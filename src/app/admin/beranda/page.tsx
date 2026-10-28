import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { HomepageSectionManager } from "@/components/admin/HomepageSectionManager";
import { getAdminHomepageSections } from "@/lib/supabase/homepage-sections";
import { getAdminHomeBanners } from "@/lib/supabase/banners";
import {
  getActiveCategories,
} from "@/lib/supabase/catalog";
import { getAdminProductsServer } from "@/lib/supabase/admin-catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CATEGORIES, PRODUCTS } from "@/data/dummy-data";
import { Category, Product, HomepageSection, Banner } from "@/types";

export default async function AdminHomepageSectionsPage() {
  await requireAdminAuth();
  const supabase = await createServerSupabaseClient();

  let sections: HomepageSection[] = [];
  let products: Product[] = [];
  let categories: Category[] = [];
  let banners: Banner[] = [];

  try {
    const [fetchedBanners, fetchedSections, fetchedProds, fetchedCats] =
      await Promise.all([
        getAdminHomeBanners(supabase),
        getAdminHomepageSections(),
        getAdminProductsServer(),
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
    <HomepageSectionManager
      initialSections={sections}
      catalogProducts={products}
      categories={categories}
      initialBanners={banners}
    />
  );
}
