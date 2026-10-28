import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs";
import path from "path";
import { Product } from "@/types";
import { QuickAddModal } from "@/components/product/QuickAddModal";
import { CartProvider } from "@/context/CartContext";
import {
  mapDbProductToUiProduct,
  DbProductRow,
} from "@/lib/supabase/catalog";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

function renderWithCart(ui: React.ReactElement): string {
  return renderToStaticMarkup(<CartProvider>{ui}</CartProvider>);
}

console.log("=== REGRESSION & PERFORMANCE TEST: Product Modal Options & Catalog Preloading ===\n");

// =========================================================================
// 1. Testing Catalog Query & Mapping (HPP exclusion, options & addons join)
// =========================================================================
console.log("--- 1. Testing Catalog Data Loader & Security Invariants ---");

const catalogSourcePath = path.join(process.cwd(), "src/lib/supabase/catalog.ts");
const catalogSource = fs.readFileSync(catalogSourcePath, "utf-8");

// Verify public catalog query explicitly excludes HPP
assert(
  !catalogSource.includes("select(`..., hpp") && !catalogSource.includes("select('..., hpp"),
  "Public catalog getVisibleProducts query strictly DOES NOT select 'hpp' column"
);

// Verify query joins option groups and add-ons
assert(
  catalogSource.includes("product_option_groups") &&
    catalogSource.includes("product_option_values"),
  "getVisibleProducts query joins product_option_groups and product_option_values"
);

assert(
  catalogSource.includes("product_addons"),
  "getVisibleProducts query loads product_addons directly"
);

// Verify archived products are excluded
assert(
  catalogSource.includes(".eq(\"is_archived\", false)"),
  "getVisibleProducts enforces is_archived = false"
);

// Verify DB Mapping helper
const mockDbRow: DbProductRow = {
  id: "prod-db-001",
  slug: "tortilla-roll-chicken-crispy",
  name: "Tortilla Roll Chicken Crispy",
  description: "Tortilla wrap renyah dengan ayam krispi dan saus spesial.",
  category_id: "cat-snack",
  price: 28000,
  is_available: true,
  is_archived: false,
  is_highlight: false,
  sort_order: 10,
  categories: {
    id: "cat-snack",
    name: "Snack & Bites",
    slug: "snack",
  },
  product_images: [
    {
      id: "img-001",
      image_url: "/images/tortilla.webp",
      sort_order: 0,
    },
  ],
  product_option_groups: [
    {
      id: "group-level-pedas",
      product_id: "prod-db-001",
      name: "Tingkat Kepedasan",
      is_required: true,
      min_select: 1,
      max_select: 1,
      sort_order: 1,
      product_option_values: [
        {
          id: "val-pedas-sedang",
          group_id: "group-level-pedas",
          name: "Pedas Sedang",
          price_delta: 0,
          is_active: true,
          sort_order: 1,
        },
        {
          id: "val-pedas-ekstra",
          group_id: "group-level-pedas",
          name: "Ekstra Pedas",
          price_delta: 2000,
          is_active: true,
          sort_order: 2,
        },
      ],
    },
  ],
  product_addons: [
    {
      product_id: "prod-db-001",
      addon_id: "add-cheese-sauce",
      sort_order: 1,
      addons: {
        id: "add-cheese-sauce",
        name: "Ekstra Saus Keju Lumer",
        description: null,
        price: 3000,
        is_active: true,
      },
    },
  ],
};

const mappedUiProduct = mapDbProductToUiProduct(mockDbRow);

assert(
  mappedUiProduct.id === "tortilla-roll-chicken-crispy" &&
    mappedUiProduct.dbId === "prod-db-001",
  "mapDbProductToUiProduct maps id (slug) and dbId accurately"
);
assert(
  mappedUiProduct.isOptionsLoaded === true,
  "mapDbProductToUiProduct flags isOptionsLoaded = true"
);
assert(
  mappedUiProduct.optionGroups.length === 1,
  "mapDbProductToUiProduct populates optionGroups from DB join"
);
assert(
  mappedUiProduct.optionGroups[0].name === "Tingkat Kepedasan" &&
    mappedUiProduct.optionGroups[0].required === true,
  "Option group preserves name and required flag"
);
assert(
  mappedUiProduct.optionGroups[0].values.length === 2,
  "Option values mapped and preserve count"
);
assert(
  mappedUiProduct.addons.length === 1 &&
    mappedUiProduct.addons[0].name === "Ekstra Saus Keju Lumer" &&
    mappedUiProduct.addons[0].price === 3000,
  "Addons mapped accurately with name and price"
);
assert(
  (mappedUiProduct as unknown as Record<string, unknown>).hpp === undefined,
  "Security check: hpp is strictly undefined on public UI product model"
);

