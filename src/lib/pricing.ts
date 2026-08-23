export const VEHICLE_TYPES = ['Saloon', 'People Carrier', 'Minibus'] as const;
export type VehicleTypeName = (typeof VEHICLE_TYPES)[number];

export const SERVICE_AREA_RULE_TYPE = 'Service area';
export const BASE_ROUTE_RULE_TYPE = 'Base + pickup + drop-off';
export const BASE_SERVICE_AREA_MARKER = 'Role: Base';
export const METERS_PER_MILE = 1609.34;

export const INSIDE_CIRCLE_CALCULATION = 'Pickup Address → Drop-off Address';
export const OUTSIDE_CIRCLE_CALCULATION = 'Base Address → Pickup Address → Drop-off Address';
export const SERVICE_AREA_FIXED_CALCULATION =
  'Inside service area: [Pickup Address] → [Drop-off Address].';
export const BASE_ROUTE_FIXED_CALCULATION =
  'Base → Pickup → Drop-off, minus the service-area radius as free deadhead. Only miles beyond the radius are charged.';

export type RouteMode = 'inside_pickup_dropoff' | 'outside_base_pickup_dropoff';

export type LatLng = { lat: number; lng: number };

export type MileTier = {
  id: string;
  after_miles: string;
};

export type MinuteTier = {
  id: string;
  after_minutes: string;
};

export type VehiclePricing = {
  enabled: boolean;
  min_price: string;
  waiting_price: string;
  start_price: string;
  base_mile_price: string;
  base_minute_price: string;
  mile_tier_prices: Record<string, string>;
  minute_tier_prices: Record<string, string>;
};

export const DEFAULT_VEHICLE_DATA: VehiclePricing = {
  enabled: true,
  min_price: '30.00',
  waiting_price: '0.40',
  start_price: '4.00',
  base_mile_price: '1.00',
  base_minute_price: '0.00',
  mile_tier_prices: { id1: '2.60', id2: '1.80' },
  minute_tier_prices: {},
};

export const DEFAULT_MILE_TIERS: MileTier[] = [
  { id: 'id1', after_miles: '25' },
  { id: 'id2', after_miles: '65' },
];

export function isServiceAreaPricingRule(rule: { rule_type?: string } | null | undefined): boolean {
  return (rule?.rule_type || '') === SERVICE_AREA_RULE_TYPE;
}

export function findMainPricingRule<T extends { rule_type?: string }>(rules: T[]): T | null {
  return rules.find((r) => !isServiceAreaPricingRule(r)) || null;
}

export function findServiceAreaPricingRule<T extends { rule_type?: string }>(rules: T[]): T | null {
  return rules.find((r) => isServiceAreaPricingRule(r)) || null;
}

// The pricing rule linked to a specific service area. Falls back to a legacy
// service-area rule that was saved before rules were linked to areas.
export function findPricingRuleForServiceArea<
  T extends { rule_type?: string; service_area_id?: string | null }
>(rules: T[], serviceAreaId?: string | null): T | null {
  if (serviceAreaId) {
    const linked = rules.find(
      (r) => isServiceAreaPricingRule(r) && r.service_area_id === serviceAreaId
    );
    if (linked) return linked;
  }
  return rules.find((r) => isServiceAreaPricingRule(r) && !r.service_area_id) || null;
}

export function buildVehiclePricing(source?: Partial<VehiclePricing> | Record<string, unknown> | null): VehiclePricing {
  const dv = source || {};
  const mileTiers = (dv as VehiclePricing).mile_tier_prices || {};
  const minuteTiers = (dv as VehiclePricing).minute_tier_prices || {};
  return {
    enabled: (dv as VehiclePricing).enabled ?? true,
    min_price: String((dv as VehiclePricing).min_price ?? DEFAULT_VEHICLE_DATA.min_price),
    waiting_price: String((dv as VehiclePricing).waiting_price ?? DEFAULT_VEHICLE_DATA.waiting_price),
    start_price: String((dv as VehiclePricing).start_price ?? DEFAULT_VEHICLE_DATA.start_price),
    base_mile_price: String((dv as VehiclePricing).base_mile_price ?? DEFAULT_VEHICLE_DATA.base_mile_price),
    base_minute_price: String((dv as VehiclePricing).base_minute_price ?? DEFAULT_VEHICLE_DATA.base_minute_price),
    mile_tier_prices: Object.fromEntries(
      Object.entries(mileTiers).map(([k, val]) => [k, String(val)])
    ),
    minute_tier_prices: Object.fromEntries(
      Object.entries(minuteTiers).map(([k, val]) => [k, String(val)])
    ),
  };
}

