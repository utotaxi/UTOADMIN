import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware that protects ALL routes except /login.
 * If the user is not authenticated, they are redirected to /login.
 * If they ARE authenticated and visit /login, they are redirected to /.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT use getSession() — it reads from cookies without
  // validating the JWT. getUser() hits Supabase Auth server and is secure.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthCallback = pathname.startsWith("/auth/");
  const isForgotPassword = pathname === "/login/forgot-password";
  const isResetPassword = pathname === "/login/reset-password";
  const isLogin = pathname === "/login";

  const isPublicRoute = isLogin || isForgotPassword || isAuthCallback;

  // Not authenticated → only allow public auth routes
  if (!user) {
    if (isResetPassword) {
      const url = request.nextUrl.clone();
      url.pathname = "/login/forgot-password";
      url.searchParams.set("error", "expired-link");
      return NextResponse.redirect(url);
    }
    if (!isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Authenticated on login/forgot → go to dashboard (but allow reset-password)
  if (user && (isLogin || isForgotPassword)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
