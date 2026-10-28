"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProductBySlugOrId, clearCatalogCache } from "@/lib/supabase/catalog";
import { PRODUCTS } from "@/data/dummy-data";
import { Product } from "@/types";
import { generateSlug, resolveUniqueSlug } from "@/lib/slug";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  extractStoragePathFromUrl,
  normalizeStoragePath,
  ALLOWED_STORAGE_PREFIXES,
} from "@/lib/supabase/storage-utils";
import {
  enqueueStorageCleanup,
  getPendingStorageCleanups,
  updateStorageCleanupStatus,
  auditLiveReferences,
  EnqueueResult,
  StorageCleanupItem,
} from "@/lib/supabase/storage-cleanup-queue";

export interface ProductAddonInputItem {
  id?: string;
  name: string;
  price: number;
}

interface MasterAddonRow {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

export interface CreateProductInput {
  name: string;
  slug?: string;
  categoryId: string;
  description?: string | null;
  price: number;
  hpp?: number | null;
  isAvailable?: boolean;
  isHighlight?: boolean;
  images: string[];
  optionGroups?: {
    name: string;
    isRequired: boolean;
    minSelect: number;
    maxSelect: number;
    values: {
      name: string;
      priceDelta: number;
    }[];
  }[];
  addonIds?: string[];
  addons?: ProductAddonInputItem[];
}

export interface CreateProductResult {
  success: boolean;
  productId?: string;
  slug?: string;
  error?: string;
}

export interface UpdateProductInput {
  id: string; // Product UUID or identifier/slug
  name: string;
  slug?: string;
  categoryId: string;
  description?: string | null;
  price: number;
  hpp?: number | null;
  isAvailable?: boolean;
  isHighlight?: boolean;
  images: string[];
  optionGroups?: {
    name: string;
    isRequired: boolean;
    minSelect: number;
    maxSelect: number;
    values: {
      name: string;
      priceDelta: number;
    }[];
  }[];
  addonIds?: string[];
  addons?: ProductAddonInputItem[];
}

export interface UpdateProductResult {
  success: boolean;
  productId?: string;
  slug?: string;
  error?: string;
}

/**
 * Resolves product addons against the master `addons` table using a Hybrid Copy-on-Write strategy:
 * 1. Exact match (name & price identical): Reuses existing master addon record without duplication.
 * 2. Unshared modification: If addon is modified and ONLY used by this product, updates the master record.
 * 3. Shared modification: If addon is modified and used by other products, creates a new record (Copy-on-Write)
 *    to strictly protect other products from unintended price/name alterations.
 * 4. New addon: Inserts a new record in `addons` and links to this product.
 */
async function resolveAndSyncProductAddons(
  client: SupabaseClient,
  productId: string,
  items: ProductAddonInputItem[]
): Promise<{ success: boolean; resolvedAddonIds?: string[]; error?: string }> {
  try {
    const { data: masterAddons, error: masterErr } = await client
      .from("addons")
      .select("id, name, price, is_active");

    if (masterErr) {
      return {
        success: false,
        error: `Gagal membaca daftar master add-on: ${masterErr.message}`,
      };
    }

    const masters: MasterAddonRow[] = (masterAddons || []) as unknown as MasterAddonRow[];
    const resolvedIds: string[] = [];

    const validItems = items
      .map((it) => ({
        id: it.id?.trim() || undefined,
        name: (it.name || "").trim(),
        price: Math.max(0, Math.round(Number(it.price) || 0)),
      }))
      .filter((it) => it.name.length > 0);

    for (const item of validItems) {
      // Step A: Check if an exact match already exists in master (name & price match)
      const exactMatch = masters.find(
        (m) =>
          m.name.trim().toLowerCase() === item.name.toLowerCase() &&
          Number(m.price) === item.price &&
          m.is_active !== false
      );

      if (exactMatch) {
        resolvedIds.push(exactMatch.id);
        continue;
      }

      // Step B: Check if item carries an existing addon ID that belongs to this product
      if (item.id) {
        const existingMaster = masters.find((m) => m.id === item.id);
        if (existingMaster) {
          // Check if this addon is shared with OTHER products
          const { count, error: countErr } = await client
            .from("product_addons")
            .select("*", { count: "exact", head: true })
            .eq("addon_id", item.id)
            .neq("product_id", productId);

          if (!countErr && (count ?? 0) === 0) {
            // Unshared: safe to update this master record directly
            const { error: updErr } = await client
              .from("addons")
              .update({
                name: item.name,
                price: item.price,
                is_active: true,
              })
              .eq("id", item.id);

            if (updErr) {
              return {
                success: false,
                error: `Gagal memperbarui add-on "${item.name}": ${updErr.message}`,
              };
            }

            resolvedIds.push(item.id);
            existingMaster.name = item.name;
            existingMaster.price = item.price;
            continue;
          }
          // Shared with other products: do not mutate existingMaster! Proceed to create copy-on-write record below.
        }
      }

      // Step C: Create a new master record in `addons`
      const newAddonId = crypto.randomUUID();
      const { error: insErr } = await client.from("addons").insert({
        id: newAddonId,
        name: item.name,
        price: item.price,
        is_active: true,
      });

      if (insErr) {
        return {
          success: false,
          error: `Gagal menyimpan add-on baru "${item.name}": ${insErr.message}`,
        };
      }

      resolvedIds.push(newAddonId);
      masters.push({
        id: newAddonId,
        name: item.name,
        price: item.price,
        is_active: true,
      });
    }

    const uniqueResolvedIds = Array.from(new Set(resolvedIds));
    return { success: true, resolvedAddonIds: uniqueResolvedIds };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Kesalahan tidak terduga saat sinkronisasi add-on.";
    return { success: false, error: msg };
  }
}

/**
 * Shared zero-trust authorization verification helper.
 * Validates active session and public.admin_users membership (with dev session fallback).
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
 * Server Action to securely insert a new product and its related tables.
 * Automatically generates a URL-friendly, unique slug from the product name.
 * Handles duplicate slugs and concurrency safely with sequential numeric suffixes (-2, -3, etc.).
 */
export async function createProductAction(
  input: CreateProductInput
): Promise<CreateProductResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    const serviceClient = getServiceRoleSupabaseClient();
    const client = serviceClient || supabase;

