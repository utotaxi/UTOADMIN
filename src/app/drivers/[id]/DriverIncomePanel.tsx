"use client";

import { useState, useMemo, useCallback, useTransition, useEffect } from "react";
import {
    Wallet,
    CreditCard,
    MapPin,
    CheckCircle2,
    XCircle,
    Clock,
    Download,
    Calendar,
    ChevronDown,
    FileSpreadsheet,
    FileText,
    X,
    Percent,
    AlertTriangle,
    Trash2,
    PlusCircle,
    TrendingDown,
    BadgePercent,
    ShieldAlert,
    ReceiptText,
    Loader2
} from "lucide-react";
import { addDeduction, deleteDeduction } from "./actions";

type Payment = {
    id: string;
    amount: number;
    status: string;
    currency?: string;
    payment_method?: string;
    created_at: string;
    ride_id: string;
    user?: {
        full_name?: string;
        email?: string;
    };
};

type RideInfo = {
    id: string;
    pickup_address?: string;
    dropoff_address?: string;
    requested_at?: string;
    rider?: { full_name?: string } | any;
};

type DriverInfo = {
    name: string;
    email: string;
    vehicle: string;
    licensePlate: string;
    vehicleType: string;
    vehicleColor: string;
};

export type Deduction = {
    id: string;
    driver_id: string;
    type: "commission" | "penalty";
    amount: number;
    reason: string | null;
    created_at: string;
};

type Props = {
    payments: Payment[];
    rideMap: Record<string, RideInfo>;
    driverInfo: DriverInfo;
    driverId: string;
    deductions: Deduction[];
};

type Tab = "income" | "commission" | "penalty";

