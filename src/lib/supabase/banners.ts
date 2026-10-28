import fs from "fs";
import path from "path";
import crypto from "crypto";
import { unstable_cache } from "next/cache";
import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import { getServiceRoleSupabaseClient } from "./service-role";
import { Banner } from "@/types";
import { BANNERS as DEFAULT_BANNERS } from "@/data/dummy-data";

const DATA_FILE_PATH = path.join(
  process.cwd(),
  "src/data/home-banners-data.json"
);

export const LEGACY_BANNER_UUID_MAP: Record<string, string> = {
  "banner-1": "d0000001-0000-4000-8000-000000000001",
  "banner-2": "d0000001-0000-4000-8000-000000000002",
  "banner-3": "d0000001-0000-4000-8000-000000000003",
};

export function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    val
  );
}

/**
 * Ensures any banner identifier is a valid PostgreSQL UUID.
 * Maps legacy strings ("banner-1", etc.) to canonical UUIDs and generates
 * deterministic v4-compliant UUIDs for other string identifiers.
 */
export function toValidBannerUuid(id?: string): string {
  if (!id || typeof id !== "string") {
    return crypto.randomUUID();
  }
  const clean = id.trim();
  if (isUuid(clean)) {
    return clean.toLowerCase();
  }
  if (LEGACY_BANNER_UUID_MAP[clean]) {
    return LEGACY_BANNER_UUID_MAP[clean];
  }
  const hash = crypto.createHash("sha256").update(clean).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Reads banners directly from the local JSON store.
 * Falls back to DEFAULT_BANNERS if file is missing or invalid.
 */
export function readLocalBanners(): Banner[] {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const content = fs.readFileSync(DATA_FILE_PATH, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((b) => ({
            ...b,
            id: toValidBannerUuid(b.id),
          }))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      }
    }
  } catch (err) {
    console.error("Error reading local home banners store:", err);
  }

  return DEFAULT_BANNERS.map((b, idx) => ({
    ...b,
    id: toValidBannerUuid(b.id),
    sortOrder: idx + 1,
  }));
}

/**
 * Writes banners to the local persistent JSON store.
 * Note: In serverless environments (e.g. Vercel), local filesystem writes may be ephemeral,
 * so Supabase `home_banners` remains the authoritative persistent source.
 */
export function writeLocalBanners(banners: Banner[]): void {
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const normalized = banners.map((b, idx) => ({
      ...b,
      id: toValidBannerUuid(b.id),
      sortOrder: b.sortOrder ?? idx + 1,
    }));
    fs.writeFileSync(
      DATA_FILE_PATH,
      JSON.stringify(normalized, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.error("Error writing local home banners store:", err);
  }
}

/**
 * Authoritative Supabase fetcher for banners.
 * Queries `public.home_banners` ordered by `sort_order` ASC.
 * Maps `subtitle` column to `targetUrl`.
 *
 * INVARIANTS:
 * 1. A successful Supabase query returning [] is a valid empty database state (returns []).
 * 2. Fallback to local JSON store is NEVER used for admin data loading or when query succeeded with [].
 * 3. Storefront only falls back to local JSON store if a network/database error truly occurred.
 */
export async function fetchAuthoritativeBanners(
  clientOverride?: SupabaseClient,
  options?: { forAdmin?: boolean }
): Promise<Banner[]> {
  const client = clientOverride || getServiceRoleSupabaseClient() || supabase;

  try {
    const { data: dbBanners, error } = await client
      .from("home_banners")
      .select("id, title, subtitle, image_url, is_active, sort_order, created_at")
      .order("sort_order", { ascending: true });

    if (!error && dbBanners && Array.isArray(dbBanners)) {
      return dbBanners.map((b) => {
        const rawSubtitle = (b.subtitle || "").trim();
        const isUrl =
          rawSubtitle.startsWith("/") ||
          rawSubtitle.startsWith("http://") ||
          rawSubtitle.startsWith("https://");

        return {
          id: toValidBannerUuid(b.id),
          title: b.title || undefined,
          subtitle: !isUrl && rawSubtitle ? rawSubtitle : undefined,
          targetUrl: isUrl ? rawSubtitle : undefined,
          imageUrl: b.image_url,
          isActive: Boolean(b.is_active),
          sortOrder: Number(b.sort_order ?? 0),
          createdAt: b.created_at,
        };
      });
    }

    if (error) {
      console.warn("Supabase fetch failed in fetchAuthoritativeBanners:", error.message);
    }
  } catch (err) {
    console.warn("Supabase fetch failed in fetchAuthoritativeBanners:", err);
  }

  // Never fall back to mock banners for admin!
  // Return [] so admin operations don't resurrect mock data.
  if (options?.forAdmin) {
    return [];
  }

  return readLocalBanners();
}

const cachedPublicHomeBannersFetcher = unstable_cache(
  async () => {
    const banners = await fetchAuthoritativeBanners();
    return banners.filter((b) => b.isActive);
  },
  ["home-banners-public-key"],
  {
    tags: ["home-banners"],
    revalidate: 60,
  }
);

/**
 * Server-side loader: Fetch all banners for admin management.
 * Checks authoritative Supabase `home_banners` table.
 * Strictly uses { forAdmin: true } to prevent ever falling back to mock banners.
 */
export async function getAdminHomeBanners(
  clientOverride?: SupabaseClient
): Promise<Banner[]> {
  let client = clientOverride;
  if (!client) {
    client = getServiceRoleSupabaseClient() || undefined;
  }
  if (!client) {
    try {
      const { createServerSupabaseClient } = await import("./server");
      client = await createServerSupabaseClient();
    } catch {
      // In non-server or non-request runtime (e.g. test suites)
      client = supabase;
    }
  }
  return fetchAuthoritativeBanners(client, { forAdmin: true });
}

/**
 * Server-side loader: Fetch only active banners for customer storefront.
 * Uses Next.js data cache with tag 'home-banners' for instant storefront response,
 * and falls back gracefully to live query outside Next.js runtime (e.g. test suites).
 */
export async function getPublicHomeBanners(
  clientOverride?: SupabaseClient,
  options?: { fresh?: boolean }
): Promise<Banner[]> {
  if (clientOverride || options?.fresh || !cachedPublicHomeBannersFetcher) {
    const banners = await fetchAuthoritativeBanners(clientOverride);
    return banners.filter((b) => b.isActive);
  }

  try {
    return await cachedPublicHomeBannersFetcher();
  } catch {
    // Outside Next.js incrementalCache (e.g. tsx test suites or non-cache contexts)
    const banners = await fetchAuthoritativeBanners(clientOverride);
    return banners.filter((b) => b.isActive);
  }
}
