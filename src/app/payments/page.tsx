import { supabaseAdmin } from "@/lib/supabase";
import { 
    CreditCard, 
    ArrowLeft, 
    Download, 
    Search,
    Filter,
    ArrowUpRight,
    ArrowDownLeft,
    CheckCircle2,
    XCircle,
    Clock,
    User
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import PaymentsSearch from "./PaymentsSearch";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams;
    const search = params.search as string;
    const status = params.status as string;
    const method = params.method as string;

    // Build base query
    let query = supabaseAdmin
        .from('payments')
        .select(`
            *,
            user:user_id(full_name, email, profile_image)
        `);

    // Add filters
    if (status && status !== 'all') {
        query = query.eq('status', status);
    }
    if (method && method !== 'all') {
        query = query.eq('payment_method', method);
    }
    
    const { data: payments, error } = await query.order('created_at', { ascending: false });

    // Client-side search for user name/email if query is too complex for server
    let filteredPayments = payments || [];
    if (search) {
        const s = search.toLowerCase();
        filteredPayments = filteredPayments.filter(p => 
            p.user?.full_name?.toLowerCase().includes(s) || 
            p.user?.email?.toLowerCase().includes(s) ||
            p.id?.toLowerCase().includes(s)
        );
    }

    if (error) {
        console.error("Error fetching payments:", error);
    }

    const totalRevenue = filteredPayments?.filter(p => p.status === 'succeeded').reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;
    const pendingAmount = filteredPayments?.filter(p => p.status === 'pending').reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;
    const failedAmount = filteredPayments?.filter(p => p.status === 'failed').reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'succeeded':
                return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
            case 'failed':
                return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800";
            case 'pending':
                return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
            default:
                return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'succeeded': return <CheckCircle2 className="w-3.5 h-3.5" />;
            case 'failed': return <XCircle className="w-3.5 h-3.5" />;
            case 'pending': return <Clock className="w-3.5 h-3.5" />;
            default: return null;
        }
    };

    return (
        <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-muted-foreground hover:text-foreground inline-flex items-center justify-center group">
                        <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
                    </Link>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <CreditCard className="w-8 h-8 text-primary" /> Payments & Transactions
                    </h1>
                </div>
                <p className="text-muted-foreground sm:pl-[56px]">Monitor all financial transactions, revenue, and payment statuses across the UTO platform.</p>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border bg-card p-6 shadow-sm glass">
                    <div className="flex items-center justify-between pb-2">
                        <span className="text-sm font-medium text-muted-foreground">Settled Revenue</span>
                        <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                        £{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Successfully processed payments</p>
                </div>
                
                <div className="rounded-xl border bg-card p-6 shadow-sm glass">
                    <div className="flex items-center justify-between pb-2">
                        <span className="text-sm font-medium text-muted-foreground">Pending Volume</span>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                        £{pendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Transactions currently in flight</p>
                </div>

                <div className="rounded-xl border bg-card p-6 shadow-sm glass">
                    <div className="flex items-center justify-between pb-2">
                        <span className="text-sm font-medium text-muted-foreground">Failed Attempts</span>
                        <ArrowDownLeft className="h-4 w-4 text-rose-500" />
                    </div>
                    <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">
                        £{failedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Review required for these charges</p>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden glass">
                <div className="p-4 border-b bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="font-semibold text-lg">Transaction History</h2>
                    <Suspense fallback={<div>Loading...</div>}>
                        <PaymentsSearch />
                    </Suspense>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-slate-50/50 dark:bg-slate-900/50 border-b">
                            <tr>
                                <th className="px-6 py-4 font-medium">Reference / ID</th>
                                <th className="px-6 py-4 font-medium">Customer</th>
                                <th className="px-6 py-4 font-medium">Amount</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Method</th>
                                <th className="px-6 py-4 font-medium">Date & Time</th>
                                <th className="px-6 py-4 font-medium text-right">Receipt</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredPayments && filteredPayments.length > 0 ? (
                                filteredPayments.map((payment: any) => (
                                    <tr key={payment.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                                        <td className="px-6 py-4 font-mono text-[10px] text-muted-foreground">
                                            {payment.id.split('-')[0]}...{payment.id.split('-').pop()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                                    {payment.user?.profile_image ? (
                                                        <img src={payment.user.profile_image} className="w-full h-full object-cover rounded-full" />
                                                    ) : (
                                                        <User className="h-4 w-4 text-slate-400" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-medium text-foreground truncate">{payment.user?.full_name || 'Individual Customer'}</span>
                                                    <span className="text-[10px] text-muted-foreground truncate">{payment.user?.email || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-foreground">£{payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase">{payment.currency}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border",
                                                getStatusStyle(payment.status)
                                            )}>
                                                {getStatusIcon(payment.status)}
                                                {payment.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-muted-foreground capitalize">
                                            {payment.payment_method?.replace('_', ' ') || 'card'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-medium">{new Date(payment.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                                                <span className="text-[10px] text-muted-foreground">{new Date(payment.created_at).toLocaleTimeString(undefined, { timeStyle: 'short' })}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-primary opacity-0 group-hover:opacity-100 focus:opacity-100" title="Download Receipt">
                                                <Download className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-3 opacity-60">
                                            <CreditCard className="w-12 h-12 mb-2" />
                                            <p className="font-semibold text-lg">No payments found</p>
                                            <p className="text-sm max-w-[300px] mx-auto">There are currently no financial records in the system. Activity will appear here once users start booking rides.</p>
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
