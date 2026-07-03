import type { Deduction } from "@/app/drivers/[id]/DriverIncomePanel";

/** Pull ride id from strings like "50% cancellation penalty for ride ride_1782554063691". */
export function extractRideIdFromPenaltyReason(reason?: string | null): string | null {
    if (!reason) return null;
    const explicit = reason.match(/for ride\s+(ride_[\w-]+)/i);
    if (explicit?.[1]) return explicit[1];
    const generic = reason.match(/\b(ride_[\w-]+)\b/i);
    return generic?.[1] || null;
}

export type PenaltyIncomeEntry = {
    id: string;
    amount: number;
    status: string;
    currency: string;
    payment_method: string;
    created_at: string;
    ride_id: string;
    entry_type: "cancellation";
    cancellation_reason: string;
    ride_status: string;
    user: { full_name: string };
};

type RideLike = {
    id?: string;
    pickup_address?: string;
    dropoff_address?: string;
    status?: string;
    cancelled_at?: string | null;
    requested_at?: string | null;
    created_at?: string | null;
    rider?: { full_name?: string } | null;
};

/** Map each `driver_deductions` penalty row to a negative income-history entry. */
export function mapDriverPenaltyDeductionsToIncome(
    deductions: Deduction[],
    rideMap: Record<string, RideLike>
): PenaltyIncomeEntry[] {
    return deductions
        .filter((d) => d.type === "penalty")
        .map((deduction) => {
            const reason = deduction.reason || "50% cancellation penalty";
            const rideId = extractRideIdFromPenaltyReason(reason);
            const linkedRide = rideId ? rideMap[rideId] : undefined;
            const rawAmount = Number(deduction.amount || 0);
            const signedAmount = rawAmount < 0
                ? Math.round(rawAmount * 100) / 100
                : -Math.round(Math.abs(rawAmount) * 100) / 100;

            return {
                id: `driver-deduction-${deduction.id}`,
                amount: signedAmount,
                status: "succeeded",
                currency: "gbp",
                payment_method: "cancellation_fee",
                created_at: deduction.created_at,
                ride_id: rideId || `penalty-${deduction.id}`,
                entry_type: "cancellation",
                cancellation_reason: reason,
                ride_status: linkedRide?.status || "cancelled",
                user: { full_name: linkedRide?.rider?.full_name || "Unknown" },
            };
        });
}

export function sumCommissionDeductions(deductions: Deduction[]): number {
    return deductions
        .filter((d) => d.type === "commission")
        .reduce((sum, d) => sum + Math.abs(d.amount || 0), 0);
}

/** Ride ids that already have a stored penalty in driver_deductions (skip duplicate credits). */
export function getPenaltyRideIds(deductions: Deduction[]): Set<string> {
    const ids = deductions
        .filter((d) => d.type === "penalty")
        .map((d) => extractRideIdFromPenaltyReason(d.reason))
        .filter((id): id is string => Boolean(id));
    return new Set(ids);
}
