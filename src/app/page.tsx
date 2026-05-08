import {
  Users,
  Car,
  MapPin,
  PoundSterling,
  TrendingUp,
  Clock,
  CalendarClock,
  AlertTriangle,
  FileWarning,
  ShieldAlert,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { RevenueChart } from "./RevenueChart";
import { DateFilter } from "./DateFilter";
import { Suspense } from "react";
import Link from "next/link";

// Make this route dynamic so it fetches fresh data on load
export const dynamic = "force-dynamic";

// Document types that have expiry dates
const EXPIRY_DOCUMENTS = [
  { key: "document_phdl_expiry", label: "Private Hire Driver Licence" },
  { key: "document_dvla_licence_expiry", label: "DVLA Driving Licence" },
  { key: "document_phvl_expiry", label: "Private Hire Vehicle Licence" },
  { key: "document_insurance_expiry", label: "Vehicle Insurance" },
  { key: "document_inspection_expiry", label: "MOT Certificate" },
];

interface ExpiringDocument {
  driverName: string;
  driverEmail: string;
  driverId: string;
  documentType: string;
  expiryDate: string;
  daysRemaining: number;
}

async function getDashboardStats(days: number = 7) {
  // Fetch overall totals simultaneously
  const [
    { count: totalDrivers },
    { count: totalUsers },
    { count: activeRides },
    { data: paymentsData },
    { count: scheduledRides },
    { data: deductionsData }
  ] = await Promise.all([
    supabaseAdmin.from('drivers').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'rider'),
    supabaseAdmin.from('rides').select('*', { count: 'exact', head: true }).in('status', ['accepted', 'started']),
    supabaseAdmin.from('payments').select('amount, status, created_at').eq('status', 'succeeded'),
    supabaseAdmin.from('later_bookings').select('*', { count: 'exact', head: true }).in('status', ['scheduled', 'driver_accepted']),
    supabaseAdmin.from('driver_deductions').select('amount')
  ]);

  // Handle revenue mapping specifically (Supabase JS doesn't have robust sum aggregate helper so we do it memory efficient for MVP)
  const grossRevenue = paymentsData?.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;
  const totalDeductions = deductionsData?.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;
  const effectiveRevenue = Math.max(0, grossRevenue - totalDeductions);

  // Aggregate daily revenue for the chart (last X days)
  // Use local dates consistently to avoid UTC timezone mismatches
  const dailyRevenue: Record<string, number> = {};
  const dateRange = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
  });

  dateRange.forEach(date => dailyRevenue[date] = 0);
  paymentsData?.forEach(p => {
    const date = new Date(p.created_at).toLocaleDateString('en-CA'); // Local date
    if (dailyRevenue[date] !== undefined) {
      dailyRevenue[date] += (p.amount || 0);
    }
  });

  const chartData = dateRange.map(date => ({
    date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    amount: dailyRevenue[date]
  }));

  // Fetch recent activity (latest 5 rides)
  const { data: recentRides } = await supabaseAdmin
    .from('rides')
    .select('*, rider:rider_id(full_name, profile_image)')
    .order('requested_at', { ascending: false })
    .limit(5);

  // Fetch drivers with expiry date fields for the "Documents About to Expire" panel
  const { data: driversWithExpiry } = await supabaseAdmin
    .from('drivers')
    .select('id, document_phdl_expiry, document_dvla_licence_expiry, document_phvl_expiry, document_insurance_expiry, document_inspection_expiry, user:user_id(full_name, email)');

  // Compute expiring documents (within 30 days or already expired)
  const now = new Date();
  const expiringDocuments: ExpiringDocument[] = [];

  if (driversWithExpiry) {
    for (const driver of driversWithExpiry) {
      const user = driver.user as any;
      const driverName = user?.full_name || 'Unknown Driver';
      const driverEmail = user?.email || '';

      for (const doc of EXPIRY_DOCUMENTS) {
        const expiryValue = (driver as any)[doc.key];
        if (!expiryValue) continue;

        // Parse the expiry date
        const expiryDate = new Date(expiryValue);
        if (isNaN(expiryDate.getTime())) continue;

        const diffMs = expiryDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // Show if expiring within 30 days or already expired (up to 90 days past)
        if (daysRemaining <= 30) {
          expiringDocuments.push({
            driverName,
            driverEmail,
            driverId: driver.id,
            documentType: doc.label,
            expiryDate: expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            daysRemaining,
          });
        }
      }
    }
  }

  // Sort: most urgent first (already expired, then soonest)
  expiringDocuments.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    totalDrivers: totalDrivers || 0,
    totalUsers: totalUsers || 0,
    activeRides: activeRides || 0,
    grossRevenue,
    totalDeductions,
    totalRevenue: effectiveRevenue,
    scheduledRides: scheduledRides || 0,
    recentRides: recentRides || [],
    expiringDocuments,
    chartData
  };
}

