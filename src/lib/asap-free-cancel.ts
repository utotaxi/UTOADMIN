/**
 * ASAP free-cancel window: every new or rebooked ASAP ride gets
 * 60 seconds free cancellation with a visible countdown for the rider app.
 */

import { supabaseAdmin } from "./supabase";

export const FREE_CANCEL_SECONDS = 60;

export const FREE_CANCEL_RIDER_HINT =
  "You have 1 minute of free cancellation. Countdown is running.";

const SEARCHING_STATUSES = [
  "pending",
  "searching",
  "searching_driver",
  "finding_driver",
] as const;

export function computeFreeCancelUntil(from: Date = new Date()): string {
  return new Date(from.getTime() + FREE_CANCEL_SECONDS * 1000).toISOString();
}

/** Payload fields rider apps use for the free-cancel countdown. */
export function buildFreeCancelFields(from: Date = new Date()): {
  requested_at: string;
  free_cancel_until: string;
  free_cancel_seconds: number;
  show_free_cancel_timer: boolean;
  free_cancel_started_at: string;
} {
  const startedAt = from.toISOString();
  return {
    // Many rider builds derive the countdown from requested_at + 60s.
    requested_at: startedAt,
    free_cancel_until: computeFreeCancelUntil(from),
    free_cancel_seconds: FREE_CANCEL_SECONDS,
    show_free_cancel_timer: true,
    free_cancel_started_at: startedAt,
  };
}

export function isFreeCancelActive(
  freeCancelUntil?: string | null,
  now: Date = new Date()
): boolean {
  if (!freeCancelUntil) return false;
  const ends = new Date(freeCancelUntil).getTime();
  return Number.isFinite(ends) && ends > now.getTime();
}

/**
 * Apply / refresh the 1-minute free-cancel window on a ride.
 * Used for new ASAP bookings and rematch/rebook flows.
 */
export async function applyAsapFreeCancelWindow(rideId: string): Promise<{
  success: boolean;
  free_cancel_until?: string;
  message: string;
}> {
  const fields = buildFreeCancelFields();

  // Prefer DB function when the SQL migration has been applied.
  try {
    const { data, error } = await supabaseAdmin.rpc("apply_asap_free_cancel_window", {
      p_ride_id: rideId,
    });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      return {
        success: true,
        free_cancel_until: row?.free_cancel_until || fields.free_cancel_until,
        message: FREE_CANCEL_RIDER_HINT,
      };
    }
  } catch {
    // Fall through to direct update.
  }

  const { error } = await supabaseAdmin.from("rides").update(fields).eq("id", rideId);
  if (!error) {
    return {
      success: true,
      free_cancel_until: fields.free_cancel_until,
      message: FREE_CANCEL_RIDER_HINT,
    };
  }

  // Minimal fallback: requested_at alone is enough for apps that use +60s.
  const { error: minimalError } = await supabaseAdmin
    .from("rides")
    .update({ requested_at: fields.requested_at })
    .eq("id", rideId);

  if (minimalError) {
    return { success: false, message: minimalError.message };
  }

  return {
    success: true,
    free_cancel_until: fields.free_cancel_until,
    message: FREE_CANCEL_RIDER_HINT,
  };
}

/**
 * Safety-net: pending ASAP rides with no free_cancel_until get a fresh window
 * so the countdown is always visible after book/rebook.
 */
export async function ensurePendingRidesHaveFreeCancel(options?: {
  limit?: number;
}): Promise<{ repaired: number; rideIds: string[] }> {
  const limit = options?.limit ?? 40;
  const { data: rides, error } = await supabaseAdmin
    .from("rides")
    .select("id, status, free_cancel_until, show_free_cancel_timer, requested_at")
    .in("status", [...SEARCHING_STATUSES])
    .is("free_cancel_until", null)
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[FreeCancel] ensure query failed:", error.message);
    return { repaired: 0, rideIds: [] };
  }

  const rideIds: string[] = [];
  for (const ride of rides || []) {
    const result = await applyAsapFreeCancelWindow(ride.id);
    if (result.success) rideIds.push(ride.id);
  }

  return { repaired: rideIds.length, rideIds };
}
