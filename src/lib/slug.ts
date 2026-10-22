/**
 * Slug generation and uniqueness utilities for Nook by Jina catalog products.
 */

/**
 * Safely generates a URL-friendly slug from text.
 * - Converts text to lowercase.
 * - Normalizes and removes accents/diacritics safely.
 * - Replaces spaces and sequences of non-alphanumeric characters with single hyphens.
 * - Strips leading and trailing hyphens.
 * - Handles Indonesian characters, punctuation, brackets, etc.
 *
 * Examples:
 * - "Nasi Bakar Cakalang Asap" -> "nasi-bakar-cakalang-asap"
 * - "Es Kopi Susu Aren" -> "es-kopi-susu-aren"
 * - "Risol Mayo Beef (Isi 3)" -> "risol-mayo-beef-isi-3"
 */
export function generateSlug(text: string): string {
  if (!text) return "produk";

  const clean = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric with hyphen
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-+|-+$/g, ""); // strip leading & trailing hyphens

  return clean || "produk";
}

import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves a guaranteed-unique slug in public.products table.
 * If baseSlug already exists, generates sequential numeric suffixes (-2, -3, etc.).
 * Optional excludeProductId allows excluding the currently edited product.
 */
export async function resolveUniqueSlug(
  supabase: SupabaseClient,
  baseSlug: string,
  excludeIdOrTable?: string,
  excludeId?: string
): Promise<string> {
  const isTable = excludeIdOrTable === "products" || excludeIdOrTable === "categories";
  const tableName: "products" | "categories" = isTable ? (excludeIdOrTable as "products" | "categories") : "products";
  const resolvedExcludeId = isTable ? excludeId : excludeIdOrTable;

  const safeBase = generateSlug(baseSlug) || (tableName === "categories" ? "kategori" : "produk");

  let query = supabase
    .from(tableName)
    .select("id, slug")
    .or(`slug.eq.${safeBase},slug.like.${safeBase}-%`);

  if (resolvedExcludeId) {
    query = query.neq("id", resolvedExcludeId);
  }

  const { data: existingRows, error } = await query;
  if (error || !existingRows || existingRows.length === 0) {
    return safeBase;
  }

  const existingSlugs = new Set(
    existingRows.map((r: { slug: string }) => (r.slug || "").toLowerCase())
  );

  // If the base slug is not taken, use it directly
  if (!existingSlugs.has(safeBase)) {
    return safeBase;
  }

  // Find the next available numeric suffix (-2, -3, ...)
  let suffix = 2;
  while (existingSlugs.has(`${safeBase}-${suffix}`)) {
    suffix++;
  }

  return `${safeBase}-${suffix}`;
}
