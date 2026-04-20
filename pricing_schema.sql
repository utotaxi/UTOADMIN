-- Create the pricing_rules table
CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pickup_area TEXT,
    dropoff_area TEXT,
    apply_web_booker BOOLEAN DEFAULT true,
    apply_dispatch_panel BOOLEAN DEFAULT true,
    vehicles JSONB DEFAULT '{}'::jsonb,
    mile_tiers JSONB DEFAULT '[]'::jsonb,
    minute_tiers JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Note: The Next.js server actions interact with this table securely 
-- using the Supabase Admin key, so you do not technically need to
-- write custom RLS policies for the admin panel to function perfectly!
