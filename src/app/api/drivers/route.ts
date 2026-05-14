import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Staleness threshold — same as cleanup route
const STALE_THRESHOLD_MINUTES = 2;

export async function GET() {
  try {
    // First, clean up stale online statuses before returning data
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("drivers")
      .update({ is_online: false, is_available: false })
      .eq("is_online", true)
      .lt("last_seen_at", cutoff);

    // Now fetch fresh driver data
    const { data: drivers, error } = await supabaseAdmin
      .from("drivers")
      .select("id, current_latitude, current_longitude, is_online, is_available, last_seen_at, vehicle_make, vehicle_model, vehicle_color, license_plate, user:user_id(full_name, phone)")
      .order("is_online", { ascending: false });

    if (error) {
      console.error("Error fetching drivers:", error);
      return NextResponse.json({ drivers: [] }, { status: 500 });
    }

    return NextResponse.json({ drivers: drivers || [] });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json({ drivers: [] }, { status: 500 });
  }
}
