import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import {
    MapPin,
    Clock,
    CheckCircle2,
    XCircle,
    Car,
    CalendarClock,
    UserCircle,
    Globe,
    Pencil,
    ArrowRight,
    ArrowLeft,
} from "lucide-react";
import AssignDriverButton from "./AssignDriverButton";
import EditLaterBookingButton from "./EditLaterBookingButton";
import { formatUkDateShort, formatUkTime } from "@/lib/uk-datetime";
import {
    buildRiderLookup,
    resolveLaterLegFare,
    resolveRiderId,
    resolveRiderName,
    resolveWebBookerFare,
    toNum,
} from "@/lib/scheduled-booking-utils";

export const dynamic = "force-dynamic";

// Map web_booker statuses onto the scheduled-ride display statuses.
function mapWebBookerStatus(status?: string): string {
    switch (status) {
        case 'driver_assigned':
        case 'manual':
            return 'driver_assigned';
        case 'driver_accepted':
            return 'driver_accepted';
        case 'completed':
            return 'completed';
        case 'cancelled':
        case 'cancelled_no_drivers':
            return 'cancelled';
        case 'in_progress':
            return 'in_progress';
        case 'marketplace':
        case 'searching_driver':
        case 'pending':
        default:
            return 'scheduled';
    }
}

// Once a ride is accepted / started by a driver it should not be reassigned.
function isDriverAssignmentLocked(status?: string, assignmentStatus?: string): boolean {
    if ((assignmentStatus || '').toLowerCase() === 'accepted') return true;
    if ((assignmentStatus || '').toLowerCase() === 'declined') return false;
    return ['driver_accepted', 'accepted', 'arrived', 'started', 'in_progress', 'completed'].includes((status || '').toLowerCase());
}

// Build a single "Additional Stop" display string from the stops array /
// stops_text columns. Returns null when the leg has no additional stop.
function formatAdditionalStop(stops: unknown, stopsText: unknown): string | null {
    if (typeof stopsText === 'string' && stopsText.trim()) return stopsText.trim();
    if (Array.isArray(stops)) {
        const cleaned = stops.filter((s) => typeof s === 'string' && (s as string).trim()) as string[];
        if (cleaned.length > 0) return cleaned.join('  •  ');
    }
    return null;
}

// Safe date formatting that won't throw on null / invalid values.
function fmtDate(value: unknown, pattern: string): string {
    if (!value) return '—';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '—';
    if (pattern === 'HH:mm') return formatUkTime(d);
    return formatUkDateShort(d);
}

function resolveDriverId(booking: any): string | null {
    const candidates = [booking.driver_id, booking.assigned_driver_id, booking.assigned_driver];
    for (const value of candidates) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
}

// Expand a booking into display "legs". Round-trip "later" bookings become two
// separate rows (onward + return); everything else stays a single row. Each leg
// carries its own route, additional stop and individual fare.
function expandBookingToLegs(booking: any): any[] {
    const assignBookingId = booking.id;

    if (booking.source !== 'later' || !booking.is_round_trip) {
        const fare = booking.source === 'web_booker'
            ? resolveWebBookerFare(booking)
            : resolveLaterLegFare(booking, 'single');
        return [{
            ...booking,
            assignBookingId,
            rowKey: booking.id,
            leg: 'single',
            legLabel: null,
            additional_stop: formatAdditionalStop(booking.stops, booking.stops_text),
            leg_fare: fare,
        }];
    }

    // Round trip → split into onward + return using discounted final fares.
    const outboundFare = resolveLaterLegFare(booking, 'outbound');
    const returnFare = resolveLaterLegFare(booking, 'return');

    const outbound = {
        ...booking,
        assignBookingId,
        rowKey: `${booking.id}::outbound`,
        leg: 'outbound',
        legLabel: 'Onward',
        additional_stop: formatAdditionalStop(booking.stops, booking.stops_text),
        leg_fare: outboundFare,
    };

    const returnAt = booking.return_at || null;
    const retDur = toNum(booking.return_duration_minutes);
    const returnDropoffBy = (returnAt && retDur != null)
        ? new Date(new Date(returnAt).getTime() + retDur * 60000).toISOString()
        : (returnAt || booking.dropoff_by);

    const ret = {
        ...booking,
        assignBookingId,
        rowKey: `${booking.id}::return`,
        leg: 'return',
        legLabel: 'Return',
        pickup_address: booking.return_pickup_address || booking.dropoff_address,
        dropoff_address: booking.return_dropoff_address || booking.pickup_address,
        additional_stop: formatAdditionalStop(booking.return_stops, booking.return_stops_text),
        pickup_at: returnAt || booking.pickup_at,
        dropoff_by: returnDropoffBy,
        leg_fare: returnFare,
    };

    return [outbound, ret];
}

