import { supabaseAdmin } from "./supabase";
import { findNearbyDrivers, type NearbyDriver } from "./dsa";
import { isCancelledByDriver, isRiderCancellationCredit } from "./cancellation-income";
import { buildFreeCancelFields, FREE_CANCEL_RIDER_HINT } from "./asap-free-cancel";

/** Rider-facing copy while we rematch after a driver cancel. */
export const RIDER_REMATCH_MESSAGE =
  "Your driver cancelled the ride. We are still finding a nearby driver for you.";

const REMATCHABLE_PRIOR_STATUSES = new Set([
  "accepted",
  "arrived",
  "driver_arrived",
  "driver_accepted",
]);

const ACTIVE_REMATCH_STATUSES = new Set([
  "pending",
  "searching",
  "searching_driver",
  "finding_driver",
]);

/** True when this cancel should rematch instead of ending the rider's trip. */
function isDriverCancelForRematch(
  reason?: string | null,
  explicitDriverCancel?: boolean
): boolean {
  // Explicit rider / no-show cancels must stay cancelled.
  if (isRiderCancellationCredit(reason)) return false;
  if (explicitDriverCancel) return true;
  if (isCancelledByDriver(reason)) return true;
  return false;
}

function shouldRematchStuckCancelledRide(row: RideRow): boolean {
  if (row.started_at || row.completed_at) return false;
  if (isRiderCancellationCredit(row.cancellation_reason)) return false;
  if (isCancelledByDriver(row.cancellation_reason)) return true;

  // Accept-then-cancel where the app left the driver attached but used a
  // generic cancellation reason (common in driver apps).
  if (row.accepted_at && row.driver_id) return true;
  if (row.accepted_at && row.last_cancelled_driver_id) return true;
  return false;
}

type RideRow = {
  id: string;
  rider_id?: string | null;
  driver_id?: string | null;
  status?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  accepted_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  dropoff_latitude?: number | null;
  dropoff_longitude?: number | null;
  estimated_price?: number | null;
  vehicle_type?: string | null;
  excluded_driver_ids?: string[] | string | null;
  rematch_count?: number | null;
  rider_message?: string | null;
  status_message?: string | null;
  last_cancelled_driver_id?: string | null;
};

function parseExcludedIds(raw: RideRow["excluded_driver_ids"]): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter(Boolean).map(String))];
}

async function softUpdateRide(rideId: string, payload: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("rides").update(payload).eq("id", rideId);
  if (!error) return true;

  // Retry without optional columns that may not exist yet in older schemas.
  const optional = new Set([
    "excluded_driver_ids",
    "rematch_count",
    "rider_message",
    "status_message",
    "last_driver_cancel_at",
    "last_cancelled_driver_id",
    "rematch_started_at",
    "free_cancel_until",
    "free_cancel_seconds",
    "show_free_cancel_timer",
    "free_cancel_started_at",
  ]);
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!optional.has(k)) stripped[k] = v;
  }
  const { error: retryError } = await supabaseAdmin
    .from("rides")
    .update(stripped)
    .eq("id", rideId);
  if (retryError) {
    console.error("[ASAP Rematch] Failed to update ride:", retryError);
    return false;
  }
  return true;
}

async function notifyRider(ride: RideRow, message: string) {
  if (!ride.rider_id) return;

  const payloads = [
    {
      table: "rider_notifications",
      row: {
        rider_id: ride.rider_id,
        user_id: ride.rider_id,
        ride_id: ride.id,
        type: "driver_cancelled_rematch",
        title: "Driver cancelled",
        message,
        body: message,
        status: "unread",
      },
    },
    {
      table: "notifications",
      row: {
        user_id: ride.rider_id,
        ride_id: ride.id,
        type: "driver_cancelled_rematch",
        title: "Driver cancelled",
        message,
        body: message,
        status: "unread",
      },
    },
  ];

  for (const { table, row } of payloads) {
    try {
      const { error } = await supabaseAdmin.from(table).insert(row);
      if (!error) return;
    } catch {
      // Table may not exist — try next.
    }
  }
}

