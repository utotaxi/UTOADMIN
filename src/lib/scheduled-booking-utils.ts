type BookingLike = Record<string, unknown> & {
    source?: string;
    rider_id?: string | null;
    user_id?: string | null;
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    rider_name?: string | null;
    passenger_name?: string | null;
    customer_name?: string | null;
    contact_name?: string | null;
    email?: string | null;
    phone_number?: string | null;
    phone?: string | null;
    users?: { full_name?: string | null } | null;
};

export type RiderLookup = {
    byId: Record<string, string>;
    byEmail: Record<string, string>;
    byPhone: Record<string, string>;
};

export function nonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

export function firstNonEmptyString(...values: unknown[]): string | null {
    for (const value of values) {
        const cleaned = nonEmptyString(value);
        if (cleaned) return cleaned;
    }
    return null;
}

export function toNum(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function normalizePhone(value: unknown): string | null {
    const raw = nonEmptyString(value);
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    return digits || null;
}

/** Resolve the rider user id from a scheduled booking row. */
export function resolveRiderId(booking: BookingLike): string | null {
    const riderId = nonEmptyString(booking.rider_id);
    if (riderId) return riderId;

    if (booking.source === "later" || booking.source === "web_booker") {
        return nonEmptyString(booking.user_id);
    }

    return null;
}

/** Build lookup maps for rider names by id, email, and phone. */
export function buildRiderLookup(
    users: Array<{ id?: string; full_name?: string | null; email?: string | null; phone?: string | null }>
): RiderLookup {
    const byId: Record<string, string> = {};
    const byEmail: Record<string, string> = {};
    const byPhone: Record<string, string> = {};

    users.forEach((user) => {
        const name = nonEmptyString(user.full_name);
        if (!name || !user.id) return;

        byId[user.id] = name;

        const email = nonEmptyString(user.email)?.toLowerCase();
        if (email) byEmail[email] = name;

        const phone = normalizePhone(user.phone);
        if (phone) byPhone[phone] = name;
    });

    return { byId, byEmail, byPhone };
}

/** Prefer booking-stored rider names (later_bookings snapshot) before users-table lookup. */
export function resolveRiderName(booking: BookingLike, lookup: RiderLookup): string | null {
    const bookingName = firstNonEmptyString(
        booking.name,
        [nonEmptyString(booking.first_name), nonEmptyString(booking.last_name)].filter(Boolean).join(" "),
        booking.rider_name,
        booking.passenger_name,
        booking.customer_name,
        booking.contact_name
    );
    if (bookingName) return bookingName;

    const riderId = resolveRiderId(booking);
    if (riderId && lookup.byId[riderId]) return lookup.byId[riderId];

    const email = nonEmptyString(booking.email)?.toLowerCase();
    if (email && lookup.byEmail[email]) return lookup.byEmail[email];

    const phone = normalizePhone(booking.phone_number ?? booking.phone);
    if (phone && lookup.byPhone[phone]) return lookup.byPhone[phone];

    return nonEmptyString(booking.users?.full_name);
}

function applyPaidDiscountToLeg(
    legFare: number,
    totalEstimated: number | null,
    amountPaid: number | null
): number {
    if (
        amountPaid == null ||
        totalEstimated == null ||
        totalEstimated <= 0 ||
        amountPaid <= 0 ||
        amountPaid >= totalEstimated
    ) {
        return legFare;
    }

    const ratio = amountPaid / totalEstimated;
    return Math.round(legFare * ratio * 100) / 100;
}

/** Final fare for a later_bookings leg, honouring amount_paid discounts when set. */
export function resolveLaterLegFare(
    booking: BookingLike,
    leg: "single" | "outbound" | "return"
): number {
    const amountPaid = toNum(booking.amount_paid);
    const estimatedFare = toNum(booking.estimated_fare);
    const outboundFare = toNum(booking.outbound_fare);
    const returnFare = toNum(booking.return_fare);

    if (leg === "outbound") {
        const base = outboundFare
            ?? (estimatedFare != null && returnFare != null
                ? Math.round((estimatedFare - returnFare) * 100) / 100
                : estimatedFare)
            ?? 0;
        return applyPaidDiscountToLeg(base, estimatedFare, amountPaid);
    }

    if (leg === "return") {
        const base = returnFare
            ?? (estimatedFare != null && outboundFare != null
                ? Math.round((estimatedFare - outboundFare) * 100) / 100
                : estimatedFare)
            ?? 0;
        return applyPaidDiscountToLeg(base, estimatedFare, amountPaid);
    }

    if (amountPaid != null && amountPaid > 0) return amountPaid;
    return outboundFare ?? estimatedFare ?? 0;
}

/** Final fare for web_booker rows (estimated_price is the stored final/admin price). */
export function resolveWebBookerFare(booking: BookingLike): number {
    return (
        toNum(booking.final_price)
        ?? toNum(booking.estimated_price)
        ?? toNum(booking.estimated_fare)
        ?? 0
    );
}

export function resolveOriginalLaterFare(booking: BookingLike, leg: "single" | "outbound" | "return"): number | null {
    if (leg === "outbound") return toNum(booking.outbound_fare) ?? toNum(booking.estimated_fare);
    if (leg === "return") return toNum(booking.return_fare) ?? toNum(booking.estimated_fare);
    return toNum(booking.estimated_fare);
}

export function hasLaterDiscount(booking: BookingLike): boolean {
    const amountPaid = toNum(booking.amount_paid);
    const estimatedFare = toNum(booking.estimated_fare);
    return amountPaid != null && estimatedFare != null && amountPaid > 0 && amountPaid < estimatedFare;
}
