'use server';

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { resolveLaterLegFare } from "@/lib/scheduled-booking-utils";

const LOCKED_ASSIGNMENT_STATUSES = new Set([
  'driver_accepted',
  'accepted',
  'arrived',
  'started',
  'in_progress',
  'completed',
]);

function hasLockedAssignmentStatus(status?: string | null): boolean {
  return LOCKED_ASSIGNMENT_STATUSES.has((status || '').toLowerCase());
}

function mapLaterStatusToWebBooker(status?: string | null): string {
  switch ((status || '').toLowerCase()) {
    case 'driver_accepted':
    case 'accepted':
      return 'driver_accepted';
    case 'driver_assigned':
      return 'driver_assigned';
    case 'in_progress':
    case 'arrived':
    case 'started':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'cancelled_no_drivers':
      return 'cancelled';
    case 'marketplace':
      return 'marketplace';
    case 'searching_driver':
      return 'searching_driver';
    default:
      return 'pending';
  }
}

/**
 * Fetch all drivers (with their user names) for manual assignment dropdown.
 */
export async function fetchAllDrivers() {
  try {
    const { data: drivers, error } = await supabaseAdmin
      .from('drivers')
      .select('id, user_id, vehicle_type, vehicle_make, vehicle_model, license_plate, is_online, is_available, user:user_id(full_name)');

    if (error) {
      console.error("[ManualAssign] Error fetching drivers:", error);
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
    console.error("[ManualAssign] Error:", err);
    return { success: false, drivers: [], error: err.message };
  }
}

/**
 * Manually assign a driver to a scheduled ride.
 * Handles both the app "Later" bookings (later_bookings) and admin web-booker
 * bookings (web_booker), depending on the booking source.
 */
export async function manualAssignDriverToScheduled(
  bookingId: string,
  driverId: string,
  driverName: string,
  source: 'later' | 'web_booker' = 'later'
) {
  try {
    if (source === 'web_booker') {
      const { data: existingBooking, error: existingError } = await supabaseAdmin
        .from('web_booker')
        .select('id, status, assigned_driver_id, assigned_driver_name, later_booking_id')
        .eq('id', bookingId)
        .maybeSingle();

      if (existingError || !existingBooking) {
        console.error("[ManualAssign] Failed to load existing web booking:", existingError);
        return { success: false, error: existingError?.message || "Booking not found." };
      }

      if (hasLockedAssignmentStatus(existingBooking.status) && existingBooking.assigned_driver_id && existingBooking.assigned_driver_id !== driverId) {
        return {
          success: false,
          error: `This ride was already accepted by ${existingBooking.assigned_driver_name || 'another driver'} and cannot be reassigned.`,
        };
      }

      if (hasLockedAssignmentStatus(existingBooking.status) && existingBooking.assigned_driver_id === driverId) {
        return { success: true };
      }

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
        console.error("[ManualAssign] Failed to assign driver (web_booker):", error);
        return { success: false, error: error.message };
      }

      // Keep linked later_bookings row in sync when present.
      if (existingBooking.later_booking_id) {
        await supabaseAdmin
          .from('later_bookings')
          .update({
            driver_id: driverId,
            assigned_driver_name: driverName,
            assignment_status: 'pending',
            assigned_at: new Date().toISOString(),
            assignment_responded_at: null,
            assignment_note: `Manually assigned to ${driverName} by admin.`,
            status: 'scheduled',
          })
          .eq('id', existingBooking.later_booking_id);
      }
    } else {
      const { data: existingBooking, error: existingError } = await supabaseAdmin
        .from('later_bookings')
        .select('id, status, driver_id, assigned_driver_name, assignment_status')
        .eq('id', bookingId)
        .maybeSingle();

      if (existingError || !existingBooking) {
        console.error("[ManualAssign] Failed to load existing later booking:", existingError);
        return { success: false, error: existingError?.message || "Booking not found." };
      }

      const locked =
        hasLockedAssignmentStatus(existingBooking.status) ||
        existingBooking.assignment_status === 'accepted';

      if (locked && existingBooking.driver_id && existingBooking.driver_id !== driverId) {
        return {
          success: false,
          error: "This ride was already accepted by another driver and cannot be reassigned.",
        };
      }

      if (locked && existingBooking.driver_id === driverId) {
        return { success: true };
      }

      const assignedAt = new Date().toISOString();
      // later_bookings_status_check only allows values like scheduled / driver_accepted /
      // cancelled — NOT driver_assigned. Keep status as scheduled (or current) and track
      // the admin assign via assignment_status = pending until the driver accepts.
      const nextStatus = hasLockedAssignmentStatus(existingBooking.status)
        ? existingBooking.status
        : (existingBooking.status === 'cancelled' ? 'scheduled' : (existingBooking.status || 'scheduled'));

      const { error } = await supabaseAdmin
        .from('later_bookings')
        .update({
          driver_id: driverId,
          assigned_driver_name: driverName,
          assignment_status: 'pending',
          assigned_at: assignedAt,
          assignment_responded_at: null,
          assignment_note: `Manually assigned to ${driverName} by admin.`,
          status: nextStatus === 'driver_assigned' ? 'scheduled' : nextStatus,
        })
        .eq('id', bookingId);

      if (error) {
        console.error("[ManualAssign] Failed to assign driver:", error);
        // If new columns are missing, fall back to legacy update so assign still works.
        if (/assigned_driver_name|assignment_status|assigned_at|assignment_note/i.test(error.message || '')) {
          const { error: legacyError } = await supabaseAdmin
            .from('later_bookings')
            .update({
              driver_id: driverId,
              status: 'scheduled',
            })
            .eq('id', bookingId);
          if (legacyError) {
            return { success: false, error: `${error.message}. Also run sql/later_bookings_assignment_columns.sql in Supabase.` };
          }
        } else if (/later_bookings_status_check/i.test(error.message || '')) {
          // Retry without an invalid status value.
          const { error: retryError } = await supabaseAdmin
            .from('later_bookings')
            .update({
              driver_id: driverId,
              assigned_driver_name: driverName,
              assignment_status: 'pending',
              assigned_at: assignedAt,
              assignment_responded_at: null,
              assignment_note: `Manually assigned to ${driverName} by admin.`,
              status: 'scheduled',
            })
            .eq('id', bookingId);
          if (retryError) {
            return { success: false, error: retryError.message };
          }
        } else {
          return { success: false, error: error.message };
        }
      }

      // Notify the driver (best-effort).
      try {
        const { data: booking } = await supabaseAdmin
          .from('later_bookings')
          .select('*')
          .eq('id', bookingId)
          .single();

        if (booking) {
          await supabaseAdmin.from('driver_notifications').insert({
            driver_id: driverId,
            type: 'ride_request',
            title: '🚕 New Ride Assigned',
            message: `Manually assigned: Pickup at ${booking.pickup_address}.`,
            booking_id: bookingId,
            booking_source: 'later_bookings',
            pickup_address: booking.pickup_address,
            dropoff_address: booking.dropoff_address,
            pickup_latitude: booking.pickup_latitude,
            pickup_longitude: booking.pickup_longitude,
            dropoff_latitude: booking.dropoff_latitude,
            dropoff_longitude: booking.dropoff_longitude,
            estimated_price: resolveLaterLegFare(booking, 'single'),
            scheduled_time: booking.pickup_at,
            status: 'pending',
          });
        }
      } catch (notifyErr) {
        console.warn('[ManualAssign] Failed to send driver notification:', notifyErr);
      }

      // Keep mirrored web_booker row in sync if it exists.
      await supabaseAdmin
        .from('web_booker')
        .update({
          assigned_driver_id: driverId,
          assigned_driver_name: driverName,
          status: 'driver_assigned',
          dispatch_mode: 'manual',
          dispatch_note: `Manually assigned to ${driverName} by admin.`,
        })
        .eq('later_booking_id', bookingId);
    }

    console.log(`[ManualAssign] Driver ${driverName} manually assigned to ${source} ride ${bookingId}`);
    revalidatePath('/scheduled-rides');
    revalidatePath('/web-booker/dashboard');
    return { success: true };
  } catch (err: any) {
    console.error("[ManualAssign] Error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Ensure an app later_booking has a mirrored web_booker row so admin can
 * Review / Edit it in the Web Booker dashboard.
 */
export async function ensureLaterBookingInWebBooker(laterBookingId: string) {
  try {
    const { data: existingMirror } = await supabaseAdmin
      .from('web_booker')
      .select('id')
      .eq('later_booking_id', laterBookingId)
      .maybeSingle();

    if (existingMirror?.id) {
      // Refresh passenger/fare snapshot from later_bookings so Review shows correct details.
      const { data: laterRefresh } = await supabaseAdmin
        .from('later_bookings')
        .select('*')
        .eq('id', laterBookingId)
        .maybeSingle();
      if (laterRefresh) {
        const riderName = [laterRefresh.first_name, laterRefresh.last_name].filter(Boolean).join(' ').trim()
          || laterRefresh.name
          || null;
        await supabaseAdmin
          .from('web_booker')
          .update({
            estimated_price: resolveLaterLegFare(laterRefresh, 'single'),
            scheduled_time: laterRefresh.pickup_at || null,
            pickup_address: laterRefresh.pickup_address,
            dropoff_address: laterRefresh.dropoff_address,
            assigned_driver_id: laterRefresh.driver_id || null,
            assigned_driver_name: laterRefresh.assigned_driver_name || null,
            dispatch_note: laterRefresh.assignment_note
              || (riderName ? `Synced from app scheduled ride (${riderName}).` : 'Synced from app scheduled ride.'),
            booking_note: [
              riderName ? `Passenger: ${riderName}` : null,
              laterRefresh.email ? `Email: ${laterRefresh.email}` : null,
              laterRefresh.phone_number ? `Phone: ${laterRefresh.phone_number}` : null,
              laterRefresh.flight_number ? `Flight: ${laterRefresh.flight_number}` : null,
            ].filter(Boolean).join('\n') || 'Opened from Scheduled Rides for admin review.',
          })
          .eq('id', existingMirror.id);
      }
      return { success: true, webBookerId: existingMirror.id };
    }

    const { data: later, error: laterError } = await supabaseAdmin
      .from('later_bookings')
      .select('*')
      .eq('id', laterBookingId)
      .maybeSingle();

    if (laterError || !later) {
      return { success: false, error: laterError?.message || 'Later booking not found.' };
    }

    const reference = Math.random().toString(36).substring(2, 8).toUpperCase();
    const fare = resolveLaterLegFare(later, 'single');
    const riderName = [later.first_name, later.last_name].filter(Boolean).join(' ').trim()
      || later.name
      || null;

    const payload: Record<string, unknown> = {
      later_booking_id: later.id,
      reference,
      rider_id: later.rider_id || null,
      status: mapLaterStatusToWebBooker(later.status),
      vehicle_type: later.vehicle_type || 'economy',
      pickup_address: later.pickup_address,
      pickup_latitude: later.pickup_latitude,
      pickup_longitude: later.pickup_longitude,
      dropoff_address: later.dropoff_address,
      dropoff_latitude: later.dropoff_latitude,
      dropoff_longitude: later.dropoff_longitude,
      estimated_price: fare,
      scheduled_time: later.pickup_at || null,
      payment_method: later.payment_method || 'pay',
      assigned_driver_id: later.driver_id || null,
      assigned_driver_name: later.assigned_driver_name || null,
      dispatch_mode: later.driver_id ? 'manual' : 'marketplace',
      dispatch_note: later.assignment_note
        || (riderName ? `Synced from app scheduled ride (${riderName}).` : 'Synced from app scheduled ride.'),
      booking_note: [
        riderName ? `Passenger: ${riderName}` : null,
        later.email ? `Email: ${later.email}` : null,
        later.phone_number ? `Phone: ${later.phone_number}` : null,
        later.flight_number ? `Flight: ${later.flight_number}` : null,
      ].filter(Boolean).join('\n') || 'Opened from Scheduled Rides for admin review.',
    };

    const { data: created, error: createError } = await supabaseAdmin
      .from('web_booker')
      .insert(payload)
      .select('id')
      .single();

    if (createError || !created) {
      // Column may not exist yet — tell admin to run SQL.
      if (/later_booking_id/i.test(createError?.message || '')) {
        return {
          success: false,
          error: 'Missing later_booking_id on web_booker. Run sql/later_bookings_assignment_columns.sql in Supabase first.',
        };
      }
      return { success: false, error: createError?.message || 'Failed to create web booker mirror.' };
    }

    revalidatePath('/web-booker/dashboard');
    return { success: true, webBookerId: created.id };
  } catch (err: any) {
    console.error('[ensureLaterBookingInWebBooker] Error:', err);
    return { success: false, error: err.message };
  }
}
