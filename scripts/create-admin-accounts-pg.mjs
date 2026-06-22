// Creates admin_accounts table via direct PostgreSQL connection.
// Run: node scripts/create-admin-accounts-pg.mjs

import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const { Client } = pg;
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
const dbPassword = env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD;

if (!dbPassword) {
  console.error("Missing SUPABASE_DB_PASSWORD in .env.local");
  process.exit(1);
}

const ref = env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] || "tadqvfnqykmjdxzpoczp";
const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(dbPassword)}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;

const sql = readFileSync(join(__dirname, "create-admin-accounts-table.sql"), "utf-8");

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL");
    await client.query(sql);
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("admin_accounts table created and schema reloaded.");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
