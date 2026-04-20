const { createClient } = require('@supabase/supabase-js');

const s = createClient(
  'https://tadqvfnqykmjdxzpoczp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHF2Zm5xeWttamR4enBvY3pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU0NDI1MSwiZXhwIjoyMDg4MTIwMjUxfQ.J9y8UBHcSK7TM7DvwsLP6GqkQQHxmzkREvw9HOvyw_k'
);

async function check() {
  const { data, error } = await s.from('service_areas').select('id').limit(1);
  if (error) {
    console.log('ERROR:', error.message);
  } else {
    console.log('SUCCESS! Table exists. Rows:', data.length);
  }
  process.exit(0);
}

check();
