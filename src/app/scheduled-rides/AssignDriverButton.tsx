'use client';

import React, { useState, useEffect, useRef } from 'react';
import { fetchAllDrivers, manualAssignDriverToScheduled } from './actions';
import { UserPlus, ChevronDown, CheckCircle2, Search, Circle, Loader2 } from 'lucide-react';
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

export default function AssignDriverButton({ bookingId, currentDriverName }: { bookingId: string; currentDriverName: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState<string | null>(currentDriverName);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync internal state when server component updates the prop
  useEffect(() => {
    setAssigned(currentDriverName);
  }, [currentDriverName]);

  // Adjust parent table row and cell z-index when open to prevent overlapping by subsequent table rows
  useEffect(() => {
    const parentTd = wrapperRef.current?.closest('td');
    const parentTr = wrapperRef.current?.closest('tr');

    if (open) {
      if (parentTd) {
        parentTd.style.position = 'relative';
        parentTd.style.zIndex = '100';
      }
      if (parentTr) {
        parentTr.style.position = 'relative';
        parentTr.style.zIndex = '100';
      }
    } else {
      if (parentTd) {
        parentTd.style.position = '';
        parentTd.style.zIndex = '';
      }
      if (parentTr) {
        parentTr.style.position = '';
        parentTr.style.zIndex = '';
      }
    }

    return () => {
      if (parentTd) {
        parentTd.style.position = '';
        parentTd.style.zIndex = '';
      }
      if (parentTr) {
        parentTr.style.position = '';
        parentTr.style.zIndex = '';
      }
    };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: any) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    const res = await fetchAllDrivers();
    if (res.success) {
      setDrivers(res.drivers);
    }
    setLoading(false);
  };

  const handleAssign = async (driver: Driver) => {
    setAssigning(true);
    const res = await manualAssignDriverToScheduled(bookingId, driver.id, driver.name);
    if (res.success) {
      setAssigned(driver.name);
      setOpen(false);
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

  return (
    <div className={`relative ${open ? 'z-50' : 'z-10'}`} ref={wrapperRef}>
      {assigned ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{assigned}</span>
          </div>
          <button
            onClick={handleOpen}
            disabled={assigning}
            className="text-[10px] text-slate-400 hover:text-primary underline ml-1 disabled:opacity-50 cursor-pointer"
          >
            {assigning ? 'Assigning...' : 'Change'}
          </button>
        </div>
      ) : (
        <button
          onClick={handleOpen}
          disabled={assigning}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {assigning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UserPlus className="w-3.5 h-3.5" />
          )}
          {assigning ? 'Assigning...' : 'Assign'}
          <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {open && (
        <div className="absolute z-[9999] mt-1 top-full left-0 w-72 bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-xl rounded-lg overflow-hidden">
          <div className="p-2 border-b dark:border-slate-700">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-900 rounded">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search drivers..."
                className="w-full text-xs bg-transparent outline-none border-none focus:ring-0 text-slate-700 dark:text-slate-200"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4.5 h-4.5 animate-spin text-primary" />
                Loading drivers...
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No drivers found</div>
            ) : (
              filteredDrivers.map(d => (
                <button
                  key={d.id}
                  onClick={() => handleAssign(d)}
                  disabled={assigning}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 border-b border-slate-50 dark:border-slate-700 last:border-0 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Circle className={`w-2 h-2 flex-shrink-0 ${d.is_online ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300'}`} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{d.name}</span>
                    <span className="text-[10px] text-slate-400 truncate">{d.vehicle} • {d.plate}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

