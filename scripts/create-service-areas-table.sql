-- ============================================================
-- SERVICE AREAS TABLE
-- Stores polygon / circle definitions for serviceable zones
-- ============================================================

CREATE TABLE IF NOT EXISTS service_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  -- 'polygon' stores a GeoJSON-style array of [lat,lng] pairs
  -- 'circle'  stores center + radius
  area_type TEXT NOT NULL CHECK (area_type IN ('polygon', 'circle')),
  -- Polygon: [[lat,lng], ...],  Circle: [[centerLat, centerLng]]
  coordinates JSONB NOT NULL DEFAULT '[]',
  -- Only used when area_type = 'circle'
  radius_meters DOUBLE PRECISION,
  -- Visual customisation
  color TEXT NOT NULL DEFAULT '#6366f1',
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_service_areas_active ON service_areas (is_active);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_service_areas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_areas_updated_at ON service_areas;
CREATE TRIGGER trg_service_areas_updated_at
  BEFORE UPDATE ON service_areas
  FOR EACH ROW
  EXECUTE FUNCTION update_service_areas_updated_at();

-- Disable RLS so the admin service_role key always works
ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;

-- Allow full access for service_role (admin panel)
CREATE POLICY "Service role full access" ON service_areas
  FOR ALL
  USING (true)
  WITH CHECK (true);