    // 2. Input Validations
    const trimmedName = (input.name || "").trim();
    if (!trimmedName || trimmedName.length < 2) {
      return {
        success: false,
        error: "Nama produk wajib diisi (minimal 2 karakter).",
      };
    }

    if (!input.categoryId) {
      return {
        success: false,
        error: "Kategori produk wajib dipilih.",
      };
    }

    const priceNum = Number(input.price);
    if (isNaN(priceNum) || priceNum < 0) {
      return {
        success: false,
        error: "Harga jual produk tidak valid (harus angka non-negatif).",
      };
    }

    let hppNum: number | null = null;
    if (
      input.hpp !== undefined &&
      input.hpp !== null &&
      input.hpp !== ("" as unknown as number)
    ) {
      const parsedHpp = Number(input.hpp);
      if (isNaN(parsedHpp) || parsedHpp < 0) {
        return {
          success: false,
          error: "HPP produk tidak valid (harus angka non-negatif).",
        };
      }
      hppNum = parsedHpp;
    }

    // 3. Automatically generate a unique slug from product name
    const baseSlug = generateSlug(trimmedName);
    let finalSlug = await resolveUniqueSlug(client, baseSlug);

    // 4. Calculate next sort_order
    const { data: maxSortData } = await client
      .from("products")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortOrder = (maxSortData?.sort_order ?? 0) + 1;
    const productId = crypto.randomUUID();

    // 5. Insert main product row into public.products with concurrency protection
    let insertSuccess = false;
    let insertAttempts = 0;

    while (!insertSuccess && insertAttempts < 3) {
      const { error: insertProdErr } = await client
        .from("products")
        .insert({
          id: productId,
          category_id: input.categoryId,
          name: trimmedName,
          slug: finalSlug,
          description: input.description?.trim() || null,
          price: priceNum,
          hpp: hppNum,
          is_available: input.isAvailable !== undefined ? Boolean(input.isAvailable) : true,
          is_archived: false,
          is_highlight: input.isHighlight !== undefined ? Boolean(input.isHighlight) : false,
          sort_order: nextSortOrder,
        });

      if (!insertProdErr) {
        insertSuccess = true;
        break;
      }

      // If concurrent insert created the same slug, increment suffix and retry
      const isSlugConflict =
        insertProdErr.code === "23505" ||
        insertProdErr.message.toLowerCase().includes("slug") ||
        insertProdErr.message.toLowerCase().includes("unique");

      if (isSlugConflict && insertAttempts < 2) {
        insertAttempts++;
        finalSlug = await resolveUniqueSlug(supabase, baseSlug);
        continue;
      }

      return {
        success: false,
        error: `Gagal menyimpan produk ke database: ${insertProdErr.message}`,
      };
    }

    // 6. Insert images if provided into public.product_images
    const validImages = (input.images || [])
      .map((img) => img.trim())
      .filter(Boolean);

    if (validImages.length > 0) {
      const imageRows = validImages.map((imageUrl, idx) => ({
        id: crypto.randomUUID(),
        product_id: productId,
        image_url: imageUrl,
        sort_order: idx + 1,
      }));

      const { error: imgErr } = await supabase
        .from("product_images")
        .insert(imageRows);

      if (imgErr) {
        console.error("Warning: Gagal menyimpan relasi foto produk:", imgErr.message);
      }
    }

    // 7. Insert Option Groups & Values in optimized batches if defined
    if (input.optionGroups && input.optionGroups.length > 0) {
      const validGroups = input.optionGroups.filter(
        (g) => g.name && g.name.trim()
      );
      if (validGroups.length > 0) {
        const groupRowsWithId = validGroups.map((g, gIdx) => ({
          id: crypto.randomUUID(),
          product_id: productId,
          name: g.name.trim(),
          is_required: Boolean(g.isRequired),
          min_select: Number(g.minSelect) || (g.isRequired ? 1 : 0),
          max_select: Number(g.maxSelect) || 1,
          sort_order: gIdx + 1,
          _rawGroup: g,
        }));

        const groupRows = groupRowsWithId.map(({ _rawGroup: _unused, ...row }) => {
          void _unused;
          return row;
        });

        const { error: grpErr } = await supabase
          .from("product_option_groups")
          .insert(groupRows);

        if (grpErr) {
          // Cleanup created product (cascades to product_images) to prevent orphaned catalog entry
          await supabase.from("products").delete().eq("id", productId);
          return {
            success: false,
            error: `Gagal menyimpan grup varian produk: ${grpErr.message}`,
          };
        }

        const allValRows = groupRowsWithId.flatMap((gRow) => {
          const values = gRow._rawGroup.values || [];
          return values
            .filter((v) => v.name && v.name.trim())
            .map((v, vIdx) => ({
              id: crypto.randomUUID(),
              group_id: gRow.id,
              name: v.name.trim(),
              price_delta: Number(v.priceDelta) || 0,
              is_active: true,
              sort_order: vIdx + 1,
            }));
        });

        if (allValRows.length > 0) {
          const { error: valErr } = await supabase
            .from("product_option_values")
            .insert(allValRows);

          if (valErr) {
            // Cleanup created product to prevent orphaned options with 0 values
            await supabase.from("products").delete().eq("id", productId);
            return {
              success: false,
              error: `Gagal menyimpan pilihan varian produk: ${valErr.message}`,
            };
          }
        }
      }
    }

    // 8. Insert linked Add-ons if provided
    const hasAddonsInput = input.addons !== undefined;
    const hasAddonIdsInput = input.addonIds !== undefined;

