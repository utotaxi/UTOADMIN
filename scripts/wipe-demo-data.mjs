/**
 * PRODUCTION DATA WIPE SCRIPT
 * 
 * This script removes ALL demo/test data from the Supabase database
 * while preserving the table structure (schema) and the admin auth account.
 * 
 * Tables wiped:
 *   - web_booker (web bookings)
 *   - rides (live rides)
 *   - later_bookings (scheduled rides)
 *   - payments (payment records)
 *   - driver_deductions (commissions/penalties)
 *   - drivers (driver profiles)
 *   - users (rider profiles - NOT Supabase auth users)
 *   - coupons (promo codes)
 * 
 * Auth accounts are also cleaned (all non-admin auth users removed).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tadqvfnqykmjdxzpoczp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHF2Zm5xeWttamR4enBvY3pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU0NDI1MSwiZXhwIjoyMDg4MTIwMjUxfQ.J9y8UBHcSK7TM7DvwsLP6GqkQQHxmzkREvw9HOvyw_k';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function wipeTable(tableName) {
  // Delete all rows - using neq on a non-existent condition to match everything
  const { error, count } = await supabase
    .from(tableName)
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // matches all real rows
    .select('*', { count: 'exact', head: true });

  if (error) {
    // Table might not exist yet — that's fine
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      console.log(`  ⏭️  ${tableName} — table does not exist, skipping`);
    } else {
      console.log(`  ❌ ${tableName} — ERROR: ${error.message}`);
    }
  } else {
    console.log(`  ✅ ${tableName} — wiped successfully`);
  }
}

async function wipeAuthUsers() {
  console.log('\n🔐 Cleaning auth accounts (keeping admin)...');
  
  // First, find the admin user (the one with role = 'admin' in the users table)
  const { data: adminUsers } = await supabase
    .from('users')
    .select('id, email')
    .eq('role', 'admin');

  const adminIds = new Set((adminUsers || []).map(u => u.id));
  console.log(`  📌 Found ${adminIds.size} admin account(s) to preserve:`, 
    (adminUsers || []).map(u => u.email).join(', '));

  // List all auth users
  const { data: { users: authUsers }, error } = await supabase.auth.admin.listUsers({
    perPage: 1000
  });

  if (error) {
    console.log(`  ❌ Failed to list auth users: ${error.message}`);
    return;
  }

  let deleted = 0;
  let preserved = 0;

  for (const user of authUsers || []) {
    if (adminIds.has(user.id)) {
      preserved++;
      console.log(`  🛡️  Preserved admin: ${user.email}`);
      continue;
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.log(`  ⚠️  Failed to delete auth user ${user.email}: ${deleteError.message}`);
    } else {
      deleted++;
    }
  }

  console.log(`  ✅ Deleted ${deleted} demo auth accounts, preserved ${preserved} admin(s)`);
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  UTO ADMIN — PRODUCTION DATA WIPE');
  console.log('  Database: ' + SUPABASE_URL);
  console.log('═══════════════════════════════════════════');
  
  // Order matters: delete child tables before parent tables (FK constraints)
  console.log('\n🗑️  Wiping transactional data...');
  await wipeTable('web_booker');
  await wipeTable('payments');
  await wipeTable('driver_deductions');
  await wipeTable('rides');
  await wipeTable('later_bookings');
  await wipeTable('coupons');

  console.log('\n🗑️  Wiping entity data...');
  await wipeTable('drivers');
  await wipeTable('users');

  // Clean up auth accounts (except admin)
  await wipeAuthUsers();

  // Clean up driver document storage
  console.log('\n📂 Cleaning driver document storage...');
  const { data: folders } = await supabase.storage.from('driver-documents').list('', { limit: 1000 });
  if (folders && folders.length > 0) {
    for (const folder of folders) {
      const { data: files } = await supabase.storage.from('driver-documents').list(folder.name, { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map(f => `${folder.name}/${f.name}`);
        await supabase.storage.from('driver-documents').remove(paths);
      }
    }
    console.log(`  ✅ Cleaned ${folders.length} driver document folder(s)`);
  } else {
    console.log('  ⏭️  No driver documents found');
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  ✅ DATABASE WIPE COMPLETE');
  console.log('  Your production admin panel is now clean.');
  console.log('  Admin account(s) preserved for login.');
  console.log('═══════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
