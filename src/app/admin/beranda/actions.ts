"use server";

import fs from "fs";
import path from "path";
import { revalidatePath, revalidateTag } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  readLocalSections,
  writeLocalSections,
} from "@/lib/supabase/homepage-sections";
import {
  writeLocalBanners,
  getAdminHomeBanners,
  toValidBannerUuid,
} from "@/lib/supabase/banners";
import { HomepageSection, Banner } from "@/types";

interface VerifyResult {
  authorized: boolean;
  error?: string;
  userEmail?: string;
}

/**
 * Checks admin authentication.
 * Strictly enforces valid user session via Supabase Auth + public.admin_users record.
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
      error: "Akses ditolak: Hanya pemilik toko yang dapat mengelola seksi beranda.",
    };
  } catch {
    return {
      authorized: false,
      error: "Terjadi kesalahan otorisasi.",
    };
  }
}

export interface SaveSectionInput {
  id?: string;
  title: string;
  subtitle?: string | null;
  isActive: boolean;
  maxProducts?: number | null;
  viewAllUrl?: string | null;
  productIds?: string[];
}

export async function saveHomepageSectionAction(
  input: SaveSectionInput
): Promise<{ success: boolean; section?: HomepageSection; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const trimmedTitle = (input.title || "").trim();
  if (!trimmedTitle || trimmedTitle.length < 2) {
    return {
      success: false,
      error: "Judul seksi wajib diisi (minimal 2 karakter).",
    };
  }

  const sections = readLocalSections();
  let targetSection: HomepageSection;

  if (input.id) {
    // Edit existing section
    const existingIndex = sections.findIndex((s) => s.id === input.id);
    if (existingIndex === -1) {
      return { success: false, error: "Seksi tidak ditemukan." };
    }

    targetSection = {
      ...sections[existingIndex],
      title: trimmedTitle,
      subtitle: input.subtitle ? input.subtitle.trim() : null,
      isActive: Boolean(input.isActive),
      maxProducts:
        input.maxProducts !== undefined && input.maxProducts !== null
          ? Number(input.maxProducts)
          : null,
      viewAllUrl: input.viewAllUrl ? input.viewAllUrl.trim() : "/menu",
      productIds: input.productIds || sections[existingIndex].productIds || [],
      updatedAt: new Date().toISOString(),
    };

    sections[existingIndex] = targetSection;
  } else {
    // Create new section
    const newId = crypto.randomUUID();
    const nextSortOrder =
      sections.reduce((max, s) => Math.max(max, s.sortOrder ?? 0), 0) + 1;

    targetSection = {
      id: newId,
      title: trimmedTitle,
      subtitle: input.subtitle ? input.subtitle.trim() : null,
      isActive: Boolean(input.isActive),
      sortOrder: nextSortOrder,
      maxProducts:
        input.maxProducts !== undefined && input.maxProducts !== null
          ? Number(input.maxProducts)
          : null,
      viewAllUrl: input.viewAllUrl ? input.viewAllUrl.trim() : "/menu",
      productIds: input.productIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sections.push(targetSection);
  }

  // Persist locally
  writeLocalSections(sections);

  // Sync to Supabase if tables exist
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.from("homepage_sections").upsert({
      id: targetSection.id,
      title: targetSection.title,
      subtitle: targetSection.subtitle,
      is_active: targetSection.isActive,
      sort_order: targetSection.sortOrder,
      max_products: targetSection.maxProducts,
      view_all_url: targetSection.viewAllUrl,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Supabase table not created yet; local persistence is active
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true, section: targetSection };
}

export async function deleteHomepageSectionAction(
  sectionId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const sections = readLocalSections();
  const filtered = sections.filter((s) => s.id !== sectionId);

  if (filtered.length === sections.length) {
    return { success: false, error: "Seksi tidak ditemukan." };
  }

  // Re-index sort order
  const reindexed = filtered.map((sec, idx) => ({
    ...sec,
    sortOrder: idx + 1,
  }));

  writeLocalSections(reindexed);

  // Sync to Supabase if table exists
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.from("homepage_sections").delete().eq("id", sectionId);
  } catch {
    // Ignore
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true };
}

export async function toggleSectionStatusAction(
  sectionId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const sections = readLocalSections();
  const target = sections.find((s) => s.id === sectionId);
  if (!target) {
    return { success: false, error: "Seksi tidak ditemukan." };
  }

  target.isActive = isActive;
  target.updatedAt = new Date().toISOString();

  writeLocalSections(sections);

  // Sync to Supabase if table exists
  try {
    const supabase = await createServerSupabaseClient();
    await supabase
      .from("homepage_sections")
      .update({ is_active: isActive })
      .eq("id", sectionId);
  } catch {
    // Ignore
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true };
}

export async function reorderHomepageSectionsAction(
  orderedSectionIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const sections = readLocalSections();
  const idMap = new Map(sections.map((s) => [s.id, s]));

  const reordered: HomepageSection[] = [];
  orderedSectionIds.forEach((id, idx) => {
    const found = idMap.get(id);
    if (found) {
      found.sortOrder = idx + 1;
      reordered.push(found);
      idMap.delete(id);
    }
  });

  // Append any remaining sections
  idMap.forEach((remaining) => {
    remaining.sortOrder = reordered.length + 1;
    reordered.push(remaining);
  });

  writeLocalSections(reordered);

  // Sync to Supabase if table exists
  try {
    const supabase = await createServerSupabaseClient();
    for (const sec of reordered) {
      await supabase
        .from("homepage_sections")
        .update({ sort_order: sec.sortOrder })
        .eq("id", sec.id);
    }
  } catch {
    // Ignore
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true };
}

export async function updateSectionProductsAction(
  sectionId: string,
  productIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const sections = readLocalSections();
  const target = sections.find((s) => s.id === sectionId);
  if (!target) {
    return { success: false, error: "Seksi tidak ditemukan." };
  }

  // Deduplicate product IDs while preserving explicit order
  const uniqueProductIds = Array.from(new Set(productIds));
  target.productIds = uniqueProductIds;
  target.updatedAt = new Date().toISOString();

  writeLocalSections(sections);

  // Sync to Supabase if table exists
  try {
    const supabase = await createServerSupabaseClient();
    // Delete existing product assignments for this section
    await supabase
      .from("homepage_section_products")
      .delete()
      .eq("section_id", sectionId);

    // Insert new product assignments
    if (uniqueProductIds.length > 0) {
      const rows = uniqueProductIds.map((pId, idx) => ({
        section_id: sectionId,
        product_id: pId,
        sort_order: idx + 1,
      }));
      await supabase.from("homepage_section_products").insert(rows);
    }
  } catch {
    // Ignore
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true };
}

// =============================================================================
// BANNER SLIDER HOMEPAGE ACTIONS
// =============================================================================

/**
 * Server Action to upload a banner image file from admin machine.
 * Validates admin authentication, file size (max 5 MB), and MIME types (JPG, PNG, WebP).
 * Saves to public/images/uploads/ and returns the web-accessible URL.
 */
