import { supabaseAdmin } from "@/lib/supabase";
import { format } from "date-fns";
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
} from "lucide-react";
import AssignDriverButton from "./AssignDriverButton";

export const dynamic = "force-dynamic";

// Map web_booker statuses onto the scheduled-ride display statuses.
function mapWebBookerStatus(status?: string): string {
    switch (status) {
        case 'driver_assigned':
        case 'manual':
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
        .select('*')
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

    // Collect unique rider_id and driver_id values to look up names
    const riderIds = [...new Set((rawBookings || []).map((b: any) => b.rider_id || b.user_id).filter(Boolean))];
    const driverIds = [...new Set((rawBookings || []).map((b: any) => b.driver_id || b.assigned_driver_id || b.assigned_driver).filter(Boolean))];

    // Fetch rider details from users table
    const riderMap: Record<string, string> = {};
    if (riderIds.length > 0) {
        const { data: riders } = await supabaseAdmin
            .from('users')
            .select('id, full_name')
            .in('id', riderIds);
        (riders || []).forEach((r: any) => { riderMap[r.id] = r.full_name; });
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
        const rId = b.rider_id || b.user_id;
        const dId = b.driver_id || b.assigned_driver_id || b.assigned_driver;
        return {
            ...b,
            rider_name: riderMap[rId] || null,
            driver_name: driverMap[dId] || b.assigned_driver_name || null,
        };
    });

    const now = new Date();

    // Completed and cancelled rides are moved to "Rides & Trips" (history), so
    // the Scheduled Rides page only lists active (upcoming / in-progress) rides.
    const activeBookings = (bookings || []).filter(
        (b: any) => !['completed', 'cancelled', 'cancelled_no_drivers', 'expired'].includes(b.status)
    );

    // Table rows ordered by pickup date & time, most recent first
    // (matches the ordering used on the Rides & Trips page).
    const tableBookings = [...activeBookings].sort(
        (a: any, b: any) => new Date(b.pickup_at).getTime() - new Date(a.pickup_at).getTime()
    );

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'scheduled':
                return (
                    <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <CalendarClock className="w-3 h-3" /> Scheduled
                    </span>
                );
            case 'driver_accepted':
                return (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Driver Assigned
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
    const acceptedCount = activeBookings.filter((b: any) => b.status === 'driver_accepted').length;
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
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{acceptedCount}</div>
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
                                {tableBookings.length > 0 ? (
                                    tableBookings.map((booking: any) => {
                                        const isPast = new Date(booking.pickup_at) <= now;
                                        const isCancelled = booking.status === 'cancelled' || booking.status === 'cancelled_no_drivers';
                                        const isCompleted = booking.status === 'completed';
                                        const isExpired = booking.status === 'expired';
                                        // Blur & dim rides whose pickup time has passed or that are cancelled.
                                        const shouldDim = isPast || isCancelled || isCompleted || isExpired;
                                        return (
                                            <tr
                                                key={booking.id}
                                                className={`bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                                                    shouldDim ? 'opacity-50 dark:opacity-40 blur-[1.1px] hover:blur-none hover:opacity-100 grayscale hover:grayscale-0' : ''
                                                }`}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col max-w-[250px]">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {booking.source === 'web_booker' ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                                                                    <Globe className="w-3 h-3" /> Web Booker
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                                    App
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
                                                    <div className="flex items-center gap-2">
                                                        <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                        <span className="text-xs font-medium">
                                                            {booking.rider_name || 'Unknown Rider'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <AssignDriverButton bookingId={booking.id} currentDriverName={booking.driver_name} source={booking.source} />
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getStatusBadge(booking.status)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-semibold text-foreground">
                                                            {format(new Date(booking.pickup_at), 'MMM dd, yyyy')}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {format(new Date(booking.pickup_at), 'HH:mm')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-semibold text-foreground">
                                                            {format(new Date(booking.dropoff_by), 'MMM dd, yyyy')}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {format(new Date(booking.dropoff_by), 'HH:mm')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {booking.created_at ? (
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-semibold text-foreground">
                                                                {format(new Date(booking.created_at), 'MMM dd, yyyy')}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {format(new Date(booking.created_at), 'HH:mm')}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 font-bold text-emerald-600 dark:text-emerald-400">
                                                    £{Number(booking.estimated_fare || booking.estimated_price || booking.final_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {booking.source === 'web_booker' ? (
                                                        <Link
                                                            href={`/web-booker/dashboard/${booking.id}`}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" /> Edit details
                                                        </Link>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-16 text-center text-muted-foreground">
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
