import { NextResponse } from "next/server";
import {
  getAdminHomepageSections,
  mapSectionsWithProducts,
  DEFAULT_FALLBACK_SECTIONS,
} from "@/lib/supabase/homepage-sections";
import { getVisibleProducts, getActiveCategories } from "@/lib/supabase/catalog";

export async function GET() {
  try {
    const [rawSections, catalogProducts, categories] = await Promise.all([
      getAdminHomepageSections(),
      getVisibleProducts(),
      getActiveCategories().catch(() => []),
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
