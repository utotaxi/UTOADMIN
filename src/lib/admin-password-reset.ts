import "server-only";

import { createHash, randomInt, timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeAdminEmail } from "@/lib/admin-accounts";
import { sendAdminEmail } from "@/lib/send-admin-email";

const { Client } = pg;

const PIN_LENGTH = 8;
const PIN_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function hashPin(pin: string, email: string): string {
  return createHash("sha256")
    .update(`${normalizeAdminEmail(email)}:${pin}`)
    .digest("hex");
}

function pinsMatch(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function generateEightDigitPin(): string {
  // 10000000–99999999 inclusive
  return String(randomInt(10_000_000, 100_000_000));
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

let ensurePromise: Promise<boolean> | null = null;

export async function ensurePasswordResetPinsTable(): Promise<boolean> {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const { error } = await supabaseAdmin
      .from("admin_password_reset_pins")
      .select("id")
      .limit(1);

    if (!error) return true;

    const msg = error.message || "";
    const missing =
      msg.includes("admin_password_reset_pins") &&
      (msg.includes("schema cache") ||
        msg.includes("does not exist") ||
        msg.includes("Could not find the table"));

    if (!missing) {
      console.error("[password-reset-pins] check failed:", msg);
      return false;
    }

    const connectionString = getConnectionString();
    if (!connectionString) {
      console.error(
        "[password-reset-pins] table missing — run sql/admin_password_reset_pins.sql"
      );
      return false;
    }

    try {
      const sql = readFileSync(
        join(process.cwd(), "sql", "admin_password_reset_pins.sql"),
        "utf-8"
      );
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      try {
        await client.query(sql);
        await client.query("NOTIFY pgrst, 'reload schema'");
      } finally {
        await client.end();
      }
      await new Promise((r) => setTimeout(r, 1000));
      const { error: recheck } = await supabaseAdmin
        .from("admin_password_reset_pins")
        .select("id")
        .limit(1);
      return !recheck;
    } catch (err) {
      console.error("[password-reset-pins] auto-migration failed:", err);
      return false;
    }
  })();

  return ensurePromise;
}

export async function requestAdminPasswordResetPin(email: string): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  cooldownSeconds?: number;
}> {
  const normalized = normalizeAdminEmail(email);
  const tableReady = await ensurePasswordResetPinsTable();
  if (!tableReady) {
    return {
      success: false,
      error:
        "Password reset is not ready. Run sql/admin_password_reset_pins.sql in Supabase.",
    };
  }

  // Rate-limit resends
  const { data: recent } = await supabaseAdmin
    .from("admin_password_reset_pins")
    .select("created_at")
    .eq("email", normalized)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent?.created_at) {
    const ageMs = Date.now() - new Date(recent.created_at).getTime();
    if (ageMs < RESEND_COOLDOWN_SECONDS * 1000) {
      const wait = Math.ceil(
        (RESEND_COOLDOWN_SECONDS * 1000 - ageMs) / 1000
      );
      return {
        success: false,
        error: `Please wait ${wait}s before requesting another PIN.`,
        cooldownSeconds: wait,
      };
    }
  }

  const pin = generateEightDigitPin();
  const pinHash = hashPin(pin, normalized);
  const expiresAt = new Date(
    Date.now() + PIN_TTL_MINUTES * 60 * 1000
  ).toISOString();

  // Invalidate older unused pins for this email
  await supabaseAdmin
    .from("admin_password_reset_pins")
    .update({ consumed_at: new Date().toISOString() })
    .eq("email", normalized)
    .is("consumed_at", null);

  const { error: insertError } = await supabaseAdmin
    .from("admin_password_reset_pins")
    .insert({
      email: normalized,
      pin_hash: pinHash,
      attempts: 0,
      expires_at: expiresAt,
    });

  if (insertError) {
    console.error("[password-reset-pins] insert:", insertError.message);
    return { success: false, error: "Could not create a reset PIN. Try again." };
  }

  const sent = await sendAdminEmail({
    to: normalized,
    subject: "UTO Admin — password reset PIN",
    text: `Your UTO Admin password reset PIN is ${pin}. It expires in ${PIN_TTL_MINUTES} minutes. If you did not request this, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 12px;font-size:20px">UTO Admin password reset</h2>
        <p style="margin:0 0 16px;color:#475569">Use this 8-digit PIN to reset your admin password. It expires in <strong>${PIN_TTL_MINUTES} minutes</strong>.</p>
        <div style="letter-spacing:6px;font-size:32px;font-weight:700;background:#f1f5f9;border-radius:12px;padding:16px 20px;text-align:center">${pin}</div>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });

  if (!sent.success) {
    return { success: false, error: sent.error };
  }

  return {
    success: true,
    message: `An 8-digit PIN has been sent to ${normalized}. It expires in ${PIN_TTL_MINUTES} minutes.`,
  };
}

export async function verifyAdminPasswordResetPin(
  email: string,
  pin: string
): Promise<{ success: boolean; error?: string }> {
  const normalized = normalizeAdminEmail(email);
  const cleaned = String(pin || "").replace(/\D/g, "");
  if (cleaned.length !== PIN_LENGTH) {
    return { success: false, error: "Enter the 8-digit PIN from your email." };
  }

  const tableReady = await ensurePasswordResetPinsTable();
  if (!tableReady) {
    return { success: false, error: "Password reset is not ready." };
  }

  const { data: row, error } = await supabaseAdmin
    .from("admin_password_reset_pins")
    .select("*")
    .eq("email", normalized)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return { success: false, error: "No active PIN found. Request a new one." };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabaseAdmin
      .from("admin_password_reset_pins")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    return { success: false, error: "This PIN has expired. Request a new one." };
  }

  if ((row.attempts || 0) >= MAX_ATTEMPTS) {
    await supabaseAdmin
      .from("admin_password_reset_pins")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    return {
      success: false,
      error: "Too many incorrect attempts. Request a new PIN.",
    };
  }

  const expected = hashPin(cleaned, normalized);
  if (!pinsMatch(expected, row.pin_hash)) {
    await supabaseAdmin
      .from("admin_password_reset_pins")
      .update({ attempts: (row.attempts || 0) + 1 })
      .eq("id", row.id);
    const left = MAX_ATTEMPTS - ((row.attempts || 0) + 1);
    return {
      success: false,
      error:
        left > 0
          ? `Incorrect PIN. ${left} attempt${left === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Request a new PIN.",
    };
  }

  return { success: true };
}

export async function consumeAdminPasswordResetPin(
  email: string,
  pin: string
): Promise<{ success: boolean; error?: string }> {
  const verified = await verifyAdminPasswordResetPin(email, pin);
  if (!verified.success) return verified;

  const normalized = normalizeAdminEmail(email);
  const cleaned = String(pin || "").replace(/\D/g, "");
  const expected = hashPin(cleaned, normalized);

  const { data: row } = await supabaseAdmin
    .from("admin_password_reset_pins")
    .select("id, pin_hash")
    .eq("email", normalized)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || !pinsMatch(expected, row.pin_hash)) {
    return { success: false, error: "PIN verification failed. Request a new one." };
  }

  await supabaseAdmin
    .from("admin_password_reset_pins")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  return { success: true };
}
