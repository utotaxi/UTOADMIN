"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

/**
 * AppShell conditionally renders the sidebar on all routes except /login.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/");

  if (isLoginPage) {
    // Full-screen layout without sidebar for login
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar className="hidden md:flex" />
      <main className="flex-1 w-full h-full overflow-y-auto px-6 py-8">
        {children}
      </main>
    </>
  );
}
