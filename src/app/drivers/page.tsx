import { supabaseAdmin } from "@/lib/supabase";
import DriversListClient from "./DriversListClient";
import { computeCancellationAmount, isCancelledStatus, isRiderCancellationCredit } from "@/lib/cancellation-income";
import { getPenaltyRideIds, sumPenaltyAmounts } from "@/lib/driver-penalty-income";

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

    // Fetch all rides to map to driver IDs (incl. cancelled for fee income)
    const { data: allRides } = await supabaseAdmin
        .from('rides')
        .select('id, driver_id, final_price, estimated_price, status, payment_status, cancellation_reason')
        .not('driver_id', 'is', null);

    // Fetch all payments (any status) so we don't double-count cancellation fees
    const { data: allPayments } = await supabaseAdmin
        .from('payments')
        .select('ride_id, amount, status');

    const { data: allDeductions } = await supabaseAdmin
        .from('driver_deductions')
        .select('driver_id, amount, type, reason');

    const deductionsByDriver: Record<string, typeof allDeductions> = {};
    (allDeductions || []).forEach((d) => {
        if (!d.driver_id) return;
        if (!deductionsByDriver[d.driver_id]) deductionsByDriver[d.driver_id] = [];
        deductionsByDriver[d.driver_id]!.push(d);
    });

    const succeededPayments = (allPayments || []).filter(p => p.status === 'succeeded');

    // Build a map of driver_id -> total earnings
    const earningsMap: Record<string, number> = {};
    const paidRideIds = new Set<string>();
    const paymentRideIds = new Set<string>();

    if (allRides && allPayments) {
        // Map ride_id to driver_id
        const rideToDriver: Record<string, string> = {};
        allRides.forEach(r => {
            if (r.id && r.driver_id) {
                rideToDriver[r.id] = r.driver_id;
            }
        });

        allPayments.forEach(p => {
            if (p.ride_id) paymentRideIds.add(p.ride_id);
        });

        // Add up succeeded payments
        succeededPayments.forEach(p => {
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

        // Rider cancel = +100% credit; driver penalties come from driver_deductions.
        allRides.forEach(r => {
            if (
                r.driver_id &&
                isCancelledStatus(r.status) &&
                !paymentRideIds.has(r.id)
            ) {
                const driverDeductions = deductionsByDriver[r.driver_id] || [];
                const rideIdsWithPenalties = getPenaltyRideIds(driverDeductions);
                if (rideIdsWithPenalties.has(r.id)) return;

                const amount = computeCancellationAmount(r);
                if (amount > 0 && isRiderCancellationCredit(r.cancellation_reason)) {
                    earningsMap[r.driver_id] = (earningsMap[r.driver_id] || 0) + amount;
                }
            }
        });
    }

    // Apply stored cancellation penalties from driver_deductions.
    Object.entries(deductionsByDriver).forEach(([driverId, driverDeductions]) => {
        earningsMap[driverId] = (earningsMap[driverId] || 0) - sumPenaltyAmounts(driverDeductions || []);
    });

    return (
        <DriversListClient
            initialDrivers={JSON.parse(JSON.stringify(drivers || []))}
            earningsMap={earningsMap}
        />
    );
}