function getUrgencyStyles(daysRemaining: number) {
  if (daysRemaining <= 0) {
    return {
      bg: "bg-rose-100 dark:bg-rose-900/30",
      text: "text-rose-700 dark:text-rose-400",
      badge: "bg-rose-500 text-white",
      label: "EXPIRED",
    };
  }
  if (daysRemaining <= 7) {
    return {
      bg: "bg-rose-50 dark:bg-rose-900/20",
      text: "text-rose-600 dark:text-rose-400",
      badge: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300",
      label: `${daysRemaining}d left`,
    };
  }
  if (daysRemaining <= 14) {
    return {
      bg: "bg-amber-50 dark:bg-amber-900/20",
      text: "text-amber-600 dark:text-amber-400",
      badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
      label: `${daysRemaining}d left`,
    };
  }
  return {
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    text: "text-yellow-600 dark:text-yellow-400",
    badge: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300",
    label: `${daysRemaining}d left`,
  };
}

export default async function Dashboard(props: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined } }) {
  const searchParams = await props.searchParams;
  const daysParam = typeof searchParams?.days === 'string' ? parseInt(searchParams.days, 10) : 7;
  const days = isNaN(daysParam) ? 7 : daysParam;
  
  const stats = await getDashboardStats(days);

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
        <p className="text-muted-foreground">Monitor real-time stats and metrics for the UTO platform.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Effective Income"
          value={`£${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          description={stats.totalDeductions > 0 ? `After £${stats.totalDeductions.toFixed(2)} deductions` : "From succeeded payments"}
          icon={PoundSterling}
          trend={stats.totalDeductions > 0 ? "down" : "up"}
        />
        <StatCard
          title="Active Rides (Live)"
          value={stats.activeRides.toString()}
          description="Drivers currently in transit"
          icon={MapPin}
          trend="neutral"
        />
        <StatCard
          title="Registered Drivers"
          value={stats.totalDrivers.toString()}
          description="+4 new this week"
          icon={Car}
          trend="up"
        />
        <StatCard
          title="Total Riders"
          value={stats.totalUsers.toString()}
          description="+48 new this week"
          icon={Users}
          trend="up"
        />
        <StatCard
          title="Scheduled Rides"
          value={stats.scheduledRides.toString()}
          description="Upcoming pre-booked rides"
          icon={CalendarClock}
          trend="neutral"
        />
      </div>

      {/* We can add recent activity underneath later */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 mt-4">
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm col-span-4 p-6 glass flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex flex-col space-y-1.5">
              <h3 className="font-semibold leading-none tracking-tight">Revenue Trends</h3>
              <p className="text-sm text-muted-foreground">Daily earnings over the past {days} days</p>
            </div>
            <Suspense fallback={<div className="h-8 w-[140px] animate-pulse bg-slate-200 dark:bg-slate-800 rounded-md"></div>}>
              <DateFilter />
            </Suspense>
          </div>
          <div className="h-[300px] w-full">
            <RevenueChart data={stats.chartData} />
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow-sm col-span-3 p-6 glass">
          <div className="flex flex-col space-y-1.5 mb-4">
            <h3 className="font-semibold leading-none tracking-tight">Recent Trips</h3>
            <p className="text-sm text-muted-foreground">Latest transportation updates</p>
          </div>
          <div className="space-y-6">
            {stats.recentRides.length > 0 ? (
              stats.recentRides.map((ride: any) => (
                <div key={ride.id} className="flex items-center">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0">
                    <Car className="h-4 w-4 text-primary" />
                  </div>
                  <div className="ml-4 space-y-1 overflow-hidden flex-1">
                    <p className="text-sm font-medium leading-none truncate">
                      {ride.rider?.full_name || 'Rider'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate" title={`${ride.pickup_address} → ${ride.dropoff_address}`}>
                      {ride.pickup_address} → {ride.dropoff_address}
                    </p>
                  </div>
                  <div className="ml-4 flex flex-col items-end gap-1 shrink-0">
                    <div className="font-medium text-sm">
                      £{(ride.final_price || ride.estimated_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <span className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
                        ride.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {ride.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-1 mt-2 flex flex-col items-center justify-center p-8 border border-dashed rounded-lg bg-slate-50/50 dark:bg-slate-900/50 w-full h-[250px]">
                <Clock className="h-8 w-8 text-muted-foreground mb-2 opacity-30" />
                <p className="text-sm font-medium text-muted-foreground text-center">No recent activity.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Documents About to Expire – Awareness Panel */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 glass">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-lg">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="flex flex-col space-y-1">
              <h3 className="font-semibold leading-none tracking-tight">Documents About to Expire</h3>
              <p className="text-sm text-muted-foreground">Driver documents expiring within 30 days or already expired</p>
            </div>
          </div>
          {stats.expiringDocuments.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                {stats.expiringDocuments.length} document{stats.expiringDocuments.length !== 1 ? 's' : ''} need attention
              </span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {stats.expiringDocuments.length > 0 ? (
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-wider">Driver</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-wider">Document</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-wider">Expiry Date</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-wider">Status</th>
                    <th className="h-10 px-2 text-right align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {stats.expiringDocuments.map((doc, idx) => {
                    const urgency = getUrgencyStyles(doc.daysRemaining);
                    return (
                      <tr key={`${doc.driverId}-${doc.documentType}-${idx}`} className={cn("border-b transition-colors hover:bg-muted/50", urgency.bg)}>
                        <td className="p-3 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                              <Car className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex flex-col truncate">
                              <span className="font-medium text-foreground">{doc.driverName}</span>
                              <span className="text-[10px] text-muted-foreground truncate">{doc.driverEmail}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 align-middle">
                          <div className="flex items-center gap-2">
                            <FileWarning className={cn("h-4 w-4 shrink-0", urgency.text)} />
                            <span className="font-medium text-sm">{doc.documentType}</span>
                          </div>
                        </td>
                        <td className="p-3 align-middle text-sm font-medium">
                          {doc.expiryDate}
                        </td>
                        <td className="p-3 align-middle">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            urgency.badge
                          )}>
                            {urgency.label}
                          </span>
                        </td>
                        <td className="p-3 align-middle text-right">
                          <Link
                            href={`/driver-documents?driverId=${doc.driverId}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            View Docs
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-[150px] w-full flex flex-col items-center justify-center bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg border border-dashed border-emerald-200 dark:border-emerald-800">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-3">
                <ShieldAlert className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">All documents are up to date</p>
              <p className="text-xs text-muted-foreground mt-1">No driver documents expiring within the next 30 days</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: any;
  trend: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 flex flex-col justify-between glass hover:shadow-md transition-shadow">
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="tracking-tight text-sm font-medium text-muted-foreground">{title}</h3>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <p className={cn(
          "text-xs mt-1 font-medium",
          trend === 'up' && "text-emerald-500",
          trend === 'down' && "text-rose-500",
          trend === 'neutral' && "text-muted-foreground"
        )}>
          {description}
        </p>
      </div>
    </div>
  );
}
