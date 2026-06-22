import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
import { supabaseAdmin } from "@/lib/supabase";

const { Client } = pg;

let ensurePromise: Promise<boolean> | null = null;

function isMissingTableError(message?: string): boolean {
  if (!message) return false;
  return (
    message.includes("admin_accounts") &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("Could not find the table"))
  );
}

function getConnectionString(): string | null {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const ref =
    supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
    "tadqvfnqykmjdxzpoczp";

  return `postgresql://postgres.${ref}:${encodeURIComponent(dbPassword)}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;
}

async function runMigrationSql(): Promise<void> {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("SUPABASE_DB_PASSWORD is not configured.");
  }

  const sqlPath = join(process.cwd(), "scripts", "create-admin-accounts-table.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(sql);
    await client.query("NOTIFY pgrst, 'reload schema';");
  } finally {
    await client.end();
  }
}

/** Ensures admin_accounts exists; returns true if table is usable. */
export async function ensureAdminAccountsTable(): Promise<boolean> {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const { error } = await supabaseAdmin.from("admin_accounts").select("id").limit(1);

    if (!error) return true;

    if (!isMissingTableError(error.message)) {
      console.error("[admin_accounts] table check failed:", error.message);
      return false;
    }

    try {
      await runMigrationSql();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const { error: recheck } = await supabaseAdmin
        .from("admin_accounts")
        .select("id")
        .limit(1);
      return !recheck;
    } catch (err) {
      console.error("[admin_accounts] auto-migration failed:", err);
      return false;
    }
  })();

  return ensurePromise;
}

export { isMissingTableError };
