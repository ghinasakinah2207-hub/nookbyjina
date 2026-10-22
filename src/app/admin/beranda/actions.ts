"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  readLocalSections,
  writeLocalSections,
} from "@/lib/supabase/homepage-sections";
import {
  readLocalBanners,
  writeLocalBanners,
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

  const banners = readLocalBanners();
  let targetBanner: Banner;

  if (input.id) {
    const existingIndex = banners.findIndex((b) => b.id === input.id);
    if (existingIndex === -1) {
      return { success: false, error: "Banner tidak ditemukan." };
    }

    targetBanner = {
      ...banners[existingIndex],
      imageUrl: trimmedUrl,
      targetUrl: input.targetUrl ? input.targetUrl.trim() : undefined,
      isActive: input.isActive !== undefined ? input.isActive : banners[existingIndex].isActive,
    };
    banners[existingIndex] = targetBanner;
  } else {
    const newId = `banner-${Date.now()}`;
    const nextSortOrder =
      banners.length > 0
        ? Math.max(...banners.map((b) => b.sortOrder ?? 0)) + 1
        : 1;

    targetBanner = {
      id: newId,
      imageUrl: trimmedUrl,
      targetUrl: input.targetUrl ? input.targetUrl.trim() : undefined,
      isActive: input.isActive !== undefined ? input.isActive : true,
      sortOrder: nextSortOrder,
      createdAt: new Date().toISOString(),
    };
    banners.push(targetBanner);
  }

  writeLocalBanners(banners);

  // Sync to Supabase if table exists
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.from("home_banners").upsert({
      id: targetBanner.id,
      image_url: targetBanner.imageUrl,
      is_active: targetBanner.isActive,
      sort_order: targetBanner.sortOrder ?? 1,
      title: "",
      subtitle: "",
    });
  } catch (err) {
    console.warn("Supabase sync warning for home_banners:", err);
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

  const banners = readLocalBanners();
  const filtered = banners.filter((b) => b.id !== bannerId);

  if (filtered.length === banners.length) {
    return { success: false, error: "Banner tidak ditemukan." };
  }

  // Re-index sort order
  const reindexed = filtered.map((b, idx) => ({
    ...b,
    sortOrder: idx + 1,
  }));

  writeLocalBanners(reindexed);

  // Sync delete to Supabase if table exists
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.from("home_banners").delete().eq("id", bannerId);
  } catch {
    // Ignore
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

  const banners = readLocalBanners();
  const target = banners.find((b) => b.id === bannerId);
  if (!target) {
    return { success: false, error: "Banner tidak ditemukan." };
  }

  target.isActive = isActive;
  writeLocalBanners(banners);

  // Sync to Supabase if table exists
  try {
    const supabase = await createServerSupabaseClient();
    await supabase
      .from("home_banners")
      .update({ is_active: isActive })
      .eq("id", bannerId);
  } catch {
    // Ignore
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

  const banners = readLocalBanners();
  const map = new Map(banners.map((b) => [b.id, b]));

  const reordered: Banner[] = [];
  orderedBannerIds.forEach((id, idx) => {
    const b = map.get(id);
    if (b) {
      reordered.push({ ...b, sortOrder: idx + 1 });
      map.delete(id);
    }
  });

  // Append any banners omitted from reorder list
  map.forEach((b) => {
    reordered.push({ ...b, sortOrder: reordered.length + 1 });
  });

  writeLocalBanners(reordered);

  // Sync to Supabase if table exists
  try {
    const supabase = await createServerSupabaseClient();
    for (const b of reordered) {
      await supabase
        .from("home_banners")
        .update({ sort_order: b.sortOrder })
        .eq("id", b.id);
    }
  } catch {
    // Ignore
  }

  revalidatePath("/admin/beranda");
  revalidatePath("/home");
  revalidatePath("/");

  return { success: true };
}

