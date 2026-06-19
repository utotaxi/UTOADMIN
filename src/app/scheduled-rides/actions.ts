'use server';

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

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
 * Manually assign a driver to a scheduled ride (later_bookings table).
 */
export async function manualAssignDriverToScheduled(bookingId: string, driverId: string, driverName: string) {
  try {
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

    console.log(`[ManualAssign] Driver ${driverName} manually assigned to scheduled ride ${bookingId}`);
    revalidatePath('/scheduled-rides');
    return { success: true };
  } catch (err: any) {
    console.error("[ManualAssign] Error:", err);
    return { success: false, error: err.message };
  }
}