export default async function ScheduledRidesPage() {
    // Fetch app "Later" bookings (later_bookings has no FK constraints in schema)
    const { data: laterBookings, error } = await supabaseAdmin
        .from('later_bookings')
        .select('*')
        .order('pickup_at', { ascending: true });

    if (error) {
        console.error("Error fetching scheduled rides:", error);
    }

    // Fetch admin/web-booker bookings so they appear here too.
    const { data: webBookings, error: webError } = await supabaseAdmin
        .from('web_booker')
        .select('*, users:rider_id(full_name)')
        .order('scheduled_time', { ascending: true });

    if (webError) {
        console.error("Error fetching web booker rides:", webError);
    }

    // Normalize web_booker rows into the unified scheduled-ride shape.
    const normalizedWeb = (webBookings || []).map((b: any) => {
        const pickupAt = b.scheduled_time || b.created_at;
        const dropoffBy = b.dropoff_by
            || (pickupAt ? new Date(new Date(pickupAt).getTime() + 30 * 60000).toISOString() : null);
        return {
            ...b,
            source: 'web_booker',
            pickup_at: pickupAt,
            dropoff_by: dropoffBy,
            estimated_fare: b.estimated_price ?? b.estimated_fare ?? b.final_price ?? 0,
            driver_id: b.assigned_driver_id || null,
            status: mapWebBookerStatus(b.status),
        };
    });

    const normalizedLater = (laterBookings || []).map((b: any) => ({ ...b, source: 'later' }));

    // Combined feed of both sources.
    const rawBookings = [...normalizedLater, ...normalizedWeb];

    // Collect rider/driver ids plus booking contact fields for name lookup.
    const riderIds = [...new Set((rawBookings || [])
        .map((b: any) => resolveRiderId(b))
        .filter((id: string | null): id is string => Boolean(id)))];
    const riderEmails = [...new Set((rawBookings || [])
        .map((b: any) => (typeof b.email === 'string' ? b.email.trim().toLowerCase() : null))
        .filter((email: string | null): email is string => Boolean(email)))];
    const riderPhones = [...new Set((rawBookings || [])
        .map((b: any) => {
            const raw = b.phone_number || b.phone;
            if (typeof raw !== 'string') return null;
            const digits = raw.replace(/\D/g, '');
            return digits || null;
        })
        .filter((phone: string | null): phone is string => Boolean(phone)))];
    const driverIds = [...new Set((rawBookings || [])
        .map((b: any) => resolveDriverId(b))
        .filter((id: string | null): id is string => Boolean(id)))];

    const riderLookupFilters: string[] = [];
    if (riderIds.length > 0) riderLookupFilters.push(`id.in.(${riderIds.join(',')})`);
    if (riderEmails.length > 0) riderLookupFilters.push(`email.in.(${riderEmails.join(',')})`);
    if (riderPhones.length > 0) riderLookupFilters.push(`phone.in.(${riderPhones.join(',')})`);

    const riderLookup = buildRiderLookup([]);
    if (riderLookupFilters.length > 0) {
        const { data: riders } = await supabaseAdmin
            .from('users')
            .select('id, full_name, email, phone')
            .or(riderLookupFilters.join(','));
        Object.assign(riderLookup, buildRiderLookup(riders || []));
    }

    // Fetch driver details from drivers table (joined with user) AND users table directly
    const driverMap: Record<string, string> = {};
    if (driverIds.length > 0) {
        // Try fetching matching rows from drivers table via id
        const { data: driversById } = await supabaseAdmin
            .from('drivers')
            .select('id, user:user_id(full_name)')
            .in('id', driverIds);
        (driversById || []).forEach((d: any) => {
            if (d.user?.full_name) {
                driverMap[d.id] = d.user.full_name;
            }
        });

        // Try fetching matching rows from drivers table via user_id instead (in case user_id was stored)
        const { data: driversByUserId } = await supabaseAdmin
            .from('drivers')
            .select('id, user_id, user:user_id(full_name)')
            .in('user_id', driverIds);
        (driversByUserId || []).forEach((d: any) => {
            if (d.user?.full_name && d.user_id) {
                driverMap[d.user_id] = d.user.full_name;
            }
        });

        // Finally, try fetching generic users directly if still missing (just in case they don't have driver entry)
        const missingIds = driverIds.filter(id => !driverMap[id as string]);
        if (missingIds.length > 0) {
            const { data: directUsers } = await supabaseAdmin
                .from('users')
                .select('id, full_name')
                .in('id', missingIds);
            (directUsers || []).forEach((u: any) => {
                if (!driverMap[u.id]) {
                    driverMap[u.id] = u.full_name;
                }
            });
        }
    }

    // Enrich bookings with rider/driver names
    const bookings = (rawBookings || []).map((b: any) => {
        const dId = resolveDriverId(b);
        return {
            ...b,
            rider_name: resolveRiderName(b, riderLookup),
            driver_name: b.assigned_driver_name || (dId ? driverMap[dId] : null) || null,
            is_driver_assignment_locked: isDriverAssignmentLocked(b.status, b.assignment_status),
        };
    });

    // Completed and cancelled rides are moved to "Rides & Trips" (history), so
    // the Scheduled Rides page only lists active (upcoming / in-progress) rides.
    const activeBookings = (bookings || []).filter(
        (b: any) => !['completed', 'cancelled', 'cancelled_no_drivers', 'expired'].includes(b.status)
    );

    // Expand round-trip "later" bookings into separate onward + return legs,
    // then order every leg by pickup date & time (earliest upcoming first).
    const tableLegs = activeBookings
        .flatMap((b: any) => expandBookingToLegs(b))
        .sort((a: any, b: any) => {
            const aTime = new Date(a.pickup_at || 0).getTime();
            const bTime = new Date(b.pickup_at || 0).getTime();
            const safeATime = Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER;
            const safeBTime = Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER;
            return safeATime - safeBTime;
        });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'scheduled':
                return (
                    <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <CalendarClock className="w-3 h-3" /> Scheduled
                    </span>
                );
            case 'driver_assigned':
                return (
                    <span className="inline-flex items-center gap-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Driver Assigned
                    </span>
                );
            case 'driver_accepted':
                return (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Driver Accepted
                    </span>
                );
            case 'in_progress':
                return (
                    <span className="inline-flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <Car className="w-3 h-3" /> In Progress
                    </span>
                );
            case 'completed':
                return (
                    <span className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Completed
                    </span>
                );
            case 'cancelled':
                return (
                    <span className="inline-flex items-center gap-1.5 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <XCircle className="w-3 h-3" /> Cancelled
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <Clock className="w-3 h-3" /> {status}
                    </span>
                );
        }
    };

    const totalBookings = activeBookings.length;
    const scheduledCount = activeBookings.filter((b: any) => b.status === 'scheduled').length;
    const assignedCount = activeBookings.filter((b: any) => ['driver_assigned', 'driver_accepted'].includes(b.status)).length;
    const inProgressCount = activeBookings.filter((b: any) => b.status === 'in_progress' || b.status === 'arrived' || b.status === 'started').length;

    return (
        <div className="flex flex-col gap-8 w-full">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Scheduled Rides</h1>
                <p className="text-muted-foreground">View and manage all pre-booked (&ldquo;Later&rdquo;) ride reservations.</p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 glass hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between pb-2">
                        <span className="text-sm font-medium text-muted-foreground">Total Bookings</span>
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{totalBookings}</div>
                    <p className="text-xs text-muted-foreground mt-1">All time scheduled rides</p>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 glass hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between pb-2">
                        <span className="text-sm font-medium text-muted-foreground">Awaiting Driver</span>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{scheduledCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">No driver assigned yet</p>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 glass hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between pb-2">
                        <span className="text-sm font-medium text-muted-foreground">Driver Assigned</span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{assignedCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">Ready for pickup</p>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 glass hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between pb-2">
                        <span className="text-sm font-medium text-muted-foreground">In Progress</span>
                        <Car className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{inProgressCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">Currently on a trip</p>
                </div>
            </div>

            {/* All Rides Table */}
            <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-foreground">All Scheduled Rides</h2>
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm w-full overflow-hidden glass">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-slate-50/50 dark:bg-slate-900/50 border-b">
                                <tr>
                                    <th scope="col" className="px-6 py-4 font-medium">Route</th>
                                    <th scope="col" className="px-6 py-4 font-medium">Additional Stop</th>
                                    <th scope="col" className="px-6 py-4 font-medium">Rider</th>
                                    <th scope="col" className="px-6 py-4 font-medium">Driver</th>
                                    <th scope="col" className="px-6 py-4 font-medium">Status</th>
                                    <th scope="col" className="px-6 py-4 font-medium">Pickup Time</th>
                                    <th scope="col" className="px-6 py-4 font-medium">Dropoff By</th>
                                    <th scope="col" className="px-6 py-4 font-medium">Booked On</th>
                                    <th scope="col" className="px-6 py-4 font-medium">Fare</th>
                                    <th scope="col" className="px-6 py-4 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {tableLegs.length > 0 ? (
                                    tableLegs.map((booking: any) => {
                                        return (
                                            <tr
                                                key={booking.rowKey}
                                                className="bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col max-w-[250px]">
                                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                            {booking.source === 'web_booker' ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                                                                    <Globe className="w-3 h-3" /> Web Booker
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                                    App
                                                                </span>
                                                            )}
                                                            {booking.legLabel === 'Onward' && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                                                    <ArrowRight className="w-3 h-3" /> Onward
                                                                </span>
                                                            )}
                                                            {booking.legLabel === 'Return' && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                                                    <ArrowLeft className="w-3 h-3" /> Return
                                                                </span>
                                                            )}
                                                            {booking.reference && (
                                                                <span className="text-[10px] font-mono text-muted-foreground">#{booking.reference}</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-start gap-2 text-xs mb-2">
                                                            <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                                            <span className="truncate" title={booking.pickup_address}>
                                                                {booking.pickup_address}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-start gap-2 text-xs">
                                                            <MapPin className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                                            <span className="truncate" title={booking.dropoff_address}>
                                                                {booking.dropoff_address}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {booking.additional_stop ? (
                                                        <div className="flex items-start gap-2 text-xs max-w-[200px]">
                                                            <MapPin className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                                                            <span className="truncate" title={booking.additional_stop}>
                                                                {booking.additional_stop}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-muted-foreground bg-slate-100 dark:bg-slate-800">
                                                            N/A
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                        <span className="text-xs font-medium">
                                                            {booking.rider_name || 'Unknown Rider'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <AssignDriverButton
                                                        bookingId={booking.assignBookingId}
                                                        currentDriverName={booking.driver_name}
                                                        source={booking.source}
                                                        status={booking.status}
                                                        assignmentStatus={booking.assignment_status}
                                                        lockAssignment={booking.is_driver_assignment_locked}
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getStatusBadge(booking.status)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-semibold text-foreground">
                                                            {fmtDate(booking.pickup_at, 'MMM dd, yyyy')}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {fmtDate(booking.pickup_at, 'HH:mm')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-semibold text-foreground">
                                                            {fmtDate(booking.dropoff_by, 'MMM dd, yyyy')}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {fmtDate(booking.dropoff_by, 'HH:mm')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {booking.created_at ? (
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-semibold text-foreground">
                                                                {fmtDate(booking.created_at, 'MMM dd, yyyy')}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {fmtDate(booking.created_at, 'HH:mm')}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 font-bold text-emerald-600 dark:text-emerald-400">
                                                    £{Number(booking.leg_fare || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {booking.source === 'web_booker' ? (
                                                        <Link
                                                            href={`/web-booker/dashboard/${booking.assignBookingId}`}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" /> Edit details
                                                        </Link>
                                                    ) : (
                                                        <EditLaterBookingButton bookingId={booking.assignBookingId} />
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={10} className="px-6 py-16 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                                    <CalendarClock className="w-8 h-8 opacity-40" />
                                                </div>
                                                <p className="font-medium">No scheduled rides yet</p>
                                                <p className="text-xs max-w-[280px]">
                                                    When riders book &ldquo;Later&rdquo; rides from the app, they will appear here.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
