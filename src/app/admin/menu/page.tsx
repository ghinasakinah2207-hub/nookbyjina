import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { MenuManager } from "@/components/admin/MenuManager";
import {
  getActiveCategories,
  getActiveAddons,
} from "@/lib/supabase/catalog";
import { getAdminProductsServer } from "@/lib/supabase/admin-catalog";
import { CATEGORIES } from "@/data/dummy-data";
import { Category, Product, Addon } from "@/types";
import { AlertTriangle } from "lucide-react";

export const instant = false;

const DEFAULT_ADDONS: Addon[] = [
  { id: "b0000005-0000-4000-8000-000000000001", name: "Ekstra Sambal Cakalang", price: 4000 },
  { id: "b0000005-0000-4000-8000-000000000002", name: "Telur Dadar Iris Gurih", price: 3000 },
  { id: "b0000005-0000-4000-8000-000000000003", name: "Kerupuk Kaleng Renyah", price: 2000 },
  { id: "b0000005-0000-4000-8000-000000000004", name: "Ekstra Sambal Matah Fresh", price: 3000 },
  { id: "b0000005-0000-4000-8000-000000000005", name: "Ekstra Saus Sambal Cocol", price: 1500 },
  { id: "b0000005-0000-4000-8000-000000000006", name: "Ekstra Keju Mozzarella (+Lumer)", price: 4000 },
  { id: "b0000005-0000-4000-8000-000000000007", name: "Homemade Chili Oil Pedas", price: 3000 },
  { id: "b0000005-0000-4000-8000-000000000008", name: "Ekstra Tobiko Melimpah", price: 3500 },
  { id: "b0000005-0000-4000-8000-000000000010", name: "Ekstra 1 Shot Espresso", price: 4000 },
  { id: "b0000005-0000-4000-8000-000000000011", name: "Grass Jelly Cincau Hitam", price: 3000 },
];

export default async function AdminMenuPage() {
  await requireAdminAuth();

  let categories: Category[] = [];
  let products: Product[] = [];
  let addons: Addon[] = [];
  let loadError: string | null = null;

  try {
    const [fetchedCats, fetchedProds, fetchedAddons] = await Promise.all([
      getActiveCategories(),
      getAdminProductsServer(),
      getActiveAddons(),
    ]);
    categories = fetchedCats.length > 0 ? fetchedCats : CATEGORIES;
    products = fetchedProds;
    addons = fetchedAddons.length > 0 ? fetchedAddons : DEFAULT_ADDONS;
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
      availableAddons={addons}
    />
  );
}
