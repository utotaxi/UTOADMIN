"use server";

import { supabaseAdmin } from "@/lib/supabase";

export async function addCouponAction(newCoupon: { code: string; name: string; discount: number; redemptions: number }) {
  const { data, error } = await supabaseAdmin
    .from('coupons')
    .insert([newCoupon])
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data };
}

export async function deleteCouponAction(id: string) {
  const { error } = await supabaseAdmin.from('coupons').delete().eq('id', id);
  if (error) {
    return { error: error.message };
  }
  return { success: true };
}
