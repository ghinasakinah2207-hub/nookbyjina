import { supabase } from "./client";
import { Category, Product, OptionGroup, OptionValue, Addon } from "@/types";
import { getDefaultIconForSlug } from "@/lib/category-icons";

export interface DbCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  icon?: string | null;
}

export interface DbProductImage {
  id: string;
  image_url: string;
  sort_order: number;
}

export interface DbProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  is_available: boolean;
  is_archived: boolean;
  is_highlight?: boolean;
  sort_order: number;
  category_id: string;
  tags?: string[] | null;
  categories: {
    id: string;
    name: string;
    slug: string;
  } | {
    id: string;
    name: string;
    slug: string;
  }[] | null;
  product_images: DbProductImage[] | null;
}

export interface DbOptionValue {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  is_active: boolean;
  sort_order: number;
}

export interface DbOptionGroup {
  id: string;
  product_id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  product_option_values: DbOptionValue[] | null;
}

export interface DbAddon {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
}

export interface DbProductAddon {
  product_id: string;
  addon_id: string;
  sort_order: number;
  addons: DbAddon | DbAddon[] | null;
}

/**
 * Maps a database product row (with joined categories and images)
 * to the UI Product model expected by components.
 */
export function mapDbProductToUiProduct(row: DbProductRow): Product & { categorySlug?: string } {
  // Extract all categories from joined categories relationship
  const rawCategories = Array.isArray(row.categories)
    ? row.categories
    : row.categories
    ? [row.categories]
    : [];

  const categoryList: { id?: string; name: string; slug?: string }[] = [];
  for (const cat of rawCategories) {
    if (cat && cat.name && !categoryList.some((c) => c.name.toLowerCase() === cat.name.toLowerCase())) {
      categoryList.push({ id: cat.id, name: cat.name, slug: cat.slug });
    }
  }

  // Include any category tags from row.tags if present and not already in categoryList
  if (Array.isArray(row.tags)) {
    for (const tag of row.tags) {
      if (tag && typeof tag === "string" && tag.trim()) {
        const trimmed = tag.trim();
        if (!categoryList.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
          categoryList.push({ name: trimmed });
        }
      }
    }
  }

  const primaryCategory = categoryList[0];

  const sortedImages = (row.product_images || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((img) => {
      const url = img.image_url;
      if (url && url.startsWith("/images/") && /\.(jpg|jpeg)$/i.test(url)) {
        return url.replace(/\.(jpg|jpeg)$/i, ".webp");
      }
      return url;
    });

  return {
    id: row.slug || row.id,
    dbId: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || "",
    categoryId: row.category_id,
    categoryName: primaryCategory?.name || "",
    categorySlug: primaryCategory?.slug || "",
    categories: categoryList,
    categoryNames: categoryList.map((c) => c.name),
    tags: Array.isArray(row.tags) ? row.tags : [],
    basePrice: Number(row.price),
    isAvailable: Boolean(row.is_available),
    isArchived: Boolean(row.is_archived),
    images: sortedImages.length > 0 ? sortedImages : ["/images/hero-food.webp"],
    optionGroups: [],
    addons: [],
    isHighlight: Boolean(row.is_highlight),
  };
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds TTL

let categoriesCache: CacheEntry<Category[]> | null = null;
let visibleProductsCache: CacheEntry<Product[]> | null = null;
const singleProductCache = new Map<string, CacheEntry<Product | null>>();
const recommendedProductsCache = new Map<string, CacheEntry<Product[]>>();

/**
 * Invalidate in-memory catalog cache when admin performs mutations
 */
export function clearCatalogCache(): void {
  categoriesCache = null;
  visibleProductsCache = null;
  singleProductCache.clear();
  recommendedProductsCache.clear();
}

/**
 * Fetch all active categories from Supabase, ordered by sort_order.
 */
export async function getActiveCategories(bypassCache = false): Promise<Category[]> {
  const now = performance.now();
  if (!bypassCache && categoriesCache && now - categoriesCache.timestamp < CACHE_TTL_MS) {
    return categoriesCache.data;
  }

  // Attempt to select 'icon' if schema migration is applied; gracefully fallback if column doesn't exist yet
  let data: DbCategory[] | null = null;
  let queryError: { message: string } | null = null;

  const res = await supabase
    .from("categories")
    .select("id, name, slug, sort_order, icon")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (res.error) {
    if (res.error.message.includes("icon")) {
      // Fallback query without icon column if remote database migration has not been run yet
      const fallbackRes = await supabase
        .from("categories")
        .select("id, name, slug, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      data = fallbackRes.data as DbCategory[] | null;
      queryError = fallbackRes.error;
    } else {
      queryError = res.error;
    }
  } else {
    data = res.data as DbCategory[] | null;
  }

  if (queryError) {
    if (categoriesCache) return categoriesCache.data;
    throw new Error(`Gagal memuat kategori: ${queryError.message}`);
  }

  const result: Category[] = (data || []).map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    icon: cat.icon || getDefaultIconForSlug(cat.slug || cat.name),
  }));

  categoriesCache = { data: result, timestamp: now };
  return result;
}