    if (hasAddonsInput || hasAddonIdsInput) {
      let uniqueAddonIds: string[] = [];

      if (hasAddonsInput) {
        const syncResult = await resolveAndSyncProductAddons(
          client,
          productId,
          input.addons || []
        );
        if (!syncResult.success) {
          await client.from("products").delete().eq("id", productId);
          return { success: false, error: syncResult.error };
        }
        uniqueAddonIds = syncResult.resolvedAddonIds || [];
      } else if (hasAddonIdsInput && input.addonIds) {
        uniqueAddonIds = Array.from(
          new Set(input.addonIds.map((id) => id.trim()).filter(Boolean))
        );
      }

      if (uniqueAddonIds.length > 0) {
        const addonRows = uniqueAddonIds.map((addonId, aIdx) => ({
          product_id: productId,
          addon_id: addonId,
          sort_order: aIdx + 1,
        }));

        const { error: addonErr } = await client
          .from("product_addons")
          .insert(addonRows);

        if (addonErr) {
          await client.from("products").delete().eq("id", productId);
          return {
            success: false,
            error: `Gagal menghubungkan add-on produk: ${addonErr.message}`,
          };
        }
      }
    }

    // 9. Invalidate cache and revalidate Next.js paths
    clearCatalogCache();
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    revalidatePath("/home");
    revalidatePath(`/produk/${finalSlug}`);
    revalidatePath("/");

