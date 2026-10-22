import fs from "fs";
import path from "path";
import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import { getServiceRoleSupabaseClient } from "./service-role";
import { StoreSettings } from "@/types";
import { STORE_SETTINGS as DEFAULT_SETTINGS } from "@/data/dummy-data";
import { normalizeInstagramUrl } from "@/lib/instagram-url";

const SETTINGS_FILE_PATH = path.join(
  process.cwd(),
  "src/data/store-settings-data.json"
);

/**
 * Reads settings from the local persistent JSON store.
 */
export function readLocalStoreSettings(): StoreSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const content = fs.readFileSync(SETTINGS_FILE_PATH, "utf-8");
      const parsed = JSON.parse(content);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        deliveryConfig: {
          ...DEFAULT_SETTINGS.deliveryConfig,
          ...(parsed.deliveryConfig || {}),
        },
        instagramUrl:
          parsed.instagramUrl !== undefined
            ? parsed.instagramUrl
            : (DEFAULT_SETTINGS.instagramUrl || ""),
        qrisImageUrl:
          parsed.qrisImageUrl !== undefined
            ? parsed.qrisImageUrl
            : (DEFAULT_SETTINGS.qrisImageUrl || ""),
        paymentMethods: {
          qris:
            parsed.paymentMethods?.qris !== undefined
              ? Boolean(parsed.paymentMethods.qris)
              : DEFAULT_SETTINGS.paymentMethods.qris,
          cash:
            parsed.paymentMethods?.cash !== undefined
              ? Boolean(parsed.paymentMethods.cash)
              : DEFAULT_SETTINGS.paymentMethods.cash,
        },
      };
    }
  } catch (err) {
    console.error("Error reading store settings local file:", err);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Writes settings to the local persistent JSON store.
 */
export function writeLocalStoreSettings(settings: StoreSettings): void {
  try {
    const dir = path.dirname(SETTINGS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const withTimestamp: StoreSettings = {
      ...settings,
      updatedAt: settings.updatedAt || new Date().toISOString(),
    };
    fs.writeFileSync(
      SETTINGS_FILE_PATH,
      JSON.stringify(withTimestamp, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.error("Error writing store settings local file:", err);
  }
}

/**
 * Validates store settings input fields.
 * Returns error string or null if valid.
 */
export function validateStoreSettings(settings: StoreSettings): string | null {
  const storeName = (settings.storeName || "").trim();
  if (!storeName || storeName.length < 2) {
    return "Nama toko wajib diisi (minimal 2 karakter).";
  }

  const rawWhatsapp = (settings.adminWhatsapp || "").replace(/[^0-9]/g, "");
  if (!rawWhatsapp || rawWhatsapp.length < 9 || rawWhatsapp.length > 16) {
    return "Nomor WhatsApp tidak valid. Masukkan minimal 9-16 digit angka (contoh: 6282273180000).";
  }

  if (
    settings.deliveryConfig.standardFee === undefined ||
    settings.deliveryConfig.standardFee === null ||
    isNaN(Number(settings.deliveryConfig.standardFee)) ||
    Number(settings.deliveryConfig.standardFee) < 0
  ) {
    return "Ongkos kirim standar tidak boleh berupa angka negatif.";
  }

  if (
    settings.deliveryConfig.freeShippingThreshold === undefined ||
    settings.deliveryConfig.freeShippingThreshold === null ||
    isNaN(Number(settings.deliveryConfig.freeShippingThreshold)) ||
    Number(settings.deliveryConfig.freeShippingThreshold) < 0
  ) {
    return "Batas gratis ongkir tidak boleh berupa angka negatif.";
  }

  if (settings.instagramUrl && settings.instagramUrl.trim()) {
    const igCheck = normalizeInstagramUrl(settings.instagramUrl);
    if (!igCheck.isValid) {
      return igCheck.error || "Link Instagram tidak valid.";
    }
  }

  if (settings.paymentMethods?.qris) {
    const merchantName = (settings.qrisMerchantName || "").trim();
    if (!merchantName || merchantName.length < 2) {
      return "Nama merchant QRIS wajib diisi (minimal 2 karakter).";
    }
  }

  return null;
}

/**
 * Fetches confirmed store settings by merging Supabase database columns
 * with the fallback persistent store. Supabase is authoritative whenever
 * a database record is returned.
 */
export async function getStoreSettings(clientOverride?: SupabaseClient): Promise<StoreSettings> {
  const local = readLocalStoreSettings();
  const client = clientOverride || getServiceRoleSupabaseClient() || supabase;

  try {
    // 1. Resilient fetch from public.store_settings
    let ssData: Record<string, unknown> | null = null;
    const fullSSRes = await client
      .from("store_settings")
      .select(
        "id, store_name, is_open, whatsapp_number, qris_image_url, updated_at, location, operating_hours_text, qris_merchant_name, qris_nmid, tagline, instagram_url, payment_methods"
      )
      .limit(1)
      .maybeSingle();

    if (!fullSSRes.error && fullSSRes.data) {
      ssData = fullSSRes.data as Record<string, unknown>;
    } else if (fullSSRes.error) {
      // Extended columns missing (42703) or column privilege restricted (42501);
      // gracefully fall back to baseline columns guaranteed to exist
      const baselineSSRes = await client
        .from("store_settings")
        .select("id, store_name, is_open, whatsapp_number, qris_image_url, updated_at")
        .limit(1)
        .maybeSingle();
      if (!baselineSSRes.error && baselineSSRes.data) {
        ssData = baselineSSRes.data as Record<string, unknown>;
      }
    }

    // 2. Resilient fetch from public.delivery_areas
    let daData: Record<string, unknown> | null = null;
    const fullDARes = await client
      .from("delivery_areas")
      .select("id, name, fee, free_shipping_threshold, is_active, sort_order, created_at")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!fullDARes.error && fullDARes.data) {
      daData = fullDARes.data as Record<string, unknown>;
    } else if (fullDARes.error) {
      // free_shipping_threshold column not added yet; fall back to baseline columns
      const baselineDARes = await client
        .from("delivery_areas")
        .select("id, name, fee, is_active, sort_order, created_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!baselineDARes.error && baselineDARes.data) {
        daData = baselineDARes.data as Record<string, unknown>;
      }
    }

    const merged: StoreSettings = { ...local };

    // Apply authoritative Supabase store_settings values
    if (ssData) {
      if (ssData.is_open !== undefined && ssData.is_open !== null) {
        merged.isOpen = Boolean(ssData.is_open);
      }
      if (typeof ssData.store_name === "string") {
        merged.storeName = ssData.store_name;
      }
      if (typeof ssData.whatsapp_number === "string") {
        merged.adminWhatsapp = ssData.whatsapp_number;
      }
      if (typeof ssData.qris_image_url === "string") {
        merged.qrisImageUrl = ssData.qris_image_url;
      }
      if (typeof ssData.location === "string") {
        merged.location = ssData.location;
      }
      if (typeof ssData.operating_hours_text === "string") {
        merged.operatingHoursText = ssData.operating_hours_text;
      }
      if (typeof ssData.qris_merchant_name === "string") {
        merged.qrisMerchantName = ssData.qris_merchant_name;
      }
      if (typeof ssData.qris_nmid === "string") {
        merged.qrisNmid = ssData.qris_nmid;
      }
      if (typeof ssData.tagline === "string") {
        merged.tagline = ssData.tagline;
      }
      if (typeof ssData.instagram_url === "string") {
        merged.instagramUrl = ssData.instagram_url;
      }
      if (ssData.payment_methods && typeof ssData.payment_methods === "object") {
        const pm = ssData.payment_methods as Record<string, unknown>;
        merged.paymentMethods = {
          qris: Boolean(pm.qris),
          cash: Boolean(pm.cash),
        };
      }
      if (typeof ssData.updated_at === "string") {
        merged.updatedAt = ssData.updated_at;
      }
    }

    // Apply authoritative Supabase delivery_areas values
    if (daData) {
      if (typeof daData.name === "string") {
        merged.deliveryConfig.configuredArea = daData.name;
      }
      if (daData.fee !== undefined && daData.fee !== null) {
        merged.deliveryConfig.standardFee = Number(daData.fee);
      }
      if (
        daData.free_shipping_threshold !== undefined &&
        daData.free_shipping_threshold !== null
      ) {
        merged.deliveryConfig.freeShippingThreshold = Number(
          daData.free_shipping_threshold
        );
      }
    }

    return merged;
  } catch (err) {
    console.error("Database query failed in getStoreSettings:", err);
    return local;
  }
}
