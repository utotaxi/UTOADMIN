'use client';

import { useState, useMemo, useRef } from 'react';
import {
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Car,
  AlertCircle,
  Download,
  Filter,
  ChevronDown,
  CheckSquare,
  Square,
  Users as UsersIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RideData {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  requested_at: string;
  estimated_price: number;
  final_price?: number;
  distance?: number;
  estimated_duration?: number;
  payment_status?: string;
  passenger_count?: number;
  rider?: { full_name: string } | null;
  driver?: {
    council_licence?: string;
    license_plate?: string;
    user?: { full_name: string; email?: string } | null;
  } | null;
}

// Map internal status to display labels
function getDisplayStatus(status: string): { label: string; priority: number } {
  switch (status) {
    case 'accepted':
      return { label: 'In Progress', priority: 1 };
    case 'started':
    case 'in_progress':
      return { label: 'POB', priority: 2 };
    case 'completed':
      return { label: 'Completed', priority: 3 };
    case 'cancelled':
      return { label: 'Cancelled', priority: 4 };
    case 'pending':
      return { label: 'Pending', priority: 5 };
    default:
      return { label: status, priority: 6 };
  }
}

function getStatusBadgeStyles(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    case 'started':
    case 'in_progress':
      return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
    case 'completed':
      return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
    case 'cancelled':
      return 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400';
    default:
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-3 h-3" />;
    case 'cancelled':
      return <XCircle className="w-3 h-3" />;
    case 'started':
    case 'in_progress':
      return <UsersIcon className="w-3 h-3" />;
    case 'accepted':
      return <Car className="w-3 h-3" />;
    default:
      return <Clock className="w-3 h-3" />;
  }
}

// Format date for council report
function formatDateForReport(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatTimeForReport(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

// Generate reference code from ride ID
function getRideReference(id: string): string {
  return id.replace(/-/g, '').substring(0, 6).toUpperCase();
}

export default function RidesClient({ rides }: { rides: RideData[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Sort rides: In Progress first, then POB, then Completed, then rest
  const sortedAndFilteredRides = useMemo(() => {
    let filtered = rides;

    if (statusFilter !== 'all') {
      filtered = rides.filter(r => {
        const { label } = getDisplayStatus(r.status);
        return label.toLowerCase() === statusFilter.toLowerCase();
      });
    }

    return [...filtered].sort((a, b) => {
      const aPriority = getDisplayStatus(a.status).priority;
      const bPriority = getDisplayStatus(b.status).priority;
      if (aPriority !== bPriority) return aPriority - bPriority;
      // Within same status, most recent first
      return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime();
    });
  }, [rides, statusFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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

    // Council report format headers
    const headers = ['Date', 'Time', 'Journey From', 'Journey To', 'Hirer', 'Driver', 'Badge No.', 'Vehicle Plate No.'];

    const rows = ridesToExport.map(ride => {
      const date = formatDateForReport(ride.requested_at);
      const time = formatTimeForReport(ride.requested_at);
      const from = (ride.pickup_address || '').replace(/"/g, '""');
      const to = (ride.dropoff_address || '').replace(/"/g, '""');
      const hirer = (ride.rider?.full_name || 'Unknown').replace(/"/g, '""');
      const driver = (ride.driver?.user?.full_name || 'Unassigned').replace(/"/g, '""');
      const badgeNo = (ride.driver?.council_licence || '').replace(/"/g, '""');
      const plateNo = (ride.driver?.license_plate || '').replace(/"/g, '""');

      return [date, time, `"${from}"`, `"${to}"`, `"${hirer}"`, `"${driver}"`, `"${badgeNo}"`, `"${plateNo}"`];
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
  const statusOptions = ['all', 'In Progress', 'POB', 'Completed', 'Cancelled', 'Pending'];

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Rides & Trips</h1>
          <p className="text-muted-foreground">Monitor live trips, view history, and generate council reports.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status filter */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border rounded-lg bg-card hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Filter className="w-4 h-4 text-muted-foreground" />
              {statusFilter === 'all' ? 'All Statuses' : statusFilter}
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl border bg-card shadow-lg z-20 overflow-hidden">
                {statusOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setStatusFilter(opt); setShowFilterDropdown(false); }}
                    className={cn(
                      "block w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800",
                      statusFilter === opt ? "font-semibold text-primary bg-primary/5" : "text-foreground"
                    )}
                  >
                    {opt === 'all' ? 'All Statuses' : opt}
                  </button>
                ))}
              </div>
            )}
          </div>

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

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm w-full overflow-hidden glass">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-slate-50/50 dark:bg-slate-900/50 border-b">
              <tr>
                <th scope="col" className="px-4 py-4 font-medium w-10">
                  <button onClick={selectAll} className="flex items-center justify-center hover:text-primary transition-colors">
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th scope="col" className="px-4 py-4 font-medium">Status</th>
                <th scope="col" className="px-4 py-4 font-medium">Driver</th>
                <th scope="col" className="px-4 py-4 font-medium">Reference</th>
                <th scope="col" className="px-4 py-4 font-medium">Date & Time</th>
                <th scope="col" className="px-4 py-4 font-medium">Hirer (Rider)</th>
                <th scope="col" className="px-4 py-4 font-medium">Journey From</th>
                <th scope="col" className="px-4 py-4 font-medium">Journey To</th>
                <th scope="col" className="px-4 py-4 font-medium">Badge No.</th>
                <th scope="col" className="px-4 py-4 font-medium">Vehicle Plate</th>
                <th scope="col" className="px-4 py-4 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedAndFilteredRides.length > 0 ? (
                sortedAndFilteredRides.map((ride) => {
                  const display = getDisplayStatus(ride.status);
                  const isSelected = selectedIds.has(ride.id);
                  return (
                    <tr
                      key={ride.id}
                      onClick={() => toggleSelect(ride.id)}
                      className={cn(
                        "transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/15"
                          : "bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      )}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold",
                          getStatusBadgeStyles(ride.status)
                        )}>
                          {getStatusIcon(ride.status)}
                          {display.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-medium text-foreground">
                          {ride.driver?.user?.full_name || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs font-bold tracking-wider bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border">
                          {getRideReference(ride.id)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{formatDateForReport(ride.requested_at)}</span>
                          <span className="text-xs">{formatTimeForReport(ride.requested_at)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-medium text-foreground">
                          {ride.rider?.full_name || 'Unknown Rider'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-1.5 max-w-[200px]">
                          <MapPin className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <span className="text-xs truncate" title={ride.pickup_address}>{ride.pickup_address}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-1.5 max-w-[200px]">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 mt-0.5 flex-shrink-0" />
                          <span className="text-xs truncate" title={ride.dropoff_address}>{ride.dropoff_address}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-xs font-mono font-medium">
                          {ride.driver?.council_licence || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-xs font-mono font-medium tracking-wider bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border uppercase">
                          {ride.driver?.license_plate || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-semibold">
                          £{(ride.final_price || ride.estimated_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
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
