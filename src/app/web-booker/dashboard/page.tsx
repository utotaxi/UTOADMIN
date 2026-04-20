import React from 'react';
import { ArrowLeft, Store, Car, Radio, Search } from 'lucide-react';
import Link from 'next/link';
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function getStatusConfig(status: string) {
    switch (status) {
        case 'marketplace':
            return { 
                label: 'MARKETPLACE', 
                classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                icon: <Store className="w-3 h-3" />,
            };
        case 'driver_assigned':
            return { 
                label: 'DRIVER ASSIGNED', 
                classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                icon: <Car className="w-3 h-3" />,
            };
        case 'searching_driver':
            return { 
                label: 'SEARCHING DRIVER', 
                classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                icon: <Search className="w-3 h-3" />,
            };
        case 'completed':
            return { 
                label: 'COMPLETED', 
                classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                icon: null,
            };
        case 'cancelled':
            return { 
                label: 'CANCELLED', 
                classes: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
                icon: null,
            };
        case 'pending':
        default:
            return { 
                label: status?.toUpperCase() || 'PENDING', 
                classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                icon: null,
            };
    }
}

export default async function WebBookerDashboardPage() {
    const { data: bookings } = await supabaseAdmin
        .from('web_booker')
        .select(`*, users:rider_id(full_name, email, phone)`)
        .order('created_at', { ascending: false });

    // Count stats
    const totalBookings = bookings?.length || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marketplaceCount = bookings?.filter((b: any) => b.status === 'marketplace').length || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignedCount = bookings?.filter((b: any) => b.status === 'driver_assigned').length || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchingCount = bookings?.filter((b: any) => b.status === 'searching_driver').length || 0;

    return (
        <div className="flex flex-col gap-6 w-full h-[calc(100vh-140px)]">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4">
                    <Link href="/web-booker" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-muted-foreground hover:text-foreground shadow-sm bg-white dark:bg-slate-900 border">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Web Bookings Dashboard</h1>
                </div>
                <p className="text-muted-foreground text-sm ml-[52px]">Track and manage all bookings created via the Web Booker portal.</p>
            </div>

            {/* Dispatch Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ml-[52px]">
                <div className="flex items-center gap-3 bg-white dark:bg-card border rounded-lg px-4 py-3 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600">
                        <Radio className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-lg font-bold">{totalBookings}</div>
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Total</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 bg-white dark:bg-card border rounded-lg px-4 py-3 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600">
                        <Store className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-lg font-bold text-amber-600">{marketplaceCount}</div>
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Marketplace</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 bg-white dark:bg-card border rounded-lg px-4 py-3 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600">
                        <Car className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-lg font-bold text-emerald-600">{assignedCount}</div>
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Assigned</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 bg-white dark:bg-card border rounded-lg px-4 py-3 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                        <Search className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-lg font-bold text-blue-600">{searchingCount}</div>
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Searching</div>
                    </div>
                </div>
            </div>
            
            <div className="bg-[#fdfdfd] dark:bg-card border shadow-sm rounded-xl overflow-hidden p-6 relative w-full h-full flex flex-col">
                <div className="w-full overflow-auto custom-scrollbar flex-1">
                    <table className="w-full text-sm text-left align-middle border-collapse">
                        <thead className="text-[10px] text-muted-foreground uppercase tracking-wider border-b sticky top-0 bg-[#fdfdfd] dark:bg-card z-10 shadow-sm">
                            <tr>
                                <th className="p-4 font-bold">Reference</th>
                                <th className="p-4 font-bold">Requested Time</th>
                                <th className="p-4 font-bold">Status</th>
                                <th className="p-4 font-bold">Dispatch</th>
                                <th className="p-4 font-bold">Passenger Details</th>
                                <th className="p-4 font-bold">Assigned Driver</th>
                                <th className="p-4 font-bold">Pick-up Address</th>
                                <th className="p-4 font-bold text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y relative z-0">
                            {bookings && bookings.length > 0 ? bookings.map((booking: any) => {
                                const statusConfig = getStatusConfig(booking.status);
                                return (
                                    <tr key={booking.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4 font-black text-slate-800 dark:text-slate-200 tracking-wider">
                                            {booking.reference || '---'}
                                        </td>
                                        <td className="p-4 text-muted-foreground font-medium">
                                            {booking.scheduled_time ? new Date(booking.scheduled_time).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'short', timeStyle: 'short' }) : 'ASAP'}
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase ${statusConfig.classes}`}>
                                                {statusConfig.icon}
                                                {statusConfig.label}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                                                booking.dispatch_mode === 'marketplace' 
                                                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' 
                                                    : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20'
                                            }`}>
                                                {booking.dispatch_mode === 'marketplace' ? '📢 MARKETPLACE' : '🎯 DSA DIRECT'}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-slate-800 dark:text-slate-200">{booking.users?.full_name || 'Anonymous User'}</span>
                                                <span className="text-[10px] text-[#0ea5e9] font-bold uppercase tracking-wider mt-0.5">{booking.vehicle_type}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {booking.assigned_driver_name ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                                        <Car className="w-3.5 h-3.5 text-emerald-600" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{booking.assigned_driver_name}</span>
                                                        {booking.assigned_driver_distance_km && (
                                                            <span className="text-[10px] text-emerald-500">{booking.assigned_driver_distance_km} miles away</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic">
                                                    {booking.status === 'marketplace' ? 'Awaiting acceptance' : 'Not assigned'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 max-w-[200px] truncate text-slate-600 dark:text-slate-300" title={booking.pickup_address}>
                                            {booking.pickup_address}
                                        </td>
                                        <td className="p-4 text-center">
                                            <Link 
                                                href={`/web-booker/dashboard/${booking.id}`}
                                                className="inline-flex items-center justify-center rounded-md text-xs font-semibold uppercase tracking-wider transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-7 px-3"
                                            >
                                                Review
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={8} className="p-10 text-center text-muted-foreground h-[300px]">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <p className="font-medium">No bookings found</p>
                                            <p className="text-xs opacity-70">Jobs created via the Web Booker will appear here.</p>
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