    return {
      success: true,
      productId,
      slug: finalSlug,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan internal saat menyimpan produk.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Server Action to securely update an existing product and its relationships.
 * Preserves the existing slug even if product name changes.
 * Preserves product availability, highlight, IDs, and existing add-ons if not modified by the form.
 */
export async function updateProductAction(
  input: UpdateProductInput
): Promise<UpdateProductResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    const serviceClient = getServiceRoleSupabaseClient();
    const client = serviceClient || supabase;

    // 2. Validate input fields
    const trimmedName = (input.name || "").trim();
    if (!trimmedName || trimmedName.length < 2) {
      return {
        success: false,
        error: "Nama produk wajib diisi (minimal 2 karakter).",
      };
    }

    if (!input.categoryId) {
      return {
        success: false,
        error: "Kategori produk wajib dipilih.",
      };
    }

    const priceNum = Number(input.price);
    if (isNaN(priceNum) || priceNum < 0) {
      return {
        success: false,
        error: "Harga jual produk tidak valid (harus angka non-negatif).",
      };
    }

    let hppNum: number | null = null;
    if (
      input.hpp !== undefined &&
      input.hpp !== null &&
      input.hpp !== ("" as unknown as number)
    ) {
      const parsedHpp = Number(input.hpp);
      if (isNaN(parsedHpp) || parsedHpp < 0) {
        return {
          success: false,
          error: "HPP produk tidak valid (harus angka non-negatif).",
        };
      }
      hppNum = parsedHpp;
    }

    // 3. Resolve existing product by ID or slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id);
    let findQuery = client.from("products").select("id, slug, name, is_available, is_highlight, hpp, description");
    if (isUuid) {
      findQuery = findQuery.eq("id", input.id);
    } else {
      findQuery = findQuery.eq("slug", input.id);
    }

    const { data: existingProd, error: findErr } = await findQuery.maybeSingle();

    if (findErr) {
      return {
        success: false,
        error: `Gagal mencari produk di database: ${findErr.message}`,
      };
    }

    let resolvedProductId: string;
    let targetSlug: string;

    if (existingProd) {
      resolvedProductId = existingProd.id;

      // Preserve existing slug strictly; only generate if existing record had no valid slug
      if (existingProd.slug && existingProd.slug.trim().length >= 2) {
        targetSlug = existingProd.slug.trim();
      } else {
        const baseSlug = generateSlug(trimmedName);
        targetSlug = await resolveUniqueSlug(client, baseSlug, resolvedProductId);
      }

      // Preserve existing availability and highlight if not passed in form
      const finalIsAvailable =
        input.isAvailable !== undefined
          ? Boolean(input.isAvailable)
          : (existingProd.is_available ?? true);

      const finalIsHighlight =
        input.isHighlight !== undefined
          ? Boolean(input.isHighlight)
          : (existingProd.is_highlight ?? false);

      // Preserve existing HPP if input.hpp was not passed (undefined)
      const finalHpp =
        input.hpp !== undefined
          ? hppNum
          : existingProd.hpp !== undefined && existingProd.hpp !== null
          ? Number(existingProd.hpp)
          : null;

      // Preserve existing description if input.description was not passed (undefined)
      const finalDescription =
        input.description !== undefined
          ? (input.description?.trim() || null)
          : (existingProd.description ?? null);

      // Update public.products
      const { error: updateErr } = await client
        .from("products")
        .update({
          category_id: input.categoryId,
          name: trimmedName,
          slug: targetSlug,
          description: finalDescription,
          price: priceNum,
          hpp: finalHpp,
          is_available: finalIsAvailable,
          is_highlight: finalIsHighlight,
          updated_at: new Date().toISOString(),
        })
        .eq("id", resolvedProductId);

      if (updateErr) {
        return {
          success: false,
          error: `Gagal memperbarui data produk: ${updateErr.message}`,
        };
      }
    } else {
      // If product does not yet exist in database (e.g. from initial mock catalog), insert it
      resolvedProductId = isUuid ? input.id : crypto.randomUUID();

      // If an existing valid slug was passed from mock, preserve it; otherwise generate unique
      const candidateSlug = input.slug ? generateSlug(input.slug) : generateSlug(trimmedName);
      targetSlug = await resolveUniqueSlug(client, candidateSlug, resolvedProductId);

      const { data: maxSortData } = await client
        .from("products")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextSortOrder = (maxSortData?.sort_order ?? 0) + 1;

      const { error: insertErr } = await client.from("products").insert({
        id: resolvedProductId,
        category_id: input.categoryId,
        name: trimmedName,
        slug: targetSlug,
        description: input.description !== undefined ? (input.description?.trim() || null) : null,
        price: priceNum,
        hpp: input.hpp !== undefined ? hppNum : null,
        is_available: input.isAvailable !== undefined ? Boolean(input.isAvailable) : true,
        is_archived: false,
        is_highlight: input.isHighlight !== undefined ? Boolean(input.isHighlight) : false,
        sort_order: nextSortOrder,
      });

      if (insertErr) {
        return {
          success: false,
          error: `Gagal menyimpan produk ke database: ${insertErr.message}`,
        };
      }
    }

    // 4. Update Images: Delete old rows and insert updated rows
    await supabase.from("product_images").delete().eq("product_id", resolvedProductId);

    const validImages = (input.images || [])
      .map((img) => img.trim())
      .filter(Boolean);

    if (validImages.length > 0) {
      const imageRows = validImages.map((imageUrl, idx) => ({
        id: crypto.randomUUID(),
        product_id: resolvedProductId,
        image_url: imageUrl,
        sort_order: idx + 1,
      }));

      await supabase.from("product_images").insert(imageRows);
    }

    // 5. Update Option Groups & Values (only if optionGroups is provided)
    if (input.optionGroups !== undefined) {
      const { data: existingGroups } = await supabase
        .from("product_option_groups")
        .select("id")
        .eq("product_id", resolvedProductId);

      const existingGroupIds = (existingGroups || []).map((g) => g.id);

      if (input.optionGroups && input.optionGroups.length > 0) {
        const validGroups = input.optionGroups.filter(
          (g) => g.name && g.name.trim()
        );
        if (validGroups.length > 0) {
          const groupRowsWithId = validGroups.map((g, gIdx) => ({
            id: crypto.randomUUID(),
            product_id: resolvedProductId,
            name: g.name.trim(),
            is_required: Boolean(g.isRequired),
            min_select: Number(g.minSelect) || (g.isRequired ? 1 : 0),
            max_select: Number(g.maxSelect) || 1,
            sort_order: gIdx + 1,
            _rawGroup: g,
          }));

          const groupRows = groupRowsWithId.map(({ _rawGroup: _unused, ...row }) => {
            void _unused;
            return row;
          });

          // 1. Insert new groups first (preserves old groups if this fails)
          const { error: grpErr } = await supabase
            .from("product_option_groups")
            .insert(groupRows);

          if (grpErr) {
            return {
              success: false,
              error: `Gagal memperbarui grup varian produk: ${grpErr.message}`,
            };
          }

          const allValRows = groupRowsWithId.flatMap((gRow) => {
            const values = gRow._rawGroup.values || [];
            return values
              .filter((v) => v.name && v.name.trim())
              .map((v, vIdx) => ({
                id: crypto.randomUUID(),
                group_id: gRow.id,
                name: v.name.trim(),
                price_delta: Number(v.priceDelta) || 0,
                is_active: true,
                sort_order: vIdx + 1,
              }));
          });

          if (allValRows.length > 0) {
            const { error: valErr } = await supabase
              .from("product_option_values")
              .insert(allValRows);

            if (valErr) {
              // Delete ONLY the newly created groups; old groups remain completely untouched
              const newGroupIds = groupRowsWithId.map((g) => g.id);
              await supabase
                .from("product_option_groups")
                .delete()
                .in("id", newGroupIds);

              return {
                success: false,
                error: `Gagal memperbarui pilihan varian produk: ${valErr.message}`,
              };
            }
          }

          // 2. Both new groups and values succeeded! Now safely remove the old groups
          if (existingGroupIds.length > 0) {
            await supabase.from("product_option_values").delete().in("group_id", existingGroupIds);
            await supabase.from("product_option_groups").delete().in("id", existingGroupIds);
          }
        } else {
          // Admin explicitly cleared all groups
          if (existingGroupIds.length > 0) {
            await supabase.from("product_option_values").delete().in("group_id", existingGroupIds);
            await supabase.from("product_option_groups").delete().in("id", existingGroupIds);
          }
        }
      } else {
        // Admin passed empty optionGroups array
        if (existingGroupIds.length > 0) {
          await supabase.from("product_option_values").delete().in("group_id", existingGroupIds);
          await supabase.from("product_option_groups").delete().in("id", existingGroupIds);
        }
      }
    }

    // 6. Update linked Addons ONLY if explicitly provided in input
    // If both input.addons and input.addonIds are undefined, preserve all existing product_addons untouched
    const hasAddonsInput = input.addons !== undefined;
    const hasAddonIdsInput = input.addonIds !== undefined;

    if (hasAddonsInput || hasAddonIdsInput) {
      // 6a. Snapshot existing addons before updating so we can restore if new insert fails
      const { data: existingAddons, error: fetchAddonErr } = await client
        .from("product_addons")
        .select("addon_id, sort_order")
        .eq("product_id", resolvedProductId)
        .order("sort_order", { ascending: true });

      if (fetchAddonErr) {
        return {
          success: false,
          error: `Gagal membaca relasi add-on produk: ${fetchAddonErr.message}`,
        };
      }

      let uniqueAddonIds: string[] = [];

      if (hasAddonsInput) {
        const syncResult = await resolveAndSyncProductAddons(
          client,
          resolvedProductId,
          input.addons || []
        );
        if (!syncResult.success) {
          return { success: false, error: syncResult.error };
        }
        uniqueAddonIds = syncResult.resolvedAddonIds || [];
      } else if (hasAddonIdsInput && input.addonIds) {
        uniqueAddonIds = Array.from(
          new Set(input.addonIds.map((id) => id.trim()).filter(Boolean))
        );
      }

      const currentAddonIds = (existingAddons || []).map((ea) => ea.addon_id);
      const isUnchanged =
        currentAddonIds.length === uniqueAddonIds.length &&
        currentAddonIds.every((id, idx) => id === uniqueAddonIds[idx]);

      // Only perform database mutation if the addons selection actually changed
      if (!isUnchanged) {
        const { error: delErr } = await client
          .from("product_addons")
          .delete()
          .eq("product_id", resolvedProductId);

        if (delErr) {
          return {
            success: false,
            error: `Gagal membersihkan relasi add-on lama: ${delErr.message}`,
          };
        }

        if (uniqueAddonIds.length > 0) {
          const addonRows = uniqueAddonIds.map((addonId, aIdx) => ({
            product_id: resolvedProductId,
            addon_id: addonId,
            sort_order: aIdx + 1,
          }));

          const { error: addonErr } = await client
            .from("product_addons")
            .insert(addonRows);

          if (addonErr) {
            // Restore previous addons snapshot if new insert fails to avoid partial state
            if (existingAddons && existingAddons.length > 0) {
              await client.from("product_addons").insert(
                existingAddons.map((ea) => ({
                  product_id: resolvedProductId,
                  addon_id: ea.addon_id,
                  sort_order: ea.sort_order,
                }))
              );
            }
            return {
              success: false,
              error: `Gagal memperbarui add-on produk: ${addonErr.message}`,
            };
          }
        }
      }
    }

    // 7. Invalidate cache and revalidate Next.js paths
    clearCatalogCache();
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    revalidatePath("/home");
    revalidatePath(`/produk/${targetSlug}`);
    revalidatePath("/");

    return {
      success: true,
      productId: resolvedProductId,
      slug: targetSlug,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan internal saat memperbarui produk.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Server Action to archive (soft-delete) a product from active catalog.
 * Preserves historical order references and transaction integrity.
 */
export async function archiveProductAction(
  productId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    // 2. Resolve product identifier
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    let query = supabase
      .from("products")
      .update({
        is_archived: true,
        is_available: false,
        updated_at: new Date().toISOString(),
      });

    if (isUuid) {
      query = query.eq("id", productId);
    } else {
      query = query.eq("slug", productId);
    }

    const { error: archiveErr } = await query;

    if (archiveErr) {
      return {
        success: false,
        error: `Gagal mengarsipkan menu: ${archiveErr.message}`,
      };
    }

    // Unlink from active homepage sections to prevent ghost listings
    const serviceClient = getServiceRoleSupabaseClient();
    const client = serviceClient || supabase;
    if (isUuid) {
      await client.from("homepage_section_products").delete().eq("product_id", productId);
    }

    // 3. Invalidate cache and revalidate Next.js paths
    clearCatalogCache();
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    revalidatePath("/home");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan saat mengarsipkan menu.";
    return { success: false, error: message };
  }
}

export interface DeleteProductResult {
  success: boolean;
  action?: "deleted" | "archived" | "already_deleted";
  hasTransactions?: boolean;
  orderCount?: number;
  message?: string;
  warning?: string;
  deletedImagesCount?: number;
  sharedImagesPreservedCount?: number;
  failedStorageFiles?: string[];
  error?: string;
}

/**
 * Server Action for consistent, permanent product and image deletion.
 *
 * CORE RULES:
 * 1. Server-side dual authorization (Rejects unauthenticated or non-admin callers).
 * 2. Idempotent: If product is already deleted, returns success without corrupting data.
 * 3. Financial & Accounting Protection: If product has order_items history, hard-delete
 *    is BLOCKED and the product is automatically soft-archived to protect transaction history.
 * 4. Shared Asset Protection: Never deletes an image file if it is referenced by another
 *    product, banner, or store setting.
 * 5. Exclusive Image Cleanup: Deletes unreferenced storage objects via Supabase Storage API.
 * 6. Non-Atomic Storage Resilience: If storage cleanup fails after DB deletion, returns
 *    actionable warning with failed paths for manual or scheduled retry.
 */
export async function deleteProductPermanentlyAction(
  productId: string
): Promise<DeleteProductResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    const serviceClient = getServiceRoleSupabaseClient();
    const client = serviceClient || supabase;

    // 2. Resolve target product in public.products
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    let findQuery = client.from("products").select("id, name, slug, is_archived");
    if (isUuid) {
      findQuery = findQuery.eq("id", productId);
    } else {
      findQuery = findQuery.eq("slug", productId);
    }

    const { data: targetProduct, error: findErr } = await findQuery.maybeSingle();

    if (findErr) {
      return {
        success: false,
        error: `Gagal mencari data menu: ${findErr.message}`,
      };
    }

    // Scenario G: If product already deleted or not found, return idempotent success
    if (!targetProduct) {
      return {
        success: true,
        action: "already_deleted",
        message: "Menu sudah tidak ada atau telah dihapus sebelumnya.",
      };
    }

    const productDbId = targetProduct.id;

    // 3. Check transaction history in order_items (Scenario C)
    const { count: orderItemsCount, error: orderCountErr } = await client
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productDbId);

