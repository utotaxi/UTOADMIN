import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UTO Admin Panel - UK",
  description: "Admin panel for UTO Ride Sharing Application in the UK.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body className={`${inter.className} bg-slate-50 dark:bg-slate-950 flex h-screen overflow-hidden`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
