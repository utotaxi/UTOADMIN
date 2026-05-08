import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data: drivers, error } = await supabaseAdmin
      .from("drivers")
      .select("id, current_latitude, current_longitude, is_online, is_available, vehicle_make, vehicle_model, vehicle_color, license_plate, user:user_id(full_name, phone)")
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