    if (orderCountErr) {
      return {
        success: false,
        error: `Gagal memeriksa riwayat transaksi menu: ${orderCountErr.message}`,
      };
    }

    // CASE 1: PRODUCT HAS ORDER HISTORY -> PRESERVE TRANSACTION INTEGRITY (SOFT-ARCHIVE)
    if (orderItemsCount && orderItemsCount > 0) {
      const { error: archiveErr } = await client
        .from("products")
        .update({
          is_archived: true,
          is_available: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productDbId);

      if (archiveErr) {
        return {
          success: false,
          error: `Gagal mengarsipkan menu berriwayat pesanan: ${archiveErr.message}`,
        };
      }

      // Unlink from active homepage section assignments
      await client
        .from("homepage_section_products")
        .delete()
        .eq("product_id", productDbId);

      clearCatalogCache();
      revalidatePath("/admin/menu");
      revalidatePath("/menu");
      revalidatePath("/home");
      revalidatePath("/");

      return {
        success: true,
        action: "archived",
        hasTransactions: true,
        orderCount: orderItemsCount,
        message: `Menu memiliki ${orderItemsCount} riwayat pesanan pelanggan. Demi menjaga integritas pembukuan dan pesanan pelanggan, menu diarsipkan dari etalase toko (bukan dihapus permanen).`,
      };
    }

    // CASE 2: ZERO ORDER ITEMS -> EXECUTE FULL PERMANENT CLEANUP
    // Step A: Fetch all product images metadata
    const { data: imageRows, error: imgFetchErr } = await client
      .from("product_images")
      .select("id, image_url")
      .eq("product_id", productDbId);

    if (imgFetchErr) {
      return {
        success: false,
        error: `Gagal memuat metadata gambar menu: ${imgFetchErr.message}`,
      };
    }

    const imageUrls = (imageRows || []).map((r) => r.image_url).filter(Boolean);

    // Step B: Determine exclusive vs shared images using precise canonical matching
    const exclusiveStoragePaths: string[] = [];
    let sharedImagesPreservedCount = 0;

    for (const url of imageUrls) {
      const storagePath = extractStoragePathFromUrl(url, "store-assets");
      if (!storagePath) {
        // Static repo asset (/images/...) or non-storage image, safely ignore
        continue;
      }

      // Check live references across all entities (excluding this product being deleted)
      const auditResult = await auditLiveReferences(
        client,
        storagePath,
        "store-assets",
        productDbId
      );

      if (auditResult.isReferenced) {
        sharedImagesPreservedCount++;
      } else {
        exclusiveStoragePaths.push(storagePath);
      }
    }

    // Step C: Enqueue exclusive storage paths into persistent queue BEFORE database deletion
    // This ensures no image metadata is lost if queue persistence fails.
    const failedStorageFiles: string[] = [];
    let actualDeletedImagesCount = 0;
    let queueItems: StorageCleanupItem[] = [];
    let queueResult: EnqueueResult | null = null;

    if (exclusiveStoragePaths.length > 0) {
      queueResult = await enqueueStorageCleanup(
        client,
        exclusiveStoragePaths.map((p) => ({ bucket: "store-assets", filePath: p }))
      );

      // In production cloud environments, if database queue is not available,
      // abort product deletion to prevent creating untracked orphan storage objects
      if (!queueResult.isDatabaseQueueAvailable && process.env.NODE_ENV === "production") {
        return {
          success: false,
          error:
            "Penghapusan menu dibatalkan: Antrean database 'storage_cleanup_queue' belum tersedia di Supabase. Harap jalankan migrasi database terlebih dahulu agar berkas gambar dapat dibersihkan secara persisten.",
        };
      }

      queueItems = queueResult.items;
    }

    // Step D: Delete child relations in strict FK order
    // 1. homepage_section_products
    await client
      .from("homepage_section_products")
      .delete()
      .eq("product_id", productDbId);

    // 2. product_images
    const { error: imgDelErr } = await client
      .from("product_images")
      .delete()
      .eq("product_id", productDbId);

    if (imgDelErr) {
      return {
        success: false,
        error: `Gagal menghapus metadata gambar: ${imgDelErr.message}`,
      };
    }

    // 3. product_addons (linking records only, master addons remain untouched)
    await client
      .from("product_addons")
      .delete()
      .eq("product_id", productDbId);

    // 4. product_option_values & product_option_groups
    const { data: optionGroups } = await client
      .from("product_option_groups")
      .select("id")
      .eq("product_id", productDbId);

    if (optionGroups && optionGroups.length > 0) {
      const groupIds = optionGroups.map((g) => g.id);
      await client
        .from("product_option_values")
        .delete()
        .in("group_id", groupIds);

      await client
        .from("product_option_groups")
        .delete()
        .eq("product_id", productDbId);
    }

    // Step E: Delete product row from public.products
    const { error: prodDelErr } = await client
      .from("products")
      .delete()
      .eq("id", productDbId);

    if (prodDelErr) {
      return {
        success: false,
        error: `Gagal menghapus produk dari database: ${prodDelErr.message}`,
      };
    }

    // Step F: Execute physical removal from storage for registered queue items
    if (queueItems.length > 0) {
      for (const item of queueItems) {
        // Concurrency guard: Re-audit to verify no other process linked this image
        const recheck = await auditLiveReferences(client, item.filePath, item.bucket);

        if (recheck.isReferenced) {
          // Re-referenced concurrently! Cancel cleanup and preserve file.
          await updateStorageCleanupStatus(
            client,
            item.id,
            "cancelled",
            `File re-referenced by: ${recheck.references.join(", ")}`
          );
          sharedImagesPreservedCount++;
          continue;
        }

        try {
          const { error: storageRemoveErr } = await client.storage
            .from(item.bucket)
            .remove([item.filePath]);

          if (storageRemoveErr) {
            await updateStorageCleanupStatus(
              client,
              item.id,
              "failed",
              storageRemoveErr.message
            );
            failedStorageFiles.push(item.filePath);
          } else {
            await updateStorageCleanupStatus(client, item.id, "completed");
            actualDeletedImagesCount++;
          }
        } catch (removeErr) {
          const errMsg = removeErr instanceof Error ? removeErr.message : "Network/storage error";
          await updateStorageCleanupStatus(client, item.id, "failed", errMsg);
          failedStorageFiles.push(item.filePath);
        }
      }
    }

    // Step F: Invalidate caches and revalidate Next.js paths
    clearCatalogCache();
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    revalidatePath("/home");
    revalidatePath("/");

    // Scenario D: If storage deletion failed, report actionable warning without claiming total success
    if (failedStorageFiles.length > 0) {
      const queueNotice = queueResult?.isDatabaseQueueAvailable
        ? `File tercatat di antrean database 'storage_cleanup_queue' dan dapat dicoba ulang.`
        : `PERHATIAN: Tabel 'storage_cleanup_queue' belum aktif di database Supabase (file lokal tidak persisten di serverless Vercel). Gunakan tombol coba ulang sekarang atau jalankan migrasi database.`;

      return {
        success: true,
        action: "deleted",
        warning: `Menu berhasil dihapus dari database, namun pembersihan ${failedStorageFiles.length} file gambar storage gagal (${failedStorageFiles.join(", ")}). ${queueNotice}`,
        deletedImagesCount: actualDeletedImagesCount,
        sharedImagesPreservedCount,
        failedStorageFiles,
        message: "Menu dihapus dari database dengan catatan kendala storage.",
      };
    }

    return {
      success: true,
      action: "deleted",
      deletedImagesCount: actualDeletedImagesCount,
      sharedImagesPreservedCount,
      message: `Menu dan ${actualDeletedImagesCount} file gambar eksklusif berhasil dihapus permanen.${
        sharedImagesPreservedCount > 0 ? ` (${sharedImagesPreservedCount} file gambar bersama dipertahankan).` : ""
      }`,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus menu.";
    return { success: false, error: message };
  }
}

/**
 * Server Action to retry cleaning up failed storage files from the persistent queue.
 * Re-checks that no other product, banner, store settings, or category references the files
 * before issuing the storage removal.
 */
export async function retryDeleteStorageImagesAction(
  storagePaths?: string[]
): Promise<{
  success: boolean;
  deletedCount?: number;
  remainingFailed?: string[];
  preservedCount?: number;
  error?: string;
  message?: string;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    const serviceClient = getServiceRoleSupabaseClient();
    const client = serviceClient || supabase;

    // Load items to retry from persistent queue (with targeted paths or batch)
    const cleanPaths = storagePaths?.map(normalizeStoragePath).filter(Boolean);
    const itemsToProcess = await getPendingStorageCleanups(client, 20, cleanPaths);

    if (cleanPaths && cleanPaths.length > 0) {
      const existingQueuePaths = new Set(itemsToProcess.map((i) => i.filePath));
      const missingPaths = cleanPaths.filter((p) => !existingQueuePaths.has(p));
      if (missingPaths.length > 0) {
        const newlyEnqueued = await enqueueStorageCleanup(
          client,
          missingPaths.map((p) => ({ bucket: "store-assets", filePath: p }))
        );
        itemsToProcess.push(...newlyEnqueued.items);
      }
    }

    if (itemsToProcess.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        preservedCount: 0,
        remainingFailed: [],
        message: "Tidak ada file storage dalam antrean retry.",
      };
    }

