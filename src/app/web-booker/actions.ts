'use server';

import { supabaseAdmin } from "@/lib/supabase";
import { shouldGoToMarketplace, assignNearestDriver } from "@/lib/dsa";
import { calcWebQuote, geocodeAddress } from "@/lib/web-quote";

/**
 * Convert a YYYY-MM-DDTHH:mm local string (meant to represent UK time) 
 * into a proper UTC ISO string, regardless of where the server or browser is.
 */
function parseUKTime(datetimeLocalValue: string | null): string | null {
  if (!datetimeLocalValue) return null;
  
  const d = new Date(datetimeLocalValue + "Z");
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  
  const parts = formatter.formatToParts(d);
  const p: Record<string, number> = {};
  parts.forEach(({ type, value }) => {
    if (type !== 'literal') p[type] = parseInt(value, 10);
  });
  
  // If hour is 24, fix it to 0
  if (p.hour === 24) p.hour = 0;
  
  const londonAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0);
  const offsetMins = Math.round((londonAsUtc - d.getTime()) / 60000);
  
  const realUtcTime = d.getTime() - (offsetMins * 60000);
  return new Date(realUtcTime).toISOString();
}

/** Blocking message shown when the fare table has no rule / pricing fails. */
export const PRICING_UNAVAILABLE = "Pricing unavailable — contact dispatch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createWebBooking(data: any) {
  try {
    // 1. Check if user exists by phone or email
    let riderId = null;

    // Build lookup filter: always match by phone, optionally also by email if provided
    const lookupFilter = data.email
      ? `phone.eq.${data.phone},email.eq.${data.email}`
      : `phone.eq.${data.phone}`;

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .or(lookupFilter)
      .maybeSingle();

    if (existingUser) {
      riderId = existingUser.id;
    } else {
      // Create user
      const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email || `${data.phone}@temp.uto.com`,
        password: "TempPassword123!",
        email_confirm: true,
      });

      if (createUserError) throw new Error("Failed to create rider auth: " + createUserError.message);

      riderId = newUser.user.id;
      
      // Update or create users table record
      await supabaseAdmin.from('users').upsert({
        id: riderId,
        email: data.email || `${data.phone}@temp.uto.com`,
        full_name: `${data.firstName} ${data.lastName}`.trim(),
        phone: data.phone,
        role: 'rider',
      });
    }

    // 2. Geocode the pickup and dropoff addresses for accurate DSA
    const [pickupGeo, dropoffGeo] = await Promise.all([
      geocodeAddress(data.pickupAddress),
      geocodeAddress(data.dropoffAddress),
    ]);

    // 3. Price the trip from the service-area fare table. The fare shown in the
    //    form is only a preview — this server-side quote is the authoritative
    //    price that is stored and cross-posted, so a client-supplied price is
    //    never accepted. A missing pricing rule / quote failure blocks the
    //    booking so no priced-but-unpriced ride can slip through.
    const quote = await calcWebQuote({
      pickup: { lat: pickupGeo.lat, lng: pickupGeo.lon },
      dropoff: { lat: dropoffGeo.lat, lng: dropoffGeo.lon },
      vehicleType: data.vehicleType || 'economy',
    });
    if (!quote.success) {
      return { success: false, error: PRICING_UNAVAILABLE };
    }

    // Commission / driver cut mirror the client's 15% standard when auto-calculated.
    const autoCommission = data.commissionCalculation === 'Calculate automatically';
    const commissionAmount = autoCommission
      ? Number((quote.price * 0.15).toFixed(2))
      : Number(data.commission) || 0;
    const driverCut = autoCommission
      ? Number((quote.price - commissionAmount).toFixed(2))
      : Number(data.driverCut) || 0;

    // 4. Determine dispatch mode: marketplace or direct driver assignment
    const scheduledTime = parseUKTime(data.time);
    const goToMarketplace = await shouldGoToMarketplace(scheduledTime);

    // 5. Generate Reference & Insert into web_booker table
    const reference = Math.random().toString(36).substring(2, 8).toUpperCase();

    const initialStatus = goToMarketplace ? 'marketplace' : 'searching_driver';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookingData: Record<string, any> = {
      reference,
      rider_id: riderId,
      status: initialStatus,
      vehicle_type: data.vehicleType || 'economy',
      pickup_address: data.pickupAddress,
      pickup_latitude: pickupGeo.lat,
      pickup_longitude: pickupGeo.lon,
      dropoff_address: data.dropoffAddress,
      dropoff_latitude: dropoffGeo.lat,
      dropoff_longitude: dropoffGeo.lon,
      estimated_price: quote.price,
      scheduled_time: scheduledTime || null,
      pricing_type: data.pricingType || "Fixed price",
      payment_method: data.paymentMethod || "pay",
      commission_calculation: data.commissionCalculation || "Calculate automatically",
      commission_amount: commissionAmount,
      driver_cut: driverCut,
      flight_number: data.flightNumber || null,
      booking_note: data.bookingNote || null,
      dispatch_mode: goToMarketplace ? 'marketplace' : 'dsa_direct',
      dispatch_note: goToMarketplace
        ? 'Booking is 4+ hours away. Placed in marketplace for drivers to accept.'
        : 'Booking within 4 hours. Searching for nearest available driver...',
    };

    const { data: newBooking, error: bookingError } = await supabaseAdmin
      .from('web_booker')
      .insert(bookingData)
      .select()
      .single();

    if (bookingError) throw new Error("Failed to create web booking: " + bookingError.message);

    // 6. If NOT marketplace → run DSA to find and assign nearest driver
    let assignedDriver = null;
    if (!goToMarketplace) {
      assignedDriver = await assignNearestDriver(
        newBooking.id,
        pickupGeo.lat,
        pickupGeo.lon,
        'web_booker'
      );
    }

    // 7. Re-fetch the booking to get the latest status after DSA assignment
    const { data: finalBooking } = await supabaseAdmin
      .from('web_booker')
      .select()
      .eq('id', newBooking.id)
      .single();

    // 8. CROSS-POST to the central utoreplit Express Server API
    // This allows the actual rider/driver app to natively pick up this trip,
    // dispatching via real sockets if < 4h, or dropping it in later_bookings if > 4h.
    try {
      const expressPayload = {
        riderId,
        pickupAddress: data.pickupAddress,
        pickupLatitude: pickupGeo.lat,
        pickupLongitude: pickupGeo.lon,
        dropoffAddress: data.dropoffAddress,
        dropoffLatitude: dropoffGeo.lat,
        dropoffLongitude: dropoffGeo.lon,
        pickupAt: scheduledTime || new Date(Date.now() + 60000).toISOString(), // Fallback to +1 minute to bypass future validation
        dropoffBy: new Date(new Date(scheduledTime || Date.now()).getTime() + 30 * 60000).toISOString(),
        estimatedPrice: quote.price,
        vehicleType: data.vehicleType || 'economy'
      };
      
      await fetch("http://localhost:5000/api/later-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expressPayload)
      });
      console.log("[WebBooker] Cross-posted payload to main Express API");
    } catch (apiErr) {
      console.error("[WebBooker] Failed to notify main Express API", apiErr);
    }

    return { 
      success: true, 
      ride: finalBooking || newBooking,
      dispatchMode: goToMarketplace ? 'marketplace' : 'dsa_direct',
      assignedDriver: assignedDriver ? {
        name: assignedDriver.driver_name,
        distance_miles: assignedDriver.distance_miles,
        vehicle: `${assignedDriver.vehicle_make} ${assignedDriver.vehicle_model}`,
        plate: assignedDriver.license_plate,
      } : null,
    };
  } catch (error: unknown) {
    console.error("Error creating web booking:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Quote the trip from the service-area fare table once pickup + dropoff are
 * entered, so the form can show the live fare (read-only) before submission.
 * The price shown here is only a preview; createWebBooking re-quotes on the
 * server so the stored/cross-posted price is always authoritative.
 */
export async function quoteForWebBooking(
  pickupAddress: string,
  dropoffAddress: string,
  vehicleType?: string | null
): Promise<
  | { success: true; quote: { price: number; billed_miles: number; route_label: string; vehicle: string } }
  | { success: false; error: string }
> {
  const pickup = pickupAddress?.trim();
  const dropoff = dropoffAddress?.trim();
  if (!pickup || !dropoff) {
    return { success: false, error: 'Enter pickup and dropoff addresses to see a price.' };
  }

  try {
    const [pickupGeo, dropoffGeo] = await Promise.all([
      geocodeAddress(pickup),
      geocodeAddress(dropoff),
    ]);

    const result = await calcWebQuote({
      pickup: { lat: pickupGeo.lat, lng: pickupGeo.lon },
      dropoff: { lat: dropoffGeo.lat, lng: dropoffGeo.lon },
      vehicleType: vehicleType ?? null,
    });

    if (!result.success) return { success: false, error: PRICING_UNAVAILABLE };

    return {
      success: true,
      quote: {
        price: result.price,
        billed_miles: result.billed_miles,
        route_label: result.route_label,
        vehicle: result.vehicle,
      },
    };
  } catch (err) {
    console.error("[WebBooker Quote] failed:", err);
    return { success: false, error: PRICING_UNAVAILABLE };
  }
}

/**
 * Fetch all drivers for manual assignment dropdown in web booker.
 */
export async function fetchAllDriversForWebBooker() {
  try {
    const { data: drivers, error } = await supabaseAdmin
      .from('drivers')
      .select('id, user_id, vehicle_type, vehicle_make, vehicle_model, license_plate, is_online, is_available, user:user_id(full_name)');

    if (error) {
      console.error("[WebBooker ManualAssign] Error fetching drivers:", error);
      return { success: false, drivers: [], error: error.message };
    }

    const formatted = (drivers || []).map((d: any) => ({
      id: d.id,
      user_id: d.user_id,
      name: d.user?.full_name || 'Unknown Driver',
      vehicle: `${d.vehicle_make || ''} ${d.vehicle_model || ''}`.trim() || 'N/A',
      plate: d.license_plate || 'N/A',
      vehicle_type: d.vehicle_type || 'N/A',
      is_online: d.is_online,
      is_available: d.is_available,
    }));

    return { success: true, drivers: formatted };
  } catch (err: any) {
    console.error("[WebBooker ManualAssign] Error:", err);
    return { success: false, drivers: [], error: err.message };
  }
}

/**
 * Manually assign a driver to a web booking (web_booker table).
 */
export async function manualAssignDriverToWebBooking(bookingId: string, driverId: string, driverName: string) {
  try {
    const { error } = await supabaseAdmin
      .from('web_booker')
      .update({
        assigned_driver_id: driverId,
        assigned_driver_name: driverName,
        status: 'driver_assigned',
        dispatch_mode: 'manual',
        dispatch_note: `Manually assigned to ${driverName} by admin.`,
      })
      .eq('id', bookingId);

    if (error) {
      console.error("[WebBooker ManualAssign] Failed to assign driver:", error);
      return { success: false, error: error.message };
    }

    console.log(`[WebBooker ManualAssign] Driver ${driverName} manually assigned to web booking ${bookingId}`);
    return { success: true };
  } catch (err: any) {
    console.error("[WebBooker ManualAssign] Error:", err);
    return { success: false, error: err.message };
  }
}

