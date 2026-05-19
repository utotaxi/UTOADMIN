const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
const envStr = fs.readFileSync(envPath, 'utf-8');
const env = {};
envStr.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key) env[key.trim()] = vals.join('=').trim().replace(/^"|"$/g, '');
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

fetch(`${url}/rest/v1/drivers?select=id,is_online,last_seen_at,current_latitude,current_longitude`, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
}).then(r => r.json()).then(data => {
   console.log('Sample driver:', data[0]);
}).catch(console.error);
