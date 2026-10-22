import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";
import { MenuManager } from "@/components/admin/MenuManager";
import {
  getActiveCategories,
  getVisibleProducts,
  getActiveAddons,
} from "@/lib/supabase/catalog";
import { CATEGORIES, PRODUCTS } from "@/data/dummy-data";
import { Category, Product, Addon } from "@/types";

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
  const { user } = await requireAdminAuth();

  let categories: Category[] = [];
  let products: Product[] = [];
  let addons: Addon[] = [];

  try {
    const [fetchedCats, fetchedProds, fetchedAddons] = await Promise.all([
      getActiveCategories(),
      getVisibleProducts(),
      getActiveAddons(),
    ]);
    categories = fetchedCats.length > 0 ? fetchedCats : CATEGORIES;
    products = fetchedProds.length > 0 ? fetchedProds : PRODUCTS;
    addons = fetchedAddons.length > 0 ? fetchedAddons : DEFAULT_ADDONS;

    // Securely retrieve HPP via public.get_admin_products() RPC for verified admin
    try {
      const supabase = await createServerSupabaseClient();
      const { data: adminProds } = await supabase.rpc("get_admin_products");
      if (adminProds && Array.isArray(adminProds)) {
        interface AdminRow {
          id: string;
          slug: string;
          hpp?: number | null;
        }
        products = products.map((p) => {
          const match = (adminProds as AdminRow[]).find(
            (r) => r.id === p.id || r.id === p.dbId || r.slug === p.slug
          );
          if (match && match.hpp !== undefined && match.hpp !== null) {
            return { ...p, hpp: Number(match.hpp) };
          }
          return p;
        });
      }
    } catch {
      // Graceful fallback for offline / development session
    }
  } catch {
    categories = CATEGORIES;
    products = PRODUCTS;
    addons = DEFAULT_ADDONS;
  }

  return (
    <AdminShell
      userEmail={user.email}
      pageTitle="Katalog Menu & Produk"
      badgeText="Katalog"
    >
      <MenuManager
        initialProducts={products}
        initialCategories={categories}
        availableAddons={addons}
      />
    </AdminShell>
  );
}
