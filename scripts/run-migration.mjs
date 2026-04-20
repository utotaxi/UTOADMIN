// Run: node scripts/run-migration.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabaseUrl = 'https://tadqvfnqykmjdxzpoczp.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHF2Zm5xeWttamR4enBvY3pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU0NDI1MSwiZXhwIjoyMDg4MTIwMjUxfQ.J9y8UBHcSK7TM7DvwsLP6GqkQQHxmzkREvw9HOvyw_k';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const sql = readFileSync(join(__dirname, 'create-service-areas-table.sql'), 'utf-8');

console.log('Running migration...');
const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

if (error) {
  // Try direct REST approach
  console.log('rpc exec_sql not available, trying alternative approach...');
  
  // Use the SQL editor REST endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceRoleKey,
      'Authorization': `Bearer ${supabaseServiceRoleKey}`,
    },
    body: JSON.stringify({ sql_string: sql }),
  });

  if (!response.ok) {
    console.log('Alternative approach also failed. Please run the SQL manually in Supabase SQL Editor.');
    console.log('SQL file: scripts/create-service-areas-table.sql');
    console.log('\nTrying to create table via Supabase JS client...');

    // Fallback: try using the postgrest API indirectly
    // First check if table already exists
    const { data: checkData, error: checkError } = await supabase
      .from('service_areas')
      .select('id')
      .limit(1);

    if (checkError && checkError.message.includes('does not exist')) {
      console.log('\n⚠️ Table does not exist. Please run the SQL in your Supabase Dashboard SQL Editor:');
      console.log('Go to: https://supabase.com/dashboard/project/tadqvfnqykmjdxzpoczp/sql');
      console.log('And paste the contents of scripts/create-service-areas-table.sql');
    } else if (!checkError) {
      console.log('✅ Table already exists!');
    } else {
      console.log('Error:', checkError.message);
      console.log('\nPlease run the SQL manually in Supabase SQL Editor:');
      console.log('Go to: https://supabase.com/dashboard/project/tadqvfnqykmjdxzpoczp/sql');
    }
  } else {
    console.log('✅ Migration completed successfully!');
  }
} else {
  console.log('✅ Migration completed successfully!');
}
