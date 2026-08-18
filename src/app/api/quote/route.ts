import { NextRequest, NextResponse } from 'next/server';
import { getServiceAreas } from '@/app/service-areas/actions';
import { getPricingRules } from '@/app/settings/actions';
import {
  billedRoute,
  calculateFareFromRule,
  describeRouteMode,
  findBaseServiceArea,
  findMainPricingRule,
  findServiceAreaPricingRule,
  metersToMiles,
  type LatLng,
} from '@/lib/pricing';

function asLatLng(lat: unknown, lng: unknown): LatLng | null {
  const latitude = parseFloat(String(lat));
  const longitude = parseFloat(String(lng));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pickup = asLatLng(body.pickup_latitude ?? body.pickupLat, body.pickup_longitude ?? body.pickupLng);
    const dropoff = asLatLng(body.dropoff_latitude ?? body.dropoffLat, body.dropoff_longitude ?? body.dropoffLng);

    if (!pickup || !dropoff) {
      return NextResponse.json(
        { error: 'pickup and dropoff latitude/longitude are required' },
        { status: 400 }
      );
    }

    const [areas, pricingRules] = await Promise.all([
      getServiceAreas(),
      getPricingRules(),
    ]);

    const baseArea = findBaseServiceArea(areas);
    const center = baseArea?.coordinates?.[0]
      ? { lat: baseArea.coordinates[0][0], lng: baseArea.coordinates[0][1] }
      : null;
    const radiusMiles = baseArea?.radius_meters ? metersToMiles(baseArea.radius_meters) : 0;

    const route = billedRoute({ pickup, dropoff, center, radiusMiles });
    const serviceAreaRule = findServiceAreaPricingRule(pricingRules);
    const mainRule = findMainPricingRule(pricingRules);
    const rule = route.mode === 'inside_pickup_dropoff'
      ? (serviceAreaRule || mainRule)
      : (mainRule || serviceAreaRule);

    if (!rule) {
      return NextResponse.json(
        { error: 'No pricing rule configured' },
        { status: 404 }
      );
    }

    const fare = calculateFareFromRule({
      miles: route.miles,
      minutes: parseFloat(String(body.minutes ?? body.duration_minutes ?? 0)) || 0,
      vehicleType: body.vehicle_type || body.vehicleType,
      vehicles: (rule.vehicles || {}) as Record<string, unknown>,
      mileTiers: rule.mile_tiers || [],
      minuteTiers: rule.minute_tiers || [],
    });

    return NextResponse.json({
      success: true,
      price: fare.price,
      billed_miles: Math.round(route.miles * 100) / 100,
      route_mode: route.mode,
      route_label: describeRouteMode(route.mode),
      legs: route.legs.map((leg) => ({
        ...leg,
        miles: Math.round(leg.miles * 100) / 100,
      })),
      vehicle: fare.vehicle,
      breakdown: {
        start: fare.start,
        mileage: fare.mileage,
        time: fare.time,
      },
      base: center && radiusMiles > 0
        ? {
            name: baseArea?.name,
            latitude: center.lat,
            longitude: center.lng,
            radius_miles: Math.round(radiusMiles * 100) / 100,
          }
        : null,
    });
  } catch (err) {
    console.error('[quote] failed:', err);
    return NextResponse.json({ error: 'Failed to calculate quote' }, { status: 500 });
  }
}
