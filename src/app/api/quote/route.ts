import { NextRequest, NextResponse } from 'next/server';
import { calcWebQuote, type LatLng } from '@/lib/web-quote';
import type { PricingTableKind } from '@/lib/pricing';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function asLatLng(lat: unknown, lng: unknown): LatLng | null {
  const latitude = parseFloat(String(lat));
  const longitude = parseFloat(String(lng));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude };
}

function resolvePricingTable(body: Record<string, unknown>): PricingTableKind {
  const bookingType = String(body.booking_type ?? body.bookingType ?? body.type ?? '').toLowerCase();
  const tableHint = String(body.pricing_table ?? body.pricingTable ?? body.table ?? '').toLowerCase();

  if (
    bookingType === 'scheduled' ||
    bookingType === 'later' ||
    tableHint === '2' ||
    tableHint === 'table_2' ||
    tableHint === 'base_route'
  ) {
    return 'base_route';
  }

  if (tableHint === '1' || tableHint === 'table_1' || tableHint === 'inside') {
    return 'inside';
  }

  return 'auto';
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const pickup = asLatLng(body.pickup_latitude ?? body.pickupLat, body.pickup_longitude ?? body.pickupLng);
    const dropoff = asLatLng(body.dropoff_latitude ?? body.dropoffLat, body.dropoff_longitude ?? body.dropoffLng);

    if (!pickup || !dropoff) {
      return json({ error: 'pickup and dropoff latitude/longitude are required' }, 400);
    }

    const result = await calcWebQuote({
      pickup,
      dropoff,
      minutes: parseFloat(String(body.minutes ?? body.duration_minutes ?? 0)) || 0,
      vehicleType: (body.vehicle_type || body.vehicleType) as string | undefined,
      pricingTable: resolvePricingTable(body),
    });

    if (!result.success) {
      return json(
        { error: result.code === 404 ? 'No pricing rule configured' : result.error },
        result.code
      );
    }

    return json(result);
  } catch (err) {
    console.error('[quote] failed:', err);
    return json({ error: 'Failed to calculate quote' }, 500);
  }
}