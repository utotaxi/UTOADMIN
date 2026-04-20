"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function DateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const currentDays = searchParams.get("days") || "7";

  const handleDaysChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const days = e.target.value;
      const params = new URLSearchParams(searchParams.toString());
      if (days && days !== "7") {
        params.set("days", days);
      } else {
        params.delete("days");
      }
      
      router.push(pathname + "?" + params.toString());
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
        Date Range:
      </span>
      <select
        value={currentDays}
        onChange={handleDaysChange}
        className="h-8 w-[140px] appearance-none rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900"
      >
        <option value="7">Last 7 Days</option>
        <option value="15">Last 15 Days</option>
        <option value="30">Last 30 Days</option>
        <option value="90">Last 90 Days</option>
      </select>
    </div>
  );
}
