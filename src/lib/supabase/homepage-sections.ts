import fs from "fs";
import path from "path";
import { supabase } from "./client";
import { getVisibleProducts } from "./catalog";
import { HomepageSection, HomepageSectionWithProducts, Product } from "@/types";

const DATA_FILE_PATH = path.join(
  process.cwd(),
  "src/data/homepage-sections-data.json"
);

/**
 * Fallback initial sections referencing real Supabase catalog products.
 * Used if storage file is missing or corrupted.
 */
export const DEFAULT_FALLBACK_SECTIONS: HomepageSection[] = [
  {
    id: "c0000001-0000-4000-8000-000000000001",
    title: "Menu Pilihan Pelanggan",
    subtitle: "Paling sering dipesan di Lhoksukon",
    isActive: true,
    sortOrder: 1,
    maxProducts: 6,
    viewAllUrl: "/menu",
    productIds: [
      "b0000001-0000-4000-8000-000000000001",
      "b0000001-0000-4000-8000-000000000002",
      "b0000001-0000-4000-8000-000000000003",
      "b0000001-0000-4000-8000-000000000004",
    ],
  },
  {
    id: "c0000001-0000-4000-8000-000000000002",
    title: "Makanan Utama",
    subtitle: "Olahan homemade gurih & mengenyangkan",
    isActive: true,
    sortOrder: 2,
    maxProducts: 6,
    viewAllUrl: "/menu",
    productIds: [
      "b0000001-0000-4000-8000-000000000001",
      "b0000001-0000-4000-8000-000000000002",
      "735ab03a-efa6-4136-b3dc-ad8fe764e1a0",
    ],
  },
  {
    id: "c0000001-0000-4000-8000-000000000003",
    title: "Snack & Camilan",
    subtitle: "Camilan renyah & lumer teman santai",
    isActive: true,
    sortOrder: 3,
    maxProducts: 6,
    viewAllUrl: "/menu",
    productIds: [
      "b0000001-0000-4000-8000-000000000003",
      "b0000001-0000-4000-8000-000000000004",
      "b0000001-0000-4000-8000-000000000005",
    ],
  },
  {
    id: "c0000001-0000-4000-8000-000000000004",
    title: "Minuman Segar",
    subtitle: "Kopi aren & minuman pelepas dahaga",
    isActive: true,
    sortOrder: 4,
    maxProducts: 6,
    viewAllUrl: "/menu",
    productIds: [
      "b0000001-0000-4000-8000-000000000006",
      "77b28184-3356-424a-aadd-c4f437c463b4",
    ],
  },
];

/**
 * Read sections directly from local persistent JSON store.
 */
export function readLocalSections(): HomepageSection[] {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const content = fs.readFileSync(DATA_FILE_PATH, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      }
    }
  } catch (err) {
    console.error("Error reading local homepage sections store:", err);
  }
  return DEFAULT_FALLBACK_SECTIONS;
}

/**
 * Write sections to local persistent JSON store.
 */
export function writeLocalSections(sections: HomepageSection[]): void {
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      DATA_FILE_PATH,
      JSON.stringify(sections, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.error("Error writing local homepage sections store:", err);
  }
}

/**
 * Server-side loader: Fetch all homepage sections (for admin management).
 * Tries Supabase first; if tables are not yet created, falls back to persistent local store.
 */
export async function getAdminHomepageSections(): Promise<HomepageSection[]> {
  try {
    const { data: dbSections, error: secError } = await supabase
      .from("homepage_sections")
      .select(`
        id,
        title,
        subtitle,
        is_active,
        sort_order,
        max_products,
        view_all_url,
        homepage_section_products (
          id,
          product_id,
          sort_order
        )
      `)
      .order("sort_order", { ascending: true });

    if (!secError && dbSections && Array.isArray(dbSections) && dbSections.length > 0) {
      return dbSections.map((sec) => {
        const rawProducts = (sec.homepage_section_products || []) as {
          id: string;
          product_id: string;
          sort_order: number;
        }[];

        const sortedProductIds = rawProducts
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((p) => p.product_id);

        return {
          id: sec.id,
          title: sec.title,
          subtitle: sec.subtitle,
          isActive: Boolean(sec.is_active),
          sortOrder: Number(sec.sort_order ?? 0),
          maxProducts: sec.max_products ? Number(sec.max_products) : null,
          viewAllUrl: sec.view_all_url || "/menu",
          productIds: sortedProductIds,
        };
      });
    }
  } catch {
    // Supabase table not present yet
  }

  // Fallback to local persistent store
  return readLocalSections();
}

/**
 * Maps raw homepage sections to full UI models with live Supabase products joined.
 * Respects maxProducts, removes archived products, and preserves unavailability state.
 */
export function mapSectionsWithProducts(
  sections: HomepageSection[],
  catalogProducts: Product[]
): HomepageSectionWithProducts[] {
  // Create quick lookup map by product id and slug
  const productMap = new Map<string, Product>();
  for (const prod of catalogProducts) {
    productMap.set(prod.id, prod);
    if (prod.dbId) {
      productMap.set(prod.dbId, prod);
    }
    if (prod.slug) {
      productMap.set(prod.slug, prod);
    }
  }

  return sections
    .filter((s) => s.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => {
      const resolvedProducts: Product[] = [];
      const seenProductIds = new Set<string>();

      for (const prodId of section.productIds || []) {
        const matched = productMap.get(prodId);
        // Exclude archived products and prevent duplicate display in same section
        if (matched && !matched.isArchived && !seenProductIds.has(matched.id)) {
          seenProductIds.add(matched.id);
          resolvedProducts.push(matched);
        }
      }

      const limit = section.maxProducts && section.maxProducts > 0
        ? section.maxProducts
        : resolvedProducts.length;

      return {
        id: section.id,
        title: section.title,
        subtitle: section.subtitle,
        isActive: section.isActive,
        sortOrder: section.sortOrder,
        maxProducts: section.maxProducts,
        viewAllUrl: section.viewAllUrl,
        products: resolvedProducts.slice(0, limit),
      };
    })
    .filter((sec) => sec.products.length > 0 || sec.title); // Keep section visible if configured
}

/**
 * Fetch public homepage sections with resolved Supabase products.
 * Never includes archived products.
 */
export async function getPublicHomepageSectionsWithProducts(): Promise<HomepageSectionWithProducts[]> {
  try {
    const [rawSections, catalogProducts] = await Promise.all([
      getAdminHomepageSections(),
      getVisibleProducts(),
    ]);

    const activeSections = rawSections.filter((s) => s.isActive);
    if (activeSections.length === 0) {
      // Safe fallback if all sections were disabled or empty
      return mapSectionsWithProducts(DEFAULT_FALLBACK_SECTIONS, catalogProducts);
    }

    return mapSectionsWithProducts(activeSections, catalogProducts);
  } catch (err) {
    console.error("Error fetching public homepage sections:", err);
    // Safe fallback so homepage never crashes
    try {
      const catalogProducts = await getVisibleProducts();
      return mapSectionsWithProducts(DEFAULT_FALLBACK_SECTIONS, catalogProducts);
    } catch {
      return [];
    }
  }
}