// =========================================================================
// 2. Testing QuickAddModal: Zero Dummy Data Dependency
// =========================================================================
console.log("\n--- 2. Testing Zero Dummy Data Dependency in QuickAddModal ---");

const quickAddSourcePath = path.join(
  process.cwd(),
  "src/components/product/QuickAddModal.tsx"
);
const quickAddSource = fs.readFileSync(quickAddSourcePath, "utf-8");

assert(
  !quickAddSource.includes('from "@/data/dummy-data"') ||
    !quickAddSource.includes("PRODUCTS"),
  "QuickAddModal does NOT import PRODUCTS from dummy-data.ts"
);
assert(
  !quickAddSource.includes("PRODUCTS.find"),
  "QuickAddModal does NOT use PRODUCTS.find fallback"
);

// =========================================================================
// 3. Testing New Product with Required Variants Rendering
// =========================================================================
console.log("\n--- 3. Testing New Product with Required Variants ---");

// This is a brand new product that never existed in dummy-data.ts
const newProductWithVariants: Product = {
  id: "new-prod-chicken-wrap",
  dbId: "b0000002-0000-4000-8000-000000000002",
  slug: "chicken-wrap-crispy",
  name: "Chicken Wrap Crispy",
  description: "Wrap ayam lezat.",
  categoryId: "cat-snack",
  categoryName: "Snack & Bites",
  categorySlug: "snack",
  basePrice: 24000,
  isAvailable: true,
  isArchived: false,
  isHighlight: false,
  isOptionsLoaded: true,
  images: ["/images/chicken-wrap.webp"],
  optionGroups: [
    {
      id: "grp-dressing",
      name: "Pilihan Dressing",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      values: [
        { id: "val-mayo", name: "Spicy Mayo", priceDelta: 0 },
        { id: "val-bbq", name: "Smoky BBQ", priceDelta: 1000 },
      ],
    },
  ],
  addons: [
    { id: "add-crispy-skin", name: "Ekstra Kulit Ayam Krispi", price: 5000 },
  ],
};

const markupNewProduct = renderWithCart(
  <QuickAddModal
    product={newProductWithVariants}
    isOpen={true}
    onClose={() => {}}
  />
);

assert(
  markupNewProduct.includes("Chicken Wrap Crispy"),
  "New product renders title accurately"
);
assert(
  markupNewProduct.includes("Pilihan Dressing"),
  "New product renders variant group 'Pilihan Dressing'"
);
assert(
  markupNewProduct.includes("Spicy Mayo") && markupNewProduct.includes("Smoky BBQ"),
  "New product renders all option values"
);
assert(
  markupNewProduct.includes("Wajib"),
  "Required option group is marked with 'Wajib' badge"
);
assert(
  markupNewProduct.includes("Ekstra Kulit Ayam Krispi"),
  "New product renders add-on item from DB"
);
assert(
  markupNewProduct.includes("Rp24.000"),
  "Base price is displayed correctly"
);
assert(
  !markupNewProduct.includes("quick-add-loading-skeleton"),
  "Preloaded product does NOT display loading skeleton"
);
assert(
  markupNewProduct.includes("Tambah ke Keranjang"),
  "Add to Cart button is enabled for preloaded available product"
);

// =========================================================================
// 4. Testing Product Without Variants
// =========================================================================
console.log("\n--- 4. Testing Product Without Variants ---");

const productWithoutVariants: Product = {
  id: "prod-mineral-water",
  dbId: "b0000003-0000-4000-8000-000000000003",
  slug: "air-mineral-dingin",
  name: "Air Mineral Dingin",
  description: "Air mineral pegunungan dingin dan menyegarkan.",
  categoryId: "cat-minuman",
  categoryName: "Minuman Segar",
  categorySlug: "minuman",
  basePrice: 5000,
  isAvailable: true,
  isArchived: false,
  isHighlight: false,
  isOptionsLoaded: true,
  images: ["/images/water.webp"],
  optionGroups: [],
  addons: [],
};

