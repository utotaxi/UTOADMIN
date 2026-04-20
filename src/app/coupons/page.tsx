import { supabaseAdmin } from "@/lib/supabase";
import { CouponsClient } from "./CouponsClient";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  // Fetch coupons from Supabase
  // If the table doesn't exist yet, this might return an error, which we catch gracefully
  const { data: coupons, error } = await supabaseAdmin
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  // If there's an error (e.g. table not found), we'll just pass an empty array to the client
  // and log a warning instead of error to avoid Next.js dev overlay blocking the screen.
  if (error) {
    console.warn("Table 'coupons' might not exist yet. Please create it in Supabase.");
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Coupons</h1>
        <p className="text-muted-foreground">Manage promo codes, discounts, and track redemptions.</p>
      </div>

      <CouponsClient initialCoupons={coupons || []} />
    </div>
  );
}