/**
 * Fetch all visible (non-archived) products with joined category and images.
 */
export async function getVisibleProducts(bypassCache = false): Promise<Product[]> {
  const now = performance.now();
  if (!bypassCache && visibleProductsCache && now - visibleProductsCache.timestamp < CACHE_TTL_MS) {
    return visibleProductsCache.data;
  }
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      description,
      price,
      is_available,
      is_archived,
      is_highlight,
      sort_order,
      category_id,
      tags,
      categories (
        id,
        name,
        slug
      ),
      product_images (
        id,
        image_url,
        sort_order
      )
    `)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  if (error) {
    if (visibleProductsCache) return visibleProductsCache.data;
    throw new Error(`Gagal memuat produk: ${error.message}`);
  }

  const result = (data || []).map((row) => mapDbProductToUiProduct(row as unknown as DbProductRow));
  visibleProductsCache = { data: result, timestamp: now };
  return result;
}

/**
 * Fetch limited recommended products for a given category/product.
 * Matches category or is_highlight=true, non-archived, excludes current product.
 */
export async function getRecommendedProducts(
  categoryId: string | null | undefined,
  currentProductId: string,
  currentProductSlug?: string,
  limit = 4,
  bypassCache = false
): Promise<Product[]> {
  const now = performance.now();
  if (!bypassCache && visibleProductsCache && now - visibleProductsCache.timestamp < CACHE_TTL_MS) {
    return visibleProductsCache.data
      .filter(
        (p) =>
          p.id !== currentProductId &&
          (!currentProductSlug || p.slug !== currentProductSlug) &&
          (p.categoryId === categoryId || p.isHighlight)
      )
      .slice(0, limit);
  }

  const cacheKey = `${categoryId || "none"}:${currentProductId}:${currentProductSlug || ""}:${limit}`;
  if (!bypassCache) {
    const cached = recommendedProductsCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  let query = supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      description,
      price,
      is_available,
      is_archived,
      is_highlight,
      sort_order,
      category_id,
      tags,
      categories (
        id,
        name,
        slug
      ),
      product_images (
        id,
        image_url,
        sort_order
      )
    `)
    .eq("is_archived", false)
    .neq("id", currentProductId);

  if (categoryId) {
    query = query.or(`category_id.eq.${categoryId},is_highlight.eq.true`);
  } else {
    query = query.eq("is_highlight", true);
  }

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .limit(limit + 1);

  if (error) {
    if (recommendedProductsCache.has(cacheKey)) {
      return recommendedProductsCache.get(cacheKey)!.data;
    }
    console.error("Error fetching recommended products:", error);
    return [];
  }

  const result = (data || [])
    .filter(
      (row) =>
        row.id !== currentProductId &&
        (!currentProductSlug || row.slug !== currentProductSlug)
    )
    .slice(0, limit)
    .map((row) => mapDbProductToUiProduct(row as unknown as DbProductRow));

  recommendedProductsCache.set(cacheKey, { data: result, timestamp: now });
  return result;
}

/**
 * Fetch a single product by slug or UUID with all images, option groups,
 * option values, and linked addons from Supabase.
 */