function formatDate(dateStr: string, fmt: "full" | "short" | "time" = "full") {
    const d = new Date(dateStr);
    if (fmt === "time") {
        return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" });
}

function getPaymentStatusStyle(status: string) {
    switch (status) {
        case "succeeded":
            return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
        case "failed":
            return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800";
        case "pending":
            return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
        default:
            return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700";
    }
}

function getPaymentStatusIcon(status: string) {
    switch (status) {
        case "succeeded": return <CheckCircle2 className="w-3 h-3" />;
        case "failed": return <XCircle className="w-3 h-3" />;
        case "pending": return <Clock className="w-3 h-3" />;
        default: return null;
    }
}

function getWeekStart(d: Date): string {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date.toLocaleDateString("en-CA");
}

function escapeCsvField(s: string): string {
    const str = s || "";
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function getGroupedData(
    payments: Payment[],
    rideMap: Record<string, RideInfo>,
    groupBy: "daily" | "weekly" | "monthly"
) {
    const groups: Record<string, Payment[]> = {};
    payments.forEach(p => {
        const d = new Date(p.created_at);
        let key = "";
        if (groupBy === "daily") {
            key = d.toLocaleDateString("en-CA");
        } else if (groupBy === "weekly") {
            key = `Week of ${getWeekStart(d)}`;
        } else {
            key = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
        const dateA = new Date(groups[a][0].created_at).getTime();
        const dateB = new Date(groups[b][0].created_at).getTime();
        return dateB - dateA;
    });

    return { groups, sortedKeys };
}

function generateCSV(
    driverInfo: DriverInfo,
    payments: Payment[],
    rideMap: Record<string, RideInfo>,
    groupBy: "daily" | "weekly" | "monthly"
): string {
    const lines: string[] = [];
    lines.push("DRIVER INCOME REPORT");
    lines.push(`Report Type,${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}`);
    lines.push(`Generated,${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString("en-GB")}`);
    lines.push("");
    lines.push("DRIVER DETAILS");
    lines.push(`Name,${escapeCsvField(driverInfo.name)}`);
    lines.push(`Email,${escapeCsvField(driverInfo.email)}`);
    lines.push(`Vehicle,${escapeCsvField(driverInfo.vehicle)}`);
    lines.push(`Type,${escapeCsvField(driverInfo.vehicleType + " - " + driverInfo.vehicleColor)}`);
    lines.push(`License Plate,${escapeCsvField(driverInfo.licensePlate)}`);
    lines.push("");

    const { groups, sortedKeys } = getGroupedData(payments, rideMap, groupBy);
    lines.push(`${groupBy.toUpperCase()} SUMMARY`);
    lines.push("Period,Total Rides,Total Earned (GBP),Succeeded,Pending,Failed");
    sortedKeys.forEach(period => {
        const periodPayments = groups[period];
        const succeeded = periodPayments.filter(p => p.status === "succeeded");
        const pending = periodPayments.filter(p => p.status === "pending");
        const failed = periodPayments.filter(p => p.status === "failed");
        const total = succeeded.reduce((s, p) => s + (p.amount || 0), 0);
        lines.push(`${escapeCsvField(period)},${periodPayments.length},${total.toFixed(2)},${succeeded.length},${pending.length},${failed.length}`);
    });
    const grandTotal = payments.filter(p => p.status === "succeeded").reduce((s, p) => s + (p.amount || 0), 0);
    lines.push(`TOTAL,${payments.length},${grandTotal.toFixed(2)},,,`);
    lines.push("");
    lines.push("DETAILED TRANSACTIONS");
    lines.push("Date,Time,Rider,Rider Email,Pickup,Dropoff,Amount (GBP),Status,Payment Method");
    payments.forEach(p => {
        const ride = rideMap[p.ride_id];
        const date = new Date(p.created_at);
        lines.push([
            date.toLocaleDateString("en-CA"),
            date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
            escapeCsvField(p.user?.full_name || "Unknown"),
            escapeCsvField(p.user?.email || ""),
            escapeCsvField(ride?.pickup_address || "-"),
            escapeCsvField(ride?.dropoff_address || "-"),
            (p.amount || 0).toFixed(2),
            p.status,
            (p.payment_method || "card").replace(/_/g, " ")
        ].join(","));
    });
    return lines.join("\r\n");
}

function generatePDFHTML(
    driverInfo: DriverInfo,
    payments: Payment[],
    rideMap: Record<string, RideInfo>,
    groupBy: "daily" | "weekly" | "monthly"
): string {
    const { groups, sortedKeys } = getGroupedData(payments, rideMap, groupBy);
    const grandTotal = payments.filter(p => p.status === "succeeded").reduce((s, p) => s + (p.amount || 0), 0);
    const pendingTotal = payments.filter(p => p.status === "pending").reduce((s, p) => s + (p.amount || 0), 0);

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Driver Income Report - ${driverInfo.name}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; padding: 40px; background: #fff; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #1e40af; }
    .header h1 { font-size: 24px; font-weight: 700; color: #1e40af; margin-bottom: 4px; }
    .header .subtitle { font-size: 11px; color: #64748b; }
    .header .meta { text-align: right; font-size: 10px; color: #64748b; }
    .driver-card { display: flex; gap: 40px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 28px; }
    .stats-row { display: flex; gap: 16px; margin-bottom: 28px; }
    .stat-card { flex: 1; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; }
    .stat-card.total { background: #ecfdf5; border-color: #a7f3d0; }
    .stat-card.pending { background: #fffbeb; border-color: #fde68a; }
    .stat-card.rides { background: #eff6ff; border-color: #bfdbfe; }
    .stat-card .stat-value { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .stat-card.total .stat-value { color: #059669; }
    .stat-card.pending .stat-value { color: #d97706; }
    .stat-card.rides .stat-value { color: #2563eb; }
    .stat-card .stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; }
    .section-title { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 11px; }
    th { background: #f1f5f9; color: #475569; font-weight: 600; text-transform: uppercase; font-size: 9px; padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    .amount { font-weight: 700; color: #059669; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .status.succeeded { background: #d1fae5; color: #065f46; }
    .status.pending { background: #fef3c7; color: #92400e; }
    .status.failed { background: #fee2e2; color: #991b1b; }
    .total-row { font-weight: 700; background: #f8fafc !important; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8; }
    @media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="header">
    <div>
        <h1>Driver Income Report</h1>
        <div class="subtitle">${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} Report</div>
    </div>
    <div class="meta">
        <div>Generated: ${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
        <div>UTO Platform - United Kingdom</div>
    </div>
</div>
<div class="stats-row">
    <div class="stat-card total"><div class="stat-value">&pound;${grandTotal.toFixed(2)}</div><div class="stat-label">Total Earned</div></div>
    <div class="stat-card pending"><div class="stat-value">&pound;${pendingTotal.toFixed(2)}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card rides"><div class="stat-value">${payments.length}</div><div class="stat-label">Total Payments</div></div>
</div>
<div class="section-title">${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} Summary</div>
<table>
    <thead><tr><th>Period</th><th>Total Rides</th><th>Earned (GBP)</th><th>Succeeded</th><th>Pending</th><th>Failed</th></tr></thead>
    <tbody>
        ${sortedKeys.map(period => {
            const pp = groups[period];
            const succeeded = pp.filter(p => p.status === "succeeded");
            const pending = pp.filter(p => p.status === "pending");
            const failed = pp.filter(p => p.status === "failed");
            const total = succeeded.reduce((s, p) => s + (p.amount || 0), 0);
            return `<tr><td><strong>${period}</strong></td><td>${pp.length}</td><td class="amount">&pound;${total.toFixed(2)}</td><td>${succeeded.length}</td><td>${pending.length}</td><td>${failed.length}</td></tr>`;
        }).join("")}
        <tr class="total-row"><td>TOTAL</td><td>${payments.length}</td><td class="amount">&pound;${grandTotal.toFixed(2)}</td><td>${payments.filter(p => p.status === "succeeded").length}</td><td>${payments.filter(p => p.status === "pending").length}</td><td>${payments.filter(p => p.status === "failed").length}</td></tr>
    </tbody>
</table>
<div class="section-title">Detailed Transactions</div>
<table>
    <thead><tr><th>Date</th><th>Time</th><th>Rider</th><th>Pickup</th><th>Dropoff</th><th>Amount</th><th>Status</th><th>Method</th></tr></thead>
    <tbody>
        ${payments.map(p => {
            const ride = rideMap[p.ride_id];
            const date = new Date(p.created_at);
            return `<tr><td>${date.toLocaleDateString("en-CA")}</td><td>${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td><td>${p.user?.full_name || "Unknown"}</td><td>${ride?.pickup_address || "-"}</td><td>${ride?.dropoff_address || "-"}</td><td class="amount">&pound;${(p.amount || 0).toFixed(2)}</td><td><span class="status ${p.status}">${p.status}</span></td><td>${(p.payment_method || "card").replace(/_/g, " ")}</td></tr>`;
        }).join("")}
    </tbody>
</table>
<div class="footer"><p>UTO Platform &bull; Driver Income Report &bull; Generated ${new Date().toLocaleDateString("en-GB")}</p></div>
</body>
</html>`;
}

// ─── Deduction Form ────────────────────────────────────────────────────────────

function DeductionForm({
    driverId,
    type,
    onSuccess,
}: {
    driverId: string;
    type: "commission" | "penalty";
    onSuccess: (d: Deduction) => void;
}) {
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();

    const isCommission = type === "commission";
    const accentColor = isCommission ? "blue" : "rose";

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseFloat(amount);
        if (!amount || isNaN(num) || num <= 0) {
            setError("Please enter a valid positive amount.");
            return;
        }
        setError("");
        startTransition(async () => {
            const result = await addDeduction(driverId, type, num, reason);
            if (result.error) {
                setError(result.error);
            } else if (result.deduction) {
                onSuccess(result.deduction as Deduction);
                setAmount("");
                setReason("");
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="rounded-xl border bg-slate-50/60 dark:bg-slate-900/40 p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
                {isCommission
                    ? <BadgePercent className="w-5 h-5 text-blue-500" />
                    : <ShieldAlert className="w-5 h-5 text-rose-500" />}
                <h4 className="font-semibold text-sm">
                    Apply {isCommission ? "Commission Deduction" : "Penalty"}
                </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Amount */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Amount (£)
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">£</span>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="0.00"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="w-full pl-7 pr-3 h-9 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                            required
                        />
                    </div>
                </div>

                {/* Reason */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Reason (optional)
                    </label>
                    <input
                        type="text"
                        placeholder={isCommission ? "e.g. Platform fee 10%" : "e.g. Late cancellation"}
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        className="h-9 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                </div>
            </div>

            {error && (
                <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
                </p>
            )}

            <button
                type="submit"
                disabled={isPending}
                className={`self-start inline-flex items-center gap-2 h-9 px-4 text-xs font-semibold rounded-lg transition-all disabled:opacity-60 ${isCommission
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-rose-600 hover:bg-rose-700 text-white"
                    }`}
            >
                {isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                    : <><PlusCircle className="w-3.5 h-3.5" /> Apply {isCommission ? "Commission" : "Penalty"}</>}
            </button>
        </form>
    );
}

// ─── Deduction Row ─────────────────────────────────────────────────────────────

function DeductionRow({
    deduction,
    driverId,
    onDelete,
}: {
    deduction: Deduction;
    driverId: string;
    onDelete: (id: string) => void;
}) {
    const [isPending, startTransition] = useTransition();

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteDeduction(driverId, deduction.id);
            if (!result.error) {
                onDelete(deduction.id);
            }
        });
    };

    const isCommission = deduction.type === "commission";

    return (
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors border-b last:border-0">
            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isCommission ? "bg-blue-100 dark:bg-blue-900/30" : "bg-rose-100 dark:bg-rose-900/30"}`}>
                {isCommission
                    ? <Percent className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">
                    {deduction.reason || (isCommission ? "Commission deduction" : "Penalty applied")}
                </p>
                <p className="text-[10px] text-muted-foreground">{formatDate(deduction.created_at, "short")}</p>
            </div>
            <span className="font-bold text-sm text-rose-600 dark:text-rose-400 mr-2">
                -£{deduction.amount.toFixed(2)}
            </span>
            <button
                onClick={handleDelete}
                disabled={isPending}
                className="p-1.5 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-40"
                title="Remove deduction"
            >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
}

// ─── Main Panel ────────────────────────────────────────────────────────────────

export function DriverIncomePanel({ payments, rideMap, driverInfo, driverId, deductions: initialDeductions }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>("income");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [showDownloadMenu, setShowDownloadMenu] = useState(false);
    const [deductions, setDeductions] = useState<Deduction[]>(initialDeductions);

    // Sync state when props change (important for revalidatePath from Server Actions)
    useEffect(() => {
        setDeductions(initialDeductions);
    }, [initialDeductions]);

    // Filter payments by date range
    const filteredPayments = useMemo(() => {
        if (!dateFrom && !dateTo) return payments;
        return payments.filter(p => {
            const pDate = new Date(p.created_at).toLocaleDateString("en-CA");
            if (dateFrom && pDate < dateFrom) return false;
            if (dateTo && pDate > dateTo) return false;
            return true;
        });
    }, [payments, dateFrom, dateTo]);

    // Summary stats for filtered range
    const filteredStats = useMemo(() => {
        const succeeded = filteredPayments.filter(p => p.status === "succeeded");
        const pending = filteredPayments.filter(p => p.status === "pending");
        return {
            total: succeeded.reduce((s, p) => s + (p.amount || 0), 0),
            pending: pending.reduce((s, p) => s + (p.amount || 0), 0),
            count: filteredPayments.length,
            succeededCount: succeeded.length
        };
    }, [filteredPayments]);

    const commissions = useMemo(() => deductions.filter(d => d.type === "commission"), [deductions]);
    const penalties = useMemo(() => deductions.filter(d => d.type === "penalty"), [deductions]);

    const totalCommissions = useMemo(() => commissions.reduce((s, d) => s + d.amount, 0), [commissions]);
    const totalPenalties = useMemo(() => penalties.reduce((s, d) => s + d.amount, 0), [penalties]);
    const totalDeductions = totalCommissions + totalPenalties;

    const grossEarnings = useMemo(() =>
        payments.filter(p => p.status === "succeeded").reduce((s, p) => s + (p.amount || 0), 0),
        [payments]
    );
    const effectiveIncome = Math.max(0, grossEarnings - totalDeductions);

    const getFileName = useCallback((groupBy: string, ext: string) => {
        const safeName = driverInfo.name.replace(/[^a-zA-Z0-9]/g, "_");
        const dateStr = new Date().toLocaleDateString("en-CA");
        return `${safeName}_income_${groupBy}_${dateStr}.${ext}`;
    }, [driverInfo.name]);

    const handleDownloadCSV = useCallback((groupBy: "daily" | "weekly" | "monthly") => {
        const csv = generateCSV(driverInfo, filteredPayments, rideMap, groupBy);
        const BOM = "\uFEFF";
        const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", getFileName(groupBy, "csv"));
        link.style.display = "none";
        document.body.appendChild(link);
        setTimeout(() => {
            link.click();
            setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
        }, 0);
        setShowDownloadMenu(false);
    }, [driverInfo, filteredPayments, rideMap, getFileName]);

    const handleDownloadPDF = useCallback((groupBy: "daily" | "weekly" | "monthly") => {
        const html = generatePDFHTML(driverInfo, filteredPayments, rideMap, groupBy);
        const printWindow = window.open("", "_blank", "width=900,height=700");
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = () => { setTimeout(() => { printWindow.print(); }, 300); };
            setTimeout(() => { printWindow.print(); }, 1000);
        }
        setShowDownloadMenu(false);
    }, [driverInfo, filteredPayments, rideMap]);

    const clearDateFilter = () => { setDateFrom(""); setDateTo(""); };
    const hasDateFilter = dateFrom || dateTo;

    const handleDeductionAdded = (d: Deduction) => {
        setDeductions(prev => [d, ...prev]);
    };

    const handleDeductionDeleted = (id: string) => {
        setDeductions(prev => prev.filter(d => d.id !== id));
    };

    const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { id: "income", label: "Income History", icon: <Wallet className="w-4 h-4" /> },
        { id: "commission", label: "Commission", icon: <BadgePercent className="w-4 h-4" />, badge: commissions.length },
        { id: "penalty", label: "Penalties", icon: <ShieldAlert className="w-4 h-4" />, badge: penalties.length },
    ];

    return (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm glass overflow-hidden">
            {/* Effective Income Banner */}
            {totalDeductions > 0 && (
                <div className="px-5 py-3 bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 border-b flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 text-slate-300 text-xs">
                        <TrendingDown className="w-4 h-4 text-rose-400" />
                        <span>Gross Earnings <span className="font-bold text-white">£{grossEarnings.toFixed(2)}</span></span>
                        <span className="text-slate-500">—</span>
                        <span>Deductions <span className="font-bold text-rose-400">£{totalDeductions.toFixed(2)}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Effective Income</span>
                        <span className="text-lg font-bold text-emerald-400">£{effectiveIncome.toFixed(2)}</span>
                    </div>
                </div>
            )}

            {/* Tab Bar */}
            <div className="flex border-b bg-slate-50/50 dark:bg-slate-900/50">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-3.5 text-xs font-semibold border-b-2 transition-all ${activeTab === tab.id
                            ? "border-primary text-primary bg-white dark:bg-slate-800/60"
                            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/60 dark:hover:bg-slate-800/30"
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                        {tab.badge !== undefined && tab.badge > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${tab.id === "commission"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
                                }`}>
                                {tab.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── INCOME HISTORY TAB ── */}
            {activeTab === "income" && (
                <>
                    <div className="p-5 border-b bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-xs text-muted-foreground mt-0.5">Payment records from Supabase for this driver&apos;s rides</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {hasDateFilter && (
                                    <div className="text-xs bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 font-medium">
                                        {filteredStats.succeededCount} of {payments.filter(p => p.status === "succeeded").length} payments · £{filteredStats.total.toFixed(2)}
                                    </div>
                                )}
                                <span className="text-xs font-medium text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                                    {filteredPayments.length} payment{filteredPayments.length !== 1 ? "s" : ""}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> From
                                </label>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="h-8 px-2.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> To
                                </label>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="h-8 px-2.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                                />
                            </div>
                            {hasDateFilter && (
                                <button
                                    onClick={clearDateFilter}
                                    className="h-8 px-2.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-muted-foreground hover:text-foreground hover:border-slate-300 dark:hover:border-slate-600 transition-all flex items-center gap-1.5"
                                >
                                    <X className="w-3 h-3" /> Clear
                                </button>
                            )}
                            <div className="flex-1" />
                            <div className="relative">
                                <button
                                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                                    className="h-8 px-3 text-xs font-medium rounded-md bg-slate-900 dark:bg-slate-50 text-slate-50 dark:text-slate-900 hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download Report
                                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showDownloadMenu ? "rotate-180" : ""}`} />
                                </button>
                                {showDownloadMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
                                        <div className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-lg border bg-white dark:bg-slate-800 shadow-xl overflow-hidden">
                                            <div className="px-3 py-2 border-b bg-slate-50/80 dark:bg-slate-900/50">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                    <FileSpreadsheet className="w-3 h-3" /> CSV (Spreadsheet)
                                                </p>
                                            </div>
                                            <div className="p-1">
                                                {(["daily", "weekly", "monthly"] as const).map(g => (
                                                    <button key={g} onClick={() => handleDownloadCSV(g)}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left">
                                                        <FileSpreadsheet className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                        <div>
                                                            <div className="font-semibold capitalize">{g} CSV</div>
                                                            <div className="text-[10px] text-muted-foreground">Earnings grouped by {g}</div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="px-3 py-2 border-t border-b bg-slate-50/80 dark:bg-slate-900/50">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                    <FileText className="w-3 h-3" /> PDF (Printable)
                                                </p>
                                            </div>
                                            <div className="p-1">
                                                {(["daily", "weekly", "monthly"] as const).map(g => (
                                                    <button key={g} onClick={() => handleDownloadPDF(g)}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left">
                                                        <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                                        <div>
                                                            <div className="font-semibold capitalize">{g} PDF</div>
                                                            <div className="text-[10px] text-muted-foreground">Print or save as PDF</div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {filteredPayments.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-[10px] text-muted-foreground uppercase bg-slate-50/50 dark:bg-slate-900/50 border-b">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">Date</th>
                                        <th className="px-5 py-3 font-medium">Rider</th>
                                        <th className="px-5 py-3 font-medium">Route</th>
                                        <th className="px-5 py-3 font-medium">Amount</th>
                                        <th className="px-5 py-3 font-medium">Status</th>
                                        <th className="px-5 py-3 font-medium">Method</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filteredPayments.map((payment) => {
                                        const linkedRide = rideMap[payment.ride_id];
                                        return (
                                            <tr key={payment.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-5 py-3.5 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-medium">{formatDate(payment.created_at, "short")}</span>
                                                        <span className="text-[10px] text-muted-foreground">{formatDate(payment.created_at, "time")}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-foreground text-xs">{payment.user?.full_name || "Unknown"}</span>
                                                        <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{payment.user?.email || ""}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    {linkedRide ? (
                                                        <div className="flex flex-col gap-0.5 max-w-[180px]">
                                                            <span className="text-[10px] flex items-center gap-1 truncate">
                                                                <MapPin className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" />
                                                                <span className="truncate">{linkedRide.pickup_address}</span>
                                                            </span>
                                                            <span className="text-[10px] flex items-center gap-1 truncate">
                                                                <MapPin className="w-2.5 h-2.5 text-rose-500 flex-shrink-0" />
                                                                <span className="truncate">{linkedRide.dropoff_address}</span>
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                        £{(payment.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>
                                                    <div className="text-[10px] text-muted-foreground uppercase">{payment.currency || "gbp"}</div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getPaymentStatusStyle(payment.status)}`}>
                                                        {getPaymentStatusIcon(payment.status)}
                                                        {payment.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-xs text-muted-foreground capitalize">
                                                    {payment.payment_method?.replace("_", " ") || "card"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
                            <CreditCard className="w-10 h-10 opacity-20 mb-3" />
                            <p className="font-medium">
                                {hasDateFilter ? "No payments found in selected date range" : "No payment records found"}
                            </p>
                            <p className="text-xs mt-1">
                                {hasDateFilter ? "Try adjusting the date range." : "Income will appear here once ride payments are processed."}
                            </p>
                            {hasDateFilter && (
                                <button onClick={clearDateFilter} className="mt-3 text-xs font-medium text-primary hover:underline">
                                    Clear date filter
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ── COMMISSION TAB ── */}
            {activeTab === "commission" && (
                <div className="p-5 flex flex-col gap-5">
                    {/* Summary bar */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border bg-slate-50/60 dark:bg-slate-800/40 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gross Earnings</span>
                            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">£{grossEarnings.toFixed(2)}</span>
                        </div>
                        <div className="rounded-lg border bg-blue-50/60 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Total Commission</span>
                            <span className="text-xl font-bold text-blue-600 dark:text-blue-400">-£{totalCommissions.toFixed(2)}</span>
                        </div>
                        <div className="rounded-lg border bg-emerald-50/60 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">After Commission</span>
                            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">£{Math.max(0, grossEarnings - totalCommissions).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Add form */}
                    <DeductionForm driverId={driverId} type="commission" onSuccess={handleDeductionAdded} />

                    {/* History */}
                    <div className="rounded-xl border overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/40 border-b flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ReceiptText className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commission History</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{commissions.length} record{commissions.length !== 1 ? "s" : ""}</span>
                        </div>
                        {commissions.length > 0 ? (
                            <div>
                                {commissions.map(d => (
                                    <DeductionRow key={d.id} deduction={d} driverId={driverId} onDelete={handleDeductionDeleted} />
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-muted-foreground">
                                <BadgePercent className="w-8 h-8 opacity-20 mx-auto mb-2" />
                                <p className="text-sm font-medium">No commissions applied yet</p>
                                <p className="text-xs mt-1">Use the form above to deduct a commission from this driver&apos;s earnings.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── PENALTY TAB ── */}
            {activeTab === "penalty" && (
                <div className="p-5 flex flex-col gap-5">
                    {/* Summary bar */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border bg-slate-50/60 dark:bg-slate-800/40 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gross Earnings</span>
                            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">£{grossEarnings.toFixed(2)}</span>
                        </div>
                        <div className="rounded-lg border bg-rose-50/60 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">Total Penalties</span>
                            <span className="text-xl font-bold text-rose-600 dark:text-rose-400">-£{totalPenalties.toFixed(2)}</span>
                        </div>
                        <div className="rounded-lg border bg-emerald-50/60 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">After Penalties</span>
                            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">£{Math.max(0, grossEarnings - totalPenalties).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Add form */}
                    <DeductionForm driverId={driverId} type="penalty" onSuccess={handleDeductionAdded} />

                    {/* History */}
                    <div className="rounded-xl border overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/40 border-b flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ReceiptText className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Penalty History</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{penalties.length} record{penalties.length !== 1 ? "s" : ""}</span>
                        </div>
                        {penalties.length > 0 ? (
                            <div>
                                {penalties.map(d => (
                                    <DeductionRow key={d.id} deduction={d} driverId={driverId} onDelete={handleDeductionDeleted} />
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-muted-foreground">
                                <ShieldAlert className="w-8 h-8 opacity-20 mx-auto mb-2" />
                                <p className="text-sm font-medium">No penalties applied yet</p>
                                <p className="text-xs mt-1">Use the form above to apply a penalty deduction.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
