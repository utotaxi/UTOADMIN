-- Create the pricing_rules table (used by Settings pricing AND per-service-area pricing)
CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT,
    rule_type TEXT,                -- 'Service area' for service-area rules, other values for the main rule
    rule_priority INTEGER DEFAULT 1,
    is_shuttle BOOLEAN DEFAULT false,
    when_applied TEXT DEFAULT 'Do not limit by time (anytime)',
    fixed_calculation TEXT,
    base_address TEXT,
    pickup_area TEXT,
    dropoff_area TEXT,
    apply_web_booker BOOLEAN DEFAULT true,
    apply_dispatch_panel BOOLEAN DEFAULT true,
    vehicles JSONB DEFAULT '{}'::jsonb,   -- keyed by 'Saloon' | 'People Carrier' | 'Minibus'
    mile_tiers JSONB DEFAULT '[]'::jsonb,   -- [{ id, after_miles }]
    minute_tiers JSONB DEFAULT '[]'::jsonb, -- [{ id, after_minutes }]
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- If the table already exists (older schema), add the missing columns instead:
-- ALTER TABLE pricing_rules
--     ADD COLUMN IF NOT EXISTS rule_name TEXT,
--     ADD COLUMN IF NOT EXISTS rule_type TEXT,
--     ADD COLUMN IF NOT EXISTS rule_priority INTEGER DEFAULT 1,
--     ADD COLUMN IF NOT EXISTS is_shuttle BOOLEAN DEFAULT false,
--     ADD COLUMN IF NOT EXISTS when_applied TEXT DEFAULT 'Do not limit by time (anytime)',
--     ADD COLUMN IF NOT EXISTS fixed_calculation TEXT,
--     ADD COLUMN IF NOT EXISTS base_address TEXT;

-- Link each service-area pricing rule to its service area:
--   service_area_id = <area id>  -> that area's own fare rule
--   service_area_id = NULL       -> the main/global rule (Settings page)
ALTER TABLE pricing_rules
    ADD COLUMN IF NOT EXISTS service_area_id UUID REFERENCES service_areas(id) ON DELETE CASCADE;

-- One pricing rule per service area (NULLs don't conflict, so main rules are unaffected)
CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_service_area_unique
    ON pricing_rules (service_area_id);

-- Migrate any existing service-area rule to the base circle
UPDATE pricing_rules
SET service_area_id = (
    SELECT id FROM service_areas
    WHERE area_type = 'circle'
    ORDER BY (description ILIKE '%Role: Base%') DESC, created_at ASC
    LIMIT 1
)
WHERE rule_type = 'Service area' AND service_area_id IS NULL;

-- Keep updated_at current on edits
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pricing_rules_updated_at
    BEFORE UPDATE ON pricing_rules
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Note: The Next.js server actions interact with this table securely
-- using the Supabase Admin key (service role), so no RLS policies are
-- needed for the admin panel to function. The table is created with
-- RLS disabled by default in Supabase; enable it if other clients
-- will ever query this table directly.

-- Second fare table (base → pickup → drop-off):
-- sql/service_area_base_pricing.sql
