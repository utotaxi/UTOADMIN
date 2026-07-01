import { supabaseAdmin } from "@/lib/supabase";
import {
    Car,
    CarTaxiFront,
    ChevronLeft,
    MapPin,
    Clock,
    FileCheck,
    Ban,
    PoundSterling,
    TrendingUp,
    TrendingDown
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DriverIncomePanel, type Deduction } from "./DriverIncomePanel";
import DriverApprovalButton from "./DriverApprovalButton";
import {
    computeCancellationAmount,
    isCancelledStatus,
} from "@/lib/cancellation-income";

export const dynamic = "force-dynamic";

// Staleness threshold — same as cleanup route
const STALE_THRESHOLD_MINUTES = 2;

// Formats a cancellation reason as "who cancelled" + any extra detail recorded.
function formatCancelledBy(raw?: string | null): string {
    const r = (raw || "").toLowerCase();
    let who: string;
    if (r.includes("no show") || r.includes("no-show") || r.includes("noshow") || r.includes("did not show") || r.includes("didn't show")) {
        who = "Cancelled due to no show";
    } else if (r.includes("driver")) {
        who = "Cancelled by driver";
    } else if (r.includes("rider") || r.includes("passenger") || r.includes("customer") || r.includes("user")) {
        who = "Cancelled by passenger";
    } else {
        who = "Cancelled";
    }
    const detail = (raw || "").trim();
    if (detail && detail.toLowerCase() !== who.toLowerCase()) {
        return `${who} — ${detail}`;
    }
    return who;
}

function pickStringField(row: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === "string" && value.trim()) return value.trim();
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return null;
}

function pickNumberField(row: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim()) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return null;
}

