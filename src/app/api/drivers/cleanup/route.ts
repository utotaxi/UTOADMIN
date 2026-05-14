import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Staleness threshold in minutes — drivers not seen for this long are considered offline
const STALE_THRESHOLD_MINUTES = 2;

/**
 * GET /api/drivers/cleanup
 * 
 * Cleans up stale driver online statuses by marking drivers as offline
 * if their last_seen_at timestamp is older than the threshold (2 minutes).
 * 
 * The mobile driver app updates last_seen_at on every heartbeat/location update.
 * If a driver crashes, loses connection, or force-closes the app, the heartbeat
 * stops and their last_seen_at becomes stale.
 * 
 * This endpoint is called:
 * - On every drivers page load  
 * - Periodically by the admin panel frontend (every 15 seconds)
 * - Before the drivers API returns data
 */
export async function GET() {
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    // Mark drivers as offline if last_seen_at is older than the threshold
    const { data: staleDrivers, error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({ is_online: false, is_available: false })
      .eq("is_online", true)
      .lt("last_seen_at", cutoff)
      .select("id");

    if (updateError) {
      console.error("Error cleaning up stale drivers:", updateError);
      // Don't block — still return current data even if cleanup fails
    }

    // Fetch current driver statuses with all needed fields
    const { data: drivers, error: fetchError } = await supabaseAdmin
      .from("drivers")
      .select("id, is_online, is_available, last_seen_at, current_latitude, current_longitude, vehicle_make, vehicle_model, vehicle_color, vehicle_type, vehicle_year, license_plate, total_earnings, created_at, user:user_id(full_name, email, phone, profile_image, is_verified, rating)")
      .order("is_online", { ascending: false })
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("Error fetching drivers:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch drivers", details: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      cleaned: staleDrivers?.length || 0,
      drivers: drivers || [],
      threshold_minutes: STALE_THRESHOLD_MINUTES,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Cleanup API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
