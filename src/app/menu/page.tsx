import React from "react";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import { getActiveCategories, getVisibleProducts } from "@/lib/supabase/catalog";
import MenuClient from "@/components/menu/MenuClient";

export const instant = false;

export default async function MenuPage() {
  const [storeSettings, categories, products] = await Promise.all([
    getStoreSettings(),
    getActiveCategories().catch(() => []),
    getVisibleProducts().catch(() => []),
  ]);

  return (
    <MenuClient
      storeOpen={storeSettings.isOpen}
      initialCategories={categories}
      initialProducts={products}
    />
  );
}