export default async function DriverDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    const driverId = resolvedParams.id;

    // Clean up stale online statuses before rendering this driver's profile
    const cutoff = new Date(new Date().getTime() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    await supabaseAdmin
        .from('drivers')
        .update({ is_online: false, is_available: false })
        .eq('is_online', true)
        .lt('last_seen_at', cutoff);

    // Fetch driver info along with user info
    const { data: driver, error: driverError } = await supabaseAdmin
        .from('drivers')
        .select('*, user:user_id(*)')
        .eq('id', driverId)
        .single();

    if (driverError || !driver) {
        console.error("Driver not found:", driverError);
        return notFound();
    }

    // Fetch recent rides they drove
    const { data: rides, error: ridesError } = await supabaseAdmin
        .from('rides')
        .select('*, rider:rider_id(*)')
        .eq('driver_id', driverId)
        .order('requested_at', { ascending: false })
        .limit(10);

    // Fetch ALL rides for this driver (to get ride IDs for payment lookup).
    // `*` pulls every available column (cancellation_reason, cancelled_at, etc.).
    const { data: allDriverRides } = await supabaseAdmin
        .from('rides')
        .select('*, rider:rider_id(full_name)')
        .eq('driver_id', driverId);

    // Get all ride IDs for this driver
    const driverRideIds = (allDriverRides || []).map(r => r.id);
    const driverRideIdSet = new Set(driverRideIds);
    const allDriverRidesById: Record<string, any> = {};
    (allDriverRides || []).forEach((r: any) => { allDriverRidesById[r.id] = r; });

    // Fetch payments from the payments table linked to this driver's rides
    let driverPayments: any[] = [];
    if (driverRideIds.length > 0) {
        const { data: paymentsData } = await supabaseAdmin
            .from('payments')
            .select('*, user:user_id(full_name, email)')
            .in('ride_id', driverRideIds)
            .order('created_at', { ascending: false });
        driverPayments = paymentsData || [];
    }

    // Fetch cancellation penalties from Supabase.
    // Primary source requested by client: `river_deductions`.
    // Fallback: `rider_deductions` (in case the table name differs by environment).
    let riverDeductionsRaw: Record<string, unknown>[] = [];
    for (const tableName of ['river_deductions', 'rider_deductions']) {
        const { data, error } = await supabaseAdmin
            .from(tableName)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5000);

        if (!error) {
            riverDeductionsRaw = (data || []) as Record<string, unknown>[];
            break;
        }

        // If table doesn't exist, try next fallback; otherwise log and stop.
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('does not exist') || msg.includes('relation')) {
            continue;
        }
        console.error(`[DriverIncome] Error fetching ${tableName}:`, error);
        break;
    }

    // Fetch existing deductions (commission + penalties)
    const { data: deductionsData } = await supabaseAdmin
        .from('driver_deductions')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });
    const deductions: Deduction[] = (deductionsData || []) as Deduction[];

    // ── Cancellation income (rider cancel = +100%, driver cancel = −50%) ───
    const paymentRideIds = new Set(driverPayments.map(p => p.ride_id));
    const riverPenaltyEntries = (riverDeductionsRaw || [])
        .map((row: Record<string, unknown>, index: number) => {
            const rideId = pickStringField(row, ['ride_id', 'rideId', 'booking_id', 'bookingId', 'trip_id', 'tripId', 'reference_ride_id', 'reference']);
            const rowDriverId = pickStringField(row, ['driver_id', 'driverId', 'driver_uuid', 'driver_user_id', 'user_id']);
            const matchesDriverId = !!rowDriverId && (rowDriverId === driverId || rowDriverId === driver.user_id);
            const matchesRideId = !!rideId && driverRideIdSet.has(rideId);
            if (!matchesDriverId && !matchesRideId) return null;

            const rawAmount = pickNumberField(row, ['amount', 'deduction_amount', 'penalty_amount', 'value', 'total_amount']);
            if (rawAmount == null || rawAmount === 0) return null;

            // Penalties are deductions from driver income.
            const signedPenaltyAmount = rawAmount > 0 ? -Math.abs(rawAmount) : rawAmount;
            if (signedPenaltyAmount >= 0) return null;

            const linkedRide = rideId ? allDriverRidesById[rideId] : null;
            const rowId = pickStringField(row, ['id', 'uuid', 'deduction_id']) || `${rideId || 'unknown'}-${index}`;
            const reason = pickStringField(row, ['reason', 'description', 'note', 'deduction_reason', 'penalty_reason', 'title'])
                || '50% cancellation penalty';
            const createdAt = pickStringField(row, ['created_at', 'createdAt', 'timestamp', 'updated_at'])
                || linkedRide?.cancelled_at
                || linkedRide?.requested_at
                || linkedRide?.created_at
                || new Date().toISOString();

            return {
                id: `river-deduction-${rowId}`,
                amount: Math.round(signedPenaltyAmount * 100) / 100,
                status: 'succeeded',
                currency: 'gbp',
                payment_method: 'cancellation_fee',
                created_at: createdAt,
                ride_id: rideId || `river-deduction-${rowId}`,
                entry_type: 'cancellation',
                cancellation_reason: reason,
                ride_status: linkedRide?.status || 'cancelled',
                user: { full_name: linkedRide?.rider?.full_name || 'Unknown' },
            };
        })
        .filter(Boolean) as any[];

    // When a ride already has a penalty in river_deductions, use that exact value
    // and skip computed fallback debits to avoid mismatches/double counting.
    const ridesWithRiverPenalty = new Set(
        riverPenaltyEntries
            .map((e: any) => e.ride_id)
            .filter((rideId: string) => driverRideIdSet.has(rideId))
    );

    const cancellationEntries = (allDriverRides || [])
        .filter((r: any) =>
            isCancelledStatus(r.status) &&
            !paymentRideIds.has(r.id)
        )
        .map((r: any) => ({ ride: r, amount: computeCancellationAmount(r) }))
        .filter(({ ride, amount }: any) =>
            amount !== 0 &&
            // Keep rider/no-show credits computed from ride data,
            // but read driver penalty debits from river_deductions when present.
            (amount > 0 || !ridesWithRiverPenalty.has(ride.id))
        )
        .map(({ ride, amount }: any) => ({
            id: `cancel-${ride.id}`,
            amount,
            status: 'succeeded',
            currency: 'gbp',
            payment_method: 'cancellation_fee',
            created_at: ride.cancelled_at || ride.requested_at || ride.created_at,
            ride_id: ride.id,
            entry_type: 'cancellation',
            cancellation_reason: ride.cancellation_reason || null,
            ride_status: ride.status,
            user: { full_name: ride.rider?.full_name || 'Unknown' },
        }));

    // Combined income feed: real payments + cancellation credits/fees.
    // Driver penalties come from river_deductions when available.
    const incomeEntries = [
        ...driverPayments.map((p: any) => ({ ...p, entry_type: 'payment' })),
        ...cancellationEntries,
        ...riverPenaltyEntries,
    ].sort((a: any, b: any) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const cancellationFeesTotal = [...cancellationEntries, ...riverPenaltyEntries].reduce((sum, e) => sum + (e.amount || 0), 0);

    // Calculate income from payments table
    const succeededPayments = driverPayments.filter(p => p.status === 'succeeded');
    const pendingPayments = driverPayments.filter(p => p.status === 'pending');
    const failedPayments = driverPayments.filter(p => p.status === 'failed');

    const totalEarnedFromPayments = succeededPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const pendingIncome = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const failedIncome = failedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalDeductions = deductions.reduce((sum, d) => sum + (d.amount || 0), 0);

    // Also compute from rides as a fallback / combined total
    const succeededPaymentRideIds = new Set(succeededPayments.map(p => p.ride_id));
    const completedPaidRides = (allDriverRides || []).filter(r => 
        (r.status === 'completed' && r.payment_status === 'paid') ||
        succeededPaymentRideIds.has(r.id)
    );
    const totalEarningsFromRides = completedPaidRides.reduce((sum, r) => sum + (r.final_price || r.estimated_price || 0), 0);

    // Use the higher of the two (payments table is the source of truth if
    // available, otherwise use rides) and always add cancellation-fee income.
    const totalEarnings = (totalEarnedFromPayments > 0 ? totalEarnedFromPayments : totalEarningsFromRides) + cancellationFeesTotal;
    const effectiveIncome = Math.max(0, totalEarnings - totalDeductions);

    // Build a map of ride_id -> ride details for the payment history
    const rideMap: Record<string, any> = {};
    (allDriverRides || []).forEach(r => { rideMap[r.id] = r; });

    // Prepare driver info for the income panel
    const driverInfo = {
        name: driver.user?.full_name || 'Unknown Driver',
        email: driver.user?.email || '',
        vehicle: `${driver.vehicle_year || ''} ${driver.vehicle_make || ''} ${driver.vehicle_model || ''}`.trim(),
        licensePlate: driver.license_plate || '',
        vehicleType: driver.vehicle_type || '',
        vehicleColor: driver.vehicle_color || ''
    };

    return (
        <div className="flex flex-col gap-6 w-full max-w-5xl">
            <div className="flex items-center gap-4">
                <Link href="/drivers" className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-muted-foreground mr-2">
                    <ChevronLeft className="w-5 h-5" />
                </Link>
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        Driver Profile
                        {driver.is_online ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span> Online
                            </span>
                        ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                                Offline
                            </span>
                        )}
                    </h1>
                    <p className="text-muted-foreground text-sm">Vehicle details, earnings, and approval status.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Left Column - Driver & Vehicle Info */}
                <div className="md:col-span-1 flex flex-col gap-6">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 glass flex flex-col items-center flex-1">
                        <div className="h-24 w-24 relative rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 mb-4 shadow-sm ring-4 ring-slate-50 dark:ring-slate-900">
                            {driver.user?.profile_image ? (
                                <img src={driver.user.profile_image} alt={driver.user.full_name} className="object-cover w-full h-full" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                    <Car className="w-10 h-10" />
                                </div>
                            )}
                        </div>
                        <h2 className="text-xl font-bold text-foreground">{driver.user?.full_name}</h2>
                        <p className="text-slate-500 mb-6 text-sm">{driver.user?.email}</p>

                        <div className="w-full pt-6 border-t border-border flex flex-col gap-4 text-sm text-left">
                            <h3 className="font-semibold text-foreground uppercase tracking-wider text-xs mb-1">Vehicle Details</h3>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Make / Model</span>
                                <span className="font-medium text-right">{driver.vehicle_year} {driver.vehicle_make} {driver.vehicle_model}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Type</span>
                                <span className="font-medium capitalize">{driver.vehicle_type} &bull; {driver.vehicle_color}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">License Plate</span>
                                <span className="font-mono font-medium tracking-widest uppercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border">{driver.license_plate}</span>
                            </div>
                        </div>

                        <div className="w-full pt-6 mt-6 border-t border-border flex gap-2">
                            <Link 
                                href={`/driver-documents?driverId=${driverId}`}
                                className="flex-1 inline-flex justify-center items-center gap-2 bg-slate-900 border border-transparent dark:bg-slate-50 text-slate-50 dark:text-slate-900 text-sm font-medium py-2 rounded-lg hover:opacity-90 transition-opacity"
                            >
                                <FileCheck className="w-4 h-4" /> Documents
                            </Link>
                            <DriverApprovalButton 
                                userId={driver.user_id} 
                                driverId={driverId} 
                                isVerified={driver.user?.is_verified || false} 
                            />
                        </div>
                    </div>
                </div>

                {/* Right Column - Stats, Income & History */}
                <div className="md:col-span-2 flex flex-col gap-6">
                    {/* Income Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 glass">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-muted-foreground">Total Earned</p>
                                <PoundSterling className="w-4 h-4 text-emerald-500" />
                            </div>
                            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                £{totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">From succeeded payments</p>
                        </div>
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 glass">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                                <Clock className="w-4 h-4 text-amber-500" />
                            </div>
                            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                                £{pendingIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">Awaiting settlement</p>
                        </div>
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 glass">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-muted-foreground">Completed Rides</p>
                                <TrendingUp className="w-4 h-4 text-blue-500" />
                            </div>
                            <p className="text-2xl font-bold">
                                {completedPaidRides.length}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">Rides completed &amp; paid</p>
                        </div>
                        {/* Effective Income card — replaces Driver Rating when deductions exist, otherwise shows rating */}
                        {totalDeductions > 0 ? (
                            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 text-card-foreground shadow-sm p-5">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Effective Income</p>
                                    <TrendingDown className="w-4 h-4 text-emerald-500" />
                                </div>
                                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                    £{effectiveIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                                <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-1">After £{totalDeductions.toFixed(2)} deductions</p>
                            </div>
                        ) : (
                            <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 glass">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-medium text-muted-foreground">Driver Rating</p>
                                    <span className="text-sm">⭐</span>
                                </div>
                                <p className="text-2xl font-bold">
                                    {driver.user?.rating?.toFixed(1) || '5.0'}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-1">Average rider rating</p>
                            </div>
                        )}
                    </div>

                    {/* Payment History from Supabase */}
                    <DriverIncomePanel
                        payments={JSON.parse(JSON.stringify(incomeEntries))}
                        rideMap={JSON.parse(JSON.stringify(rideMap))}
                        driverInfo={driverInfo}
                        driverId={driverId}
                        deductions={JSON.parse(JSON.stringify(deductions))}
                    />

                    {/* Recent Driving History */}
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 glass flex flex-col min-h-[300px]">
                        <h3 className="font-semibold text-lg mb-4">Recent Driving History</h3>

                        <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4">
                            {rides && rides.length > 0 ? (
                                rides.map((ride: any) => {
                                    const cancelled = isCancelledStatus(ride.status);
                                    const cancelAmount = cancelled ? computeCancellationAmount(ride) : 0;
                                    const displayAmount = cancelled
                                        ? cancelAmount
                                        : (ride.final_price || ride.estimated_price || 0);
                                    const isDebit = cancelled && cancelAmount < 0;
                                    return (
                                    <div key={ride.id} className="p-4 rounded-lg border bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row gap-4 justify-between sm:items-center">
                                        <div className="flex flex-col flex-1 max-w-[280px]">
                                            <span className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {ride.requested_at ? format(new Date(ride.requested_at), 'MMM dd, yyyy - HH:mm') : ''}
                                            </span>
                                            <div className="flex items-start gap-2 text-sm mb-1.5">
                                                <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                                <span className="truncate" title={ride.pickup_address}>{ride.pickup_address}</span>
                                            </div>
                                            <div className="flex items-start gap-2 text-sm">
                                                <MapPin className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                                                <span className="truncate" title={ride.dropoff_address}>{ride.dropoff_address}</span>
                                            </div>
                                            {cancelled && (
                                                <div className="flex items-start gap-1.5 mt-2 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                                    <Ban className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                                    <span>{formatCancelledBy(ride.cancellation_reason)}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col sm:items-end gap-1">
                                            <span className="text-xs text-muted-foreground">Rider: {ride.rider?.full_name || 'Unknown'}</span>
                                            <span className={`font-bold text-lg ${isDebit ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                {isDebit ? '-' : '+'}£{Math.abs(displayAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                            {cancelled && (
                                                <span className="text-[10px] text-muted-foreground">
                                                    {isDebit ? 'Cancellation fee (50%)' : 'Cancellation credit (100%)'}
                                                </span>
                                            )}
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${cancelled ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-slate-200 dark:bg-slate-800'}`}>
                                                {ride.status}
                                            </span>
                                        </div>
                                    </div>
                                    );
                                })
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground flex-1">
                                    <CarTaxiFront className="w-8 h-8 opacity-20 mb-3" />
                                    <p>No driving history found.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
