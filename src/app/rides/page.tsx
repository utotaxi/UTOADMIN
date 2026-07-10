import { supabaseAdmin } from "@/lib/supabase";
import RidesClient from "./RidesClient";
import {
    buildRiderLookup,
    resolveLaterLegFare,
    resolveRiderId,
    resolveRiderName,
    resolveWebBookerFare,
} from "@/lib/scheduled-booking-utils";

export const dynamic = "force-dynamic";

// Scheduled-ride statuses that count as "finished" and should appear in the
// Rides & Trips history instead of the Scheduled Rides page.
const FINISHED_STATUSES = ['completed', 'cancelled', 'cancelled_no_drivers', 'expired'];

function normalizeFinishedStatus(status?: string): string {
    if (status === 'cancelled_no_drivers') return 'cancelled';
    if (status === 'expired') return 'cancelled';
    return status || 'completed';
}

export default async function RidesPage() {
    // Select all ride columns with `*` so optional fields (reference,
    // passenger_count, cancellation_reason, etc.) come through when present
    // without erroring on schemas that don't have them. The driver embed also
    // uses `*` to pull council/PHD & PHV licence and document expiry fields.
    //
    // In parallel we also pull the completed/cancelled scheduled bookings from
    // `later_bookings` and `web_booker` so that finished scheduled rides "move"
    // into this history view.
    const [ridesRes, laterRes, webRes] = await Promise.all([
        supabaseAdmin
            .from('rides')
            .select(`
                *,
                rider:rider_id(full_name, phone, email),
                driver:driver_id(*, user:user_id(full_name, phone, email)),
                payments(payment_method, status)
            `)
            .order('requested_at', { ascending: false })
            .limit(1000),
        supabaseAdmin
            .from('later_bookings')
            .select('*')
            .in('status', FINISHED_STATUSES),
        supabaseAdmin
            .from('web_booker')
            .select('*')
            .in('status', FINISHED_STATUSES),
    ]);

    const { data: rides, error } = ridesRes;
    if (error) {
        console.error("Error fetching rides:", error);
    }
    if (laterRes.error) console.error("Error fetching finished later_bookings:", laterRes.error);
    if (webRes.error) console.error("Error fetching finished web_booker rides:", webRes.error);

    const finishedBookings = [
        ...(laterRes.data || []).map((b: any) => ({ ...b, source: 'later' })),
        ...(webRes.data || []).map((b: any) => ({ ...b, source: 'web_booker' })),
    ];

    const riderIds = [...new Set(finishedBookings.map((b: any) => resolveRiderId(b)).filter(Boolean))];
    const riderEmails = [...new Set(finishedBookings
        .map((b: any) => (typeof b.email === 'string' ? b.email.trim().toLowerCase() : null))
        .filter(Boolean))];
    const riderPhones = [...new Set(finishedBookings
        .map((b: any) => {
            const raw = b.phone_number || b.phone;
            if (typeof raw !== 'string') return null;
            const digits = raw.replace(/\D/g, '');
            return digits || null;
        })
        .filter(Boolean))];
    const driverIds = [...new Set(finishedBookings.map((b: any) => b.driver_id || b.assigned_driver_id || b.assigned_driver).filter(Boolean))];

    const riderLookupFilters: string[] = [];
    if (riderIds.length > 0) riderLookupFilters.push(`id.in.(${riderIds.join(',')})`);
    if (riderEmails.length > 0) riderLookupFilters.push(`email.in.(${riderEmails.join(',')})`);
    if (riderPhones.length > 0) riderLookupFilters.push(`phone.in.(${riderPhones.join(',')})`);

    const riderLookup = buildRiderLookup([]);
    if (riderLookupFilters.length > 0) {
        const { data: riders } = await supabaseAdmin
            .from('users')
            .select('id, full_name, phone, email')
            .or(riderLookupFilters.join(','));
        Object.assign(riderLookup, buildRiderLookup(riders || []));
    }

    // Pull full driver rows (incl. licence + PHD/PHV + expiry fields) for reports.
    const driverMap: Record<string, any> = {};
    if (driverIds.length > 0) {
        const { data: driversById } = await supabaseAdmin
            .from('drivers')
            .select('*, user:user_id(full_name, phone, email)')
            .in('id', driverIds);
        (driversById || []).forEach((d: any) => { driverMap[d.id] = d; });

        const { data: driversByUserId } = await supabaseAdmin
            .from('drivers')
            .select('*, user:user_id(full_name, phone, email)')
            .in('user_id', driverIds);
        (driversByUserId || []).forEach((d: any) => {
            if (d.user_id && !driverMap[d.user_id]) driverMap[d.user_id] = d;
        });
    }

    // Normalize finished scheduled bookings into the RideData shape.
    const normalizedBookings = finishedBookings.map((b: any) => {
        const status = normalizeFinishedStatus(b.status);
        const dId = b.driver_id || b.assigned_driver_id || b.assigned_driver;
        const requestedAt = b.created_at || b.pickup_at || b.scheduled_time || null;
        const driverObj = driverMap[dId]
            || (b.assigned_driver_name ? { user: { full_name: b.assigned_driver_name } } : null);
        const resolvedName = resolveRiderName(b, riderLookup);
        const riderId = resolveRiderId(b);
        const finalFare = b.source === 'web_booker'
            ? resolveWebBookerFare(b)
            : resolveLaterLegFare(b, 'single');
        const originalFare = Number(b.estimated_fare ?? b.estimated_price ?? 0);

        return {
            ...b,
            status,
            pickup_address: b.pickup_address,
            dropoff_address: b.dropoff_address,
            requested_at: requestedAt,
            created_at: b.created_at,
            completed_at: status === 'completed' ? (b.completed_at || b.updated_at || b.pickup_at || b.scheduled_time) : b.completed_at,
            cancelled_at: status === 'cancelled' ? (b.cancelled_at || b.updated_at) : b.cancelled_at,
            estimated_price: originalFare,
            final_price: finalFare !== originalFare ? finalFare : (b.final_price ?? undefined),
            payment_method: b.payment_method,
            vehicle_type: b.vehicle_type,
            passenger_count: b.passenger_count,
            reference: b.reference,
            cancellation_reason: b.cancellation_reason,
            rider: resolvedName
                ? { id: riderId, full_name: resolvedName, phone: b.phone_number || b.phone, email: b.email }
                : (riderId && riderLookup.byId[riderId]
                    ? { id: riderId, full_name: riderLookup.byId[riderId] }
                    : null),
            driver: driverObj,
            payments: null,
        };
    });

    // De-duplicate: skip a booking if a real ride with the same id or reference
    // already exists (the backend may already mirror finished rides into `rides`).
    const existingIds = new Set((rides || []).map((r: any) => r.id));
    const existingRefs = new Set(
        (rides || [])
            .map((r: any) => (r.reference || '').toString().toLowerCase())
            .filter(Boolean)
    );
    const seenRefs = new Set<string>();
    const extraRides = normalizedBookings.filter((r: any) => {
        if (existingIds.has(r.id)) return false;
        const ref = (r.reference || '').toString().toLowerCase();
        if (ref && existingRefs.has(ref)) return false;
        if (ref && seenRefs.has(ref)) return false;
        if (ref) seenRefs.add(ref);
        return true;
    });

    const merged = [...(rides || []), ...extraRides].sort((a: any, b: any) => {
        const ta = new Date(a.requested_at || a.created_at || 0).getTime();
        const tb = new Date(b.requested_at || b.created_at || 0).getTime();
        return tb - ta;
    });

    return <RidesClient rides={(merged as any) || []} />;
}
