import { NextResponse } from "next/server";
import {
  getAdminHomepageSections,
  mapSectionsWithProducts,
  DEFAULT_FALLBACK_SECTIONS,
} from "@/lib/supabase/homepage-sections";
import { getPublicHomeBanners } from "@/lib/supabase/banners";
import { getVisibleProducts, getActiveCategories } from "@/lib/supabase/catalog";

export async function GET() {
  try {
    const [rawSections, catalogProducts, categories, banners] =
      await Promise.all([
        getAdminHomepageSections(),
        getVisibleProducts(),
        getActiveCategories().catch(() => []),
        getPublicHomeBanners().catch(() => []),
      ]);

    const activeSections = rawSections.filter((s) => s.isActive);

    const sectionsWithProducts =
      activeSections.length > 0
        ? mapSectionsWithProducts(activeSections, catalogProducts)
        : mapSectionsWithProducts(DEFAULT_FALLBACK_SECTIONS, catalogProducts);

    return NextResponse.json({
      success: true,
      sections: sectionsWithProducts,
      categories,
      banners: banners || [],
      products: catalogProducts,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memuat seksi beranda.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
