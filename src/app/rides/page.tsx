import { supabaseAdmin } from "@/lib/supabase";
import RidesClient from "./RidesClient";

export const dynamic = "force-dynamic";

export default async function RidesPage() {
    // Select all ride columns with `*` so optional fields (reference,
    // passenger_count, cancellation_reason, etc.) come through when present
    // without erroring on schemas that don't have them. The driver embed also
    // uses `*` to pull council/PHD & PHV licence and document expiry fields.
    const { data: rides, error } = await supabaseAdmin
        .from('rides')
        .select(`
            *,
            rider:rider_id(full_name, phone, email),
            driver:driver_id(*, user:user_id(full_name, phone, email)),
            payments(payment_method, status)
        `)
        .order('requested_at', { ascending: false })
        .limit(1000);

    if (error) {
        console.error("Error fetching rides:", error);
    }

    return <RidesClient rides={(rides as any) || []} />;
}

