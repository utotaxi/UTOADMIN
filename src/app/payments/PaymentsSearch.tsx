'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PaymentsSearch() {
    const router = useRouter();
    const searchParams = useSearchParams();
    
    // State for search
    const [search, setSearch] = useState(searchParams.get('search') || '');
    
    // State for filters
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);
    
    const [status, setStatus] = useState(searchParams.get('status') || 'all');
    const [method, setMethod] = useState(searchParams.get('method') || 'all');

    // Handle clicks outside filter dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const applyFilters = (newStatus?: string, newMethod?: string) => {
        const params = new URLSearchParams(searchParams.toString());
        
        const s = newStatus !== undefined ? newStatus : status;
        const m = newMethod !== undefined ? newMethod : method;

        if (s && s !== 'all') params.set('status', s);
        else params.delete('status');

        if (m && m !== 'all') params.set('method', m);
        else params.delete('method');
        
        if (search) params.set('search', search);
        else params.delete('search');

        router.push(`/payments?${params.toString()}`);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        applyFilters();
    };

    const resetFilters = () => {
        setSearch('');
        setStatus('all');
        setMethod('all');
        router.push('/payments');
        setIsFilterOpen(false);
    };

    const statusOptions = [
        { label: 'All Statuses', value: 'all' },
        { label: 'Succeeded', value: 'succeeded' },
        { label: 'Pending', value: 'pending' },
        { label: 'Failed', value: 'failed' },
    ];

    const methodOptions = [
        { label: 'All Methods', value: 'all' },
        { label: 'Cash', value: 'cash' },
        { label: 'Card', value: 'card' },
    ];

    const activeFiltersCount = (status !== 'all' ? 1 : 0) + (method !== 'all' ? 1 : 0);

    return (
        <div className="flex items-center gap-2">
            <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input 
                    type="text" 
                    placeholder="Search name, email or ID..." 
                    className="bg-background border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-[250px]"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </form>

            <div className="relative" ref={filterRef}>
                <button 
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={cn(
                        "inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-background text-sm font-medium hover:bg-slate-50 transition-colors relative",
                        isFilterOpen && "border-primary text-primary bg-primary/5",
                        activeFiltersCount > 0 && "border-primary/50"
                    )}
                >
                    <Filter className="w-4 h-4" /> 
                    <span>Filter</span>
                    {activeFiltersCount > 0 && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground ml-1">
                            {activeFiltersCount}
                        </span>
                    )}
                    <ChevronDown className={cn("w-3 h-3 ml-1 transition-transform", isFilterOpen && "rotate-180")} />
                </button>

                {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border rounded-lg shadow-xl z-50 p-4 animate-in fade-in zoom-in duration-100">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b">
                            <span className="font-semibold text-sm">Filters</span>
                            <button onClick={resetFilters} className="text-[11px] text-primary hover:underline font-medium">Reset all</button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Payment Status</label>
                                <div className="space-y-1">
                                    {statusOptions.map((opt) => (
                                        <button 
                                            key={opt.value}
                                            onClick={() => {
                                                setStatus(opt.value);
                                                applyFilters(opt.value, method);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors",
                                                status === opt.value ? "bg-primary/10 text-primary font-medium" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                            )}
                                        >
                                            {opt.label}
                                            {status === opt.value && <Check className="w-4 h-4" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Payment Method</label>
                                <div className="space-y-1">
                                    {methodOptions.map((opt) => (
                                        <button 
                                            key={opt.value}
                                            onClick={() => {
                                                setMethod(opt.value);
                                                applyFilters(status, opt.value);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors",
                                                method === opt.value ? "bg-primary/10 text-primary font-medium" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                            )}
                                        >
                                            {opt.label}
                                            {method === opt.value && <Check className="w-4 h-4" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            {(activeFiltersCount > 0 || search) && (
                <button 
                    onClick={resetFilters}
                    className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                    title="Clear all filters"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