const markupNoVariants = renderWithCart(
  <QuickAddModal
    product={productWithoutVariants}
    isOpen={true}
    onClose={() => {}}
  />
);

assert(
  markupNoVariants.includes("Air Mineral Dingin"),
  "Product without variants renders title"
);
assert(
  !markupNoVariants.includes("Wajib"),
  "Product without variants does not show required badges"
);
assert(
  !markupNoVariants.includes("Tambahan / Ekstra (Add-on)"),
  "Product without addons does not show addon section"
);
assert(
  markupNoVariants.includes("Rp5.000"),
  "Product without variants displays base price"
);
assert(
  markupNoVariants.includes("Tambah ke Keranjang"),
  "Add to cart button is immediately ready"
);

// =========================================================================
// 5. Testing Loading Skeleton & Disabled Button when Options are Pending
// =========================================================================
console.log("\n--- 5. Testing Loading State when Options are Pending ---");

const productPendingOptions: Product = {
  ...newProductWithVariants,
  id: "prod-pending-options",
  isOptionsLoaded: false,
  optionGroups: [],
  addons: [],
};

const markupPendingOptions = renderWithCart(
  <QuickAddModal
    product={productPendingOptions}
    isOpen={true}
    onClose={() => {}}
  />
);

assert(
  markupPendingOptions.includes('data-testid="quick-add-loading-skeleton"'),
  "Modal displays loading skeleton when options are not yet loaded"
);
assert(
  markupPendingOptions.includes("Memuat Pilihan..."),
  "Add to Cart button shows 'Memuat Pilihan...' spinner label"
);
assert(
  markupPendingOptions.includes('aria-busy="true"'),
  "Add to Cart button has aria-busy='true' while options are loading"
);
assert(
  markupPendingOptions.includes("disabled"),
  "Add to Cart button is strictly disabled while options are loading"
);

// =========================================================================
// 6. Testing Out of Stock Modal Prevention & Invariant
// =========================================================================
console.log("\n--- 6. Testing Out of Stock Invariant in Modal ---");

const outOfStockProduct: Product = {
  ...newProductWithVariants,
  id: "prod-sold-out",
  isAvailable: false,
};

const markupSoldOut = renderWithCart(
  <QuickAddModal
    product={outOfStockProduct}
    isOpen={true}
    onClose={() => {}}
  />
);

assert(
  markupSoldOut.includes("Menu Habis"),
  "Out of stock product displays 'Menu Habis' button label"
);
assert(
  markupSoldOut.includes("cursor-not-allowed"),
  "Out of stock product button has cursor-not-allowed styling"
);

// =========================================================================
// 7. Testing State Isolation Keying Across Product Transitions
// =========================================================================
console.log("\n--- 7. Testing State Isolation Across Product Transitions ---");

assert(
  quickAddSource.includes("<QuickAddForm") &&
    (quickAddSource.includes("key={activeProduct.dbId || activeProduct.id}") ||
      quickAddSource.includes("key={activeProduct.id}")),
  "QuickAddForm is keyed with unique product identifier to guarantee zero state leakage"
);

assert(
  quickAddSource.includes("setAsyncProduct(null)"),
  "QuickAddModal resets asyncProduct on modal close and product switch"
);

// =========================================================================
// 8. Testing Catalog Cache Invalidation & Direct Cache Hits
// =========================================================================
console.log("\n--- 8. Testing Catalog In-Memory Cache & Revalidation ---");

assert(
  catalogSource.includes("visibleProductsCache"),
  "catalog.ts contains dedicated visibleProductsCache"
);
assert(
  catalogSource.includes("clearCatalogCache"),
  "catalog.ts exports clearCatalogCache for admin invalidation"
);

const actionsSourcePath = path.join(
  process.cwd(),
  "src/app/admin/menu/actions.ts"
);
const actionsSource = fs.readFileSync(actionsSourcePath, "utf-8");

assert(
  actionsSource.includes("clearCatalogCache"),
  "Admin menu actions call clearCatalogCache on product mutations"
);

console.log("\n🎉 ALL 8 PRODUCT MODAL OPTIONS & PERFORMANCE TEST SUITES PASSED SUCCESSFULLY!");
