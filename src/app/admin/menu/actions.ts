"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProductBySlugOrId, clearCatalogCache } from "@/lib/supabase/catalog";
import { PRODUCTS } from "@/data/dummy-data";
import { Product } from "@/types";
import { generateSlug, resolveUniqueSlug } from "@/lib/slug";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export interface CreateProductInput {
  name: string;
  slug?: string;
  categoryId: string;
  description?: string;
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
  description?: string;
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
}

export interface UpdateProductResult {
  success: boolean;
  productId?: string;
  slug?: string;
  error?: string;
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
    if (input.addonIds && input.addonIds.length > 0) {
      const addonRows = input.addonIds.map((addonId, aIdx) => ({
        product_id: productId,
        addon_id: addonId,
        sort_order: aIdx + 1,
      }));

      const { error: addonErr } = await supabase
        .from("product_addons")
        .insert(addonRows);

      if (addonErr) {
        await supabase.from("products").delete().eq("id", productId);
        return {
          success: false,
          error: `Gagal menghubungkan add-on produk: ${addonErr.message}`,
        };
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
    let findQuery = client.from("products").select("id, slug, name, is_available, is_highlight, hpp");
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

      // Update public.products
      const { error: updateErr } = await client
        .from("products")
        .update({
          category_id: input.categoryId,
          name: trimmedName,
          slug: targetSlug,
          description: input.description?.trim() || null,
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
        description: input.description?.trim() || null,
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
    // If input.addonIds is undefined, preserve all existing product_addons untouched
    if (input.addonIds !== undefined) {
      // Snapshot existing addons before updating so we can restore if new insert fails
      const { data: existingAddons } = await supabase
        .from("product_addons")
        .select("addon_id, sort_order")
        .eq("product_id", resolvedProductId);

      await supabase.from("product_addons").delete().eq("product_id", resolvedProductId);

      if (input.addonIds && input.addonIds.length > 0) {
        const addonRows = input.addonIds.map((addonId, aIdx) => ({
          product_id: resolvedProductId,
          addon_id: addonId,
          sort_order: aIdx + 1,
        }));

        const { error: addonErr } = await supabase
          .from("product_addons")
          .insert(addonRows);

        if (addonErr) {
          // Restore previous addons if new insert fails
          if (existingAddons && existingAddons.length > 0) {
            await supabase.from("product_addons").insert(
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

    // 2. Fetch product by slug or id using existing catalog loader
    const baseProduct = await getProductBySlugOrId(identifier);

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
      const serviceClient = getServiceRoleSupabaseClient();
      const client = serviceClient || supabase;

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

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        productId
      );

    const client =
      (process.env.NODE_ENV === "development" && getServiceRoleSupabaseClient()) ||
      supabase;

    let query = client
      .from("products")
      .update({ is_available: isAvailable });

    if (isUuid) {
      query = query.eq("id", productId);
    } else {
      query = query.eq("slug", productId);
    }

    const { error } = await query;

    if (error) {
      return { success: false, error: error.message };
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
