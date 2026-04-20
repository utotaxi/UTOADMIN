import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tadqvfnqykmjdxzpoczp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHF2Zm5xeWttamR4enBvY3pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU0NDI1MSwiZXhwIjoyMDg4MTIwMjUxfQ.J9y8UBHcSK7TM7DvwsLP6GqkQQHxmzkREvw9HOvyw_k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== Checking pricing_rules table ===\n');

  // 1. Try to fetch all rows
  const { data, error } = await supabase
    .from('pricing_rules')
    .select('*');

  if (error) {
    console.log('ERROR fetching pricing_rules:', error.message);
    console.log('Full error:', JSON.stringify(error, null, 2));
  } else {
    console.log(`Found ${data.length} row(s) in pricing_rules`);
    if (data.length > 0) {
      console.log('\nColumns present:', Object.keys(data[0]).join(', '));
      console.log('\nFull data:');
      data.forEach((row, i) => {
        console.log(`\n--- Row ${i + 1} ---`);
        console.log(JSON.stringify(row, null, 2));
      });
    }
  }

  // 2. Check table columns via information_schema
  console.log('\n\n=== Checking table schema via SQL ===\n');
  const { data: cols, error: colsErr } = await supabase.rpc('get_table_columns', { p_table_name: 'pricing_rules' });
  if (colsErr) {
    console.log('Could not run RPC (expected):', colsErr.message);
    // Try raw SQL approach
    const { data: sqlData, error: sqlErr } = await supabase
      .from('pricing_rules')
      .select('*')
      .limit(0);
    
    if (sqlErr) {
      console.log('Cannot even query with limit 0:', sqlErr.message);
    } else {
      console.log('Table exists and is queryable (0-row query succeeded)');
    }
  } else {
    console.log('Columns:', JSON.stringify(cols, null, 2));
  }
}

main().catch(console.error);
