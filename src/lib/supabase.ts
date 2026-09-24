import { createClient } from "@supabase/supabase-js";

// Placeholders keep `next build` from crashing when Railway does not inject
// env vars into the image build. Runtime still uses the real Railway variables.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-key";

// Client for regular auth operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for overriding RLS and managing data
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
