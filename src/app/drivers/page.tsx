import { supabaseAdmin } from "@/lib/supabase";
import { Car, CheckCircle2, CarTaxiFront, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DriversPage() {
    const { data: drivers, error } = await supabaseAdmin
        .from('drivers')
        .select('*, user:user_id(*)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching drivers:", error);
    }

    // Fetch all rides to map to driver IDs
    const { data: allRides } = await supabaseAdmin
        .from('rides')
        .select('id, driver_id, final_price, estimated_price, status, payment_status')
        .not('driver_id', 'is', null);

    // Fetch all succeeded payments
    const { data: allPayments } = await supabaseAdmin
        .from('payments')
        .select('ride_id, amount')
        .eq('status', 'succeeded');

    // Build a map of driver_id -> total earnings
    const earningsMap: Record<string, number> = {};
    const paidRideIds = new Set<string>();

    if (allRides && allPayments) {
        // Map ride_id to driver_id
        const rideToDriver: Record<string, string> = {};
        allRides.forEach(r => {
            if (r.id && r.driver_id) {
                rideToDriver[r.id] = r.driver_id;
            }
        });

        // Add up succeeded payments
        allPayments.forEach(p => {
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
    }

    return (
        <div className="flex flex-col gap-8 w-full">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Drivers Management</h1>
                <p className="text-muted-foreground">Manage driver approvals, documentation, and live status.</p>
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow-sm w-full overflow-hidden glass">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-slate-50/50 dark:bg-slate-900/50 border-b">
                            <tr>
                                <th scope="col" className="px-6 py-4 font-medium">Driver</th>
                                <th scope="col" className="px-6 py-4 font-medium">Vehicle</th>
                                <th scope="col" className="px-6 py-4 font-medium">Status & Availability</th>
                                <th scope="col" className="px-6 py-4 font-medium">Earnings</th>
                                <th scope="col" className="px-6 py-4 font-medium">Joined</th>
                                <th scope="col" className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {drivers && drivers.length > 0 ? (
                                drivers.map((driver: any) => (
                                    <tr key={driver.id} className="bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 relative rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 flex-shrink-0">
                                                    {driver.user?.profile_image ? (
                                                        <img src={driver.user.profile_image} alt={driver.user.full_name} className="object-cover w-full h-full" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                                                            <Car className="w-5 h-5" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-foreground">{driver.user?.full_name || 'Unknown User'}</span>
                                                    <span className="text-xs text-muted-foreground">{driver.user?.email}</span>
                                                    <span className="text-xs text-muted-foreground">{driver.user?.phone}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="font-semibold">{driver.vehicle_year} {driver.vehicle_make} {driver.vehicle_model}</span>
                                                <span className="text-xs text-muted-foreground capitalize">{driver.vehicle_color} &bull; {driver.vehicle_type}</span>
                                                <span className="text-xs font-mono font-medium tracking-widest mt-0.5 uppercase bg-slate-100 dark:bg-slate-800 inline-block px-1.5 py-0.5 rounded w-fit border">{driver.license_plate}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1.5">
                                                {driver.is_online ? (
                                                    <span className="inline-flex items-center w-fit gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Online
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center w-fit gap-1 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Offline
                                                    </span>
                                                )}

                                                {driver.is_available ? (
                                                    <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs font-medium">
                                                        <CheckCircle2 className="w-3 h-3" /> Available
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-medium">
                                                        <CarTaxiFront className="w-3 h-3" /> Busy
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-emerald-600 dark:text-emerald-400">
                                            £{(earningsMap[driver.id] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                                            {driver.created_at ? format(new Date(driver.created_at), 'MMM dd, yyyy') : 'Unknown'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link href={`/drivers/${driver.id}`} className="text-sm font-medium text-primary hover:underline">
                                                Review
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <AlertCircle className="w-8 h-8 opacity-50" />
                                            <p>No drivers found</p>
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
