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

export async function forgotPasswordAction(formData: FormData) {
  const email = normalizeAdminEmail(formData.get("email") as string);
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

  await ensureAdminAccountsTable();

  let account = await getAdminAccountByEmail(email);

  if (!account) {
    const existingCount = await countAdminAccounts();
    const authUserId = await findAuthAdminUserIdByEmail(email);

    if (existingCount === 0 && !authUserId) {
      const saved = await saveAdminAccount({
        email,
        password,
        fullName: "System Admin",
      });
      if (saved.success) {
        account = await getAdminAccountByEmail(email);
      }
    }

    if (!account) {
      const authReset = await resetPasswordViaAuth(email, password);
      if (authReset.success) {
        return {
          success: true,
          message:
            "Password updated successfully. You can now sign in with your new password.",
        };
      }
      return { error: authReset.error || "No admin account found for that email address." };
    }
  } else {
    const { account: updated, error: updateError } = await updateAdminAccountPassword(
      email,
      password
    );
    if (updateError || !updated) {
      return { error: updateError || "Failed to update password." };
    }
    account = updated;
  }

  const { error: syncError } = await syncAdminAuthUser(account, password);
  if (syncError) {
    return { error: syncError };
  }

  return {
    success: true,
    message: "Password updated successfully. You can now sign in with your new password.",
  };
}
