import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
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
  });

  // IMPORTANT: DO NOT use getSession(), use getUser() for authentic validation
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/admin/login";

  // Unauthenticated user attempting to access /admin or any admin subroute
  if (!user) {
    if (!isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Authenticated user on login page: verify admin role before redirecting to dashboard
  if (isLoginPage) {
    const { data: adminRecord } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminRecord) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // Allow non-admin on /admin/login to view error and sign in with admin account
    return supabaseResponse;
  }

  // On protected admin routes, user session is verified and cookies refreshed.
  // Authoritative role verification is enforced by requireAdminAuth() in the RSC DAL.
  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*"],
};
