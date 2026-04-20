import React from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import WebBookerClient from './WebBookerClient';

export default function WebBookerPage() {
    return (
        <div className="flex flex-col gap-6 w-full">
            <div className="flex flex-col gap-2">
                <div className="flex items-center w-full">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Web Booker</h1>
                    </div>
                    
                    {/* Add Bookings Link matching user screenshot concept */}
                    <Link href="/web-booker/dashboard" className="ml-auto flex items-center gap-2 bg-[#0ea5e9] text-white px-5 py-2 text-sm font-semibold rounded-md shadow-sm hover:bg-[#0284c7] transition-all group">
                        View Portal Dashboard
                    </Link>
                </div>
                <p className="text-muted-foreground text-sm ml-[52px]">Book rides for customers directly from the admin panel.</p>
            </div>
            
            <WebBookerClient />
        </div>
    );
}
