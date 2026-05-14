import { supabaseAdmin } from "@/lib/supabase";
import { User as UserIcon, Shield, CheckCircle2, ChevronLeft, MapPin, Clock, CreditCard, PoundSterling } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// Status badge styling
function getStatusBadge(status: string) {
    switch (status) {
        case 'completed':
            return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';
        case 'in_progress':
            return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';
        case 'accepted':
        case 'arriving':
        case 'arrived':
            return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
        case 'cancelled':
        case 'cancelled_no_drivers':
            return 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300';
        case 'pending':
            return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
        default:
            return 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
    }
}

export default async function UserDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    const userId = resolvedParams.id;

    // Fetch the user
    const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (userError || !user) {
        console.error("User not found:", userError);
        return notFound();
    }

    // Fetch ALL rides for this rider (not just 10) — use requested_at for ordering
    const { data: rides, error: ridesError } = await supabaseAdmin
        .from('rides')
        .select('*, driver:driver_id(user:user_id(full_name, phone))')
        .eq('rider_id', userId)
        .order('requested_at', { ascending: false });

    if (ridesError) {
        console.error("Error fetching rides for user:", ridesError);
    }

    // Compute actual ride counts dynamically from the rides table
    const allRides = rides || [];
    const totalRides = allRides.length;
    const completedRides = allRides.filter((r: any) => r.status === 'completed').length;
    const cancelledRides = allRides.filter((r: any) => r.status === 'cancelled' || r.status === 'cancelled_no_drivers').length;
    const totalSpent = allRides
        .filter((r: any) => r.status === 'completed')
        .reduce((sum: number, r: any) => sum + (r.final_price || r.estimated_price || 0), 0);

    // Fetch payments for this user too, in case rides were recorded differently
    const { data: payments } = await supabaseAdmin
        .from('payments')
        .select('ride_id, amount, status, completed_at')
        .eq('user_id', userId)
        .eq('status', 'succeeded');

    const totalPaid = (payments || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    return (
        <div className="flex flex-col gap-6 w-full max-w-5xl">
            <div className="flex items-center gap-4">
                <Link href="/users" className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-muted-foreground mr-2">
                    <ChevronLeft className="w-5 h-5" />
                </Link>
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        User Profile
                        {user.role === 'admin' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/20 text-primary">Admin</span>
                        )}
                    </h1>
                    <p className="text-muted-foreground text-sm">Detailed view and trip history.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Profile Card */}
                <div className="md:col-span-1 flex flex-col gap-6">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 glass flex flex-col items-center text-center">
                        <div className="h-24 w-24 relative rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 mb-4 shadow-sm ring-4 ring-slate-50 dark:ring-slate-900">
                            {user.profile_image ? (
                                <img src={user.profile_image} alt={user.full_name} className="object-cover w-full h-full" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                    <UserIcon className="w-10 h-10" />
                                </div>
                            )}
                        </div>
                        <h2 className="text-xl font-bold text-foreground">{user.full_name}</h2>
                        <p className="text-slate-500 mb-4">{user.email}</p>

                        <div className="flex items-center gap-2 mb-6">
                            {user.is_verified ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-medium bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 rounded-full">
                                    <CheckCircle2 className="w-4 h-4" /> Verified
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-sm font-medium bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-full">
                                    <Shield className="w-4 h-4" /> Unverified
                                </span>
                            )}
                        </div>

                        <div className="w-full pt-6 border-t border-border flex flex-col gap-3 text-sm text-left">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Phone</span>
                                <span className="font-medium">{user.phone || 'Not provided'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Joined</span>
                                <span className="font-medium">{user.created_at ? format(new Date(user.created_at), 'MMM dd, yyyy') : 'Unknown'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Total Rides</span>
                                <span className="font-medium text-primary">{totalRides}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Completed</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">{completedRides}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Cancelled</span>
                                <span className="font-medium text-rose-600 dark:text-rose-400">{cancelledRides}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Total Spent</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    £{(totalSpent || totalPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Rating</span>
                                <span className="font-medium flex items-center gap-1">
                                    ⭐ {user.rating?.toFixed(1) || '5.0'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* History Area */}
                <div className="md:col-span-2 flex flex-col gap-6">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 glass flex flex-col h-full">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-lg">Ride History</h3>
                            <span className="text-xs text-muted-foreground">{totalRides} total ride{totalRides !== 1 ? 's' : ''}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4">
                            {allRides.length > 0 ? (
                                allRides.map((ride: any) => (
                                    <div key={ride.id} className="p-4 rounded-lg border bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row gap-4 justify-between sm:items-center">
                                        <div className="flex flex-col flex-1 max-w-[320px]">
                                            <span className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {ride.requested_at ? format(new Date(ride.requested_at), 'MMM dd, yyyy - HH:mm') : 'Unknown date'}
                                            </span>
                                            <div className="flex items-start gap-2 text-sm mb-1.5">
                                                <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                                <span className="truncate" title={ride.pickup_address}>{ride.pickup_address || 'Unknown pickup'}</span>
                                            </div>
                                            <div className="flex items-start gap-2 text-sm">
                                                <MapPin className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                                                <span className="truncate" title={ride.dropoff_address}>{ride.dropoff_address || 'Unknown dropoff'}</span>
                                            </div>
                                            {ride.driver?.user?.full_name && (
                                                <span className="text-xs text-muted-foreground mt-2">
                                                    Driver: {ride.driver.user.full_name}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex flex-col sm:items-end gap-1">
                                            <span className="font-bold text-lg">£{(ride.final_price || ride.estimated_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${getStatusBadge(ride.status)}`}>
                                                {ride.status?.replace(/_/g, ' ')}
                                            </span>
                                            {ride.payment_status && ride.payment_status !== 'pending' && (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                                    <CreditCard className="w-3 h-3" /> {ride.payment_status}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-12">
                                    <MapPin className="w-8 h-8 opacity-20 mb-3" />
                                    <p>No rides taken yet.</p>
                                    <p className="text-xs mt-1 opacity-50">Rides will appear here once this rider completes a trip.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
