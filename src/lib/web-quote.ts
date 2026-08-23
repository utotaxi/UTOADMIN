import { getServiceAreas, getServiceAreaBasePricing } from '@/app/service-areas/actions';
import { getPricingRules } from '@/app/settings/actions';
import {
  billedRoute,
  calculateFareFromRule,
  describeRouteMode,
  findBaseServiceArea,
  findMainPricingRule,
  findPricingRuleForServiceArea,
  forcedRouteMode,
  metersToMiles,
  resolveVehicleName,
  type LatLng,
  type PricingTableKind,
  type RouteLeg,
  type RouteMode,
  type VehicleTypeName,
} from '@/lib/pricing';

export type { LatLng };

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
  raw_miles: number;
  free_miles: number;
  route_mode: RouteMode;
  route_label: string;
  pricing_table: 'table_1' | 'table_2';
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
 * Price a ride from the two service-area fare tables.
 *
 * Table 1 (`pricing_rules`, rule_type = Service area):
 *   ASAP / on-demand when pickup AND drop-off are inside the circle
 *   → pickup → drop-off only
 *
 * Table 2 (`service_area_base_pricing`):
 *   scheduled rides (web booker + app later bookings), and any ASAP trip
 *   that is not fully inside the circle
 *   → base → pickup + pickup → drop-off, minus the circle radius as free deadhead.
 *   Example: 9-mile area, 2 miles to pickup + 5 miles pickup→drop = 7 raw miles
 *   → 7 < 9 so billed miles = 0 and fare = £0.
 *   If raw miles are 16, billed miles = 16 - 9 = 7.
 */
export async function calcWebQuote(params: {
  pickup: LatLng;
  dropoff: LatLng;
  minutes?: number;
  vehicleType?: string | null;
  pricingTable?: PricingTableKind;
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
      forceMode: forcedRouteMode(params.pricingTable),
    });

    const insideRule = findPricingRuleForServiceArea(pricingRules, baseArea?.id);
    const mainRule = findMainPricingRule(pricingRules);
    const baseRouteRows = await getServiceAreaBasePricing(baseArea?.id ?? null);
    const baseRouteRule = baseRouteRows[0] || null;
    const useTable2 = route.mode === 'outside_base_pickup_dropoff';
    const pricingTable: 'table_1' | 'table_2' = useTable2 ? 'table_2' : 'table_1';

    const rule = useTable2
      ? baseRouteRule || mainRule || insideRule
      : insideRule || mainRule;

    if (!rule) {
      return { success: false, code: 404, error: 'No pricing rule configured' };
    }

    const billedMiles = Math.round(route.miles * 100) / 100;
    const rawMiles = Math.round(route.raw_miles * 100) / 100;
    const freeMiles = Math.round(route.free_miles * 100) / 100;

    // Entirely within the free deadhead allowance → no charge from this table
    if (route.mode === 'outside_base_pickup_dropoff' && billedMiles <= 0) {
      return {
        success: true,
        price: 0,
        billed_miles: 0,
        raw_miles: rawMiles,
        free_miles: freeMiles,
        route_mode: route.mode,
        route_label: describeRouteMode(route.mode),
        pricing_table: pricingTable,
        vehicle: resolveVehicleName(params.vehicleType ?? 'economy'),
        breakdown: { start: 0, mileage: 0, time: 0 },
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
    }

    const fare = calculateFareFromRule({
      miles: route.miles,
      minutes: params.minutes ?? 0,
      vehicleType: params.vehicleType ?? 'economy',
      vehicles: (rule.vehicles || {}) as Record<string, unknown>,
      mileTiers: (rule.mile_tiers || []) as { id: string; after_miles: string }[],
      minuteTiers: (rule.minute_tiers || []) as { id: string; after_minutes: string }[],
    });

    return {
      success: true,
      price: fare.price,
      billed_miles: billedMiles,
      raw_miles: rawMiles,
      free_miles: freeMiles,
      route_mode: route.mode,
      route_label: describeRouteMode(route.mode),
      pricing_table: pricingTable,
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