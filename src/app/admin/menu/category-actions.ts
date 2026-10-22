"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { clearCatalogCache } from "@/lib/supabase/catalog";
import { generateSlug, resolveUniqueSlug } from "@/lib/slug";
import { getDefaultIconForSlug } from "@/lib/category-icons";
import { Category } from "@/types";

export interface CreateCategoryInput {
  name: string;
  icon?: string | null;
}

export interface CreateCategoryResult {
  success: boolean;
  category?: Category;
  error?: string;
}

export interface UpdateCategoryInput {
  id: string;
  name?: string;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateCategoryResult {
  success: boolean;
  error?: string;
}

export interface DeleteCategoryResult {
  success: boolean;
  error?: string;
}

/**
 * Shared zero-trust authorization verification helper.
 * Validates active session and public.admin_users membership.
 */
async function verifyAdminCaller(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      isAuthorized: false,
      error: "Sesi tidak ditemukan atau kedaluwarsa. Silakan masuk kembali sebagai admin.",
    };
  }

  const { data: adminRecord, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !adminRecord) {
    return {
      isAuthorized: false,
      error: "Akses ditolak: Akun Anda tidak terdaftar sebagai pemilik toko di tabel otorisasi.",
    };
  }

  return { isAuthorized: true, userId: user.id };
}

/**
 * Server Action to create a new Category with an icon.
 */
export async function createCategoryAction(
  input: CreateCategoryInput
): Promise<CreateCategoryResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    // 2. Input Validations
    const trimmedName = (input.name || "").trim();
    if (!trimmedName || trimmedName.length < 2) {
      return {
        success: false,
        error: "Nama kategori wajib diisi (minimal 2 karakter).",
      };
    }

    // 3. Resolve unique slug from category name
    const baseSlug = generateSlug(trimmedName);
    const finalSlug = await resolveUniqueSlug(supabase, baseSlug, "categories");

    // 4. Calculate next sort_order
    const { data: maxSortData } = await supabase
      .from("categories")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortOrder = ((maxSortData as { sort_order?: number } | null)?.sort_order ?? 0) + 1;
    const categoryId = crypto.randomUUID();
    const finalIcon = (input.icon || "").trim() || getDefaultIconForSlug(trimmedName);

    // 5. Insert category row
    let insertErr = (
      await supabase.from("categories").insert({
        id: categoryId,
        name: trimmedName,
        slug: finalSlug,
        icon: finalIcon,
        sort_order: nextSortOrder,
        is_active: true,
      })
    ).error;

    // Gracefully handle if icon column has not been added to remote DB yet
    if (insertErr && insertErr.message.includes("icon")) {
      const retryRes = await supabase.from("categories").insert({
        id: categoryId,
        name: trimmedName,
        slug: finalSlug,
        sort_order: nextSortOrder,
        is_active: true,
      });
      insertErr = retryRes.error;
    }

    if (insertErr) {
      return {
        success: false,
        error: `Gagal menyimpan kategori: ${insertErr.message}`,
      };
    }

    // 6. Invalidate in-memory and page caches
    clearCatalogCache();
    revalidatePath("/menu");
    revalidatePath("/home");
    revalidatePath("/admin/menu");
    revalidatePath("/api/homepage-sections");

    const createdCategory: Category = {
      id: categoryId,
      name: trimmedName,
      slug: finalSlug,
      icon: finalIcon,
    };

    return {
      success: true,
      category: createdCategory,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan internal saat menambah kategori.";
    return { success: false, error: message };
  }
}

/**
 * Server Action to update an existing Category's icon, name, or sort order.
 * Allows updating ONLY the icon without changing the name or other data.
 */
export async function updateCategoryAction(
  input: UpdateCategoryInput
): Promise<UpdateCategoryResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    if (!input.id) {
      return { success: false, error: "ID kategori wajib disertakan." };
    }

    // 2. Build update payload
    const updatePayload: Record<string, unknown> = {};

    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (!trimmedName || trimmedName.length < 2) {
        return { success: false, error: "Nama kategori minimal 2 karakter." };
      }
      updatePayload.name = trimmedName;
    }

    if (input.icon !== undefined) {
      updatePayload.icon = input.icon ? input.icon.trim() : null;
    }

    if (input.sortOrder !== undefined) {
      updatePayload.sort_order = Number(input.sortOrder);
    }

    if (input.isActive !== undefined) {
      updatePayload.is_active = Boolean(input.isActive);
    }

    if (Object.keys(updatePayload).length === 0) {
      return { success: true };
    }

    // 3. Execute update
    let updateErr = (
      await supabase.from("categories").update(updatePayload).eq("id", input.id)
    ).error;

    // Gracefully handle if icon column has not been added to remote DB yet
    if (updateErr && updateErr.message.includes("icon") && "icon" in updatePayload) {
      delete updatePayload.icon;
      if (Object.keys(updatePayload).length > 0) {
        const retryRes = await supabase.from("categories").update(updatePayload).eq("id", input.id);
        updateErr = retryRes.error;
      } else {
        updateErr = null;
      }
    }

    if (updateErr) {
      return {
        success: false,
        error: `Gagal memperbarui kategori: ${updateErr.message}`,
      };
    }

    // 4. Invalidate caches
    clearCatalogCache();
    revalidatePath("/menu");
    revalidatePath("/home");
    revalidatePath("/admin/menu");
    revalidatePath("/api/homepage-sections");

    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan internal saat memperbarui kategori.";
    return { success: false, error: message };
  }
}

/**
 * Server Action to archive/delete a Category.
 */
export async function deleteCategoryAction(
  categoryId: string
): Promise<DeleteCategoryResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    if (!categoryId) {
      return { success: false, error: "ID kategori wajib disertakan." };
    }

    // 2. Check if products exist in this category
    const { count, error: countErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .eq("is_archived", false);

    if (countErr) {
      return { success: false, error: `Gagal memeriksa produk kategori: ${countErr.message}` };
    }

    if (count && count > 0) {
      return {
        success: false,
        error: `Kategori tidak dapat dihapus karena masih memuat ${count} produk aktif. Harap pindahkan produk terlebih dahulu.`,
      };
    }

    // 3. Soft-archive category by setting is_active = false
    const { error: archiveErr } = await supabase
      .from("categories")
      .update({ is_active: false })
      .eq("id", categoryId);

    if (archiveErr) {
      return { success: false, error: `Gagal menghapus kategori: ${archiveErr.message}` };
    }

    // 4. Invalidate caches
    clearCatalogCache();
    revalidatePath("/menu");
    revalidatePath("/home");
    revalidatePath("/admin/menu");
    revalidatePath("/api/homepage-sections");

    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan internal saat menghapus kategori.";
    return { success: false, error: message };
  }
}
