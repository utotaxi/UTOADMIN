'use server';

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateBookingAction(id: string, updateData: Record<string, any>) {
    const { data: existing, error: existingError } = await supabaseAdmin
        .from('web_booker')
        .select('id, later_booking_id')
        .eq('id', id)
        .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const { error } = await supabaseAdmin
        .from('web_booker')
        .update(updateData)
        .eq('id', id);

    if (error) throw new Error(error.message);

    // Keep the source later_bookings row in sync when this is an app scheduled ride mirror.
    if (existing?.later_booking_id) {
        const laterUpdate: Record<string, unknown> = {};
        if (updateData.pickup_address !== undefined) laterUpdate.pickup_address = updateData.pickup_address;
        if (updateData.dropoff_address !== undefined) laterUpdate.dropoff_address = updateData.dropoff_address;
        if (updateData.estimated_price !== undefined) laterUpdate.estimated_fare = updateData.estimated_price;
        if (updateData.scheduled_time !== undefined) laterUpdate.pickup_at = updateData.scheduled_time;
        if (updateData.status !== undefined) {
            laterUpdate.status = updateData.status;
            if (updateData.status === 'driver_accepted' || updateData.status === 'accepted') {
                laterUpdate.assignment_status = 'accepted';
                laterUpdate.assignment_responded_at = new Date().toISOString();
            } else if (updateData.status === 'driver_assigned') {
                laterUpdate.assignment_status = 'pending';
            } else if (updateData.status === 'cancelled') {
                laterUpdate.cancellation_note = updateData.dispatch_note || 'Cancelled from Web Booker review.';
            }
        }
        if (updateData.assigned_driver_id !== undefined) laterUpdate.driver_id = updateData.assigned_driver_id;
        if (updateData.assigned_driver_name !== undefined) laterUpdate.assigned_driver_name = updateData.assigned_driver_name;

        if (Object.keys(laterUpdate).length > 0) {
            const { error: laterError } = await supabaseAdmin
                .from('later_bookings')
                .update(laterUpdate)
                .eq('id', existing.later_booking_id);
            if (laterError) {
                console.warn('[updateBookingAction] Failed to sync later_bookings:', laterError.message);
            }
        }
    }

    revalidatePath(`/web-booker/dashboard/${id}`);
    revalidatePath('/web-booker/dashboard');
    revalidatePath('/scheduled-rides');
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
    revalidatePath('/scheduled-rides');

    return { success: true, driverName };
}

/**
 * Cancel a web-booker booking as admin.
 * Removes it from marketplace/scheduled views and syncs related later_bookings rows.
 */
export async function cancelBookingAction(bookingId: string, reason?: string) {
    const { data: booking, error: bookingErr } = await supabaseAdmin
        .from('web_booker')
        .select('*')
        .eq('id', bookingId)
        .single();

    if (bookingErr || !booking) {
        throw new Error('Booking not found: ' + (bookingErr?.message || 'Unknown error'));
    }

    if (booking.status === 'completed') {
        throw new Error('Completed bookings cannot be cancelled.');
    }
    if (booking.status === 'cancelled') {
        return { success: true, alreadyCancelled: true };
    }

    const cancelNote = reason?.trim() || 'Cancelled by admin from Web Booker dashboard.';

    const { error: updateErr } = await supabaseAdmin
        .from('web_booker')
        .update({
            status: 'cancelled',
            assigned_driver_id: null,
            assigned_driver_name: null,
            dispatch_mode: 'manual',
            dispatch_note: cancelNote,
        })
        .eq('id', bookingId);

    if (updateErr) throw new Error('Failed to cancel booking: ' + updateErr.message);

    // Remove matching marketplace / later booking rows so drivers no longer see the job.
    if (booking.pickup_address) {
        let laterQuery = supabaseAdmin
            .from('later_bookings')
            .update({
                status: 'cancelled',
                cancellation_reason: cancelNote,
            })
            .eq('pickup_address', booking.pickup_address)
            .in('status', ['scheduled', 'marketplace', 'driver_accepted', 'searching_driver', 'pending']);

        if (booking.scheduled_time) {
            const pickupAt = new Date(booking.scheduled_time);
            const windowStart = new Date(pickupAt.getTime() - 5 * 60 * 1000).toISOString();
            const windowEnd = new Date(pickupAt.getTime() + 5 * 60 * 1000).toISOString();
            laterQuery = laterQuery.gte('pickup_at', windowStart).lte('pickup_at', windowEnd);
        }

        const { error: laterErr } = await laterQuery;
        if (laterErr) {
            console.warn('[cancelBookingAction] Failed to sync later_bookings:', laterErr);
        }
    }

    // Close any pending driver notifications for this booking.
    try {
        await supabaseAdmin
            .from('driver_notifications')
            .update({ status: 'cancelled' })
            .eq('booking_id', bookingId)
            .eq('booking_source', 'web_booker');
    } catch (notifyErr) {
        console.warn('[cancelBookingAction] Failed to cancel driver notifications:', notifyErr);
    }

    revalidatePath(`/web-booker/dashboard/${bookingId}`);
    revalidatePath('/web-booker/dashboard');
    revalidatePath('/scheduled-rides');

    return { success: true };
}
