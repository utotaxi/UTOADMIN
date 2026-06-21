import { supabaseAdmin } from "@/lib/supabase";
import RidesClient from "./RidesClient";

export const dynamic = "force-dynamic";

// Shared column list. `reference` is kept separate so we can gracefully
// retry without it on databases where the column doesn't exist.
const BASE_RIDE_COLUMNS = `
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
`;

export default async function RidesPage() {
    // Prefer the real `reference` column from Supabase; if it doesn't exist
    // on this schema the query errors, so we transparently retry without it.
    let { data: rides, error } = await supabaseAdmin
        .from('rides')
        .select(`reference, ${BASE_RIDE_COLUMNS}`)
        .order('requested_at', { ascending: false })
        .limit(1000);

    if (error) {
        console.warn("[RidesPage] reference column unavailable, retrying without it:", error.message);
        ({ data: rides, error } = await supabaseAdmin
            .from('rides')
            .select(BASE_RIDE_COLUMNS)
            .order('requested_at', { ascending: false })
            .limit(1000));
    }

    if (error) {
        console.error("Error fetching rides:", error);
    }

    return <RidesClient rides={(rides as any) || []} />;
}

