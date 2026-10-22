import React from "react";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import { getPublicHomeBanners } from "@/lib/supabase/banners";
import {
  getAdminHomepageSections,
  mapSectionsWithProducts,
  DEFAULT_FALLBACK_SECTIONS,
} from "@/lib/supabase/homepage-sections";
import { getVisibleProducts, getActiveCategories } from "@/lib/supabase/catalog";
import { StoreClosedView } from "@/components/home/StoreClosedView";
import ShoppingHomeClient from "@/components/home/ShoppingHomeClient";

export const instant = false;

export default async function ShoppingHomePage() {
  const [storeSettings, banners, rawSections, catalogProducts, categories] =
    await Promise.all([
      getStoreSettings(),
      getPublicHomeBanners(),
      getAdminHomepageSections().catch(() => []),
      getVisibleProducts().catch(() => []),
      getActiveCategories().catch(() => []),
    ]);

  // If the store is marked as closed, render the dedicated StoreClosedView immediately
  if (!storeSettings.isOpen) {
    return <StoreClosedView storeSettings={storeSettings} />;
  }

  const activeSections = rawSections.filter((s) => s.isActive);
  const initialSections =
    activeSections.length > 0
      ? mapSectionsWithProducts(activeSections, catalogProducts)
      : mapSectionsWithProducts(DEFAULT_FALLBACK_SECTIONS, catalogProducts);

  // Normal open storefront experience with server-prepopulated catalog data
  return (
    <ShoppingHomeClient
      storeSettings={storeSettings}
      initialBanners={banners}
      initialSections={initialSections}
      initialCategories={categories}
      initialProducts={catalogProducts}
    />
  );
}
