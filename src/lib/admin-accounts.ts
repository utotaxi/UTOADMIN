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

  // Prefer linked admin_accounts row when present.
  const account = await getAdminAccountByEmail(normalized);
  if (account?.auth_user_id) {
    return account.auth_user_id;
  }

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

  // Last resort: auth directory (still only used for password updates).
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
  const existing = await getAdminAccountByEmail(normalized);

  // Never wipe an existing admin profile on password save/reset.
  const payload: Record<string, unknown> = {
    email: normalized,
    password: params.password,
    updated_at: new Date().toISOString(),
  };

  if (params.authUserId) {
    payload.auth_user_id = params.authUserId;
  } else if (existing?.auth_user_id) {
    payload.auth_user_id = existing.auth_user_id;
  }

  if (existing) {
    // Keep existing full_name unless explicitly provided and non-empty.
    if (params.fullName && params.fullName.trim()) {
      payload.full_name = params.fullName.trim();
    }
  } else {
    payload.full_name = params.fullName?.trim() || "System Admin";
    payload.auth_user_id = params.authUserId ?? null;
  }

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

/**
 * Password-only Auth update. Does not change email, profile, role, or public.users.
 */
export async function updateAuthPasswordOnly(
  authUserId: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    password,
  });
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Ensure a public.users admin row exists without overwriting existing profile data.
 */
async function ensureAdminUsersRowWithoutOverwrite(params: {
  authUserId: string;
  email: string;
  fullName?: string;
}): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", params.authUserId)
    .maybeSingle();

  if (existing) {
    // Existing rider/admin/profile data must stay untouched on password reset/login sync.
    return;
  }

  await supabaseAdmin.from("users").insert({
    id: params.authUserId,
    email: normalizeAdminEmail(params.email),
    role: "admin",
    full_name: params.fullName?.trim() || "System Admin",
  });
}

/** Keep Supabase Auth in sync with admin_accounts (password). Never rewrite profile data. */
export async function syncAdminAuthUser(
  account: AdminAccount,
  password: string
): Promise<{ authUserId: string | null; error?: string }> {
  const normalized = normalizeAdminEmail(account.email);

  if (account.auth_user_id) {
    const updated = await updateAuthPasswordOnly(account.auth_user_id, password);
    if (!updated.success) {
      return { authUserId: null, error: updated.error };
    }

    await ensureAdminUsersRowWithoutOverwrite({
      authUserId: account.auth_user_id,
      email: normalized,
      fullName: account.full_name,
    });

    return { authUserId: account.auth_user_id };
  }

  // Linked auth user missing — reuse existing auth user for this email if present.
  const existingAuthId = await findAuthAdminUserIdByEmail(normalized);
  if (existingAuthId) {
    const updated = await updateAuthPasswordOnly(existingAuthId, password);
    if (!updated.success) {
      return { authUserId: null, error: updated.error };
    }

    await supabaseAdmin
      .from("admin_accounts")
      .update({
        auth_user_id: existingAuthId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    await ensureAdminUsersRowWithoutOverwrite({
      authUserId: existingAuthId,
      email: normalized,
      fullName: account.full_name,
    });

    return { authUserId: existingAuthId };
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

  await ensureAdminUsersRowWithoutOverwrite({
    authUserId,
    email: normalized,
    fullName: account.full_name,
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

/**
 * Reset password only — never rewrite public.users profile/role/name
 * and never force full_name to "System Admin".
 */
export async function resetPasswordViaAuth(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const normalized = normalizeAdminEmail(email);
  const authUserId = await findAuthAdminUserIdByEmail(normalized);

  if (!authUserId) {
    return { success: false, error: "No admin account found for that email address." };
  }

  const updated = await updateAuthPasswordOnly(authUserId, password);
  if (!updated.success) {
    return { success: false, error: updated.error };
  }

  const tableReady = await ensureAdminAccountsTable();
  if (tableReady) {
    const account = await getAdminAccountByEmail(normalized);
    if (account) {
      await updateAdminAccountPassword(normalized, password);
      if (!account.auth_user_id) {
        await supabaseAdmin
          .from("admin_accounts")
          .update({
            auth_user_id: authUserId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id);
      }
    } else {
      // Create admin_accounts row without touching public.users data.
      const { data: existingUser } = await supabaseAdmin
        .from("users")
        .select("full_name")
        .eq("id", authUserId)
        .maybeSingle();

      await saveAdminAccount({
        email: normalized,
        password,
        authUserId,
        fullName: existingUser?.full_name || undefined,
      });
    }
  }

  return { success: true };
}
