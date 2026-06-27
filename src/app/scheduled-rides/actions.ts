'use server';

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

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
        .select('id, status, assigned_driver_id, assigned_driver_name')
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
    } else {
      const { data: existingBooking, error: existingError } = await supabaseAdmin
        .from('later_bookings')
        .select('id, status, driver_id')
        .eq('id', bookingId)
        .maybeSingle();

      if (existingError || !existingBooking) {
        console.error("[ManualAssign] Failed to load existing later booking:", existingError);
        return { success: false, error: existingError?.message || "Booking not found." };
      }

      if (hasLockedAssignmentStatus(existingBooking.status) && existingBooking.driver_id && existingBooking.driver_id !== driverId) {
        return {
          success: false,
          error: "This ride was already accepted by another driver and cannot be reassigned.",
        };
      }

      if (hasLockedAssignmentStatus(existingBooking.status) && existingBooking.driver_id === driverId) {
        return { success: true };
      }

      const { error } = await supabaseAdmin
        .from('later_bookings')
        .update({
          driver_id: driverId,
          status: 'driver_accepted',
        })
        .eq('id', bookingId);

      if (error) {
        console.error("[ManualAssign] Failed to assign driver:", error);
        return { success: false, error: error.message };
      }
    }

    console.log(`[ManualAssign] Driver ${driverName} manually assigned to ${source} ride ${bookingId}`);
    revalidatePath('/scheduled-rides');
    return { success: true };
  } catch (err: any) {
    console.error("[ManualAssign] Error:", err);
    return { success: false, error: err.message };
  }
}

