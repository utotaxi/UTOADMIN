import { supabaseAdmin } from "@/lib/supabase";
import RidesClient from "./RidesClient";

export const dynamic = "force-dynamic";

export default async function RidesPage() {
    const { data: rides, error } = await supabaseAdmin
        .from('rides')
        .select('*, rider:rider_id(full_name), driver:driver_id(council_licence, license_plate, user:user_id(full_name, email))')
        .order('requested_at', { ascending: false });

    if (error) {
        console.error("Error fetching rides:", error);
    }

    return <RidesClient rides={rides || []} />;
}
