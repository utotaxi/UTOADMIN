'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    Car,
    Map,
    CreditCard,
    Settings,
    ShieldAlert,
    CalendarClock,
    FileText,
    Ticket,
    Globe,
    Layers,
    LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutAction } from '@/app/login/actions';

const links = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Drivers', href: '/drivers', icon: Car },
    { name: 'Driver Docs', href: '/driver-documents', icon: FileText },
    { name: 'Riders', href: '/users', icon: Users },
    { name: 'Live Map', href: '/map', icon: Map },
    { name: 'Service Areas', href: '/service-areas', icon: Layers },
    { name: 'Rides & Trips', href: '/rides', icon: ShieldAlert },
    { name: 'Scheduled Rides', href: '/scheduled-rides', icon: CalendarClock },
    { name: 'Payments', href: '/payments', icon: CreditCard },
    { name: 'Coupons', href: '/coupons', icon: Ticket },
    { name: 'Web Booker', href: '/web-booker', icon: Globe },
    { name: 'Pricing', href: '/settings', icon: Settings },
];

export default function Sidebar({ className }: { className?: string }) {
    const pathname = usePathname();

    return (
        <div className={cn("flex h-screen w-64 flex-col border-r bg-card px-4 py-8 shadow-sm", className)}>
            <div className="flex items-center gap-2 px-2 mb-10">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl shadow-lg">
                    U
                </div>
                <span className="text-2xl font-bold tracking-tight text-foreground">UTO Admin</span>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-2 pb-2">
                {links.map((link) => {
                    const isActive = pathname.startsWith(link.href) && (link.href !== '/' || pathname === '/');
                    const IconStyle = link.icon;

                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : "text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-foreground"
                            )}
                        >
                            <IconStyle className={cn("h-5 w-5", isActive ? "text-primary-foreground" : "text-slate-400")} />
                            {link.name}
                        </Link>
                    );
                })}
            </nav>

            {/* Logout Button */}
            <div className="mt-4 pt-4 border-t border-border shrink-0">
                <form action={logoutAction}>
                    <button
                        type="submit"
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 w-full"
                    >
                        <LogOut className="h-5 w-5" />
                        Sign Out
                    </button>
                </form>
            </div>
        </div>
    );
}
