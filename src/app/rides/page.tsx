import { supabaseAdmin } from "@/lib/supabase";
import { format } from "date-fns";
import {
    MapPin,
    Clock,
    CheckCircle2,
    XCircle,
    Car,
    AlertCircle,
    Route,
    Timer
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RidesPage() {
    const { data: rides, error } = await supabaseAdmin
        .from('rides')
        .select('*, rider:rider_id(*), driver:driver_id(*, user:user_id(full_name, email))')
        .order('requested_at', { ascending: false });

    if (error) {
        console.error("Error fetching rides:", error);
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <span className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-full text-xs font-semibold"><CheckCircle2 className="w-3 h-3" /> Completed</span>;
            case 'cancelled':
                return <span className="inline-flex items-center gap-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-1 rounded-full text-xs font-semibold"><XCircle className="w-3 h-3" /> Cancelled</span>;
            case 'started':
            case 'accepted':
                return <span className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full text-xs font-semibold"><Car className="w-3 h-3" /> In Progress</span>;
            default:
                return <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-full text-xs font-semibold"><Clock className="w-3 h-3" /> Pending</span>;
        }
    };

    return (
        <div className="flex flex-col gap-8 w-full">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Rides & Trips</h1>
                <p className="text-muted-foreground">Monitor live trips, view history, and handle discrepancies.</p>
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow-sm w-full overflow-hidden glass">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-slate-50/50 dark:bg-slate-900/50 border-b">
                            <tr>
                                <th scope="col" className="px-6 py-4 font-medium">Trip Details</th>
                                <th scope="col" className="px-6 py-4 font-medium">Rider / Driver</th>
                                <th scope="col" className="px-6 py-4 font-medium">Status</th>
                                <th scope="col" className="px-6 py-4 font-medium">Distance</th>
                                <th scope="col" className="px-6 py-4 font-medium">Duration</th>
                                <th scope="col" className="px-6 py-4 font-medium">Amount</th>
                                <th scope="col" className="px-6 py-4 font-medium">Date & Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {rides && rides.length > 0 ? (
                                rides.map((ride: any) => (
                                    <tr key={ride.id} className="bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col max-w-[250px]">
                                                <div className="flex items-start gap-2 text-xs mb-2">
                                                    <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                                    <span className="truncate" title={ride.pickup_address}>{ride.pickup_address}</span>
                                                </div>
                                                <div className="flex items-start gap-2 text-xs">
                                                    <MapPin className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                                                    <span className="truncate" title={ride.dropoff_address}>{ride.dropoff_address}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 text-xs">
                                                <span className="font-medium text-foreground">Rider: {ride.rider?.full_name || 'Unknown Rider'}</span>
                                                <span className="text-muted-foreground">Driver: {ride.driver?.user?.full_name || 'Unassigned'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(ride.status)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <Route className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                                                <span className="font-medium">{ride.distance ? `${Number(ride.distance).toFixed(1)} mi` : '—'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <Timer className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                                                <span className="font-medium">{ride.estimated_duration ? `${Math.round(Number(ride.estimated_duration))} min` : '—'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-semibold">£{(ride.final_price || ride.estimated_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase">{ride.payment_status}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                                            {ride.requested_at ? format(new Date(ride.requested_at), 'MMM dd, HH:mm') : 'Unknown'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <AlertCircle className="w-8 h-8 opacity-50" />
                                            <p>No trips found</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
