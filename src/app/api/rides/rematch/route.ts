import { NextResponse } from "next/server";
import { processStuckDriverCancelRematches } from "@/lib/asap-rematch";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/rematch
 *
 * Safety-net poller: finds ASAP rides that were accepted then cancelled
 * by the driver, and rematches other nearby drivers so the rider stays
 * in "finding a driver" instead of a dead cancelled state.
 */
export async function GET() {
  try {
    const result = await processStuckDriverCancelRematches({
      lookbackMinutes: 45,
      limit: 30,
    });

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/rides/rematch]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
