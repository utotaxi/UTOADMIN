import { getServiceAreas } from '@/app/service-areas/actions';
import { getPricingRules } from '@/app/settings/actions';
import {
  billedRoute,
  calculateFareFromRule,
  describeRouteMode,
  findBaseServiceArea,
  findMainPricingRule,
  findPricingRuleForServiceArea,
  metersToMiles,
  type LatLng,
  type RouteLeg,
  type RouteMode,
  type VehicleTypeName,
} from '@/lib/pricing';

export interface WebQuoteBase {
  name: string | undefined;
  latitude: number;
  longitude: number;
  radius_miles: number;
}

export interface WebQuoteSuccess {
  success: true;
  price: number;
  billed_miles: number;
  route_mode: RouteMode;
  route_label: string;
  vehicle: VehicleTypeName;
  breakdown: { start: number; mileage: number; time: number };
  legs: RouteLeg[];
  base: WebQuoteBase | null;
}

export interface WebQuoteFailure {
  success: false;
  code: 404 | 500;
  error: string;
}

export type WebQuoteResult = WebQuoteSuccess | WebQuoteFailure;

/**
 * Price a ride from the service-area fare table.
 *
 * Policy: if both pickup and drop-off fall inside the base service-area circle,
 * the fare covers pickup → drop-off only. If either point is outside, the dead
 * mileage from the base to the pickup is included (base → pickup → drop-off).
 * This is the single source of truth for the web-booker form, the /api/quote
 * endpoint, and booking creation — the same price is always returned.
 */
export async function calcWebQuote(params: {
  pickup: LatLng;
  dropoff: LatLng;
  minutes?: number;
  vehicleType?: string | null;
}): Promise<WebQuoteResult> {
  try {
    const [areas, pricingRules] = await Promise.all([
      getServiceAreas(),
      getPricingRules(),
    ]);

    const baseArea = findBaseServiceArea(areas);
    const center = baseArea?.coordinates?.[0]
      ? { lat: baseArea.coordinates[0][0], lng: baseArea.coordinates[0][1] }
      : null;
    const radiusMiles = baseArea?.radius_meters
      ? metersToMiles(baseArea.radius_meters)
      : 0;

    const route = billedRoute({
      pickup: params.pickup,
      dropoff: params.dropoff,
      center,
      radiusMiles,
    });

    const serviceAreaRule = findPricingRuleForServiceArea(pricingRules, baseArea?.id);
    const mainRule = findMainPricingRule(pricingRules);
    const rule =
      route.mode === 'inside_pickup_dropoff'
        ? serviceAreaRule || mainRule
        : mainRule || serviceAreaRule;

    if (!rule) {
      return { success: false, code: 404, error: 'No pricing rule configured' };
    }

    const fare = calculateFareFromRule({
      miles: route.miles,
      minutes: params.minutes ?? 0,
      vehicleType: params.vehicleType ?? 'economy',
      vehicles: (rule.vehicles || {}) as Record<string, unknown>,
      mileTiers: rule.mile_tiers || [],
      minuteTiers: rule.minute_tiers || [],
    });

    return {
      success: true,
      price: fare.price,
      billed_miles: Math.round(route.miles * 100) / 100,
      route_mode: route.mode,
      route_label: describeRouteMode(route.mode),
      vehicle: fare.vehicle,
      breakdown: { start: fare.start, mileage: fare.mileage, time: fare.time },
      legs: route.legs.map((leg) => ({ ...leg, miles: Math.round(leg.miles * 100) / 100 })),
      base:
        center && radiusMiles > 0
          ? {
              name: baseArea?.name,
              latitude: center.lat,
              longitude: center.lng,
              radius_miles: Math.round(radiusMiles * 100) / 100,
            }
          : null,
    };
  } catch (err) {
    console.error('[quote] failed:', err);
    return { success: false, code: 500, error: 'Failed to calculate quote' };
  }
}

/**
 * Geocode an address to lat/lon using Nominatim (OpenStreetMap).
 * Falls back to UK-general placeholder coordinates if geocoding fails.
 */
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lon: number }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        address
      )}&format=json&limit=1&countrycodes=gb`,
      { headers: { 'User-Agent': 'UTO-Admin-Panel/1.0' } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }
  } catch (err) {
    console.error('[Geocode] Failed for address:', address, err);
  }
  // Fallback to London centre as placeholder
  return { lat: 51.5074, lon: -0.1278 };
}