export function buildInitialVehicles(initialPricingRule?: { vehicles?: Record<string, unknown> } | null): Record<string, VehiclePricing> {
  const dbVehicles = initialPricingRule?.vehicles || {};
  const vehicles: Record<string, VehiclePricing> = {};
  VEHICLE_TYPES.forEach((tag) => {
    vehicles[tag] = dbVehicles[tag]
      ? buildVehiclePricing(dbVehicles[tag] as Record<string, unknown>)
      : { ...DEFAULT_VEHICLE_DATA, mile_tier_prices: { ...DEFAULT_VEHICLE_DATA.mile_tier_prices } };
  });
  return vehicles;
}

export function formatVehiclesForSave(vehicles: Record<string, VehiclePricing>) {
  const formatted: Record<string, unknown> = {};
  Object.keys(vehicles).forEach((v) => {
    const data = vehicles[v];
    const parsedMileTiers: Record<string, number> = {};
    Object.keys(data.mile_tier_prices || {}).forEach((k) => {
      parsedMileTiers[k] = parseFloat(String(data.mile_tier_prices[k])) || 0;
    });
    const parsedMinuteTiers: Record<string, number> = {};
    Object.keys(data.minute_tier_prices || {}).forEach((k) => {
      parsedMinuteTiers[k] = parseFloat(String(data.minute_tier_prices[k])) || 0;
    });
    formatted[v] = {
      enabled: data.enabled ?? true,
      min_price: parseFloat(String(data.min_price)) || 0,
      waiting_price: parseFloat(String(data.waiting_price)) || 0,
      start_price: parseFloat(String(data.start_price)) || 0,
      base_mile_price: parseFloat(String(data.base_mile_price)) || 0,
      base_minute_price: parseFloat(String(data.base_minute_price)) || 0,
      mile_tier_prices: parsedMileTiers,
      minute_tier_prices: parsedMinuteTiers,
    };
  });
  return formatted;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isWithinCircle(point: LatLng, center: LatLng, radiusMiles: number): boolean {
  if (!radiusMiles || radiusMiles <= 0) return false;
  return haversineMiles(point, center) <= radiusMiles;
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE;
}

export function resolveRouteMode(
  pickup: LatLng,
  dropoff: LatLng,
  center: LatLng | null,
  radiusMiles: number
): RouteMode {
  if (!center || radiusMiles <= 0) return 'outside_base_pickup_dropoff';
  const pickupIn = isWithinCircle(pickup, center, radiusMiles);
  const dropoffIn = isWithinCircle(dropoff, center, radiusMiles);
  return pickupIn && dropoffIn ? 'inside_pickup_dropoff' : 'outside_base_pickup_dropoff';
}

export type RouteLeg = {
  from: 'base' | 'pickup';
  to: 'pickup' | 'dropoff';
  miles: number;
};

export type PricingTableKind = 'auto' | 'inside' | 'base_route';

export function forcedRouteMode(pricingTable?: PricingTableKind | null): RouteMode | undefined {
  if (pricingTable === 'base_route') return 'outside_base_pickup_dropoff';
  if (pricingTable === 'inside') return 'inside_pickup_dropoff';
  return undefined;
}

export function billedRoute(params: {
  pickup: LatLng;
  dropoff: LatLng;
  center: LatLng | null;
  radiusMiles: number;
  forceMode?: RouteMode;
}): { miles: number; raw_miles: number; free_miles: number; mode: RouteMode; legs: RouteLeg[] } {
  const { pickup, dropoff, center, radiusMiles } = params;
  const mode = params.forceMode ?? resolveRouteMode(pickup, dropoff, center, radiusMiles);
  const pickupToDropoff = haversineMiles(pickup, dropoff);

  if (mode === 'inside_pickup_dropoff') {
    return {
      miles: pickupToDropoff,
      raw_miles: pickupToDropoff,
      free_miles: 0,
      mode,
      legs: [{ from: 'pickup', to: 'dropoff', miles: pickupToDropoff }],
    };
  }

  const baseToPickup = center ? haversineMiles(center, pickup) : 0;
  const rawMiles = baseToPickup + pickupToDropoff;
  const freeMiles = Math.max(0, radiusMiles);
  const billedMiles = Math.max(0, rawMiles - freeMiles);

  return {
    miles: billedMiles,
    raw_miles: rawMiles,
    free_miles: Math.min(freeMiles, rawMiles),
    mode,
    legs: [
      ...(center ? [{ from: 'base' as const, to: 'pickup' as const, miles: baseToPickup }] : []),
      { from: 'pickup', to: 'dropoff', miles: pickupToDropoff },
    ],
  };
}

function applyTieredRate(
  distance: number,
  baseRate: number,
  tiers: { after: number; rate: number }[]
): number {
  if (distance <= 0) return 0;
  const sorted = [...tiers].filter((t) => t.after > 0).sort((a, b) => a.after - b.after);
  if (sorted.length === 0) return distance * baseRate;

  let remaining = distance;
  let prev = 0;
  let total = 0;
  let currentRate = baseRate;

  for (const tier of sorted) {
    const chunk = Math.min(remaining, Math.max(0, tier.after - prev));
    if (chunk > 0) {
      total += chunk * currentRate;
      remaining -= chunk;
    }
    currentRate = tier.rate;
    prev = tier.after;
    if (remaining <= 0) break;
  }

  if (remaining > 0) total += remaining * currentRate;
  return total;
}

function num(value: unknown, fallback = 0): number {
  const parsed = parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveVehicleName(vehicleType?: string | null): VehicleTypeName {
  const raw = (vehicleType || '').toLowerCase().trim();
  if (raw.includes('mini') || raw.includes('bus')) return 'Minibus';
  if (raw.includes('people') || raw.includes('mpv') || raw.includes('carrier') || raw.includes('xl')) {
    return 'People Carrier';
  }
  return 'Saloon';
}

export function calculateFareFromRule(params: {
  miles: number;
  minutes?: number;
  vehicleType?: string | null;
  vehicles: Record<string, unknown>;
  mileTiers?: MileTier[];
  minuteTiers?: MinuteTier[];
}): { price: number; vehicle: VehicleTypeName; start: number; mileage: number; time: number } {
  const vehicle = resolveVehicleName(params.vehicleType);
  const raw = (params.vehicles?.[vehicle] || params.vehicles?.[vehicle.toLowerCase()] || {}) as Record<string, unknown>;
  const start = num(raw.start_price);
  const minPrice = num(raw.min_price);
  const mileRate = num(raw.base_mile_price);
  const minuteRate = num(raw.base_minute_price);
  const mileTierPrices = (raw.mile_tier_prices || {}) as Record<string, unknown>;
  const minuteTierPrices = (raw.minute_tier_prices || {}) as Record<string, unknown>;

  const mileTiers = (params.mileTiers || []).map((tier) => ({
    after: num(tier.after_miles),
    rate: num(mileTierPrices[tier.id], mileRate),
  }));
  const minuteTiers = (params.minuteTiers || []).map((tier) => ({
    after: num(tier.after_minutes),
    rate: num(minuteTierPrices[tier.id], minuteRate),
  }));

  const mileage = applyTieredRate(params.miles, mileRate, mileTiers);
  const time = applyTieredRate(params.minutes || 0, minuteRate, minuteTiers);
  const price = Math.max(minPrice, start + mileage + time);

  return {
    price: Math.round(price * 100) / 100,
    vehicle,
    start,
    mileage: Math.round(mileage * 100) / 100,
    time: Math.round(time * 100) / 100,
  };
}

export function describeRouteMode(mode: RouteMode): string {
  return mode === 'inside_pickup_dropoff'
    ? INSIDE_CIRCLE_CALCULATION
    : OUTSIDE_CIRCLE_CALCULATION;
}

export function parseBaseAreaDescription(description?: string | null): { isBase: boolean; limitEnabled: boolean } {
  const text = description || '';
  return {
    isBase: text.includes(BASE_SERVICE_AREA_MARKER),
    limitEnabled: !/Limit:\s*false/i.test(text),
  };
}

export function buildBaseAreaDescription(limitEnabled: boolean): string {
  return `${BASE_SERVICE_AREA_MARKER} | Limit: ${limitEnabled} | Inside: pickup_dropoff | Outside: base_pickup_dropoff`;
}

export function findBaseServiceArea<T extends { area_type?: string; description?: string | null }>(
  areas: T[]
): T | undefined {
  return (
    areas.find((a) => a.area_type === 'circle' && parseBaseAreaDescription(a.description).isBase) ||
    areas.find((a) => a.area_type === 'circle')
  );
}
