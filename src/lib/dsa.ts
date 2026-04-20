'use server';

import { supabaseAdmin } from "./supabase";

/**
 * DSA — Driver Search Algorithm
 * 
 * Finds the nearest available driver to a given pickup location using the 
 * Haversine formula for distance calculation (in MILES). The algorithm:
 * 
 * 1. Queries all drivers who are ONLINE and AVAILABLE
 * 2. Filters out drivers without valid GPS coordinates
 * 3. Calculates distance from each driver to the pickup point
 * 4. Sorts by distance ascending
 * 5. Returns the closest driver(s), up to `maxResults`
 * 
 * The search radius defaults to 30 miles but can be configured.
 */

// Haversine formula: compute distance in MILES between two lat/lon pairs
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8; // Earth radius in MILES
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export interface NearbyDriver {
  driver_id: string;
  user_id: string;
  driver_name: string;
  distance_miles: number;
  latitude: number;
  longitude: number;
  vehicle_type: string;
  vehicle_make: string;
  vehicle_model: string;
  license_plate: string;
}

/**
 * Find nearby available drivers sorted by distance (nearest first).
 * Distance is returned in MILES.
 */
export async function findNearbyDrivers(
  pickupLat: number,
  pickupLon: number,
  options?: {
    maxRadiusMiles?: number;
    maxResults?: number;
  }
): Promise<NearbyDriver[]> {
  const maxRadius = options?.maxRadiusMiles ?? 30; // Default 30 miles radius
  const maxResults = options?.maxResults ?? 10;

  // 1. Query all online & available drivers with their location
  const { data: drivers, error } = await supabaseAdmin
    .from('drivers')
    .select('id, user_id, current_latitude, current_longitude, vehicle_type, vehicle_make, vehicle_model, license_plate, is_online, is_available, user:user_id(full_name)')
    .eq('is_online', true)
    .eq('is_available', true);

  if (error) {
    console.error("[DSA] Error fetching drivers:", error);
    return [];
  }

  if (!drivers || drivers.length === 0) {
    console.log("[DSA] No online/available drivers found");
    return [];
  }

  // 2. Filter drivers with valid coordinates & compute distance in miles
  const driversWithDistance: NearbyDriver[] = [];

  for (const driver of drivers) {
    const lat = driver.current_latitude;
    const lon = driver.current_longitude;
    
    // Skip drivers without valid GPS
    if (!lat || !lon || lat === 0 || lon === 0) {
      continue;
    }

    const distanceMiles = haversineDistance(pickupLat, pickupLon, lat, lon);

    // Only include drivers within the search radius
    if (distanceMiles <= maxRadius) {
      const userData = driver.user as any;
      driversWithDistance.push({
        driver_id: driver.id,
        user_id: driver.user_id,
        driver_name: userData?.full_name || 'Unknown Driver',
        distance_miles: Math.round(distanceMiles * 100) / 100,
        latitude: lat,
        longitude: lon,
        vehicle_type: driver.vehicle_type || '',
        vehicle_make: driver.vehicle_make || '',
        vehicle_model: driver.vehicle_model || '',
        license_plate: driver.license_plate || '',
      });
    }
  }

  // 3. Sort by distance (nearest first) — this is the core DSA ranking
  driversWithDistance.sort((a, b) => a.distance_miles - b.distance_miles);

  // 4. Return top N results
  return driversWithDistance.slice(0, maxResults);
}

/**
 * Assign the nearest driver to a booking.
 * Returns the assigned driver info or null if no driver found.
 * 
 * COMMUNICATION WITH DRIVER APP:
 * When a driver is assigned, this function inserts a record into the 
 * `driver_notifications` table. The driver app subscribes to this table
 * via Supabase Realtime and receives the ride popup in real-time.
 * 
 * For marketplace bookings, the booking is inserted into `marketplace_rides`
 * which the driver app also subscribes to via Supabase Realtime.
 */