    let deletedCount = 0;
    let preservedCount = 0;
    const remainingFailed: string[] = [];

    for (const item of itemsToProcess) {
      // 1. Audit live references across all entities with precise canonical matching
      const audit = await auditLiveReferences(client, item.filePath, item.bucket);

      if (audit.isReferenced) {
        // File has active references! Cancel queue item and preserve file.
        await updateStorageCleanupStatus(
          client,
          item.id,
          "cancelled",
          `File actively referenced by: ${audit.references.join(", ")}`
        );
        preservedCount++;
        continue;
      }

      // 2. Attempt removal
      try {
        const { error: removeErr } = await client.storage
          .from(item.bucket)
          .remove([item.filePath]);

        if (removeErr) {
          await updateStorageCleanupStatus(client, item.id, "failed", removeErr.message);
          remainingFailed.push(item.filePath);
        } else {
          await updateStorageCleanupStatus(client, item.id, "completed");
          deletedCount++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Storage removal failed";
        await updateStorageCleanupStatus(client, item.id, "failed", errMsg);
        remainingFailed.push(item.filePath);
      }
    }

    if (remainingFailed.length > 0) {
      return {
        success: false,
        remainingFailed,
        deletedCount,
        preservedCount,
        error: `Gagal membersihkan ${remainingFailed.length} file dari storage. Tercatat untuk percobaan berikutnya.`,
      };
    }

    return {
      success: true,
      deletedCount,
      preservedCount,
      message: `Berhasil membersihkan ${deletedCount} file storage.${
        preservedCount > 0 ? ` (${preservedCount} file dipertahankan karena berstatus aktif/bersama).` : ""
      }`,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan saat retry pembersihan storage.";
    return { success: false, error: message };
  }
}

export interface GarbageCollectorOptions {
  bucket?: string;
  prefix?: string;
  batchSize?: number;
  dryRun?: boolean;
}

/**
 * Server Action for admin garbage collection of unreferenced files in store-assets.
 * Whitelisted prefixes only ("products", "banners").
 * Dry-run mode by default to ensure safe inspection before physical removal.
 */
export async function cleanupUnreferencedStorageImagesAction(
  options?: GarbageCollectorOptions
): Promise<{
  success: boolean;
  dryRun?: boolean;
  scannedCount?: number;
  orphanCandidates?: string[];
  deletedCount?: number;
  preservedCount?: number;
  error?: string;
  message?: string;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    const serviceClient = getServiceRoleSupabaseClient();
    const client = serviceClient || supabase;

    const bucket = options?.bucket || "store-assets";
    const prefix = normalizeStoragePath(options?.prefix || "products");
    const batchSize = Math.min(100, Math.max(1, options?.batchSize || 50));
    const dryRun = options?.dryRun !== false; // Default: true for safety!

    // Prefix validation against whitelist
    if (!ALLOWED_STORAGE_PREFIXES.some((p) => prefix === p || prefix.startsWith(`${p}/`))) {
      return {
        success: false,
        error: `Prefix "${prefix}" tidak diizinkan. Prefix yang didukung: ${ALLOWED_STORAGE_PREFIXES.join(", ")}`,
      };
    }

    // List files from storage
    const { data: fileList, error: listErr } = await client.storage
      .from(bucket)
      .list(prefix, { limit: batchSize });

    if (listErr) {
      return { success: false, error: `Gagal membaca list storage: ${listErr.message}` };
    }

    if (!fileList || fileList.length === 0) {
      return {
        success: true,
        dryRun,
        scannedCount: 0,
        deletedCount: 0,
        preservedCount: 0,
        orphanCandidates: [],
        message: `Storage "${bucket}/${prefix}" kosong.`,
      };
    }

    const orphanCandidates: string[] = [];
    let preservedCount = 0;

    for (const file of fileList) {
      if (!file.name || file.name === ".emptyFolderPlaceholder") continue;
      const fullPath = `${prefix}/${file.name}`;

      // Audit live references across all entities using exact canonical path
      const audit = await auditLiveReferences(client, fullPath, bucket);

      if (audit.isReferenced) {
        preservedCount++;
      } else {
        orphanCandidates.push(fullPath);
      }
    }

    // In dryRun mode, report candidates without mutating storage
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        scannedCount: fileList.length,
        deletedCount: 0,
        orphanCandidates,
        preservedCount,
        message: `[DRY-RUN] Ditemukan ${orphanCandidates.length} file orphan dari ${fileList.length} file yang dipindai (${preservedCount} file aktif dipertahankan). Tidak ada file yang dihapus.`,
      };
    }

    // Actual execution mode (dryRun: false)
    if (orphanCandidates.length > 0) {
      const { error: removeErr } = await client.storage
        .from(bucket)
        .remove(orphanCandidates);

      if (removeErr) {
        return {
          success: false,
          error: `Gagal menghapus file orphan dari storage: ${removeErr.message}`,
        };
      }
    }

    return {
      success: true,
      dryRun: false,
      scannedCount: fileList.length,
      deletedCount: orphanCandidates.length,
      orphanCandidates,
      preservedCount,
      message: `Pembersihan storage selesai: ${orphanCandidates.length} file orphan berhasil dihapus (${preservedCount} file aktif dipertahankan).`,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan saat pembersihan orphan storage.";
    return { success: false, error: message };
  }
}

