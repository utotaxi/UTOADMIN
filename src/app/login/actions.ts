"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/site-url";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function signupAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Security Check: Ensure only 1 admin can ever exist.
  const { data: existingAdmins } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("role", "admin")
    .limit(1);

  if (existingAdmins && existingAdmins.length > 0) {
    return { error: "An admin account has already been registered. For security reasons, only 1 admin account is permitted." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Ensure this user gets the admin role. 
  // If a trigger already created a row, we update it. If not, upset handles it.
  if (data?.user) {
    // Adding a tiny delay to allow any Supabase 'auth to public triggers' to fire first.
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await supabaseAdmin
      .from("users")
      .update({ role: "admin", full_name: "System Admin" })
      .eq("id", data.user.id);
  }

  if (data?.session) {
    // If auto-confirm is enabled, they are logged in immediately.
    redirect("/");
  }

  // If email confirmation is required by Supabase settings:
  return { 
    success: true, 
    message: "Admin account created successfully! If you have 'Confirm email' enabled in Supabase, please check your inbox. Otherwise, you can now sign in." 
  };
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  if (!email) {
    return { error: "Email address is required." };
  }

  // Only send reset emails for registered admin accounts (match auth email).
  const { data: admins } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("role", "admin");

  let isAuthorizedAdmin = false;
  for (const admin of admins || []) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(admin.id);
    if (authUser?.user?.email?.toLowerCase() === email) {
      isAuthorizedAdmin = true;
      break;
    }
  }

  if (isAuthorizedAdmin) {
    const supabase = await createSupabaseServerClient();
    const siteUrl = await getSiteUrl();
    const redirectTo = `${siteUrl}/auth/callback?next=/login/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      console.error("[forgotPasswordAction]", error.message);
    }
  }

  // Generic message so we do not reveal whether the email exists.
  return {
    success: true,
    message:
      "If an admin account exists for that email, a password reset link has been sent. Check your inbox and follow the link to set a new password.",
  };
}

export async function resetPasswordAction(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Your reset link has expired or is invalid. Please request a new password reset.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}
