/**
 * Cancellation income rules:
 * - Cancelled by rider (incl. no-show / unknown): driver receives 100% credit (+)
 * - Cancelled by driver: driver is debited 50% of the fare (−)
 */

export function isCancelledStatus(status?: string): boolean {
    return status === "cancelled" || status === "cancelled_no_drivers";
}

export function isCancelledByDriver(raw?: string | null): boolean {
    const r = (raw || "").toLowerCase();
    if (
        r.includes("no show") ||
        r.includes("no-show") ||
        r.includes("noshow") ||
        r.includes("did not show") ||
        r.includes("didn't show")
    ) {
        return false;
    }
    if (r.includes("driver")) return true;
    return false;
}

function getFareBase(ride: { estimated_price?: number | null; final_price?: number | null }): number {
    return ride.estimated_price || ride.final_price || 0;
}

/** Signed amount: positive = rider-cancel credit, negative = driver-cancel fee. */
export function computeCancellationAmount(ride: {
    estimated_price?: number | null;
    final_price?: number | null;
    cancellation_reason?: string | null;
}): number {
    const base = getFareBase(ride);
    if (base <= 0) return 0;

    if (isCancelledByDriver(ride.cancellation_reason)) {
        return -Math.round(base * 0.5 * 100) / 100;
    }

    // Rider, no-show, or unrecognised reason → full fare credit to driver.
    return Math.round(base * 100) / 100;
}

export function getCancellationAmountLabel(amount: number): string {
    if (amount < 0) return "Cancellation fee (50%)";
    if (amount > 0) return "Cancellation credit (100%)";
    return "Cancellation";
}
