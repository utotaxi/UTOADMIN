'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fetchSingleRideAction } from './actions';
import {
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Car,
  AlertCircle,
  Download,
  Filter,
  CheckSquare,
  Square,
  Users as UsersIcon,
  CreditCard,
  Search,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RideData {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  requested_at?: string;
  created_at?: string;
  accepted_at?: string;
  started_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  estimated_price: number;
  final_price?: number;
  payment_method?: string;
  payment_status?: string;
  vehicle_type?: string;
  passenger_count?: number;
  reference?: string;
  cancellation_reason?: string;
  rider?: { full_name: string; phone?: string; email?: string } | null;
  driver?: {
    council_licence?: string;
    license_plate?: string;
    vehicle_type?: string;
    vehicle_make?: string;
    vehicle_model?: string;
    user?: { full_name: string; phone?: string; email?: string } | null;
  } | null;
  payments?: { payment_method: string; status: string }[] | null;
}

// Returns the best available timestamp for a ride
function getRideTimestamp(ride: RideData): string {
  return ride.requested_at || ride.created_at || '';
}

// Returns the most relevant completed/event timestamp for reporting
function getEventTimestamp(ride: RideData): string {
  if (ride.status === 'completed' && ride.completed_at) return ride.completed_at;
  if (ride.status === 'cancelled' && ride.cancelled_at) return ride.cancelled_at;
  if (ride.accepted_at) return ride.accepted_at;
  return getRideTimestamp(ride);
}

function getDisplayStatus(status: string): { label: string; priority: number } {
  switch (status) {
    case 'accepted':   return { label: 'In Progress', priority: 1 };
    case 'arrived':    return { label: 'Driver Arrived', priority: 2 };
    case 'started':
    case 'in_progress': return { label: 'POB', priority: 3 };
    case 'completed':  return { label: 'Completed', priority: 4 };
    case 'cancelled':  return { label: 'Cancelled', priority: 5 };
    case 'pending':    return { label: 'Pending', priority: 6 };
    default:           return { label: status?.replace(/_/g, ' ') || 'Unknown', priority: 7 };
  }
}

function getStatusBadgeStyles(status: string): string {
  switch (status) {
    case 'accepted':   return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    case 'arrived':    return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
    case 'started':
    case 'in_progress': return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
    case 'completed':  return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
    case 'cancelled':  return 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400';
    default:           return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':  return <CheckCircle2 className="w-3 h-3" />;
    case 'cancelled':  return <XCircle className="w-3 h-3" />;
    case 'started':
    case 'in_progress': return <UsersIcon className="w-3 h-3" />;
    case 'accepted':   return <Car className="w-3 h-3" />;
    case 'arrived':    return <MapPin className="w-3 h-3" />;
    default:           return <Clock className="w-3 h-3" />;
  }
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return '—'; }
}

function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return '—'; }
}

function getRideReference(ride: RideData): string {
  // Use the real reference from Supabase when present.
  if (ride.reference) return ride.reference.toUpperCase();
  // Fallback: derive a unique code from the END of the id. Many ride ids look
  // like `ride_<timestamp>`, so taking the first chars collapses everything to
  // the same value (e.g. "RIDE_1"); the tail keeps each reference distinct.
  const raw = (ride.id || '').replace(/[^a-zA-Z0-9]/g, '');
  return raw ? raw.slice(-6).toUpperCase() : '—';
}

// Maps any raw cancellation reason to one of the three approved labels.
function getCancellationReason(reason?: string): string {
  const r = (reason || '').toLowerCase();
  if (r.includes('no show') || r.includes('no-show') || r.includes('noshow') || r.includes('did not show') || r.includes("didn't show")) {
    return 'Cancelled due to no show';
  }
  if (r.includes('driver')) return 'Cancelled by driver';
  if (r.includes('rider') || r.includes('passenger') || r.includes('customer') || r.includes('user')) {
    return 'Cancelled by rider';
  }
  // Default when no recognisable reason is recorded.
  return 'Cancelled by rider';
}

// Returns the vehicle registration / number for a ride's assigned driver.
function getVehicleNumber(ride: RideData): string {
  return ride.driver?.license_plate || '—';
}

