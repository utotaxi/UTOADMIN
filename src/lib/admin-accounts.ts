import { supabaseAdmin } from "@/lib/supabase";
import { ensureAdminAccountsTable } from "@/lib/ensure-admin-accounts-table";

export type AdminAccount = {
  id: string;
  email: string;
  password: string;
  auth_user_id: string | null;
  full_name: string;
  created_at: string;
  updated_at: string;
};

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findAuthAdminUserIdByEmail(
  email: string
): Promise<string | null> {
  const normalized = normalizeAdminEmail(email);
  const { data: admins } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("role", "admin");

  for (const admin of admins || []) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(admin.id);
    if (authUser?.user?.email?.toLowerCase() === normalized) {
      return admin.id;
    }
  }

  // Also check auth users directly (admin row may be missing in public.users).
  const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  for (const user of authList?.users || []) {
    if (user.email?.toLowerCase() === normalized) {
      return user.id;
    }
  }

  return null;
}

export async function getAdminAccountByEmail(
  email: string
): Promise<AdminAccount | null> {
  const tableReady = await ensureAdminAccountsTable();
  if (!tableReady) return null;

  const normalized = normalizeAdminEmail(email);
  const { data, error } = await supabaseAdmin
    .from("admin_accounts")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    console.error("[admin_accounts] getByEmail:", error.message);
    return null;
  }

  return data as AdminAccount | null;
}

export async function saveAdminAccount(params: {
  email: string;
  password: string;
  authUserId?: string | null;
  fullName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const tableReady = await ensureAdminAccountsTable();
  if (!tableReady) {
    return {
      success: false,
      error:
        "Admin accounts table is not set up yet. Run scripts/create-admin-accounts-table.sql in Supabase SQL Editor, or add SUPABASE_DB_PASSWORD to Railway so the table can be created automatically.",
    };
  }

  const normalized = normalizeAdminEmail(params.email);
  const payload = {
    email: normalized,
    password: params.password,
    auth_user_id: params.authUserId ?? null,
    full_name: params.fullName || "System Admin",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("admin_accounts").upsert(payload, {
    onConflict: "email",
  });

  if (error) {
    console.error("[admin_accounts] save:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function updateAdminAccountPassword(
  email: string,
  password: string
): Promise<{ account: AdminAccount | null; error?: string }> {
  const normalized = normalizeAdminEmail(email);
  const account = await getAdminAccountByEmail(normalized);

  if (!account) {
    return { account: null, error: "No admin account found for that email address." };
  }

  const { error } = await supabaseAdmin
    .from("admin_accounts")
    .update({ password, updated_at: new Date().toISOString() })
    .eq("id", account.id);

  if (error) {
    console.error("[admin_accounts] updatePassword:", error.message);
    return { account: null, error: error.message };
  }

  return {
    account: { ...account, password },
  };
}

/** Keep Supabase Auth + public users row in sync with admin_accounts. */
export async function syncAdminAuthUser(
  account: AdminAccount,
  password: string
): Promise<{ authUserId: string | null; error?: string }> {
  const normalized = normalizeAdminEmail(account.email);

  if (account.auth_user_id) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      account.auth_user_id,
      { password, email: normalized }
    );
    if (error) {
      return { authUserId: null, error: error.message };
    }

    await supabaseAdmin.from("users").upsert({
      id: account.auth_user_id,
      email: normalized,
      role: "admin",
      full_name: account.full_name || "System Admin",
    });

    return { authUserId: account.auth_user_id };
  }

  const { data: created, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email: normalized,
      password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    return { authUserId: null, error: createError?.message || "Failed to create auth user." };
  }

  const authUserId = created.user.id;

  await supabaseAdmin
    .from("admin_accounts")
    .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
    .eq("id", account.id);

  await supabaseAdmin.from("users").upsert({
    id: authUserId,
    email: normalized,
    role: "admin",
    full_name: account.full_name || "System Admin",
  });

  return { authUserId };
}

export async function countAdminAccounts(): Promise<number> {
  const tableReady = await ensureAdminAccountsTable();
  if (!tableReady) return 0;

  const { count, error } = await supabaseAdmin
    .from("admin_accounts")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("[admin_accounts] count:", error.message);
    return 0;
  }

  return count || 0;
}

/** Reset password via Supabase Auth when admin_accounts is unavailable. */
export async function resetPasswordViaAuth(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const authUserId = await findAuthAdminUserIdByEmail(email);

  if (!authUserId) {
    return { success: false, error: "No admin account found for that email address." };
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    password,
    email: normalizeAdminEmail(email),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await supabaseAdmin.from("users").upsert({
    id: authUserId,
    email: normalizeAdminEmail(email),
    role: "admin",
    full_name: "System Admin",
  });

  // Persist to admin_accounts when the table exists.
  const tableReady = await ensureAdminAccountsTable();
  if (tableReady) {
    await saveAdminAccount({
      email,
      password,
      authUserId,
      fullName: "System Admin",
    });
  }

  return { success: true };
}
