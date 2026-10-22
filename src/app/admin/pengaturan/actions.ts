"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  readLocalStoreSettings,
  writeLocalStoreSettings,
  validateStoreSettings,
  getStoreSettings,
} from "@/lib/supabase/store-settings";
import { StoreSettings } from "@/types";

interface VerifyResult {
  authorized: boolean;
  error?: string;
  userEmail?: string;
}

/**
 * Checks admin authentication.
 * Enforces valid session via Supabase Auth + active record in public.admin_users.
 */
async function verifyAdminAuth(): Promise<VerifyResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (user && !userError) {
      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminRecord) {
        return { authorized: true, userEmail: user.email };
      }
    }

    return {
      authorized: false,
      error: "Akses ditolak: Hanya pemilik toko yang dapat mengubah pengaturan toko.",
    };
  } catch {
    return {
      authorized: false,
      error: "Terjadi kesalahan otorisasi admin.",
    };
  }
}

/**
 * Server Action to upload a static merchant QRIS image.
 * Validates admin credentials, file size (max 5 MB), and image MIME type.
 * Persists to Supabase Storage bucket 'store-assets' and returns public URL.
 * Safely removes previous QRIS object if replacing.
 */
export async function uploadQrisImageAction(
  formData: FormData
): Promise<{ success: boolean; url?: string; path?: string; error?: string }> {
  try {
    const auth = await verifyAdminAuth();
    if (!auth.authorized) {
      return {
        success: false,
        error:
          auth.error ||
          "Akses ditolak: Hanya pemilik toko yang dapat mengunggah foto QRIS.",
      };
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return {
        success: false,
        error: "File gambar tidak ditemukan dalam formulir.",
      };
    }

    // 1. Validate file size (max 5 MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return {
        success: false,
        error: `Ukuran file terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Batas maksimal adalah 5 MB.`,
      };
    }

    // 2. Validate MIME type
    const validMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimeTypes.includes(file.type)) {
      return {
        success: false,
        error:
          "Format file tidak didukung. Harap gunakan format JPG, PNG, atau WebP.",
      };
    }

    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
        ? "webp"
        : "jpg";

    const fileName = `merchant-qris-${Date.now()}.${ext}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `qris/${fileName}`;

    const client =
      getServiceRoleSupabaseClient() || (await createServerSupabaseClient());

    // Safely clean up previous QRIS image in store-assets if replacing
    const previousUrl = formData.get("previousUrl");
    if (
      typeof previousUrl === "string" &&
      previousUrl.includes("store-assets") &&
      previousUrl.includes("qris/")
    ) {
      try {
        const oldFileName = previousUrl.split("qris/")[1]?.split("?")[0];
        if (oldFileName) {
          await client.storage
            .from("store-assets")
            .remove([`qris/${oldFileName}`]);
        }
      } catch {
        // Non-blocking cleanup failure
      }
    }

    // 3. Upload to Supabase Storage bucket 'store-assets'
    const { data: uploadData, error: uploadError } = await client.storage
      .from("store-assets")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError || !uploadData) {
      return {
        success: false,
        error: `Gagal mengunggah foto QRIS ke Supabase Storage: ${uploadError?.message || "Kesalahan penyimpanan."}`,
      };
    }

    const { data: publicUrlData } = client.storage
      .from("store-assets")
      .getPublicUrl(storagePath);

    if (!publicUrlData?.publicUrl) {
      return {
        success: false,
        error: "Gagal mendapatkan URL publik dari foto QRIS yang diunggah.",
      };
    }

    return {
      success: true,
      url: publicUrlData.publicUrl,
      path: storagePath,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan internal saat mengunggah foto QRIS.";
    return { success: false, error: message };
  }
}

/**
 * Server Action to save all store settings.
 * Persists to Supabase with schema-aware resilience and fallback local sync.
 */
export async function saveStoreSettingsAction(
  settings: StoreSettings
): Promise<{ success: boolean; settings?: StoreSettings; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  // 1. Validate inputs
  const validationError = validateStoreSettings(settings);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // 2. Persist to local configuration store as fallback cache
  writeLocalStoreSettings(settings);

  // 3. Persist to Supabase
  const client =
    getServiceRoleSupabaseClient() || (await createServerSupabaseClient());

  try {
    // Check existing store_settings row
    const { data: existingSS, error: ssCheckErr } = await client
      .from("store_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (ssCheckErr) {
      console.warn("Supabase store_settings pre-check notice:", ssCheckErr.message);
    }

    const instagramVal = settings.instagramUrl
      ? settings.instagramUrl.trim()
      : null;
    const qrisMerchantNameVal = (
      settings.qrisMerchantName || "Nook by Jina"
    ).trim();
    const qrisNmidVal = (settings.qrisNmid || "").trim();
    const qrisImageVal = settings.qrisImageUrl
      ? settings.qrisImageUrl.trim()
      : null;
    const locationVal = (settings.location || "Lhoksukon, Aceh Utara").trim();
    const operatingHoursVal = (
      settings.operatingHoursText || "Setiap Hari: 09:00 – 17:00 WIB"
    ).trim();
    const taglineVal = (settings.tagline || "").trim();
    const storeNameVal = settings.storeName.trim();
    const whatsappVal = settings.adminWhatsapp.trim();
    const isOpenVal = Boolean(settings.isOpen);
    const paymentMethodsVal = settings.paymentMethods || {
      qris: true,
      cash: true,
    };
    const nowIso = new Date().toISOString();

    if (existingSS?.id) {
      // Attempt full update
      let updateErr = (
        await client
          .from("store_settings")
          .update({
            store_name: storeNameVal,
            is_open: isOpenVal,
            whatsapp_number: whatsappVal,
            instagram_url: instagramVal,
            qris_merchant_name: qrisMerchantNameVal,
            qris_nmid: qrisNmidVal,
            qris_image_url: qrisImageVal,
            location: locationVal,
            operating_hours_text: operatingHoursVal,
            tagline: taglineVal,
            payment_methods: paymentMethodsVal,
            updated_at: nowIso,
          })
          .eq("id", existingSS.id)
      ).error;

      if (updateErr?.code === "42703") {
        // Fallback to baseline columns if pending migration
        updateErr = (
          await client
            .from("store_settings")
            .update({
              store_name: storeNameVal,
              is_open: isOpenVal,
              whatsapp_number: whatsappVal,
              qris_image_url: qrisImageVal,
              updated_at: nowIso,
            })
            .eq("id", existingSS.id)
        ).error;
      }

      if (updateErr) {
        return {
          success: false,
          error: `Gagal memperbarui pengaturan toko di database: ${updateErr.message}`,
        };
      }
    } else {
      // Table is empty, insert initial row
      let insertErr = (
        await client.from("store_settings").insert({
          id: "a0000001-0000-4000-8000-000000000001",
          store_name: storeNameVal,
          is_open: isOpenVal,
          whatsapp_number: whatsappVal,
          instagram_url: instagramVal,
          qris_merchant_name: qrisMerchantNameVal,
          qris_nmid: qrisNmidVal,
          qris_image_url: qrisImageVal,
          location: locationVal,
          operating_hours_text: operatingHoursVal,
          tagline: taglineVal,
          payment_methods: paymentMethodsVal,
          updated_at: nowIso,
        })
      ).error;

      if (insertErr?.code === "42703") {
        insertErr = (
          await client.from("store_settings").insert({
            id: "a0000001-0000-4000-8000-000000000001",
            store_name: storeNameVal,
            is_open: isOpenVal,
            whatsapp_number: whatsappVal,
            qris_image_url: qrisImageVal,
            updated_at: nowIso,
          })
        ).error;
      }

      if (insertErr) {
        const msg =
          insertErr.code === "42501"
            ? "Izin ditolak untuk membuat data awal store_settings. Terapkan migrasi 20261017010000_fix_store_settings_permissions_and_columns.sql untuk mengaktifkan izin INSERT."
            : `Gagal menyimpan baris baru pengaturan toko di database: ${insertErr.message}`;
        return { success: false, error: msg };
      }
    }

    // Upsert delivery_areas
    const { data: existingDA } = await client
      .from("delivery_areas")
      .select("id")
      .limit(1)
      .maybeSingle();

    const standardFeeNum = Number(settings.deliveryConfig.standardFee);
    const freeShippingThresholdNum = Number(
      settings.deliveryConfig.freeShippingThreshold
    );
    const areaName = settings.deliveryConfig.configuredArea.trim();

    if (existingDA?.id) {
      let daUpdateErr = (
        await client
          .from("delivery_areas")
          .update({
            name: areaName,
            fee: standardFeeNum,
            free_shipping_threshold: freeShippingThresholdNum,
          })
          .eq("id", existingDA.id)
      ).error;

      if (daUpdateErr?.code === "42703") {
        daUpdateErr = (
          await client
            .from("delivery_areas")
            .update({
              name: areaName,
              fee: standardFeeNum,
            })
            .eq("id", existingDA.id)
        ).error;
      }

      if (daUpdateErr) {
        console.warn("Delivery areas update warning:", daUpdateErr.message);
      }
    } else {
      let daInsertErr = (
        await client.from("delivery_areas").insert({
          name: areaName,
          fee: standardFeeNum,
          free_shipping_threshold: freeShippingThresholdNum,
          is_active: true,
          sort_order: 1,
        })
      ).error;

      if (daInsertErr?.code === "42703") {
        daInsertErr = (
          await client.from("delivery_areas").insert({
            name: areaName,
            fee: standardFeeNum,
            is_active: true,
            sort_order: 1,
          })
        ).error;
      }

      if (daInsertErr) {
        console.warn("Delivery areas insert warning:", daInsertErr.message);
      }
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan saat menyinkronkan pengaturan ke database.";
    return { success: false, error: message };
  }

  // 4. Revalidate all storefront and admin pages
  revalidatePath("/admin/pengaturan");
  revalidatePath("/admin/pembayaran");
  revalidatePath("/pembayaran", "layout");
  revalidatePath("/home");
  revalidatePath("/menu");
  revalidatePath("/keranjang");
  revalidatePath("/checkout");
  revalidatePath("/");

  const confirmedSettings = await getStoreSettings(client);
  return { success: true, settings: confirmedSettings };
}

/**
 * Server Action to quickly toggle store open/closed status.
 */
export async function toggleStoreStatusAction(
  isOpen: boolean
): Promise<{ success: boolean; isOpen?: boolean; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const currentSettings = readLocalStoreSettings();
  const updatedSettings: StoreSettings = {
    ...currentSettings,
    isOpen: Boolean(isOpen),
  };

  writeLocalStoreSettings(updatedSettings);

  // Sync to Supabase
  try {
    const client =
      getServiceRoleSupabaseClient() || (await createServerSupabaseClient());
    const { data: existingSS } = await client
      .from("store_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existingSS?.id) {
      const { error } = await client
        .from("store_settings")
        .update({
          is_open: Boolean(isOpen),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSS.id);

      if (error) {
        return {
          success: false,
          error: `Gagal memperbarui status toko di database: ${error.message}`,
        };
      }
    } else {
      const { error } = await client.from("store_settings").insert({
        id: "a0000001-0000-4000-8000-000000000001",
        is_open: Boolean(isOpen),
        store_name: currentSettings.storeName,
        whatsapp_number: currentSettings.adminWhatsapp,
      });

      if (error) {
        return {
          success: false,
          error: `Gagal menginisialisasi status toko di database: ${error.message}`,
        };
      }
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan saat menyinkronkan status toko.";
    return { success: false, error: message };
  }

  revalidatePath("/admin/pengaturan");
  revalidatePath("/home");
  revalidatePath("/menu");
  revalidatePath("/keranjang");
  revalidatePath("/checkout");
  revalidatePath("/");

  return { success: true, isOpen: Boolean(isOpen) };
}