export default function RidesClient({ rides }: { rides: RideData[] }) {
  const [ridesList, setRidesList] = useState<RideData[]>(rides);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'custom'>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [cancellationFilter, setCancellationFilter] = useState<'all' | 'driver' | 'rider' | 'no_show'>('all');
  const [driverQuery, setDriverQuery] = useState('');
  const [passengerQuery, setPassengerQuery] = useState('');
  const router = useRouter();

  // Sync internal state when the server component yields new data
  useEffect(() => {
    setRidesList(rides);
  }, [rides]);

  // Safety-net polling: re-fetch server data periodically so ride statuses
  // stay current even if the realtime websocket drops or isn't enabled.
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [router]);

  // Real-time Postgres changes subscription
  useEffect(() => {
    const client = createSupabaseBrowserClient();
    const channel = client
      .channel('realtime-rides-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides' },
        async (payload) => {
          console.log('[Realtime] postgres_changes payload:', payload);

          if (payload.eventType === 'DELETE') {
            setRidesList((prev) => prev.filter((r) => r.id !== payload.old.id));
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const res = await fetchSingleRideAction(payload.new.id);
            if (res.success && res.ride) {
              const updatedRide = res.ride;
              setRidesList((prev) => {
                const index = prev.findIndex((r) => r.id === updatedRide.id);
                if (index !== -1) {
                  const next = [...prev];
                  next[index] = updatedRide as any;
                  return next;
                } else {
                  return [updatedRide as any, ...prev];
                }
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  const sortedAndFilteredRides = useMemo(() => {
    const driverQ = driverQuery.trim().toLowerCase();
    const passengerQ = passengerQuery.trim().toLowerCase();

    // Pre-compute date boundaries once.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    // Start of this week (Monday).
    const mondayOffset = (startOfToday.getDay() + 6) % 7;
    const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);
    const customStartDate = customStart ? new Date(`${customStart}T00:00:00`) : null;
    const customEndDate = customEnd ? new Date(`${customEnd}T23:59:59`) : null;

    const filtered = ridesList.filter(r => {
      // Status filter
      if (statusFilter !== 'all') {
        const { label } = getDisplayStatus(r.status);
        if (label.toLowerCase() !== statusFilter.toLowerCase()) return false;
      }

      // Cancellation reason filter (implies cancelled rides only)
      if (cancellationFilter !== 'all') {
        if (r.status !== 'cancelled') return false;
        const reason = getCancellationReason(r.cancellation_reason);
        if (cancellationFilter === 'driver' && reason !== 'Cancelled by driver') return false;
        if (cancellationFilter === 'rider' && reason !== 'Cancelled by rider') return false;
        if (cancellationFilter === 'no_show' && reason !== 'Cancelled due to no show') return false;
      }

      // Driver name filter
      if (driverQ && !(r.driver?.user?.full_name || '').toLowerCase().includes(driverQ)) return false;

      // Passenger name filter
      if (passengerQ && !(r.rider?.full_name || '').toLowerCase().includes(passengerQ)) return false;

      // Date filter
      if (dateFilter !== 'all') {
        const t = new Date(getRideTimestamp(r));
        if (isNaN(t.getTime())) return false;
        if (dateFilter === 'today' && !(t >= startOfToday && t < startOfTomorrow)) return false;
        if (dateFilter === 'yesterday' && !(t >= startOfYesterday && t < startOfToday)) return false;
        if (dateFilter === 'week' && !(t >= startOfWeek && t < startOfTomorrow)) return false;
        if (dateFilter === 'custom') {
          if (customStartDate && t < customStartDate) return false;
          if (customEndDate && t > customEndDate) return false;
        }
      }

      return true;
    });

    // Order strictly by requested date & time (most recent first).
    return [...filtered].sort((a, b) => {
      const aTime = new Date(getRideTimestamp(a)).getTime() || 0;
      const bTime = new Date(getRideTimestamp(b)).getTime() || 0;
      return bTime - aTime;
    });
  }, [ridesList, statusFilter, dateFilter, customStart, customEnd, cancellationFilter, driverQuery, passengerQuery]);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    dateFilter !== 'all' ||
    cancellationFilter !== 'all' ||
    driverQuery.trim() !== '' ||
    passengerQuery.trim() !== '';

  const clearFilters = () => {
    setStatusFilter('all');
    setDateFilter('all');
    setCustomStart('');
    setCustomEnd('');
    setCancellationFilter('all');
    setDriverQuery('');
    setPassengerQuery('');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === sortedAndFilteredRides.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAndFilteredRides.map(r => r.id)));
    }
  };

  const downloadCSV = () => {
    const ridesToExport = sortedAndFilteredRides.filter(r => selectedIds.has(r.id));
    if (ridesToExport.length === 0) return;

    const headers = [
      'Reference',
      'Date',
      'Time',
      'Status',
      'Journey From',
      'Journey To',
      'Hirer (Rider)',
      'Rider Phone',
      'Driver',
      'Driver Phone',
      'Badge No.',
      'Vehicle Plate',
      'Vehicle Type',
      'Payment Method',
      'Payment Status',
      'Amount (£)',
      'Completed At',
      'Cancelled At',
    ];

    const rows = ridesToExport.map(ride => {
      const ts = getRideTimestamp(ride);
      const amountValue = ride.status === 'cancelled'
        ? (ride.final_price || 0)
        : (ride.final_price || ride.estimated_price || 0);
      const amount = amountValue.toFixed(2);
      const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
      const pMethod = ride.payment_method || (ride as any).payments?.[0]?.payment_method || '';
      return [
        esc(getRideReference(ride)),
        esc(formatDate(ts)),
        esc(formatTime(ts)),
        esc(getDisplayStatus(ride.status).label),
        esc(ride.pickup_address || ''),
        esc(ride.dropoff_address || ''),
        esc(ride.rider?.full_name || 'Unknown'),
        esc(ride.rider?.phone || ''),
        esc(ride.driver?.user?.full_name || 'Unassigned'),
        esc(ride.driver?.user?.phone || ''),
        esc(ride.driver?.council_licence || ''),
        esc(ride.driver?.license_plate || ''),
        esc(ride.vehicle_type || ride.driver?.vehicle_type || ''),
        esc(pMethod),
        esc(ride.payment_status || ''),
        amount,
        esc(ride.completed_at ? `${formatDate(ride.completed_at)} ${formatTime(ride.completed_at)}` : ''),
        esc(ride.cancelled_at ? `${formatDate(ride.cancelled_at)} ${formatTime(ride.cancelled_at)}` : ''),
      ];
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `UTO_Council_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const allSelected = sortedAndFilteredRides.length > 0 && selectedIds.size === sortedAndFilteredRides.length;
  const statusOptions = ['all', 'In Progress', 'Driver Arrived', 'POB', 'Completed', 'Cancelled', 'Pending'];

  // Summary counts
  const counts = useMemo(() => ({
    total: ridesList.length,
    completed: ridesList.filter(r => r.status === 'completed').length,
    cancelled: ridesList.filter(r => r.status === 'cancelled').length,
    active: ridesList.filter(r => ['accepted', 'arrived', 'started', 'in_progress'].includes(r.status)).length,
    pending: ridesList.filter(r => r.status === 'pending').length,
  }), [ridesList]);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Rides &amp; Trips</h1>
          <p className="text-muted-foreground text-sm">Monitor live trips, view history, and generate council reports.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Download Report */}
          <button
            onClick={downloadCSV}
            disabled={selectedIds.size === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all",
              selectedIds.size > 0
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                : "bg-slate-100 dark:bg-slate-800 text-muted-foreground cursor-not-allowed"
            )}
          >
            <Download className="w-4 h-4" />
            Generate Report {selectedIds.size > 0 && `(${selectedIds.size})`}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: counts.total, color: 'text-foreground' },
          { label: 'Active', value: counts.active, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Completed', value: counts.completed, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Cancelled', value: counts.cancelled, color: 'text-rose-600 dark:text-rose-400' },
          { label: 'Pending', value: counts.pending, color: 'text-amber-600 dark:text-amber-400' },
        ].map(stat => (
          <div key={stat.label} className="bg-card border rounded-xl p-4 shadow-sm flex flex-col gap-1">
            <span className={cn("text-2xl font-bold", stat.color)}>{stat.value}</span>
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          Filters
          <span className="normal-case font-medium text-muted-foreground/70">
            ({sortedAndFilteredRides.length} of {ridesList.length})
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-primary hover:underline normal-case font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {/* Date */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</label>
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as typeof dateFilter)}
              className="h-9 rounded-lg border bg-card px-3 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">This week</option>
              <option value="custom">Custom range</option>
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border bg-card px-3 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              {statusOptions.map(opt => (
                <option key={opt} value={opt}>{opt === 'all' ? 'All statuses' : opt}</option>
              ))}
            </select>
          </div>

          {/* Cancellation reason */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cancellation reason</label>
            <select
              value={cancellationFilter}
              onChange={e => setCancellationFilter(e.target.value as typeof cancellationFilter)}
              className="h-9 rounded-lg border bg-card px-3 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              <option value="all">Any reason</option>
              <option value="driver">Cancelled by driver</option>
              <option value="rider">Cancelled by passenger</option>
              <option value="no_show">Cancelled due to no show</option>
            </select>
          </div>

          {/* Driver name */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Driver name</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={driverQuery}
                onChange={e => setDriverQuery(e.target.value)}
                placeholder="Search driver..."
                className="h-9 w-full rounded-lg border bg-card pl-8 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Passenger name */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Passenger name</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={passengerQuery}
                onChange={e => setPassengerQuery(e.target.value)}
                placeholder="Search passenger..."
                className="h-9 w-full rounded-lg border bg-card pl-8 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>

        {/* Custom date range */}
        {dateFilter === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-border/50 mt-1">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="h-9 rounded-lg border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="h-9 rounded-lg border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm w-full overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-slate-50/50 dark:bg-slate-900/50 border-b">
              <tr>
                <th className="px-4 py-4 font-medium w-10">
                  <button onClick={selectAll} className="flex items-center justify-center hover:text-primary transition-colors">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-4 py-4 font-medium">Status</th>
                <th className="px-4 py-4 font-medium">Driver</th>
                <th className="px-4 py-4 font-medium">Reference</th>
                <th className="px-4 py-4 font-medium">Date &amp; Time</th>
                <th className="px-4 py-4 font-medium">Hirer (Rider)</th>
                <th className="px-4 py-4 font-medium">Journey From</th>
                <th className="px-4 py-4 font-medium">Journey To</th>
                <th className="px-4 py-4 font-medium">Vehicle Number</th>
                <th className="px-4 py-4 font-medium">Payment</th>
                <th className="px-4 py-4 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedAndFilteredRides.length > 0 ? (
                sortedAndFilteredRides.map((ride) => {
                  const display = getDisplayStatus(ride.status);
                  const isSelected = selectedIds.has(ride.id);
                  const ts = getRideTimestamp(ride);
                  const amount = ride.status === 'cancelled'
                    ? (ride.final_price || 0)
                    : (ride.final_price || ride.estimated_price || 0);
                  const rawPaymentMethod = ride.payment_method || (ride as any).payments?.[0]?.payment_method;
                  const paymentLabel = rawPaymentMethod === 'card' ? 'Card' : rawPaymentMethod === 'cash' || rawPaymentMethod === 'pay' ? 'Cash' : (rawPaymentMethod || '—');
                  const isPaid = ride.payment_status === 'completed' || ride.payment_status === 'card_charged';

                  return (
                    <tr
                      key={ride.id}
                      onClick={() => toggleSelect(ride.id)}
                      className={cn(
                        "transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/5 dark:bg-primary/10 hover:bg-primary/10"
                          : "bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      )}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center">
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-primary" />
                            : <Square className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold w-fit",
                          getStatusBadgeStyles(ride.status)
                        )}>
                          {getStatusIcon(ride.status)}
                          {display.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground text-xs">
                            {ride.driver?.user?.full_name || 'Unassigned'}
                          </span>
                          {ride.driver?.license_plate && (
                            <span className="text-[10px] text-muted-foreground font-mono">{ride.driver.license_plate}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs font-bold tracking-wider bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border">
                          {getRideReference(ride)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground text-xs">{formatDate(ts)}</span>
                          <span className="text-xs">{formatTime(ts)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground text-xs">
                            {ride.rider?.full_name || 'Unknown Rider'}
                          </span>
                          {ride.rider?.phone && (
                            <span className="text-[10px] text-muted-foreground">{ride.rider.phone}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-1.5 max-w-[180px]">
                          <MapPin className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <span className="text-xs truncate" title={ride.pickup_address}>{ride.pickup_address}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-1.5 max-w-[180px]">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 mt-0.5 flex-shrink-0" />
                          <span className="text-xs truncate" title={ride.dropoff_address}>{ride.dropoff_address}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-xs font-mono font-medium tracking-wider bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border uppercase">
                          {getVehicleNumber(ride)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 text-xs font-medium">
                            <CreditCard className="w-3 h-3 text-muted-foreground" />
                            {paymentLabel}
                          </span>
                          {ride.payment_status && (
                            <span className={cn(
                              "text-[10px] font-semibold uppercase tracking-wider",
                              isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                            )}>
                              {ride.payment_status.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="font-semibold text-sm">
                          £{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        {ride.status === 'cancelled' ? (
                          <span className="mt-1 block text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                            {getCancellationReason(ride.cancellation_reason)}
                          </span>
                        ) : ride.final_price && ride.final_price !== ride.estimated_price ? (
                          <span className="block text-[10px] text-muted-foreground line-through font-mono">
                            est. £{(ride.estimated_price || 0).toFixed(2)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-8 h-8 opacity-50" />
                      <p>No trips found</p>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="text-xs text-primary hover:underline mt-1"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selection summary bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-2xl bg-card border shadow-2xl z-50">
          <span className="text-sm font-medium text-muted-foreground">
            {selectedIds.size} ride{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-md"
          >
            <Download className="w-4 h-4" />
            Generate Council Report
          </button>
        </div>
      )}
    </div>
  );
}

