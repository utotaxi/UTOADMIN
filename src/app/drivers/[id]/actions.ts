"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export type DeductionType = "commission" | "penalty";

export async function addDeduction(
    driverId: string,
    type: DeductionType,
    amount: number,
    reason: string
) {
    if (!driverId || !amount || amount <= 0) {
        return { error: "Invalid input: driver ID and a positive amount are required." };
    }

    const { data, error } = await supabaseAdmin
        .from("driver_deductions")
        .insert({
            driver_id: driverId,
            type,
            amount,
            reason: reason || null,
        })
        .select()
        .single();

    if (error) {
        console.error("Error adding deduction:", error);
        return { error: error.message };
    }

    revalidatePath(`/drivers/${driverId}`);
    return { success: true, deduction: data };
}

export async function deleteDeduction(driverId: string, deductionId: string) {
    const { error } = await supabaseAdmin
        .from("driver_deductions")
        .delete()
        .eq("id", deductionId);

    if (error) {
        console.error("Error deleting deduction:", error);
        return { error: error.message };
    }

    revalidatePath(`/drivers/${driverId}`);
    return { success: true };
}

export async function toggleDriverApproval(userId: string, isVerified: boolean, driverId: string) {
    const { error } = await supabaseAdmin
        .from('users')
        .update({ is_verified: isVerified })
        .eq('id', userId);

    if (error) {
        console.error("Error toggling verification:", error);
        return { error: error.message };
    }

    revalidatePath(`/drivers/${driverId}`);
    revalidatePath(`/drivers`);
    return { success: true };
}

