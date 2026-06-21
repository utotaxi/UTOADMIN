'use server';

import { supabaseAdmin } from "@/lib/supabase";

export async function fetchSingleRideAction(rideId: string) {
  try {
    // `*` pulls all available ride columns (reference, passenger_count,
    // cancellation_reason, etc.) without erroring on missing columns. The
    // driver embed uses `*` to include council/PHD & PHV licence + expiries.
    const { data: ride, error } = await supabaseAdmin
      .from('rides')
      .select(`
          *,
          rider:rider_id(full_name, phone, email),
          driver:driver_id(*, user:user_id(full_name, phone, email)),
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
