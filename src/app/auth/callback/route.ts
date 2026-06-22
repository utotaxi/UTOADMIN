import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Handles Supabase auth redirects (password recovery, email confirm, etc.).
 * Exchanges the one-time code for a session, then sends the user to `next`.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";

    if (!code) {
        return NextResponse.redirect(`${origin}/login/forgot-password?error=invalid-link`);
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    );
                },
            },
        }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
        console.error("[auth/callback] exchangeCodeForSession:", error.message);
        return NextResponse.redirect(`${origin}/login/forgot-password?error=expired-link`);
    }

    const safeNext = next.startsWith("/") ? next : "/login/reset-password";
    return NextResponse.redirect(`${origin}${safeNext}`);
}