export async function getProductBySlugOrId(identifier: string, bypassCache = false): Promise<Product | null> {
  const now = performance.now();
  if (!bypassCache) {
    const cached = singleProductCache.get(identifier);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  let query = supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      description,
      price,
      is_available,
      is_archived,
      is_highlight,
      sort_order,
      category_id,
      tags,
      categories (
        id,
        name,
        slug
      ),
      product_images (
        id,
        image_url,
        sort_order
      )
    `);

  if (isUuid) {
    query = query.or(`id.eq.${identifier},slug.eq.${identifier}`);
  } else {
    query = query.eq("slug", identifier);
  }

  const { data: productRow, error: prodErr } = await query.maybeSingle();

  if (prodErr) {
    throw new Error(`Gagal memuat produk: ${prodErr.message}`);
  }

  if (!productRow) {
    return null;
  }

  // Fetch option groups with values, and linked addons in parallel
  const [optionGroupsRes, addonsRes] = await Promise.all([
    supabase
      .from("product_option_groups")
      .select(`
        id,
        product_id,
        name,
        is_required,
        min_select,
        max_select,
        sort_order,
        product_option_values (
          id,
          group_id,
          name,
          price_delta,
          is_active,
          sort_order
        )
      `)
      .eq("product_id", productRow.id)
      .order("sort_order", { ascending: true }),

    supabase
      .from("product_addons")
      .select(`
        product_id,
        addon_id,
        sort_order,
        addons (
          id,
          name,
          description,
          price,
          is_active
        )
      `)
      .eq("product_id", productRow.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (optionGroupsRes.error) {
    throw new Error(`Gagal memuat opsi varian: ${optionGroupsRes.error.message}`);
  }

  if (addonsRes.error) {
    throw new Error(`Gagal memuat ekstra add-on: ${addonsRes.error.message}`);
  }

  // Map option groups ordered by sort_order
  const optionGroups: OptionGroup[] = (optionGroupsRes.data || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((g) => {
      const rawValues = (g.product_option_values || []) as DbOptionValue[];
      const values: OptionValue[] = rawValues
        .filter((v) => v.is_active !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((v) => ({
          id: v.id,
          name: v.name,
          priceDelta: Number(v.price_delta || 0),
        }));

      return {
        id: g.id,
        name: g.name,
        required: Boolean(g.is_required),
        minSelect: Number(g.min_select ?? (g.is_required ? 1 : 0)),
        maxSelect: Number(g.max_select ?? 1),
        values,
      };
    });

  // Map addons linked via product_addons ordered by sort_order
  const rawProductAddons = (addonsRes.data || []) as unknown as DbProductAddon[];
  const addons: Addon[] = rawProductAddons
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((pa) => {
      const rawAddon = Array.isArray(pa.addons) ? pa.addons[0] : pa.addons;
      if (!rawAddon || rawAddon.is_active === false) return null;
      return {
        id: rawAddon.id,
        name: rawAddon.name,
        price: Number(rawAddon.price || 0),
      };
    })
    .filter((a): a is Addon => a !== null);

  const baseProduct = mapDbProductToUiProduct(productRow as unknown as DbProductRow);

  const fullProduct: Product = {
    ...baseProduct,
    optionGroups,
    addons,
  };

  singleProductCache.set(identifier, { data: fullProduct, timestamp: now });
  if (fullProduct.id && fullProduct.id !== identifier) {
    singleProductCache.set(fullProduct.id, { data: fullProduct, timestamp: now });
  }
  if (fullProduct.slug && fullProduct.slug !== identifier) {
    singleProductCache.set(fullProduct.slug, { data: fullProduct, timestamp: now });
  }

  return fullProduct;
}

/**
 * Fetch all active addons from Supabase, ordered by name.
 */
export async function getActiveAddons(): Promise<Addon[]> {
  const { data, error } = await supabase
    .from("addons")
    .select("id, name, description, price, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return [];
  }

  return (data || []).map((a) => ({
    id: a.id,
    name: a.name,
    price: Number(a.price || 0),
  }));
}

