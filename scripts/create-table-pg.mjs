// Use native pg to connect to Supabase PostgreSQL directly
// First install: npm install pg
// Then run: node scripts/create-table-pg.mjs

import pg from 'pg';
const { Client } = pg;

// Supabase project: tadqvfnqykmjdxzpoczp
// Connection string from Supabase dashboard (Settings > Database)
const connectionString = `postgresql://postgres.tadqvfnqykmjdxzpoczp:${process.env.SUPABASE_DB_PASSWORD || 'YOUR_DB_PASSWORD'}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;

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
`;

const indexSql = `CREATE INDEX IF NOT EXISTS idx_service_areas_active ON service_areas (is_active);`;
const rlsSql = `ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;`;
const policySql = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'service_areas' AND policyname = 'Service role full access'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON service_areas FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END
$$;
`;

async function main() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL');
    
    console.log('Creating table...');
    await client.query(sql);
    console.log('✅ Table created');
    
    console.log('Creating index...');
    await client.query(indexSql);
    console.log('✅ Index created');
    
    console.log('Enabling RLS...');
    await client.query(rlsSql);
    console.log('✅ RLS enabled');
    
    console.log('Creating policy...');
    await client.query(policySql);
    console.log('✅ Policy created');
    
    console.log('\n🎉 All done! service_areas table is ready.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
