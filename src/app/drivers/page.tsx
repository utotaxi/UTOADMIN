import { supabaseAdmin } from "@/lib/supabase";
import DriversListClient from "./DriversListClient";

export const dynamic = "force-dynamic";

// Staleness threshold — same as cleanup route
const STALE_THRESHOLD_MINUTES = 2;

export default async function DriversPage() {
    // Clean up stale online statuses before rendering
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    await supabaseAdmin
        .from('drivers')
        .update({ is_online: false, is_available: false })
        .eq('is_online', true)
        .lt('last_seen_at', cutoff);

    // Fetch drivers with corrected statuses
    const { data: drivers, error } = await supabaseAdmin
        .from('drivers')
        .select('*, user:user_id(*)')
        .order('is_online', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching drivers:", error);
    }

    // Fetch all rides to map to driver IDs
    const { data: allRides } = await supabaseAdmin
        .from('rides')
        .select('id, driver_id, final_price, estimated_price, status, payment_status')
        .not('driver_id', 'is', null);

    // Fetch all succeeded payments
    const { data: allPayments } = await supabaseAdmin
        .from('payments')
        .select('ride_id, amount')
        .eq('status', 'succeeded');

    // Build a map of driver_id -> total earnings
    const earningsMap: Record<string, number> = {};
    const paidRideIds = new Set<string>();

    if (allRides && allPayments) {
        // Map ride_id to driver_id
        const rideToDriver: Record<string, string> = {};
        allRides.forEach(r => {
            if (r.id && r.driver_id) {
                rideToDriver[r.id] = r.driver_id;
            }
        });

        // Add up succeeded payments
        allPayments.forEach(p => {
            if (p.ride_id && rideToDriver[p.ride_id]) {
                const driverId = rideToDriver[p.ride_id];
                earningsMap[driverId] = (earningsMap[driverId] || 0) + (p.amount || 0);
                paidRideIds.add(p.ride_id);
            }
        });
    }

    // Add fallback for rides with payment_status = 'paid' without a payment record
    if (allRides) {
        allRides.forEach(r => {
            if (r.driver_id && r.status === 'completed' && r.payment_status === 'paid' && !paidRideIds.has(r.id)) {
                const amount = r.final_price || r.estimated_price || 0;
                earningsMap[r.driver_id] = (earningsMap[r.driver_id] || 0) + amount;
            }
        });
    }

    return (
        <DriversListClient
            initialDrivers={JSON.parse(JSON.stringify(drivers || []))}
            earningsMap={earningsMap}
        />
    );
}
