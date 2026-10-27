import { createServerSupabaseClient } from "./server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { User } from "@supabase/supabase-js";
import { cache } from "react";

export interface AdminAuthContext {
  user: User;
  adminRecord: {
    user_id: string;
    created_at?: string;
  };
}

/**
 * Scoped zero-trust verification helper memoized per RSC request pass.
 * Returns the authenticated admin context or null without throwing a redirect.
 */
export const getAuthenticatedAdmin = cache(
  async (): Promise<AdminAuthContext | null> => {
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError) {
        return null;
      }

      // Cross-check membership in public.admin_users
      const { data: adminRecord, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id, created_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminError || !adminRecord) {
        return null;
      }

      return { user, adminRecord };
    } catch {
      return null;
    }
  }
);

/**
 * Server-side authorization guard for Admin pages and Server Actions.
 * Enforces dual verification:
 * 1. Valid Supabase Auth session via getUser()
 * 2. Active membership in public.admin_users
 *
 * If unauthenticated: redirects to /admin/login.
 * If authenticated but NOT in admin_users: immediately terminates the unauthorized session
 * and redirects to /admin/login with an explicit error query param.
 */
export const requireAdminAuth = cache(async (): Promise<AdminAuthContext> => {
  // Indicate rendering must wait for an incoming user request before continuing
  await connection();

  const auth = await getAuthenticatedAdmin();

  if (!auth) {
    // Check if the caller has any session at all to determine appropriate error
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/admin/login");
    } else {
      // Unauthorized: user is authenticated but not registered in public.admin_users
      redirect("/admin/login?error=unauthorized");
    }
  }

  return auth;
});

/**
 * Check if a given user ID is registered in public.admin_users.
 */
export const checkIsAdmin = cache(async (userId: string): Promise<boolean> => {
  await connection();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
});
