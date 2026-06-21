'use client';

import React, { useState, useEffect, useRef } from 'react';
import { fetchAllDrivers, manualAssignDriverToScheduled } from './actions';
import { UserPlus, ChevronDown, CheckCircle2, Search, Loader2, Car, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Driver {
  id: string;
  user_id: string;
  name: string;
  vehicle: string;
  plate: string;
  vehicle_type: string;
  is_online: boolean;
  is_available: boolean;
}

function getVehicleLabel(vehicle: string, plate: string): string {
  const isPendingVehicle =
    !vehicle ||
    vehicle.toLowerCase() === 'n/a' ||
    vehicle.toLowerCase().includes('pending');
  const isPendingPlate =
    !plate ||
    plate.toLowerCase() === 'n/a' ||
    plate.toLowerCase().includes('pending');

  if (isPendingVehicle && isPendingPlate) return 'Vehicle info pending';
  if (isPendingVehicle) return plate;
  if (isPendingPlate) return vehicle;
  return `${vehicle} · ${plate}`;
}

export default function AssignDriverButton({
  bookingId,
  currentDriverName,
  source = 'later',
}: {
  bookingId: string;
  currentDriverName: string | null;
  source?: 'later' | 'web_booker';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState<string | null>(currentDriverName);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sync internal state when server component updates the prop
  useEffect(() => {
    setAssigned(currentDriverName);
  }, [currentDriverName]);

  // Elevate parent tr/td z-index when dropdown is open
  useEffect(() => {
    const parentTd = wrapperRef.current?.closest('td');
    const parentTr = wrapperRef.current?.closest('tr');
    if (open) {
      if (parentTd) { parentTd.style.position = 'relative'; parentTd.style.zIndex = '100'; }
      if (parentTr) { parentTr.style.position = 'relative'; parentTr.style.zIndex = '100'; }
    } else {
      if (parentTd) { parentTd.style.position = ''; parentTd.style.zIndex = ''; }
      if (parentTr) { parentTr.style.position = ''; parentTr.style.zIndex = ''; }
    }
    return () => {
      if (parentTd) { parentTd.style.position = ''; parentTd.style.zIndex = ''; }
      if (parentTr) { parentTr.style.position = ''; parentTr.style.zIndex = ''; }
    };
  }, [open]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const handleOpen = async () => {
    if (open) { setOpen(false); setSearch(''); return; }
    setOpen(true);
    setLoading(true);
    const res = await fetchAllDrivers();
    if (res.success) setDrivers(res.drivers);
    setLoading(false);
  };

  const handleAssign = async (driver: Driver) => {
    setAssigning(true);
    const res = await manualAssignDriverToScheduled(bookingId, driver.id, driver.name, source);
    if (res.success) {
      setAssigned(driver.name);
      setOpen(false);
      setSearch('');
      router.refresh();
    } else {
      alert('Failed to assign driver: ' + res.error);
    }
    setAssigning(false);
  };

  const filteredDrivers = drivers.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.vehicle.toLowerCase().includes(search.toLowerCase()) ||
    d.plate.toLowerCase().includes(search.toLowerCase())
  );

  // Sort: online first, then available, then offline
  const sortedDrivers = [...filteredDrivers].sort((a, b) => {
    if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
    if (a.is_available !== b.is_available) return a.is_available ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className={`relative ${open ? 'z-50' : 'z-10'}`} ref={wrapperRef}>
      {/* Trigger */}
      {assigned ? (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[120px]">{assigned}</span>
          </div>
          <button
            onClick={handleOpen}
            disabled={assigning}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-40 cursor-pointer border border-slate-200 dark:border-slate-600"
          >
            <ChevronDown className="w-2.5 h-2.5" />
            Change
          </button>
        </div>
      ) : (
        <button
          onClick={handleOpen}
          disabled={assigning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
        >
          {assigning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UserPlus className="w-3.5 h-3.5" />
          )}
          {assigning ? 'Assigning…' : 'Assign Driver'}
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[9999] top-full left-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Select Driver</span>
            <button
              onClick={() => { setOpen(false); setSearch(''); }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search by name or plate…"
                className="w-full text-xs bg-transparent outline-none border-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Driver list */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                <span className="text-xs">Loading drivers…</span>
              </div>
            ) : sortedDrivers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                <Car className="w-5 h-5 opacity-40" />
                <span className="text-xs">{search ? 'No drivers match your search' : 'No drivers available'}</span>
              </div>
            ) : (
              sortedDrivers.map(d => {
                const vehicleLabel = getVehicleLabel(d.vehicle, d.plate);
                const isPending = vehicleLabel === 'Vehicle info pending';
                const statusColor = d.is_available
                  ? 'bg-emerald-500'
                  : d.is_online
                  ? 'bg-amber-400'
                  : 'bg-slate-300 dark:bg-slate-600';
                const statusLabel = d.is_available ? 'Available' : d.is_online ? 'On Trip' : 'Offline';

                return (
                  <button
                    key={d.id}
                    onClick={() => handleAssign(d)}
                    disabled={assigning}
                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 flex items-center gap-3 transition-colors disabled:opacity-50 cursor-pointer group"
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 group-hover:border-indigo-300 transition-colors">
                        {d.name.charAt(0).toUpperCase()}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${statusColor}`} title={statusLabel} />
                    </div>

                    {/* Info */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate leading-tight">{d.name}</span>
                      <span className={`text-[10px] truncate leading-tight mt-0.5 ${isPending ? 'text-amber-500 dark:text-amber-400 italic' : 'text-slate-400 dark:text-slate-500'}`}>
                        {vehicleLabel}
                      </span>
                    </div>

                    {/* Status badge */}
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                      d.is_available
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : d.is_online
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {statusLabel}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer count */}
          {!loading && sortedDrivers.length > 0 && (
            <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <span className="text-[10px] text-slate-400">
                {sortedDrivers.filter(d => d.is_available).length} available · {sortedDrivers.filter(d => d.is_online).length} online · {sortedDrivers.length} total
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
