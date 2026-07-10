'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2 } from 'lucide-react';
import { cancelScheduledRideAction } from './actions';

export default function CancelScheduledRideButton({
  bookingId,
  source = 'later',
  disabled = false,
}: {
  bookingId: string;
  source?: 'later' | 'web_booker';
  disabled?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    const res = await cancelScheduledRideAction(bookingId, source);
    setCancelling(false);
    setConfirming(false);
    if (!res.success) {
      alert(res.error || 'Failed to cancel ride.');
      return;
    }
    router.refresh();
  };

  if (disabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
      >
        <Ban className="w-3 h-3" />
        Cancel
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
          onClick={() => !cancelling && setConfirming(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h3 className="text-base font-bold text-foreground mb-1">Cancel this ride?</h3>
              <p className="text-sm text-muted-foreground">
                The booking will be cancelled and removed from scheduled / marketplace views.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-border">
              <button
                onClick={() => setConfirming(false)}
                disabled={cancelling}
                className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50"
              >
                Keep ride
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
              >
                {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                {cancelling ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