export async function uploadBannerImageAction(
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const auth = await verifyAdminAuth();
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return {
        success: false,
        error: "File gambar tidak ditemukan dalam formulir.",
      };
    }

    // Max 5 MB for hero banners
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return {
        success: false,
        error: `Ukuran file terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Batas maksimal adalah 5 MB.`,
      };
    }

    const validMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimeTypes.includes(file.type)) {
      return {
        success: false,
        error: "Format file tidak didukung. Harap gunakan format JPG, PNG, atau WebP.",
      };
    }

    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
        ? "webp"
        : "jpg";

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `banners/banner-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const client =
      getServiceRoleSupabaseClient() || (await createServerSupabaseClient());

    const { data: uploadData, error: uploadError } = await client.storage
      .from("store-assets")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError || !uploadData) {
      // Development fallback if bucket not created yet in local environment
      if (process.env.NODE_ENV === "development") {
        try {
          const uploadsDir = path.join(process.cwd(), "public/images/uploads");
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          const cleanBaseName = file.name
            .replace(/\.[^/.]+$/, "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 30);
          const fileName = `banner-${cleanBaseName || "slide"}-${Date.now()}.${ext}`;
          const filePath = path.join(uploadsDir, fileName);
          fs.writeFileSync(filePath, fileBuffer);
          return {
            success: true,
            url: `/images/uploads/${fileName}`,
          };
        } catch {
          // Fall through to error
        }
      }

      return {
        success: false,
        error: `Gagal mengunggah foto banner ke Supabase Storage: ${uploadError?.message || "Kesalahan penyimpanan."}`,
      };
    }

    const { data: publicUrlData } = client.storage
      .from("store-assets")
      .getPublicUrl(storagePath);

    if (!publicUrlData?.publicUrl) {
      return {
        success: false,
        error: "Gagal mendapatkan URL publik dari foto banner yang diunggah.",
      };
    }

    return {
      success: true,
      url: publicUrlData.publicUrl,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan saat mengunggah foto banner.";
    return {
      success: false,
      error: message,
    };
  }
}

export interface SaveBannerInput {
  id?: string;
  imageUrl: string;
  targetUrl?: string | null;
  isActive?: boolean;
}

/**
 * Server Action to save or update a homepage slider banner.
 * Ensures persistent storage in Supabase `home_banners` table with valid UUIDs,
 * maps targetUrl to the subtitle column, and invalidates Next.js tag cache.
 */
export async function saveHomeBannerAction(
  input: SaveBannerInput
): Promise<{ success: boolean; banner?: Banner; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const trimmedUrl = (input.imageUrl || "").trim();
  if (!trimmedUrl) {
    return {
      success: false,
      error: "URL atau file gambar banner wajib diisi.",
    };
  }

  const client =
    getServiceRoleSupabaseClient() || (await createServerSupabaseClient());

  const banners = await getAdminHomeBanners(client);
  const targetUuid = input.id ? toValidBannerUuid(input.id) : crypto.randomUUID();

  let targetBanner: Banner;
  const existingIndex = banners.findIndex(
    (b) => b.id === targetUuid || (input.id && b.id === input.id)
  );

  if (existingIndex !== -1) {
    targetBanner = {
      ...banners[existingIndex],
      id: targetUuid,
      imageUrl: trimmedUrl,
      targetUrl: input.targetUrl ? input.targetUrl.trim() : undefined,
      isActive:
        input.isActive !== undefined
          ? Boolean(input.isActive)
          : banners[existingIndex].isActive,
    };
    banners[existingIndex] = targetBanner;
  } else {
    const nextSortOrder =
      banners.length > 0
        ? Math.max(...banners.map((b) => b.sortOrder ?? 0)) + 1
        : 1;

    targetBanner = {
      id: targetUuid,
      imageUrl: trimmedUrl,
      targetUrl: input.targetUrl ? input.targetUrl.trim() : undefined,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : true,
      sortOrder: nextSortOrder,
      createdAt: new Date().toISOString(),
    };
    banners.push(targetBanner);
  }

  // Authoritative Supabase persistence: ensure all baseline slides are synced with valid UUIDs
  const upsertRows = banners.map((b, idx) => ({
    id: toValidBannerUuid(b.id),
    image_url: b.imageUrl,
    title: b.title || "",
    subtitle: (b.targetUrl || b.subtitle || "").trim(),
    is_active: Boolean(b.isActive),
    sort_order: Number(b.sortOrder ?? idx + 1),
    created_at: b.createdAt || new Date().toISOString(),
  }));

  const { error: upsertError } = await client
    .from("home_banners")
    .upsert(upsertRows, { onConflict: "id" });

  if (upsertError) {
    console.error("Supabase upsert error in saveHomeBannerAction:", upsertError);
    return {
      success: false,
      error: `Gagal menyimpan banner ke database Supabase: ${upsertError.message}`,
    };
  }

  // Secondary local store fallback
  writeLocalBanners(banners);

  // Invalidate Next.js cache tags and paths so customer homepage receives fresh data
  try {
    revalidateTag("home-banners", { expire: 0 });
  } catch {
    // Graceful fallback outside Next.js request runtime
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true, banner: targetBanner };
}

/**
 * Server Action to delete a slider banner.
 */
export async function deleteHomeBannerAction(
  bannerId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const client =
    getServiceRoleSupabaseClient() || (await createServerSupabaseClient());

  const banners = await getAdminHomeBanners(client);
  const targetUuid = toValidBannerUuid(bannerId);

  const filtered = banners.filter(
    (b) => b.id !== targetUuid && b.id !== bannerId
  );

  if (filtered.length === banners.length) {
    return { success: false, error: "Banner tidak ditemukan." };
  }

  // Re-index sort order
  const reindexed = filtered.map((b, idx) => ({
    ...b,
    id: toValidBannerUuid(b.id),
    sortOrder: idx + 1,
  }));

  // Sync delete to Supabase
  const { error: deleteError } = await client
    .from("home_banners")
    .delete()
    .eq("id", targetUuid);

  if (deleteError) {
    console.error("Supabase delete error in deleteHomeBannerAction:", deleteError);
    return {
      success: false,
      error: `Gagal menghapus banner dari database: ${deleteError.message}`,
    };
  }

  // Update sort_order for remaining banners in Supabase
  if (reindexed.length > 0) {
    const reindexRows = reindexed.map((b) => ({
      id: b.id,
      image_url: b.imageUrl,
      title: b.title || "",
      subtitle: (b.targetUrl || b.subtitle || "").trim(),
      is_active: b.isActive,
      sort_order: b.sortOrder,
    }));
    const { error: reindexError } = await client
      .from("home_banners")
      .upsert(reindexRows, { onConflict: "id" });

    if (reindexError) {
      console.warn("Supabase re-index warning in deleteHomeBannerAction:", reindexError);
    }
  }

  writeLocalBanners(reindexed);

  try {
    revalidateTag("home-banners", { expire: 0 });
  } catch {
    // Graceful fallback outside Next.js request runtime
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true };
}

/**
 * Server Action to toggle banner active / hidden status.
 */
export async function toggleBannerStatusAction(
  bannerId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const client =
    getServiceRoleSupabaseClient() || (await createServerSupabaseClient());

  const banners = await getAdminHomeBanners(client);
  const targetUuid = toValidBannerUuid(bannerId);

  const target = banners.find(
    (b) => b.id === targetUuid || b.id === bannerId
  );
  if (!target) {
    return { success: false, error: "Banner tidak ditemukan." };
  }

  target.isActive = isActive;
  target.id = targetUuid;

  // Sync to Supabase
  const { error: updateError } = await client
    .from("home_banners")
    .upsert(
      {
        id: targetUuid,
        image_url: target.imageUrl,
        title: target.title || "",
        subtitle: (target.targetUrl || target.subtitle || "").trim(),
        is_active: isActive,
        sort_order: target.sortOrder ?? 1,
      },
      { onConflict: "id" }
    );

  if (updateError) {
    console.error(
      "Supabase update error in toggleBannerStatusAction:",
      updateError
    );
    return {
      success: false,
      error: `Gagal mengubah status banner: ${updateError.message}`,
    };
  }

  writeLocalBanners(banners);

  try {
    revalidateTag("home-banners", { expire: 0 });
  } catch {
    // Graceful fallback outside Next.js request runtime
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true };
}

/**
 * Server Action to reorder slider banners.
 */
export async function reorderHomeBannersAction(
  orderedBannerIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const client =
    getServiceRoleSupabaseClient() || (await createServerSupabaseClient());

  const banners = await getAdminHomeBanners(client);
  const map = new Map(banners.map((b) => [toValidBannerUuid(b.id), b]));

  const reordered: Banner[] = [];
  orderedBannerIds.forEach((rawId, idx) => {
    const uuid = toValidBannerUuid(rawId);
    const b = map.get(uuid);
    if (b) {
      reordered.push({ ...b, id: uuid, sortOrder: idx + 1 });
      map.delete(uuid);
    }
  });

  // Append any banners omitted from reorder list
  map.forEach((b) => {
    reordered.push({
      ...b,
      id: toValidBannerUuid(b.id),
      sortOrder: reordered.length + 1,
    });
  });

  // Sync to Supabase in a single batch upsert
  const upsertRows = reordered.map((b) => ({
    id: b.id,
    image_url: b.imageUrl,
    title: b.title || "",
    subtitle: (b.targetUrl || b.subtitle || "").trim(),
    is_active: b.isActive,
    sort_order: b.sortOrder,
  }));

  const { error: reorderError } = await client
    .from("home_banners")
    .upsert(upsertRows, { onConflict: "id" });

  if (reorderError) {
    console.error(
      "Supabase upsert error in reorderHomeBannersAction:",
      reorderError
    );
    return {
      success: false,
      error: `Gagal memperbarui urutan banner di database: ${reorderError.message}`,
    };
  }

  writeLocalBanners(reordered);

  try {
    revalidateTag("home-banners", { expire: 0 });
  } catch {
    // Graceful fallback outside Next.js request runtime
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true };
}


