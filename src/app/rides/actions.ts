'use server';

import { supabaseAdmin } from "@/lib/supabase";

export async function fetchSingleRideAction(rideId: string) {
  try {
    const { data: ride, error } = await supabaseAdmin
      .from('rides')
      .select(`
          id,
          status,
          pickup_address,
          dropoff_address,
          requested_at,
          created_at,
          accepted_at,
          started_at,
          completed_at,
          cancelled_at,
          estimated_price,
          final_price,
          payment_status,
          vehicle_type,
          cancellation_reason,
          rider:rider_id(full_name, phone, email),
          driver:driver_id(
              council_licence,
              license_plate,
              vehicle_type,
              vehicle_make,
              vehicle_model,
              user:user_id(full_name, phone, email)
          ),
          payments(payment_method, status)
      `)
      .eq('id', rideId)
      .single();

    if (error) {
      console.error("[fetchSingleRideAction] Error fetching ride:", error);
      return { success: false, error: error.message };
    }

    return { success: true, ride };
  } catch (err: any) {
    console.error("[fetchSingleRideAction] Error:", err);
    return { success: false, error: err.message };
  }
}
