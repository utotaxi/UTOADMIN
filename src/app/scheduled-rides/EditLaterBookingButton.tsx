'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Loader2 } from 'lucide-react';
import { ensureLaterBookingInWebBooker } from './actions';

export default function EditLaterBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await ensureLaterBookingInWebBooker(bookingId);
      if (!res.success || !res.webBookerId) {
        alert(res.error || 'Failed to open booking in Web Booker.');
        setLoading(false);
        return;
      }
      router.push(`/web-booker/dashboard/${res.webBookerId}`);
    } catch (err: any) {
      alert(err?.message || 'Failed to open booking in Web Booker.');
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
      {loading ? 'Opening…' : 'Edit details'}
    </button>
  );
}
