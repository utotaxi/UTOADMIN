import { supabaseAdmin } from "@/lib/supabase";
import RidesClient from "./RidesClient";

export const dynamic = "force-dynamic";

export default async function RidesPage() {
    const { data: rides, error } = await supabaseAdmin
        .from('rides')
        .select(`
            id,
            status,
            pickup_address,
            dropoff_address,
            requested_at,
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
        .order('requested_at', { ascending: false })
        .limit(1000);

    if (error) {
        console.error("Error fetching rides:", error);
    }

    return <RidesClient rides={(rides as any) || []} />;
}

