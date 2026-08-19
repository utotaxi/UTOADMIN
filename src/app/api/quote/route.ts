import { NextRequest, NextResponse } from 'next/server';
import { calcWebQuote, type LatLng } from '@/lib/web-quote';

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

    const result = await calcWebQuote({
      pickup,
      dropoff,
      minutes: parseFloat(String(body.minutes ?? body.duration_minutes ?? 0)) || 0,
      vehicleType: body.vehicle_type || body.vehicleType,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.code === 404 ? 'No pricing rule configured' : result.error },
        { status: result.code }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[quote] failed:', err);
    return NextResponse.json({ error: 'Failed to calculate quote' }, { status: 500 });
  }
}