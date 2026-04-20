'use server';

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateBookingAction(id: string, updateData: Record<string, any>) {
    const { error } = await supabaseAdmin
        .from('web_booker')
        .update(updateData)
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath(`/web-booker/dashboard/${id}`);
    revalidatePath('/web-booker/dashboard');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function duplicateBookingAction(booking: Record<string, any>, isReturn: boolean = false) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newBookingData: Record<string, any> = {
        rider_id: booking.rider_id,
        pickup_address: isReturn ? booking.dropoff_address : booking.pickup_address,
        dropoff_address: isReturn ? booking.pickup_address : booking.dropoff_address,
        vehicle_type: booking.vehicle_type,
        estimated_price: booking.estimated_price,
        scheduled_time: booking.scheduled_time,
        status: 'pending',
        booking_note: booking.booking_note,
        reference: Math.random().toString(36).substring(2, 8).toUpperCase()
    };
    
    if (booking.pickup_latitude) {
        newBookingData[isReturn ? 'dropoff_latitude' : 'pickup_latitude'] = booking.pickup_latitude;
        newBookingData[isReturn ? 'dropoff_longitude' : 'pickup_longitude'] = booking.pickup_longitude;
    }
    if (booking.dropoff_latitude) {
        newBookingData[isReturn ? 'pickup_latitude' : 'dropoff_latitude'] = booking.dropoff_latitude;
        newBookingData[isReturn ? 'pickup_longitude' : 'dropoff_longitude'] = booking.dropoff_longitude;
    }
    if (booking.commission_amount !== undefined) {
        newBookingData.commission_amount = booking.commission_amount;
    }

    const { data, error } = await supabaseAdmin
        .from('web_booker')
        .insert([newBookingData])
        .select()
        .single();

    if (error) throw new Error(error.message);

    revalidatePath('/web-booker/dashboard');
    return data.id;
}
