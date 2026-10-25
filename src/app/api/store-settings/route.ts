import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  getStoreSettings,
  writeLocalStoreSettings,
  validateStoreSettings,
} from "@/lib/supabase/store-settings";
import { normalizeInstagramUrl } from "@/lib/instagram-url";
import { supabase } from "@/lib/supabase/client";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

import { createServerSupabaseClient } from "@/lib/supabase/server";

async function verifyAdminCaller() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return {
      authorized: false,
      status: 401,
      error: "Sesi tidak ditemukan atau kedaluwarsa. Silakan masuk sebagai admin.",
    };
  }

  const { data: adminRecord } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRecord) {
    return {
      authorized: false,
      status: 403,
      error: "Akses ditolak: Akun Anda tidak terdaftar sebagai pemilik toko di tabel otorisasi.",
    };
  }

  return { authorized: true, userEmail: user.email };
}

export async function GET() {
  try {
    const settings = await getStoreSettings();
    return NextResponse.json(
      {
        success: true,
        settings,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memuat pengaturan toko.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // 0. Zero-trust server-side admin authorization before reading body
    const auth = await verifyAdminCaller();
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status || 401 }
      );
    }

    const body = await request.json();
    const validationError = validateStoreSettings(body);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    const igCheck = body.instagramUrl && String(body.instagramUrl).trim()
      ? normalizeInstagramUrl(String(body.instagramUrl))
      : null;

    const normalizedBody = {
      ...body,
      instagramUrl: igCheck && igCheck.isValid ? igCheck.normalized : "",
    };

    // 1. Persist to local JSON store
    writeLocalStoreSettings(normalizedBody);

    // 2. Sync to Supabase if connected
    try {
      const client = getServiceRoleSupabaseClient() || supabase;
      const { data: existingSS } = await client
        .from("store_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      const instagramVal = normalizedBody.instagramUrl ? normalizedBody.instagramUrl.trim() : null;
      const qrisMerchantNameVal = (body.qrisMerchantName || "Nook by Jina").trim();
      const qrisNmidVal = (body.qrisNmid || "").trim();
      const qrisImageVal = body.qrisImageUrl ? String(body.qrisImageUrl).trim() : null;
      const locationVal = (body.location || "Lhoksukon, Aceh Utara").trim();
      const operatingHoursVal = (body.operatingHoursText || "Setiap Hari: 09:00 – 17:00 WIB").trim();
      const taglineVal = (body.tagline || "").trim();
      const nowIso = new Date().toISOString();

      if (existingSS?.id) {
        let updateErr = (
          await client
            .from("store_settings")
            .update({
              store_name: (body.storeName || "").trim(),
              is_open: Boolean(body.isOpen),
              whatsapp_number: (body.adminWhatsapp || "").trim(),
              instagram_url: instagramVal,
              qris_merchant_name: qrisMerchantNameVal,
              qris_nmid: qrisNmidVal,
              qris_image_url: qrisImageVal,
              location: locationVal,
              operating_hours_text: operatingHoursVal,
              tagline: taglineVal,
              updated_at: nowIso,
            })
            .eq("id", existingSS.id)
        ).error;

        if (updateErr?.code === "42703") {
          updateErr = (
            await client
              .from("store_settings")
              .update({
                store_name: (body.storeName || "").trim(),
                is_open: Boolean(body.isOpen),
                whatsapp_number: (body.adminWhatsapp || "").trim(),
                qris_image_url: qrisImageVal,
                updated_at: nowIso,
              })
              .eq("id", existingSS.id)
          ).error;
        }

        if (updateErr) {
          console.warn("Supabase store_settings update warning in route:", updateErr.message);
        }
      }

      if (body.deliveryConfig) {
        const { data: existingDA } = await client
          .from("delivery_areas")
          .select("id")
          .limit(1)
          .maybeSingle();

        if (existingDA?.id) {
          let daUpdateErr = (
            await client
              .from("delivery_areas")
              .update({
                name: (body.deliveryConfig.configuredArea || "Lhoksukon").trim(),
                fee: Number(body.deliveryConfig.standardFee),
                free_shipping_threshold: Number(body.deliveryConfig.freeShippingThreshold),
              })
              .eq("id", existingDA.id)
          ).error;

          if (daUpdateErr?.code === "42703") {
            daUpdateErr = (
              await client
                .from("delivery_areas")
                .update({
                  name: (body.deliveryConfig.configuredArea || "Lhoksukon").trim(),
                  fee: Number(body.deliveryConfig.standardFee),
                })
                .eq("id", existingDA.id)
            ).error;
          }

          if (daUpdateErr) {
            console.warn("Supabase delivery_areas sync warning in route:", daUpdateErr.message);
          }
        }
      }
    } catch (syncErr) {
      console.warn("Supabase store_settings sync in POST route:", syncErr);
    }

    // 3. Invalidate caches for storefront and admin
    try {
      revalidateTag("store-settings", { expire: 0 });
    } catch {
      // Graceful fallback if called outside Next.js request
    }
    revalidatePath("/pembayaran", "layout");
    revalidatePath("/checkout");
    revalidatePath("/keranjang");
    revalidatePath("/home");
    revalidatePath("/menu");
    revalidatePath("/admin/pengaturan");
    revalidatePath("/");

    const confirmed = await getStoreSettings();
    return NextResponse.json(
      { success: true, settings: confirmed },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal menyimpan pengaturan toko.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
