import { NextRequest, NextResponse } from "next/server";
import { rematchAfterDriverCancel } from "@/lib/asap-rematch";

export const dynamic = "force-dynamic";

/**
 * POST /api/rides/driver-cancel
 *
 * Called when a driver cancels an ASAP ride after accepting it.
 * Resets the ride to searching, notifies the rider, and rematches
 * nearby drivers excluding the cancelling driver.
 *
 * Body: { ride_id: string, driver_id?: string, reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rideId = String(body.ride_id || body.rideId || "").trim();
    const driverId = body.driver_id || body.driverId || null;
    const reason =
      body.reason ||
      body.cancellation_reason ||
      "Cancelled by driver";

    if (!rideId) {
      return NextResponse.json(
        { error: "ride_id is required" },
        { status: 400 }
      );
    }

    const result = await rematchAfterDriverCancel({
      rideId,
      cancellingDriverId: driverId,
      reason,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/rides/driver-cancel]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
