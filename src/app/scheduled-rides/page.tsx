import { supabaseAdmin } from "@/lib/supabase";
import { format } from "date-fns";
import {
    MapPin,
    Clock,
    CheckCircle2,
    XCircle,
    Car,
    AlertCircle,
    CalendarClock,
    UserCircle,
    ArrowRight,
    Timer,
} from "lucide-react";
import AssignDriverButton from "./AssignDriverButton";

export const dynamic = "force-dynamic";

export default async function ScheduledRidesPage() {
    // Fetch bookings without FK joins (later_bookings has no FK constraints in schema)
    const { data: rawBookings, error } = await supabaseAdmin
        .from('later_bookings')
        .select('*')
        .order('pickup_at', { ascending: true });

    if (error) {
        console.error("Error fetching scheduled rides:", error);
    }

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
            driver_name: driverMap[dId] || null,
        };
    });

    // Separate into upcoming and past
    const now = new Date();
    const upcomingBookings = bookings?.filter(
        (b: any) => new Date(b.pickup_at) > now && !['cancelled', 'completed'].includes(b.status)
    ) || [];
    const pastBookings = bookings?.filter(
        (b: any) => new Date(b.pickup_at) <= now || ['cancelled', 'completed'].includes(b.status)
    ) || [];

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

    const totalBookings = bookings?.length || 0;
    const scheduledCount = bookings?.filter((b: any) => b.status === 'scheduled').length || 0;
    const acceptedCount = bookings?.filter((b: any) => b.status === 'driver_accepted').length || 0;
    const cancelledCount = bookings?.filter((b: any) => b.status === 'cancelled').length || 0;

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
                        <span className="text-sm font-medium text-muted-foreground">Cancelled</span>
                        <XCircle className="h-4 w-4 text-rose-500" />
                    </div>
                    <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{cancelledCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">Rides cancelled</p>
                </div>
            </div>

            {/* Upcoming Rides */}
            {upcomingBookings.length > 0 && (
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <h2 className="text-lg font-semibold text-foreground">Upcoming Rides ({upcomingBookings.length})</h2>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {upcomingBookings.map((booking: any) => (
                            <div
                                key={booking.id}
                                className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 glass hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group"
                            >
                                {/* Header: Status + Time */}
                                <div className="flex items-center justify-between mb-4">
                                    {getStatusBadge(booking.status)}
                                    <span className="text-xs text-muted-foreground font-mono">
                                        #{booking.id?.slice(0, 8)}
                                    </span>
                                </div>

                                {/* Schedule Time */}
                                <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                                    <CalendarClock className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                                            {format(new Date(booking.pickup_at), 'EEE, dd MMM yyyy')}
                                        </span>
                                        <div className="flex items-center gap-1.5 text-xs text-indigo-600/80 dark:text-indigo-400/80">
                                            <span className="font-semibold">{format(new Date(booking.pickup_at), 'HH:mm')}</span>
                                            <ArrowRight className="w-3 h-3" />
                                            <span className="font-semibold">{format(new Date(booking.dropoff_by), 'HH:mm')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Route */}
                                <div className="flex gap-3 mb-4">
                                    <div className="flex flex-col items-center pt-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
                                        <div className="w-0.5 flex-1 bg-gradient-to-b from-emerald-500/50 to-amber-500/50 my-1" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
                                    </div>
                                    <div className="flex flex-col gap-3 flex-1 min-w-0">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Pickup</p>
                                            <p className="text-sm font-medium text-foreground truncate" title={booking.pickup_address}>
                                                {booking.pickup_address}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Dropoff</p>
                                            <p className="text-sm font-medium text-foreground truncate" title={booking.dropoff_address}>
                                                {booking.dropoff_address}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Rider Info & Fare */}
                                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                                    <div className="flex items-center gap-2">
                                        <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                        <span className="text-xs font-medium text-muted-foreground truncate">
                                            {booking.rider_name || 'Unknown Rider'}
                                        </span>
                                        {booking.driver_name && (
                                            <>
                                                <ArrowRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                                                <Car className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 truncate">
                                                    {booking.driver_name}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 pl-2">
                                        £{Number(booking.estimated_fare || booking.estimated_price || booking.final_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {bookings && bookings.length > 0 ? (
                                    bookings.map((booking: any) => {
                                        const isPast = new Date(booking.pickup_at) <= now;
                                        const isCancelled = booking.status === 'cancelled' || booking.status === 'cancelled_no_drivers';
                                        const isExpired = booking.status === 'expired' || (isPast && booking.status === 'scheduled');
                                        const shouldDim = isCancelled || isExpired;
                                        return (
                                            <tr
                                                key={booking.id}
                                                className={`bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                                                    shouldDim ? 'opacity-50 dark:opacity-40' : ''
                                                }`}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col max-w-[250px]">
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
                                                    <AssignDriverButton bookingId={booking.id} currentDriverName={booking.driver_name} />
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
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-16 text-center text-muted-foreground">
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
