'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

export default function UsersSearch() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const defaultSearch = searchParams.get('search') || '';
    const [searchTerm, setSearchTerm] = useState(defaultSearch);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams(searchParams.toString());
        if (searchTerm.trim()) {
            params.set('search', searchTerm.trim());
        } else {
            params.delete('search');
        }
        router.push(`/users?${params.toString()}`);
    };

    return (
        <form onSubmit={handleSearch} className="flex flex-1 max-w-sm items-center space-x-2">
            <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                    type="search"
                    placeholder="Search by name or email..."
                    className="block w-full p-2 pl-10 text-sm border rounded-md bg-background border-input focus:ring-ring focus:border-ring text-foreground"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 h-9"
            >
                Search
            </button>
        </form>
    );
}
