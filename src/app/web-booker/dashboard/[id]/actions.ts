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

/**
 * Manually assign a specific driver to a booking.
 * Updates the booking with the driver's info and sends a real-time
 * notification to the driver via the driver_notifications table.
 */
export async function assignDriverAction(bookingId: string, driverId: string) {
    // 1. Fetch the driver info
    const { data: driver, error: driverErr } = await supabaseAdmin
        .from('drivers')
        .select('id, vehicle_make, vehicle_model, license_plate, user:user_id(full_name, phone)')
        .eq('id', driverId)
        .single();

    if (driverErr || !driver) {
        throw new Error('Driver not found: ' + (driverErr?.message || 'Unknown error'));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const driverUser = driver.user as any;
    const driverName = driverUser?.full_name || 'Unknown Driver';

    // 2. Update the booking
    const { error: updateErr } = await supabaseAdmin
        .from('web_booker')
        .update({
            status: 'driver_assigned',
            assigned_driver_id: driverId,
            assigned_driver_name: driverName,
            dispatch_mode: 'manual',
            dispatch_note: `Manually assigned by admin to ${driverName}.`,
        })
        .eq('id', bookingId);

    if (updateErr) throw new Error('Failed to assign driver: ' + updateErr.message);

    // 3. Fetch the booking to get route details for the notification
    const { data: booking } = await supabaseAdmin
        .from('web_booker')
        .select('*')
        .eq('id', bookingId)
        .single();

    // 4. Send a real-time notification to the driver via driver_notifications
    if (booking) {
        try {
            await supabaseAdmin
                .from('driver_notifications')
                .insert({
                    driver_id: driverId,
                    type: 'ride_request',
                    title: '🚕 New Ride Assigned',
                    message: `Manually assigned: Pickup at ${booking.pickup_address}.`,
                    booking_id: bookingId,
                    booking_source: 'web_booker',
                    pickup_address: booking.pickup_address,
                    dropoff_address: booking.dropoff_address,
                    pickup_latitude: booking.pickup_latitude,
                    pickup_longitude: booking.pickup_longitude,
                    dropoff_latitude: booking.dropoff_latitude,
                    dropoff_longitude: booking.dropoff_longitude,
                    estimated_price: booking.estimated_price,
                    scheduled_time: booking.scheduled_time,
                    status: 'pending',
                });
        } catch (notifyErr) {
            console.warn('[assignDriverAction] Failed to send driver notification:', notifyErr);
            // Non-blocking — don't fail the assignment if notification fails
        }
    }

    revalidatePath(`/web-booker/dashboard/${bookingId}`);
    revalidatePath('/web-booker/dashboard');

    return { success: true, driverName };
}
