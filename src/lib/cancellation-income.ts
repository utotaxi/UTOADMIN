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
    if (r.includes("penalty") || r.includes("50%")) return true;
    if (r.includes("driver")) return true;
    return false;
}

/** True only when the cancellation should pay the driver a 100% rider-cancel credit. */
export function isRiderCancellationCredit(raw?: string | null): boolean {
    if (isCancelledByDriver(raw)) return false;
    const r = (raw || "").toLowerCase();
    if (
        r.includes("no show") ||
        r.includes("no-show") ||
        r.includes("noshow") ||
        r.includes("did not show") ||
        r.includes("didn't show")
    ) {
        return true;
    }
    if (
        r.includes("rider") ||
        r.includes("passenger") ||
        r.includes("customer") ||
        r.includes("user")
    ) {
        return true;
    }
    // Unknown / generic "cancelled" must not auto-credit — penalties come from driver_deductions.
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

    if (!isRiderCancellationCredit(ride.cancellation_reason)) {
        return 0;
    }

    return Math.round(base * 100) / 100;
}

export function getCancellationAmountLabel(amount: number): string {
    if (amount < 0) return "Cancellation fee (50%)";
    if (amount > 0) return "Cancellation credit (100%)";
    return "Cancellation";
}