export async function assignNearestDriver(
  bookingId: string,
  pickupLat: number,
  pickupLon: number,
  tableName: string = 'web_booker'
): Promise<NearbyDriver | null> {
  // Find the single nearest driver
  const nearby = await findNearbyDrivers(pickupLat, pickupLon, {
    maxResults: 1,
    maxRadiusMiles: 30,
  });

  if (nearby.length === 0) {
    console.log(`[DSA] No nearby driver found for booking ${bookingId}. Sending to marketplace.`);
    
    // No driver available → fall back to marketplace
    await supabaseAdmin
      .from(tableName)
      .update({ 
        status: 'marketplace',
        dispatch_note: 'No nearby drivers available. Placed in marketplace.'
      })
      .eq('id', bookingId);

    // Also notify marketplace via driver_notifications for all online drivers
    await notifyMarketplace(bookingId, tableName);

    return null;
  }

  const assignedDriver = nearby[0];

  // Update the booking with the assigned driver
  const { error } = await supabaseAdmin
    .from(tableName)
    .update({
      status: 'driver_assigned',
      assigned_driver_id: assignedDriver.driver_id,
      assigned_driver_name: assignedDriver.driver_name,
      assigned_driver_distance_km: assignedDriver.distance_miles, // Stores miles value (column name kept for DB compatibility)
      dispatch_note: `Auto-assigned via DSA. Driver is ${assignedDriver.distance_miles} miles away.`,
    })
    .eq('id', bookingId);

  if (error) {
    console.error("[DSA] Failed to assign driver:", error);
    return null;
  }

  // Send a real-time notification to the assigned driver via Supabase
  await notifyDriver(assignedDriver, bookingId, tableName);

  console.log(`[DSA] Successfully assigned driver ${assignedDriver.driver_name} (${assignedDriver.distance_miles} mi) to booking ${bookingId}`);
  return assignedDriver;
}

/**
 * Send a real-time notification to a specific driver via the 
 * `driver_notifications` table. The driver app subscribes to 
 * INSERT events on this table filtered by their driver_id.
 * 
 * This allows the ride to "pop up" on the driver's phone instantly.
 */
async function notifyDriver(
  driver: NearbyDriver,
  bookingId: string,
  tableName: string
) {
  try {
    // Fetch the full booking details for the notification
    const { data: booking } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('id', bookingId)
      .single();

    if (!booking) return;

    await supabaseAdmin
      .from('driver_notifications')
      .insert({
        driver_id: driver.driver_id,
        type: 'ride_request',
        title: 'New Ride Request',
        message: `Pickup at ${booking.pickup_address}. ${driver.distance_miles} miles away.`,
        booking_id: bookingId,
        booking_source: tableName,
        pickup_address: booking.pickup_address,
        dropoff_address: booking.dropoff_address,
        pickup_latitude: booking.pickup_latitude,
        pickup_longitude: booking.pickup_longitude,
        dropoff_latitude: booking.dropoff_latitude,
        dropoff_longitude: booking.dropoff_longitude,
        estimated_price: booking.estimated_price,
        distance_miles: driver.distance_miles,
        status: 'pending',
      });

    console.log(`[DSA] Notification sent to driver ${driver.driver_name} for booking ${bookingId}`);
  } catch (err) {
    // Non-blocking — don't fail the booking if notification fails
    console.error("[DSA] Failed to send driver notification:", err);
  }
}

/**
 * Notify all online drivers about a marketplace ride.
 * The driver app subscribes to the `marketplace_rides` table 
 * via Supabase Realtime and shows the ride in their "Available Rides" list.
 */
async function notifyMarketplace(bookingId: string, tableName: string) {
  try {
    const { data: booking } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('id', bookingId)
      .single();

    if (!booking) return;

    await supabaseAdmin
      .from('marketplace_rides')
      .insert({
        booking_id: bookingId,
        booking_source: tableName,
        pickup_address: booking.pickup_address,
        dropoff_address: booking.dropoff_address,
        pickup_latitude: booking.pickup_latitude,
        pickup_longitude: booking.pickup_longitude,
        dropoff_latitude: booking.dropoff_latitude,
        dropoff_longitude: booking.dropoff_longitude,
        estimated_price: booking.estimated_price,
        scheduled_time: booking.scheduled_time,
        vehicle_type: booking.vehicle_type,
        status: 'available',
      });

    console.log(`[DSA] Marketplace ride posted for booking ${bookingId}`);
  } catch (err) {
    console.error("[DSA] Failed to post marketplace ride:", err);
  }
}

/**
 * Determines whether a booking should go to marketplace or be dispatched
 * directly to a nearby driver based on the 4-hour threshold.
 * 
 * - scheduledTime > 4 hours from now → MARKETPLACE
 * - scheduledTime ≤ 4 hours from now (or ASAP/null) → DSA direct dispatch
 */
export async function shouldGoToMarketplace(scheduledTime: string | null): Promise<boolean> {
  if (!scheduledTime) {
    // ASAP booking → dispatch immediately to nearest driver
    return false;
  }

  const now = new Date();
  const scheduled = new Date(scheduledTime);
  const diffMs = scheduled.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  // If more than 4 hours away → marketplace
  return diffHours > 4;
}
