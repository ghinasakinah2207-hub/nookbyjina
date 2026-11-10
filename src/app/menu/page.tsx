import React from "react";
import type { Metadata } from "next";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import { getActiveCategories, getVisibleProducts } from "@/lib/supabase/catalog";
import MenuClient from "@/components/menu/MenuClient";

export const instant = false;

export const metadata: Metadata = {
  title: "Daftar Menu Lengkap",
  description:
    "Daftar lengkap menu makanan, cemilan, dan minuman lezat dari Nook by Jina. Pesan online dengan praktis untuk pickup atau delivery di Lhoksukon.",
  alternates: {
    canonical: "https://nookbyjina.my.id/menu",
  },
  openGraph: {
    title: "Daftar Menu Lengkap | Nook by Jina",
    description:
      "Daftar lengkap menu makanan, cemilan, dan minuman lezat dari Nook by Jina. Pesan online dengan praktis untuk pickup atau delivery di Lhoksukon.",
    url: "https://nookbyjina.my.id/menu",
  },
};

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
