import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { MenuManager } from "@/components/admin/MenuManager";
import { getActiveCategories } from "@/lib/supabase/catalog";
import { getAdminProductsServer } from "@/lib/supabase/admin-catalog";
import { CATEGORIES } from "@/data/dummy-data";
import { Category, Product } from "@/types";
import { AlertTriangle } from "lucide-react";

export const instant = false;

export default async function AdminMenuPage() {
  await requireAdminAuth();

  let categories: Category[] = [];
  let products: Product[] = [];
  let loadError: string | null = null;

  try {
    const [fetchedCats, fetchedProds] = await Promise.all([
      getActiveCategories(),
      getAdminProductsServer(),
    ]);
    categories = fetchedCats.length > 0 ? fetchedCats : CATEGORIES;
    products = fetchedProds;
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan saat memuat data menu dari database.";
    console.error("[AdminMenuPage] Data loading failed:", err);
    loadError = msg;
  }

  if (loadError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-2">
        <h3 className="text-sm font-bold text-red-800 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          Gagal Memuat Menu Admin
        </h3>
        <p className="text-xs text-red-600">{loadError}</p>
      </div>
    );
  }

  return (
    <MenuManager
      initialProducts={products}
      initialCategories={categories}
    />
  );
}
