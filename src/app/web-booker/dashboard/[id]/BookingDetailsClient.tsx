'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingAction, duplicateBookingAction, cancelBookingAction } from './actions';
import { MapPin, Clock, Calendar, Car, CreditCard, User as UserIcon, ScrollText, Edit2, Copy, Repeat, Save, X, Ban, CheckCircle2, AlertCircle } from "lucide-react";
import { formatUKDate } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
            status === 'pending' ? 'bg-amber-100 text-amber-700' : 
            status === 'marketplace' ? 'bg-amber-100 text-amber-700' :
            status === 'driver_assigned' ? 'bg-emerald-100 text-emerald-700' :
            status === 'searching_driver' ? 'bg-blue-100 text-blue-700' :
            status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
            status === 'cancelled' ? 'bg-rose-100 text-rose-700' :
            'bg-blue-100 text-blue-700'
        }`}>
            {status === 'marketplace' && '\u{1F4E2} '}
            {status === 'driver_assigned' && '\u{1F697} '}
            {status === 'searching_driver' && '\u{1F50D} '}
            {status?.replace(/_/g, ' ')}
        </span>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function BookingDetailsClient({ booking }: { booking: any; drivers?: any[] }) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({
        pickup_address: booking.pickup_address || '',
        dropoff_address: booking.dropoff_address || '',
        estimated_price: booking.estimated_price || 0,
        status: booking.status || 'pending',
        booking_note: booking.booking_note || '',
        scheduled_time: booking.scheduled_time || '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isBookingReturn, setIsBookingReturn] = useState(false);
    const [returnScheduledTime, setReturnScheduledTime] = useState('');

    const [isCancelling, setIsCancelling] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dataToUpdate: Record<string, any> = { ...editData };
            if (!dataToUpdate.scheduled_time) {
                dataToUpdate.scheduled_time = null;
            } else {
                dataToUpdate.scheduled_time = new Date(dataToUpdate.scheduled_time).toISOString();
            }
            await updateBookingAction(booking.id, dataToUpdate);
            setIsEditing(false);
            router.refresh();
        } catch (error: unknown) {
            console.error("Failed to update booking", error);
            alert("Failed to save changes: " + (error instanceof Error ? error.message : "Unknown error"));
        }
        setIsSubmitting(false);
    };

    const handleDuplicate = async (isReturn: boolean) => {
        if (isReturn && !isBookingReturn) {
            setIsBookingReturn(true);
            setReturnScheduledTime('');
            return;
        }
        setIsSubmitting(true);
        try {
            const overrides = isReturn && returnScheduledTime 
                ? { scheduled_time: new Date(returnScheduledTime).toISOString() } 
                : {};
            const newId = await duplicateBookingAction({ ...booking, ...overrides }, isReturn);
            router.push(`/web-booker/dashboard/${newId}`);
        } catch (error: unknown) {
            console.error("Failed to duplicate booking", error);
            alert("Failed to duplicate booking: " + (error instanceof Error ? error.message : "Unknown error"));
        }
        setIsSubmitting(false);
        setIsBookingReturn(false);
    };

    const handleCancelBooking = async () => {
        setIsCancelling(true);
        setToast(null);
        try {
            await cancelBookingAction(booking.id);
            setShowCancelConfirm(false);
            setToast({
                type: 'success',
                message: 'Booking cancelled successfully. It has been removed from marketplace and scheduled rides.',
            });
            router.refresh();
        } catch (error: unknown) {
            console.error("Failed to cancel booking:", error);
            setShowCancelConfirm(false);
            setToast({
                type: 'error',
                message: 'Failed to cancel booking: ' + (error instanceof Error ? error.message : 'Unknown error'),
            });
        }
        setIsCancelling(false);
    };

    const canCancel = booking.status !== 'completed' && booking.status !== 'cancelled';

    return (
        <div className="flex flex-col gap-6 w-full">
            {/* Toast notification */}
            {toast && (
                <div
                    className={`fixed top-6 right-6 z-[10001] flex items-start gap-3 max-w-md px-4 py-3 rounded-xl border shadow-2xl animate-[slideIn_0.25s_ease-out] ${
                        toast.type === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                            : 'bg-rose-50 dark:bg-rose-950/90 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    ) : (
                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 text-sm font-medium leading-snug">{toast.message}</div>
                    <button
                        onClick={() => setToast(null)}
                        className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        aria-label="Dismiss notification"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Cancel confirmation modal */}
            {showCancelConfirm && (
                <div
                    className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 animate-[fadeIn_0.2s_ease-out]"
                    onClick={() => !isCancelling && setShowCancelConfirm(false)}
                >
                    <div
                        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden animate-[slideUp_0.3s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center flex-shrink-0">
                                    <Ban className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-foreground mb-1">Cancel this booking?</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Reference <span className="font-mono font-semibold text-foreground">{booking.reference || '—'}</span> will be cancelled and removed from the marketplace and scheduled rides immediately.
                                    </p>
                                    {booking.pickup_address && (
                                        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                                            <span className="font-medium text-foreground">Pickup:</span> {booking.pickup_address}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-border">
                            <button
                                onClick={() => setShowCancelConfirm(false)}
                                disabled={isCancelling}
                                className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Keep Booking
                            </button>
                            <button
                                onClick={handleCancelBooking}
                                disabled={isCancelling}
                                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                            >
                                {isCancelling ? (
                                    <>
                                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        Cancelling...
                                    </>
                                ) : (
                                    <>
                                        <Ban className="w-4 h-4" />
                                        Yes, Cancel Booking
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-3 w-full bg-slate-50 dark:bg-slate-900 border rounded-lg p-3 shadow-sm">
                {!isEditing && !isBookingReturn && (
                    <>
                        <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border rounded-md text-sm font-medium hover:bg-slate-100 transition shadow-sm text-slate-700 dark:text-slate-300">
                            <Edit2 className="w-4 h-4" /> Edit Booking
                        </button>
                        <button onClick={() => handleDuplicate(false)} disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border rounded-md text-sm font-medium hover:bg-slate-100 transition shadow-sm text-slate-700 dark:text-slate-300 disabled:opacity-50">
                            <Copy className="w-4 h-4" /> Re-book (Duplicate)
                        </button>
                        <button onClick={() => handleDuplicate(true)} disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 transition shadow-sm disabled:opacity-50">
                            <Repeat className="w-4 h-4" /> Book Return
                        </button>
                    </>
                )}
                {isEditing && (
                    <>
                        <button onClick={handleSave} disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition shadow-sm disabled:opacity-50">
                            <Save className="w-4 h-4" /> Save Changes
                        </button>
                        <button onClick={() => setIsEditing(false)} disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-md text-sm font-medium hover:bg-rose-100 transition shadow-sm dark:bg-rose-900/30 dark:border-rose-900 dark:text-rose-400">
                            <X className="w-4 h-4" /> Cancel
                        </button>
                    </>
                )}
                {isBookingReturn && (
                    <div className="flex items-center gap-3 w-full flex-wrap">
                        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                           <Repeat className="w-4 h-4 text-primary" /> Return Time:
                        </span>
                        <input 
                            type="datetime-local" 
                            className="border rounded px-3 py-1.5 text-sm bg-background flex-1 min-w-[200px] max-w-xs"
                            value={returnScheduledTime}
                            onChange={e => setReturnScheduledTime(e.target.value)}
                        />
                        <button onClick={() => handleDuplicate(true)} disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 transition shadow-sm disabled:opacity-50">
                            Save &amp; Create Return
                        </button>
                        <button onClick={() => setIsBookingReturn(false)} disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-md text-sm font-medium hover:bg-rose-100 transition shadow-sm dark:bg-rose-900/30 dark:border-rose-900 dark:text-rose-400">
                            <X className="w-4 h-4" /> Cancel
                        </button>
                    </div>
                )}
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Left column */}
                <div className="md:col-span-1 flex flex-col gap-6">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 glass flex flex-col items-center text-center">
                        <div className="h-24 w-24 relative rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 mb-4 shadow-sm ring-4 ring-slate-50 dark:ring-slate-900 flex items-center justify-center text-primary">
                            <Car className="w-10 h-10" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground uppercase">{booking.vehicle_type || 'Standard'}</h2>
                        <div className="mt-2 mb-6">
                            {isEditing ? (
                                <select 
                                    className="border rounded px-2 py-1 text-sm bg-background"
                                    value={editData.status}
                                    onChange={e => setEditData({...editData, status: e.target.value})}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="marketplace">Marketplace</option>
                                    <option value="searching_driver">Searching Driver</option>
                                    <option value="driver_assigned">Driver Assigned</option>
                                    <option value="assigned">Assigned</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            ) : (
                                <StatusBadge status={booking.status} />
                            )}
                        </div>

                        <div className="w-full pt-6 border-t border-border flex flex-col gap-4 text-sm text-left">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground flex items-center gap-2"><CreditCard className="w-4 h-4"/>Est. Price</span>
                                {isEditing ? (
                                    <input 
                                        type="number" 
                                        className="border rounded px-2 py-1 w-24 text-right bg-background"
                                        value={editData.estimated_price}
                                        onChange={e => setEditData({...editData, estimated_price: parseFloat(e.target.value) || 0})}
                                    />
                                ) : (
                                    <span className="font-bold text-lg">&pound;{Number(booking.estimated_price || 0).toFixed(2)}</span>
                                )}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground flex items-center gap-2"><Calendar className="w-4 h-4"/>Created</span>
                                <span className="font-medium">{formatUKDate(booking.created_at, 'MMM dd, yyyy')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Dispatch Info Card */}
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 glass">
                        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                            Dispatch Info
                        </h3>
                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Mode</span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                                    booking.dispatch_mode === 'marketplace' 
                                        ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' 
                                        : booking.dispatch_mode === 'manual'
                                        ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/20'
                                        : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20'
                                }`}>
                                    {booking.dispatch_mode === 'marketplace' ? '\u{1F4E2} Marketplace' : booking.dispatch_mode === 'manual' ? '\u{270F}\uFE0F Manual' : '\u{1F3AF} DSA Direct'}
                                </span>
                            </div>
                            {booking.assigned_driver_name && (
                                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center flex-shrink-0">
                                            <Car className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{booking.assigned_driver_name}</span>
                                            {booking.assigned_driver_distance_km && (
                                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{booking.assigned_driver_distance_km} miles away</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {booking.dispatch_note && (
                                <p className="text-xs text-muted-foreground italic mt-1">{booking.dispatch_note}</p>
                            )}
                        </div>
                    </div>

                    {/* ── Admin Cancel Booking ── */}
                    <div className="rounded-xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/10 text-card-foreground shadow-sm p-5">
                        <h3 className="font-bold text-sm mb-1 flex items-center gap-2 text-rose-700 dark:text-rose-300 uppercase tracking-wider">
                            <Ban className="w-4 h-4" /> Cancel Booking
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">
                            Cancel this booking as admin. It will be removed from marketplace and scheduled rides immediately.
                        </p>

                        {!canCancel ? (
                            <p className="text-xs text-muted-foreground italic">
                                This booking is already {booking.status} and cannot be cancelled again.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => setShowCancelConfirm(true)}
                                    disabled={isCancelling}
                                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition shadow disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Ban className="w-4 h-4" />
                                    Cancel Booking
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Details Area */}
                <div className="md:col-span-2 flex flex-col gap-6">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 glass flex flex-col h-full gap-6">
                        
                        <div>
                            <h3 className="font-semibold text-lg mb-4 pb-2 border-b flex items-center gap-2">
                                <Clock className="w-5 h-5 text-primary" /> Journey Schedule
                            </h3>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-32 text-sm font-medium text-muted-foreground">Requested Time</div>
                                    {isEditing ? (
                                        <input 
                                            type="datetime-local" 
                                            className="border rounded px-3 py-1.5 text-sm bg-background w-full max-w-xs"
                                            value={editData.scheduled_time ? editData.scheduled_time.slice(0, 16) : ''}
                                            onChange={e => setEditData({...editData, scheduled_time: e.target.value})}
                                        />
                                    ) : (
                                        <div className="font-semibold text-foreground bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-md inline-block">
                                            {booking.scheduled_time ? formatUKDate(booking.scheduled_time, 'PPPP - p') : 'ASAP'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold text-lg mb-4 pb-2 border-b flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-primary" /> Route Details
                            </h3>
                            <div className="flex flex-col gap-4">
                                <div className={`flex items-start gap-4 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 ${isEditing ? 'bg-white dark:bg-slate-900' : ''}`}>
                                    <MapPin className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
                                    <div className="flex flex-col w-full">
                                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-1">Pick-up Address</span>
                                        {isEditing ? (
                                            <input 
                                                type="text" 
                                                className="border rounded px-3 py-2 w-full text-sm bg-background mt-1"
                                                value={editData.pickup_address}
                                                onChange={e => setEditData({...editData, pickup_address: e.target.value})}
                                            />
                                        ) : (
                                            <span className="font-medium text-slate-800 dark:text-slate-200">{booking.pickup_address}</span>
                                        )}
                                    </div>
                                </div>
                                <div className={`flex items-start gap-4 p-4 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 ${isEditing ? 'bg-white dark:bg-slate-900' : ''}`}>
                                    <MapPin className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
                                    <div className="flex flex-col w-full">
                                        <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-500 mb-1">Drop-off Address</span>
                                        {isEditing ? (
                                            <input 
                                                type="text" 
                                                className="border rounded px-3 py-2 w-full text-sm bg-background mt-1"
                                                value={editData.dropoff_address}
                                                onChange={e => setEditData({...editData, dropoff_address: e.target.value})}
                                            />
                                        ) : (
                                            <span className="font-medium text-slate-800 dark:text-slate-200">{booking.dropoff_address}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold text-lg mb-4 pb-2 border-b flex items-center gap-2">
                                <UserIcon className="w-5 h-5 text-primary" /> Passenger Information
                            </h3>
                            {booking.users ? (
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Name</span>
                                        <span className="font-medium">{booking.users.full_name || 'Not provided'}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Email</span>
                                        <span className="font-medium">{booking.users.email || 'Not provided'}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Phone</span>
                                        <span className="font-medium">{booking.users.phone || 'Not provided'}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-muted-foreground italic">Anonymous or unregistered passenger.</p>
                            )}
                        </div>

                        {(booking.booking_note || isEditing) && (
                            <div>
                                <h3 className="font-semibold text-lg mb-4 pb-2 border-b flex items-center gap-2">
                                    <ScrollText className="w-5 h-5 text-primary" /> Additional Notes
                                </h3>
                                <div className={`p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 ${isEditing ? 'p-0 border-0 bg-transparent' : ''}`}>
                                    {isEditing ? (
                                        <textarea 
                                            className="border rounded px-3 py-2 w-full text-sm min-h-[100px] bg-background"
                                            value={editData.booking_note}
                                            onChange={e => setEditData({...editData, booking_note: e.target.value})}
                                            placeholder="Add notes..."
                                        />
                                    ) : (
                                        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{booking.booking_note}</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(12px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes slideIn {
                    from { opacity: 0; transform: translateX(12px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}
