'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Car, CheckCircle2, CarTaxiFront, AlertCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

interface DriverData {
    id: string;
    is_online: boolean;
    is_available: boolean;
    last_seen_at: string | null;
    vehicle_make: string;
    vehicle_model: string;
    vehicle_color: string;
    vehicle_type: string;
    vehicle_year: number | null;
    license_plate: string;
    created_at: string;
    user?: {
        full_name: string;
        email: string;
        phone?: string;
        profile_image?: string;
    };
}

interface DriversListClientProps {
    initialDrivers: DriverData[];
    earningsMap: Record<string, number>;
}

export default function DriversListClient({ initialDrivers, earningsMap }: DriversListClientProps) {
    const [drivers, setDrivers] = useState<DriverData[]>(initialDrivers);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [cleanedCount, setCleanedCount] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const refreshDrivers = useCallback(async () => {
        try {
            setIsRefreshing(true);
            const res = await fetch('/api/drivers/cleanup');
            if (res.ok) {
                const data = await res.json();
                if (data.drivers) {
                    setDrivers(data.drivers);
                    setLastUpdated(new Date());
                    if (data.cleaned > 0) {
                        setCleanedCount(prev => prev + data.cleaned);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to refresh drivers:', err);
        } finally {
            setIsRefreshing(false);
        }
    }, []);

    // Initial cleanup on mount + auto-refresh every 15 seconds
    useEffect(() => {
        // Run cleanup immediately on mount to catch stale statuses
        refreshDrivers();

        intervalRef.current = setInterval(refreshDrivers, 15000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [refreshDrivers]);

    const onlineCount = drivers.filter(d => d.is_online).length;
    const offlineCount = drivers.filter(d => !d.is_online).length;

    return (
        <div className="flex flex-col gap-8 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Drivers Management</h1>
                    <p className="text-muted-foreground">Manage driver approvals, documentation, and live status.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Status summary badges */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{onlineCount} Online</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{offlineCount} Offline</span>
                    </div>
                    {/* Refresh button */}
                    <button
                        onClick={refreshDrivers}
                        disabled={isRefreshing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 text-primary ${isRefreshing ? 'animate-spin' : ''}`} />
                        <span className="text-xs font-semibold text-primary">Refresh</span>
                    </button>
                    {/* Last updated */}
                    <span className="text-[10px] text-muted-foreground">
                        Updated {lastUpdated.toLocaleTimeString()}
                    </span>
                </div>
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
                                drivers.map((driver: DriverData) => (
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

                                                {driver.is_online && (
                                                    driver.is_available ? (
                                                        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs font-medium">
                                                            <CheckCircle2 className="w-3 h-3" /> Available
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-medium">
                                                            <CarTaxiFront className="w-3 h-3" /> Busy
                                                        </span>
                                                    )
                                                )}

                                                {driver.last_seen_at && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        Last seen: {formatLastSeen(driver.last_seen_at)}
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

function formatLastSeen(dateStr: string): string {
    const now = new Date();
    const lastSeen = new Date(dateStr);
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}
