import { supabaseAdmin } from "@/lib/supabase";
import { User, Shield, UserX, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import UsersSearch from "./UsersSearch";

export const dynamic = "force-dynamic";

export default async function UsersPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams;
    const search = typeof params?.search === 'string' ? params.search : undefined;

    // Fetch users
    let query = supabaseAdmin
        .from('users')
        .select('*')
        .eq('role', 'rider')
        .order('created_at', { ascending: false });

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: users, error } = await query;
    if (error) {
        console.error("Error fetching users:", error);
    }

    return (
        <div className="flex flex-col gap-8 w-full">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Riders</h1>
                    <p className="text-muted-foreground">View and manage all registered riders.</p>
                </div>
                <UsersSearch />
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow-sm w-full overflow-hidden glass">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-slate-50/50 dark:bg-slate-900/50 border-b">
                            <tr>
                                <th scope="col" className="px-6 py-4 font-medium">Rider</th>
                                <th scope="col" className="px-6 py-4 font-medium">Status</th>
                                <th scope="col" className="px-6 py-4 font-medium">Rides</th>
                                <th scope="col" className="px-6 py-4 font-medium">Joined</th>
                                <th scope="col" className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {users && users.length > 0 ? (
                                users.map((user) => (
                                    <tr key={user.id} className="bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 relative rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 flex-shrink-0">
                                                    {user.profile_image ? (
                                                        <img src={user.profile_image} alt={user.full_name} className="object-cover w-full h-full" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                                                            <User className="w-5 h-5" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-foreground">{user.full_name}</span>
                                                    <span className="text-xs text-muted-foreground">{user.email}</span>
                                                    {user.phone && <span className="text-xs text-muted-foreground">{user.phone}</span>}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4">
                                            {user.is_verified ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                                    <CheckCircle2 className="w-3 h-3" /> Verified
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-medium">
                                                    <Shield className="w-3 h-3" /> Unverified
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-medium">
                                            {user.total_rides || 0}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                                            {user.created_at ? format(new Date(user.created_at), 'MMM dd, yyyy') : 'Unknown'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link href={`/users/${user.id}`} className="text-sm font-medium text-primary hover:underline">
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <UserX className="w-8 h-8 opacity-50" />
                                            <p>No users found</p>
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
