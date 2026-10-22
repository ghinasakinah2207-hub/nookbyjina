import fs from "fs";
import path from "path";
import { supabase } from "./client";
import { Banner } from "@/types";
import { BANNERS as DEFAULT_BANNERS } from "@/data/dummy-data";

const DATA_FILE_PATH = path.join(
  process.cwd(),
  "src/data/home-banners-data.json"
);

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
        return parsed.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      }
    }
  } catch (err) {
    console.error("Error reading local home banners store:", err);
  }

  return DEFAULT_BANNERS.map((b, idx) => ({
    ...b,
    sortOrder: idx + 1,
  }));
}

/**
 * Writes banners to the local persistent JSON store.
 */
export function writeLocalBanners(banners: Banner[]): void {
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      DATA_FILE_PATH,
      JSON.stringify(banners, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.error("Error writing local home banners store:", err);
  }
}

/**
 * Server-side loader: Fetch all banners for admin management.
 * Checks Supabase `home_banners` table; falls back to local JSON store.
 */
export async function getAdminHomeBanners(): Promise<Banner[]> {
  try {
    const { data: dbBanners, error } = await supabase
      .from("home_banners")
      .select("id, title, subtitle, image_url, is_active, sort_order, created_at")
      .order("sort_order", { ascending: true });

    if (!error && dbBanners && Array.isArray(dbBanners) && dbBanners.length > 0) {
      return dbBanners.map((b) => ({
        id: b.id,
        title: b.title || undefined,
        subtitle: b.subtitle || undefined,
        imageUrl: b.image_url,
        isActive: Boolean(b.is_active),
        sortOrder: Number(b.sort_order ?? 0),
        createdAt: b.created_at,
      }));
    }
  } catch {
    // Supabase query failed or table empty, fallback to local store
  }

  return readLocalBanners();
}

/**
 * Server-side loader: Fetch only active banners for customer storefront.
 * Checks Supabase `home_banners` table; falls back to local JSON store.
 */
export async function getPublicHomeBanners(): Promise<Banner[]> {
  try {
    const { data: dbBanners, error } = await supabase
      .from("home_banners")
      .select("id, title, subtitle, image_url, is_active, sort_order, created_at")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (!error && dbBanners && Array.isArray(dbBanners) && dbBanners.length > 0) {
      return dbBanners.map((b) => ({
        id: b.id,
        title: b.title || undefined,
        subtitle: b.subtitle || undefined,
        imageUrl: b.image_url,
        isActive: true,
        sortOrder: Number(b.sort_order ?? 0),
        createdAt: b.created_at,
      }));
    }
  } catch {
    // Supabase query failed or table empty, fallback to local store
  }

  return readLocalBanners().filter((b) => b.isActive);
}
