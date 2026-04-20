// Quick script to create the service_areas table via Supabase Management API
// Run: node scripts/create-table-rest.mjs

const SUPABASE_URL = 'https://tadqvfnqykmjdxzpoczp.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHF2Zm5xeWttamR4enBvY3pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU0NDI1MSwiZXhwIjoyMDg4MTIwMjUxfQ.J9y8UBHcSK7TM7DvwsLP6GqkQQHxmzkREvw9HOvyw_k';

const sql = `
CREATE TABLE IF NOT EXISTS service_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  area_type TEXT NOT NULL CHECK (area_type IN ('polygon', 'circle')),
  coordinates JSONB NOT NULL DEFAULT '[]',
  radius_meters DOUBLE PRECISION,
  color TEXT NOT NULL DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_areas_active ON service_areas (is_active);

ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'service_areas' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON service_areas FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
`;

async function runSQL() {
  // Try the pg_net extension or direct SQL execution endpoint
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({}),
  });

  console.log('Direct RPC status:', response.status);
}

// Alternative: use the Supabase SQL over HTTP endpoint
async function runViaHTTP() {
  const statements = sql.split(';').filter(s => s.trim().length > 0);
  
  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed || trimmed === '$$') continue;
    
    console.log(`Executing: ${trimmed.substring(0, 60)}...`);
  }

  // The proper way is via the pg endpoint
  const pgEndpoint = `${SUPABASE_URL}/pg`;
  const response = await fetch(pgEndpoint, {
    method: 'POST', 
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  console.log('PG endpoint status:', response.status);
  if (response.ok) {
    const data = await response.json();
    console.log('Result:', JSON.stringify(data, null, 2));
  } else {
    const text = await response.text();
    console.log('Response:', text.substring(0, 500));
  }
}

runViaHTTP().catch(console.error);