/**
 * Server Action to securely load full product details (including HPP, option groups, and addons)
 * for an authorized admin opening the edit modal.
 * Uses get_admin_products() RPC to retrieve protected HPP data.
 */
export async function getAdminProductForEditAction(
  identifier: string
): Promise<{ success: boolean; product?: Product; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    const serviceClient = getServiceRoleSupabaseClient();
    const client = serviceClient || supabase;

    // 2. Fetch product by slug or id using catalog loader with authenticated admin client
    const baseProduct = await getProductBySlugOrId(identifier, true, client);

    // Fallback to dummy PRODUCTS if not yet seeded in database
    let resolvedProduct: Product;
    if (baseProduct) {
      resolvedProduct = baseProduct;
    } else {
      const dummyProd = PRODUCTS.find((p) => p.id === identifier || p.slug === identifier);
      if (dummyProd) {
        resolvedProduct = dummyProd;
      } else {
        return {
          success: false,
          error: "Produk tidak ditemukan.",
        };
      }
    }

    // 3. Fetch authoritative HPP directly from products table (authorized admins only)
    let fetchedHpp: number | null = null;
    try {
      const targetId = resolvedProduct.dbId || resolvedProduct.id;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
      let directQuery = client.from("products").select("id, slug, hpp");
      if (isUuid) {
        directQuery = directQuery.eq("id", targetId);
      } else {
        directQuery = directQuery.eq("slug", resolvedProduct.slug || targetId);
      }
      const { data: directProd, error: directErr } = await directQuery.maybeSingle();
      if (!directErr && directProd && directProd.hpp !== undefined && directProd.hpp !== null) {
        fetchedHpp = Number(directProd.hpp);
      }
    } catch {
      // In dev or fallback mode, continue gracefully
    }

    return {
      success: true,
      product: {
        ...resolvedProduct,
        hpp: fetchedHpp,
      },
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data produk.";
    return { success: false, error: message };
  }
}

