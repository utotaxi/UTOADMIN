import { NextRequest, NextResponse } from "next/server";
import {
  applyAsapFreeCancelWindow,
  ensurePendingRidesHaveFreeCancel,
  FREE_CANCEL_SECONDS,
} from "@/lib/asap-free-cancel";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/free-cancel
 * Safety-net: repair pending ASAP rides missing a free-cancel countdown.
 */
export async function GET() {
  try {
    const result = await ensurePendingRidesHaveFreeCancel({ limit: 40 });
    return NextResponse.json({
      ...result,
      free_cancel_seconds: FREE_CANCEL_SECONDS,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/rides/free-cancel]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/rides/free-cancel
 * Body: { ride_id: string }
 * Starts / refreshes the 1-minute free-cancel window (new book or rebook).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rideId = String(body.ride_id || body.rideId || "").trim();
    if (!rideId) {
      return NextResponse.json({ error: "ride_id is required" }, { status: 400 });
    }

    const result = await applyAsapFreeCancelWindow(rideId);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({
      ...result,
      free_cancel_seconds: FREE_CANCEL_SECONDS,
      show_free_cancel_timer: true,
    });
  } catch (err) {
    console.error("[POST /api/rides/free-cancel]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
