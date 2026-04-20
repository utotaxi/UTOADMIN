"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import { BarChart3, LineChart } from "lucide-react";

type ChartData = {
  date: string;
  amount: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col">
            <span className="uppercase text-muted-foreground font-semibold tracking-wider">Date</span>
            <span className="font-bold text-foreground">{label}</span>
          </div>
          <div className="flex flex-col">
            <span className="uppercase text-muted-foreground font-semibold tracking-wider">Revenue</span>
            <span className="font-bold text-primary">£{payload[0].value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function RevenueChart({ data }: { data: ChartData[] }) {
  const [viewMode, setViewMode] = useState<"area" | "bar">("area");

  // If no data, show a friendly placeholder
  if (!data || data.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground italic text-sm">
        Insufficient daily data to render revenue trends.
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {/* Toggle Button */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 shadow-sm border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setViewMode("area")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
            viewMode === "area"
              ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Area Chart"
        >
          <LineChart className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Line</span>
        </button>
        <button
          onClick={() => setViewMode("bar")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
            viewMode === "bar"
              ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Bar Chart"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Bar</span>
        </button>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        {viewMode === "area" ? (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
            <XAxis 
              dataKey="date" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", dy: 5 }}
              minTickGap={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) => `£${value}`}
            />
            <Tooltip cursor={false} content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorAmount)"
              animationDuration={1500}
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.5}/>
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
            <XAxis 
              dataKey="date" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", dy: 5 }}
              minTickGap={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) => `£${value}`}
            />
            <Tooltip cursor={false} content={<CustomTooltip />} />
            <Bar
              dataKey="amount"
              fill="url(#barGradient)"
              radius={[6, 6, 0, 0]}
              animationDuration={1200}
              maxBarSize={50}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