/**
 * Server Action to update product availability status in public.products.
 */
export async function toggleProductAvailabilityAction(
  productId: string,
  isAvailable: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    const trimmedId = (productId || "").trim();
    if (!trimmedId) {
      return { success: false, error: "ID atau slug produk tidak valid." };
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmedId
      );

    const serviceClient = getServiceRoleSupabaseClient();
    const client = serviceClient || supabase;

    let query = client
      .from("products")
      .update({ is_available: isAvailable });

    if (isUuid) {
      query = query.eq("id", trimmedId);
    } else {
      query = query.eq("slug", trimmedId);
    }

    const { data: updatedRows, error } = await query.select("id, is_available");

    if (error) {
      return { success: false, error: error.message };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        error: `Produk dengan identifier "${trimmedId}" tidak ditemukan.`,
      };
    }

    clearCatalogCache();
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    revalidatePath("/home");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Gagal memperbarui status ketersediaan.";
    return { success: false, error: message };
  }
}

/**
 * Server Action to handle product image upload from admin's local machine.
 * Validates admin authorization, file size (max 2 MB), and MIME types (JPG, PNG, WebP).
 * Uploads to Supabase Storage bucket 'store-assets' (products/ folder) with fallback to local uploads in development.
 */
export async function uploadProductImageAction(
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Dual authorization check
    const authCheck = await verifyAdminCaller(supabase);
    if (!authCheck.isAuthorized) {
      return { success: false, error: authCheck.error };
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return {
        success: false,
        error: "File gambar tidak ditemukan dalam formulir.",
      };
    }

    // 2. Validate file size (max 2 MB per PRD)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return {
        success: false,
        error: `Ukuran file terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Batas maksimal adalah 2 MB.`,
      };
    }

    // 3. Validate file MIME type
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
    const storagePath = `products/product-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const client =
      (process.env.NODE_ENV === "development" && getServiceRoleSupabaseClient()) ||
      supabase;

    // 4. Upload to Supabase Storage bucket 'store-assets'
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
          const fileName = `${cleanBaseName || "produk"}-${Date.now()}.${ext}`;
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
        error: `Gagal mengunggah foto produk ke Supabase Storage: ${uploadError?.message || "Kesalahan penyimpanan."}`,
      };
    }

    const { data: publicUrlData } = client.storage
      .from("store-assets")
      .getPublicUrl(storagePath);

    if (!publicUrlData?.publicUrl) {
      return {
        success: false,
        error: "Gagal mendapatkan URL publik dari foto produk yang diunggah.",
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
        : "Terjadi kesalahan internal saat mengunggah gambar.";
    return {
      success: false,
      error: message,
    };
  }
}
