// Run: node scripts/setup-admin-accounts.mjs
// Creates admin_accounts table and seeds from existing Supabase auth admin(s).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = join(__dirname, "..", ".env.local");
    const envStr = readFileSync(envPath, "utf-8");
    const env = {};
    envStr.split("\n").forEach((line) => {
      const parts = line.split("=");
      const key = parts[0];
      const vals = parts.slice(1);
      if (key) env[key.trim()] = vals.join("=").trim().replace(/^"|"$/g, "");
    });
    return env;
  } catch {
    return process.env;
  }
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const sql = readFileSync(join(__dirname, "create-admin-accounts-table.sql"), "utf-8");

console.log("Creating admin_accounts table...");
const { error: sqlError } = await supabase.rpc("exec_sql", { sql_string: sql });

if (sqlError) {
  console.log("exec_sql RPC unavailable:", sqlError.message);
  console.log("Please run scripts/create-admin-accounts-table.sql in Supabase SQL Editor if the table does not exist.");
}

const { data: existing, error: checkError } = await supabase
  .from("admin_accounts")
  .select("id")
  .limit(1);

if (checkError && checkError.message.includes("does not exist")) {
  console.error("\nadmin_accounts table not found. Run the SQL file manually:");
  console.log("  scripts/create-admin-accounts-table.sql");
  process.exit(1);
}

console.log("Seeding admin_accounts from existing auth admins...");

const { data: adminUsers } = await supabase
  .from("users")
  .select("id, email, full_name")
  .eq("role", "admin");

for (const admin of adminUsers || []) {
  const { data: authUser } = await supabase.auth.admin.getUserById(admin.id);
  const email = (authUser?.user?.email || admin.email || "").toLowerCase();
  if (!email) continue;

  const { data: existingAccount } = await supabase
    .from("admin_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingAccount) {
    console.log(`  Already in admin_accounts: ${email}`);
    continue;
  }

  // Placeholder password — admin must reset via Forgot Password page.
  const placeholderPassword = "ChangeMe123!";
  const { error: insertError } = await supabase.from("admin_accounts").insert({
    email,
    password: placeholderPassword,
    auth_user_id: admin.id,
    full_name: admin.full_name || "System Admin",
  });

  if (insertError) {
    console.error(`  Failed to seed ${email}:`, insertError.message);
  } else {
    console.log(`  Seeded ${email} (temporary password: ${placeholderPassword} — reset via Forgot Password)`);
  }
}

console.log("\nDone.");
