"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";

export function SearchInput() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    
    const [query, setQuery] = useState(searchParams.get("q") || "");

    useEffect(() => {
        const currentQ = searchParams.get("q") || "";
        if (query === currentQ) return;

        const delayDebounceFn = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (query) {
                params.set("q", query);
            } else {
                params.delete("q");
            }
            startTransition(() => {
                router.push(`${pathname}?${params.toString()}`);
            });
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [query, pathname, router, searchParams]);

    return (
        <div className="relative w-full group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-focus-within:opacity-100 rounded-lg transition-opacity pointer-events-none" />
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] transition-colors ${isPending ? 'text-primary animate-pulse' : 'text-slate-400 group-focus-within:text-primary'}`} />
            <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search drivers by name or email..." 
                className="w-full bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg pl-11 pr-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-800/90 shadow-sm"
            />
        </div>
    );
}