async function dismissDriverOffers(rideId: string, driverId?: string | null) {
  try {
    let q = supabaseAdmin
      .from("driver_notifications")
      .update({ status: "cancelled" })
      .eq("booking_id", rideId)
      .in("status", ["pending", "sent", "delivered"]);
    if (driverId) q = q.eq("driver_id", driverId);
    const { error } = await q;
    if (error) {
      // Table may not exist in this project — ASAP matching uses rides.status=pending.
      console.warn("[ASAP Rematch] driver_notifications dismiss skipped:", error.message);
    }
  } catch (err) {
    console.warn("[ASAP Rematch] Failed to dismiss driver offers:", err);
  }
}

async function offerRideToDriver(ride: RideRow, driver: NearbyDriver) {
  try {
    const { error } = await supabaseAdmin.from("driver_notifications").insert({
      driver_id: driver.driver_id,
      type: "ride_request",
      title: "New Ride Request",
      message: `Pickup at ${ride.pickup_address || "pickup"}. ${driver.distance_miles} miles away.`,
      booking_id: ride.id,
      ride_id: ride.id,
      booking_source: "rides",
      pickup_address: ride.pickup_address,
      dropoff_address: ride.dropoff_address,
      pickup_latitude: ride.pickup_latitude,
      pickup_longitude: ride.pickup_longitude,
      dropoff_latitude: ride.dropoff_latitude,
      dropoff_longitude: ride.dropoff_longitude,
      estimated_price: ride.estimated_price,
      distance_miles: driver.distance_miles,
      status: "pending",
    });
    if (error) {
      console.warn(
        "[ASAP Rematch] driver_notifications insert skipped (matching relies on rides.pending):",
        error.message
      );
    }
  } catch (err) {
    console.error("[ASAP Rematch] Failed to notify driver:", err);
  }
}

async function freeDriver(driverId: string) {
  try {
    await supabaseAdmin
      .from("drivers")
      .update({ is_available: true })
      .eq("id", driverId);
  } catch (err) {
    console.warn("[ASAP Rematch] Failed to free driver:", err);
  }
}

/**
 * After a driver accepts an ASAP ride then cancels:
 * 1) Do NOT leave the rider on a dead cancelled trip
 * 2) Tell the rider we are still finding a nearby driver
 * 3) Rematch other nearby drivers, excluding the cancelling driver
 */
