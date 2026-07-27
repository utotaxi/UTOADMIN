"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  countAdminAccounts,
  findAuthAdminUserIdByEmail,
  getAdminAccountByEmail,
  normalizeAdminEmail,
  resetPasswordViaAuth,
  saveAdminAccount,
  syncAdminAuthUser,
  updateAdminAccountPassword,
} from "@/lib/admin-accounts";
import {
  consumeAdminPasswordResetPin,
  requestAdminPasswordResetPin,
  verifyAdminPasswordResetPin,
} from "@/lib/admin-password-reset";
import { ensureAdminAccountsTable } from "@/lib/ensure-admin-accounts-table";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const email = normalizeAdminEmail(formData.get("email") as string);
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  await ensureAdminAccountsTable();
  const account = await getAdminAccountByEmail(email);

  if (account) {
    if (account.password !== password) {
      return { error: "Invalid login credentials." };
    }
    const { authUserId, error: syncError } = await syncAdminAuthUser(account, password);
    if (syncError || !authUserId) {
      return { error: syncError || "Unable to sign in. Please try again." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid login credentials." };
  }

  redirect("/");
}

export async function signupAction(formData: FormData) {
  const email = normalizeAdminEmail(formData.get("email") as string);
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  await ensureAdminAccountsTable();
  const existingCount = await countAdminAccounts();
  if (existingCount > 0) {
    return {
      error:
        "An admin account has already been registered. For security reasons, only 1 admin account is permitted.",
    };
  }

  const existingAuth = await findAuthAdminUserIdByEmail(email);
  if (existingAuth) {
    return { error: "A user with this email address has already been registered." };
  }

  const { data: created, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    return { error: createError?.message || "Failed to create admin account." };
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  await supabaseAdmin.from("users").upsert({
    id: created.user.id,
    email,
    role: "admin",
    full_name: "System Admin",
  });

  const saved = await saveAdminAccount({
    email,
    password,
    authUserId: created.user.id,
    fullName: "System Admin",
  });

  if (!saved.success) {
    console.warn("[signupAction] admin_accounts save:", saved.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (!signInError) {
    redirect("/");
  }

  return {
    success: true,
    message: "Admin account created successfully! You can now sign in.",
  };
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Step 1 — email an 8-digit PIN to the admin address. */
export async function requestPasswordResetPinAction(formData: FormData) {
  const email = normalizeAdminEmail(formData.get("email") as string);
  if (!email) {
    return { error: "Email address is required." };
  }

  // Only send PINs for known admin accounts (do not create accounts here).
  await ensureAdminAccountsTable();
  const account = await getAdminAccountByEmail(email);
  const authUserId = account ? null : await findAuthAdminUserIdByEmail(email);

  if (!account && !authUserId) {
    // Generic response — avoid confirming whether the email exists.
    return {
      success: true,
      message:
        "If an admin account exists for that email, an 8-digit PIN has been sent. Check your inbox.",
    };
  }

  const result = await requestAdminPasswordResetPin(email);
  if (!result.success) {
    return { error: result.error };
  }

  return {
    success: true,
    message: result.message,
    step: "pin" as const,
  };
}

/** Step 2 — verify the 8-digit PIN from email. */
export async function verifyPasswordResetPinAction(formData: FormData) {
  const email = normalizeAdminEmail(formData.get("email") as string);
  const pin = String(formData.get("pin") || "");

  if (!email) {
    return { error: "Email address is required." };
  }

  const result = await verifyAdminPasswordResetPin(email, pin);
  if (!result.success) {
    return { error: result.error };
  }

  return {
    success: true,
    message: "PIN verified. Choose a new password.",
    step: "password" as const,
  };
}

/** Step 3 — reset password after a valid PIN. */
export async function resetPasswordWithPinAction(formData: FormData) {
  const email = normalizeAdminEmail(formData.get("email") as string);
  const pin = String(formData.get("pin") || "");
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!email) {
    return { error: "Email address is required." };
  }

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const consumed = await consumeAdminPasswordResetPin(email, pin);
  if (!consumed.success) {
    return { error: consumed.error || "Invalid or expired PIN." };
  }

  await ensureAdminAccountsTable();

  let account = await getAdminAccountByEmail(email);

  if (!account) {
    const authReset = await resetPasswordViaAuth(email, password);
    if (authReset.success) {
      return {
        success: true,
        message:
          "Password updated successfully. You can now sign in with your new password.",
        step: "done" as const,
      };
    }
    return {
      error: authReset.error || "No admin account found for that email address.",
    };
  }

  const { account: updated, error: updateError } = await updateAdminAccountPassword(
    email,
    password
  );
  if (updateError || !updated) {
    return { error: updateError || "Failed to update password." };
  }

  const { error: syncError } = await syncAdminAuthUser(updated, password);
  if (syncError) {
    return { error: syncError };
  }

  return {
    success: true,
    message:
      "Password updated successfully. You can now sign in with your new password.",
    step: "done" as const,
  };
}

/**
 * @deprecated Direct password reset without PIN is disabled for security.
 * Kept so old clients fail closed instead of resetting without verification.
 */
export async function forgotPasswordAction(_formData: FormData) {
  return {
    error:
      "For security, password reset now requires an 8-digit PIN sent to your admin email. Refresh the page and follow the PIN steps.",
  };
}
