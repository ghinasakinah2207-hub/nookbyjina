import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let serviceRoleClientInstance: SupabaseClient | null = null;

/**
 * Returns a server-only Supabase client initialized with the privileged service-role key.
 * 
 * SECURITY RULES:
 * 1. This file uses `import "server-only"` to prevent bundler inclusion in client components.
 * 2. The service-role key bypasses RLS and must NEVER be leaked to browser bundles,
 *    URLs, client-side responses, or console logs.
 * 3. Returns null if SUPABASE_SERVICE_ROLE_KEY is not configured in the environment.
 */
export function getServiceRoleSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  if (!serviceRoleClientInstance) {
    serviceRoleClientInstance = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serviceRoleClientInstance;
}

/**
 * Enforces that the service-role client is available.
 * If missing, throws a clear diagnostic error instructing the operator
 * to configure SUPABASE_SERVICE_ROLE_KEY.
 */
export function requireServiceRoleClient(): SupabaseClient {
  const client = getServiceRoleSupabaseClient();
  if (!client) {
    throw new Error(
      "Konfigurasi server belum lengkap: Environment variable SUPABASE_SERVICE_ROLE_KEY belum disetel. " +
      "Kunci ini wajib dikonfigurasi pada Project Settings Vercel dan file .env.local untuk mengizinkan " +
      "persistensi pesanan yang aman di sisi server."
    );
  }
  return client;
}
