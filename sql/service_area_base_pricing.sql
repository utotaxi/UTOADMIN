-- ============================================================
-- BASE + PICKUP + DROP-OFF PRICING
-- Run this in the Supabase SQL Editor.
--
-- Table 1 (existing `pricing_rules` with rule_type = 'Service area'):
--   Pickup AND drop-off inside the blue circle
--   → charge pickup → drop-off only
--
-- Table 2 (this table):
--   Base → pickup + pickup → drop-off, minus the circle radius as FREE deadhead.
--   Only miles beyond the radius are charged (and those miles use this table's rates).
--
-- Example A: 9-mile service area, 2 miles base→pickup, 5 miles pickup→drop-off
--   raw miles = 2 + 5 = 7
--   7 < 9 → billed miles = 0, fare = £0
--
-- Example B: 9-mile service area, raw miles = 16
--   billed miles = 16 - 9 = 7 (charged on this table)
-- ============================================================

CREATE TABLE IF NOT EXISTS service_area_base_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_area_id UUID REFERENCES service_areas(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL DEFAULT 'Base + pickup + drop-off',
  calculation TEXT NOT NULL DEFAULT 'base_pickup_dropoff',
  apply_web_booker BOOLEAN NOT NULL DEFAULT true,
  apply_dispatch_panel BOOLEAN NOT NULL DEFAULT true,
  -- Same shape as pricing_rules.vehicles:
  -- { "Saloon": { enabled, min_price, waiting_price, start_price,
  --               base_mile_price, base_minute_price,
  --               mile_tier_prices, minute_tier_prices }, ... }
  vehicles JSONB NOT NULL DEFAULT '{}'::jsonb,
  mile_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  minute_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One base-route rate card per service area
CREATE UNIQUE INDEX IF NOT EXISTS service_area_base_pricing_area_unique
  ON service_area_base_pricing (service_area_id);

CREATE INDEX IF NOT EXISTS idx_service_area_base_pricing_area
  ON service_area_base_pricing (service_area_id);

CREATE OR REPLACE FUNCTION set_service_area_base_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_area_base_pricing_updated_at ON service_area_base_pricing;
CREATE TRIGGER trg_service_area_base_pricing_updated_at
  BEFORE UPDATE ON service_area_base_pricing
  FOR EACH ROW
  EXECUTE FUNCTION set_service_area_base_pricing_updated_at();

ALTER TABLE service_area_base_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON service_area_base_pricing;
CREATE POLICY "Service role full access" ON service_area_base_pricing
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional: seed from the existing inside-circle service-area pricing row
-- (safe to re-run; skips areas that already have a base-route row)
INSERT INTO service_area_base_pricing (
  service_area_id,
  rule_name,
  vehicles,
  mile_tiers,
  minute_tiers,
  apply_web_booker,
  apply_dispatch_panel
)
SELECT
  pr.service_area_id,
  'Base + pickup + drop-off',
  COALESCE(pr.vehicles, '{}'::jsonb),
  COALESCE(pr.mile_tiers, '[]'::jsonb),
  COALESCE(pr.minute_tiers, '[]'::jsonb),
  COALESCE(pr.apply_web_booker, true),
  COALESCE(pr.apply_dispatch_panel, true)
FROM pricing_rules pr
WHERE pr.rule_type = 'Service area'
  AND pr.service_area_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM service_area_base_pricing b
    WHERE b.service_area_id = pr.service_area_id
  );
