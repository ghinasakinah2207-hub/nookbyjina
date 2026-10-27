import "server-only";
import { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAdminCatalogProducts } from "@/lib/supabase/catalog";
import { Product } from "@/types";

/**
 * Dedicated server-side admin product loader.
 *
 * SECURITY & INVARIANTS:
 * 1. MUST only be called after verifying admin authorization (e.g. requireAdminAuth() or verifyAdminCaller()).
 * 2. Uses service-role client if available (production), or authenticated server client.
 * 3. Fetches all non-archived products (is_archived = false), including out-of-stock (is_available = false).
 * 4. Includes categories, product images, and HPP for authorized admin view.
 * 5. Does NOT use dummy PRODUCTS fallback, ensuring DB errors or empty states are transparent.
 */
export async function getAdminProductsServer(clientOverride?: SupabaseClient): Promise<Product[]> {
  const client =
    clientOverride ||
    getServiceRoleSupabaseClient() ||
    (await createServerSupabaseClient());

  return getAdminCatalogProducts(client);
}
