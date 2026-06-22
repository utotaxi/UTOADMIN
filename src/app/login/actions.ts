"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";

async function findAdminIdByEmail(email: string): Promise<string | null> {
  const { data: admins } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("role", "admin");

  for (const admin of admins || []) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(admin.id);
    if (authUser?.user?.email?.toLowerCase() === email) {
      return admin.id;
    }
  }

  return null;
}

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

  const adminId = await findAdminIdByEmail(email);
  if (!adminId) {
    return { error: "No admin account found for that email address." };
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(adminId, {
    password,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    message: "Password updated successfully. You can now sign in with your new password.",
  };
}
