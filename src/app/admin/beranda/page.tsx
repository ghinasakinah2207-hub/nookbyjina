import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { HomepageSectionManager } from "@/components/admin/HomepageSectionManager";
import { getAdminHomepageSections } from "@/lib/supabase/homepage-sections";
import { getAdminHomeBanners } from "@/lib/supabase/banners";
import {
  getActiveCategories,
  getVisibleProducts,
} from "@/lib/supabase/catalog";
import { CATEGORIES, PRODUCTS } from "@/data/dummy-data";
import { Category, Product, HomepageSection, Banner } from "@/types";

export const instant = false;

export default async function AdminHomepageSectionsPage() {
  const { user } = await requireAdminAuth();

  let sections: HomepageSection[] = [];
  let products: Product[] = [];
  let categories: Category[] = [];
  let banners: Banner[] = [];

  try {
    const [fetchedBanners, fetchedSections, fetchedProds, fetchedCats] =
      await Promise.all([
        getAdminHomeBanners(),
        getAdminHomepageSections(),
        getVisibleProducts(),
        getActiveCategories().catch(() => []),
      ]);

    banners = fetchedBanners;
    sections = fetchedSections;
    products = fetchedProds.length > 0 ? fetchedProds : PRODUCTS;
    categories = fetchedCats.length > 0 ? fetchedCats : CATEGORIES;
  } catch (err) {
    console.error("Error loading admin homepage sections data:", err);
    products = PRODUCTS;
    categories = CATEGORIES;
  }

  return (
    <AdminShell
      userEmail={user.email}
      pageTitle="Manajemen Seksi Beranda"
      pageDescription="Konfigurasi banner hero beranda, susunan seksi, visibilitas, dan penugasan produk etalase beranda pelanggan"
      badgeText="Etalase Toko"
    >
      <HomepageSectionManager
        initialSections={sections}
        catalogProducts={products}
        categories={categories}
        initialBanners={banners}
      />
    </AdminShell>
  );
}