export async function rematchAfterDriverCancel(params: {
  rideId: string;
  cancellingDriverId?: string | null;
  reason?: string | null;
}): Promise<{
  success: boolean;
  rematched: boolean;
  message: string;
  offeredDriverIds?: string[];
}> {
  const { data: ride, error } = await supabaseAdmin
    .from("rides")
    .select("*")
    .eq("id", params.rideId)
    .maybeSingle();

  if (error || !ride) {
    return {
      success: false,
      rematched: false,
      message: error?.message || "Ride not found",
    };
  }

  const row = ride as RideRow;
  if (row.started_at || row.completed_at) {
    return {
      success: false,
      rematched: false,
      message: "Ride already started — not rematching",
    };
  }

  const status = String(row.status || "").toLowerCase();
  const cancellingDriverId =
    params.cancellingDriverId || row.driver_id || null;

  // Already rematching / searching — still ensure excluded list + offers.
  const isCancelled = status === "cancelled" || status === "cancelled_no_drivers";
  const isSearching = ACTIVE_REMATCH_STATUSES.has(status);
  const looksDriverCancel = isDriverCancelForRematch(
    params.reason || row.cancellation_reason,
    Boolean(params.cancellingDriverId)
  );

  if (!isCancelled && !isSearching) {
    // Only rematch pre-trip cancels (accepted/arrived). Never rematch mid-trip.
    if (!REMATCHABLE_PRIOR_STATUSES.has(status) && !row.accepted_at) {
      return {
        success: false,
        rematched: false,
        message: `Ride status "${row.status}" is not eligible for rematch`,
      };
    }
  }

  if (isCancelled && !looksDriverCancel) {
    return {
      success: false,
      rematched: false,
      message: "Ride was not cancelled by the driver — leaving as cancelled",
    };
  }

  const excluded = uniqueIds([
    ...parseExcludedIds(row.excluded_driver_ids),
    cancellingDriverId,
  ]);

  if (cancellingDriverId) {
    await freeDriver(cancellingDriverId);
    await dismissDriverOffers(row.id, cancellingDriverId);
  }

  const now = new Date().toISOString();
  const rematchCount = Number(row.rematch_count || 0) + 1;
  const freeCancel = buildFreeCancelFields(new Date());

  const updated = await softUpdateRide(row.id, {
    status: "pending",
    driver_id: null,
    accepted_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    excluded_driver_ids: excluded,
    rematch_count: rematchCount,
    rider_message: `${RIDER_REMATCH_MESSAGE} ${FREE_CANCEL_RIDER_HINT}`,
    status_message: `${RIDER_REMATCH_MESSAGE} ${FREE_CANCEL_RIDER_HINT}`,
    last_driver_cancel_at: now,
    last_cancelled_driver_id: cancellingDriverId,
    rematch_started_at: now,
    // Fresh 1-minute free cancel + visible countdown after rebook/rematch
    ...freeCancel,
  });

  if (!updated) {
    return {
      success: false,
      rematched: false,
      message: "Failed to reset ride for rematch",
    };
  }

  await notifyRider(row, RIDER_REMATCH_MESSAGE);

  const lat = Number(row.pickup_latitude);
  const lon = Number(row.pickup_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      success: true,
      rematched: true,
      message:
        "Ride reset to searching, but pickup coordinates are missing so no new drivers were offered",
      offeredDriverIds: [],
    };
  }

  const nearby = await findNearbyDrivers(lat, lon, {
    maxResults: 5,
    maxRadiusMiles: 30,
    excludeDriverIds: excluded,
  });

  for (const driver of nearby) {
    await offerRideToDriver(row, driver);
  }

  // Optional marketplace fallback when nobody is nearby.
  if (nearby.length === 0) {
    try {
      const { error } = await supabaseAdmin.from("marketplace_rides").insert({
        booking_id: row.id,
        ride_id: row.id,
        booking_source: "rides",
        pickup_address: row.pickup_address,
        dropoff_address: row.dropoff_address,
        pickup_latitude: row.pickup_latitude,
        pickup_longitude: row.pickup_longitude,
        dropoff_latitude: row.dropoff_latitude,
        dropoff_longitude: row.dropoff_longitude,
        estimated_price: row.estimated_price,
        vehicle_type: row.vehicle_type,
        status: "available",
      });
      if (error) {
        console.warn(
          "[ASAP Rematch] marketplace_rides skipped (ride left pending for driver apps):",
          error.message
        );
      }
    } catch (err) {
      console.warn("[ASAP Rematch] Marketplace fallback failed:", err);
    }
  }

  console.log(
    `[ASAP Rematch] Ride ${row.id}: excluded=${excluded.join(",") || "none"}, offered=${nearby
      .map((d) => d.driver_id)
      .join(",") || "none"}`
  );

  return {
    success: true,
    rematched: true,
    message: RIDER_REMATCH_MESSAGE,
    offeredDriverIds: nearby.map((d) => d.driver_id),
  };
}

/**
 * Safety-net: find recent ASAP rides cancelled by the assigned driver after accept
 * and rematch them so the rider is not left on a cancelled screen.
 */
export async function processStuckDriverCancelRematches(options?: {
  lookbackMinutes?: number;
  limit?: number;
}): Promise<{ processed: number; results: Array<Record<string, unknown>> }> {
  const lookbackMinutes = options?.lookbackMinutes ?? 30;
  const limit = options?.limit ?? 25;
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

  const { data: rides, error } = await supabaseAdmin
    .from("rides")
    .select("*")
    .eq("status", "cancelled")
    .or(`cancelled_at.gte.${since},updated_at.gte.${since}`)
    .order("cancelled_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Fallback if updated_at filter fails on older schemas
    const fallback = await supabaseAdmin
      .from("rides")
      .select("*")
      .eq("status", "cancelled")
      .gte("cancelled_at", since)
      .order("cancelled_at", { ascending: false })
      .limit(limit);

    if (fallback.error) {
      console.error("[ASAP Rematch] Failed to load cancelled rides:", fallback.error);
      return { processed: 0, results: [] };
    }

    return await rematchCancelledRows(fallback.data || []);
  }

  return await rematchCancelledRows(rides || []);
}

async function rematchCancelledRows(rides: RideRow[]) {
  const results: Array<Record<string, unknown>> = [];
  for (const row of rides) {
    if (!shouldRematchStuckCancelledRide(row)) continue;

    const result = await rematchAfterDriverCancel({
      rideId: row.id,
      cancellingDriverId: row.driver_id || row.last_cancelled_driver_id,
      reason: row.cancellation_reason || "Cancelled by driver",
    });
    results.push({ rideId: row.id, ...result });
  }

  return { processed: results.length, results };
}
