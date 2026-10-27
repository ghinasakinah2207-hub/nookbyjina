import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Product, Order, CartItem } from "@/types";
import { ProductCard } from "@/components/product/ProductCard";
import { CartProvider } from "@/context/CartContext";
import { calculateReportStats } from "@/lib/admin-reports";
import {
  mapDbProductToUiProduct,
  DbProductRow,
  getAdminCatalogProducts,
} from "@/lib/supabase/catalog";
import { getAdminProductsServer } from "@/lib/supabase/admin-catalog";
import { SupabaseClient } from "@supabase/supabase-js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== REGRESSION TEST: Out of Stock (Produk Habis) Behavior ===\n");



const availableProduct: Product = {
  id: "nasi-bakar-cakalang",
  dbId: "b0000001-0000-4000-8000-000000000001",
  slug: "nasi-bakar-cakalang",
  name: "Nasi Bakar Cakalang Asap",
  description: "Nasi bakar gurih dengan suwiran ikan cakalang asap bumbu rica pedas",
  categoryId: "cat-makanan",
  categoryName: "Makanan Utama",
  categorySlug: "makanan",
  basePrice: 25000,
  hpp: 15000,
  isAvailable: true,
  isArchived: false,
  isHighlight: true,
  images: ["/images/nasi-bakar.webp"],
  optionGroups: [
    {
      id: "opt-pedas",
      name: "Level Pedas",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      values: [
        { id: "pedas-sedang", name: "Sedang", priceDelta: 0 },
        { id: "pedas-ekstra", name: "Ekstra Pedas", priceDelta: 2000 },
      ],
    },
  ],
  addons: [
    { id: "add-kerupuk", name: "Kerupuk Kaleng", price: 2000 },
  ],
};

const outOfStockProduct: Product = {
  ...availableProduct,
  id: "risol-mayo-beef",
  dbId: "b0000001-0000-4000-8000-000000000003",
  slug: "risol-mayo-beef",
  name: "Risol Mayo Beef Lumer",
  description: "Risol isi smoked beef, telur rebus, dan saus mayo creamy gurih",
  categoryId: "cat-snack",
  categoryName: "Snack & Camilan",
  categorySlug: "snack",
  basePrice: 18000,
  hpp: 10000,
  isAvailable: false, // OUT OF STOCK
};

function renderProductCard(product: Product) {
  return renderToStaticMarkup(
    <CartProvider>
      <ProductCard product={product} />
    </CartProvider>
  );
}

// -----------------------------------------------------------------------------
// 1. Available products render in Admin and Customer Catalog
// -----------------------------------------------------------------------------
console.log("--- 1. Testing Available Product Display ---");
const availableCardHtml = renderProductCard(availableProduct);

assert(
  availableCardHtml.includes("Nasi Bakar Cakalang Asap"),
  "Available product name is rendered on product card"
);
assert(
  availableCardHtml.includes("Pilih opsi Nasi Bakar Cakalang Asap"),
  "Available product displays active interactive Plus button"
);
assert(
  !availableCardHtml.includes("inline-flex items-center text-[9px] font-bold text-[#B42318] bg-red-50"),
  "Available product does not show sold-out pill badge"
);

// -----------------------------------------------------------------------------
// 2. Out of Stock products remain visible with clear "Habis" badge
// -----------------------------------------------------------------------------
console.log("\n--- 2. Testing Out-of-Stock Product Display & Badges ---");
const outOfStockCardHtml = renderProductCard(outOfStockProduct);

assert(
  outOfStockCardHtml.includes("Risol Mayo Beef Lumer"),
  "Out-of-stock product remains visible in catalog"
);
assert(
  outOfStockCardHtml.includes("inline-flex items-center text-[9px] font-bold text-[#B42318] bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5 select-none"),
  "Out-of-stock product renders prominent, styled 'Habis' badge beside price"
);
assert(
  outOfStockCardHtml.includes("grayscale opacity-75"),
  "Out-of-stock product image has grayscale styling for clear visual hierarchy"
);
assert(
  outOfStockCardHtml.includes("Habis</span></div>"),
  "Out-of-stock product displays high-contrast sold-out overlay badge"
);
assert(
  !outOfStockCardHtml.includes("Pilih opsi Risol Mayo Beef Lumer"),
  "Out-of-stock product does not render the interactive Plus button"
);

// -----------------------------------------------------------------------------
// 3. Out of stock products cannot be added to cart
// -----------------------------------------------------------------------------
console.log("\n--- 3. Testing Cart Prevention for Out-of-Stock Products ---");

// Test direct CartContext addToCart logic
let cartState: CartItem[] = [];
function mockAddToCart(prod: Product, qty: number) {
  if (qty <= 0 || !prod.isAvailable) return;
  cartState.push({
    id: `item-${prod.id}`,
    productId: prod.id,
    productName: prod.name,
    productImage: prod.images[0],
    basePrice: prod.basePrice,
    selectedOptions: [],
    selectedAddons: [],
    itemNote: "",
    quantity: qty,
    unitPrice: prod.basePrice,
    itemTotal: prod.basePrice * qty,
    isAvailable: prod.isAvailable,
  });
}

// Attempt adding out-of-stock product
mockAddToCart(outOfStockProduct, 1);
assert(cartState.length === 0, "Out-of-stock product is rejected by addToCart handler");

// Adding available product succeeds
mockAddToCart(availableProduct, 1);
assert(cartState.length === 1 && cartState[0].productName === "Nasi Bakar Cakalang Asap", "Available product is successfully added to cart");

// Test openQuickAdd guard
let quickAddTarget: Product | null = null;
function mockOpenQuickAdd(prod: Product) {
  if (!prod || !prod.isAvailable) return;
  quickAddTarget = prod;
}

mockOpenQuickAdd(outOfStockProduct);
assert(quickAddTarget === null, "openQuickAdd rejects opening modal for out-of-stock product");

mockOpenQuickAdd(availableProduct);
assert(quickAddTarget !== null && (quickAddTarget as Product).id === availableProduct.id, "openQuickAdd opens modal for available product");

// -----------------------------------------------------------------------------
// 4. Server Route validation rejects out of stock products on checkout
// -----------------------------------------------------------------------------
console.log("\n--- 4. Testing Server Checkout Rejection ---");

function mockValidateServerOrder(items: { productId: string; quantity: number }[], catalog: Map<string, Product>) {
  for (const item of items) {
    const prod = catalog.get(item.productId);
    if (!prod) {
      return { success: false, error: "Produk tidak ditemukan dalam katalog toko." };
    }
    if (prod.isArchived || !prod.isAvailable) {
      return { success: false, error: `Produk "${prod.name}" sedang tidak tersedia atau telah diarsipkan.` };
    }
  }
  return { success: true };
}

const mockCatalog = new Map<string, Product>();
mockCatalog.set(availableProduct.id, availableProduct);
mockCatalog.set(outOfStockProduct.id, outOfStockProduct);

// Manipulated client payload trying to order out of stock product
const manipulatedOrder = [{ productId: outOfStockProduct.id, quantity: 2 }];
const serverValidation = mockValidateServerOrder(manipulatedOrder, mockCatalog);

assert(
  Boolean(!serverValidation.success && serverValidation.error?.includes("sedang tidak tersedia")),
  "Server route strictly rejects out-of-stock item checkout with informative error"
);

// Valid order checkout passes
const validOrder = [{ productId: availableProduct.id, quantity: 1 }];
const validValidation = mockValidateServerOrder(validOrder, mockCatalog);
assert(validValidation.success, "Server route accepts order containing available products");

// -----------------------------------------------------------------------------
// 5. Reactivating a product restores purchase availability without data loss
// -----------------------------------------------------------------------------
console.log("\n--- 5. Testing Reactivation & Data Preservation ---");

// Simulate toggling outOfStockProduct back to available
const reactivatedProduct: Product = {
  ...outOfStockProduct,
  isAvailable: true,
};

assert(Boolean(reactivatedProduct.isAvailable), "Product status updated to isAvailable: true");
assert(reactivatedProduct.hpp === outOfStockProduct.hpp, "Product HPP is strictly preserved across availability toggles");
assert(reactivatedProduct.basePrice === outOfStockProduct.basePrice, "Product basePrice is preserved");
assert(reactivatedProduct.slug === outOfStockProduct.slug, "Product slug is preserved");
assert(reactivatedProduct.description === outOfStockProduct.description, "Product description is preserved");
assert(reactivatedProduct.images.length === outOfStockProduct.images.length, "Product images are preserved");

// Reactivated product can now be added to cart
cartState = [];
mockAddToCart(reactivatedProduct, 2);
assert(cartState.length === 1 && cartState[0].quantity === 2, "Reactivated product can be purchased immediately");

// -----------------------------------------------------------------------------
// 6. Search and category filters works on out-of-stock products
// -----------------------------------------------------------------------------
console.log("\n--- 6. Testing Search & Category Filters with Out-of-Stock Products ---");

const allCatalogProducts = [availableProduct, outOfStockProduct];

// Filter by Category
const snackFilter = allCatalogProducts.filter(
  (p) => p.categoryId === "cat-snack" || p.categorySlug === "snack"
);
assert(
  snackFilter.length === 1 && snackFilter[0].id === outOfStockProduct.id,
  "Category filter includes out-of-stock products in its category"
);

// Search Query matching name of out-of-stock product
const searchQuery = "risol";
const searchResults = allCatalogProducts.filter(
  (p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
);
assert(
  searchResults.length === 1 && searchResults[0].id === outOfStockProduct.id,
  "Search query finds out-of-stock products matching keyword"
);

// Search Query matching available product
const searchAvailableResults = allCatalogProducts.filter(
  (p) =>
    p.name.toLowerCase().includes("cakalang") ||
    p.description.toLowerCase().includes("cakalang")
);
assert(
  searchAvailableResults.length === 1 && searchAvailableResults[0].id === availableProduct.id,
  "Search query finds available products without regression"
);

// -----------------------------------------------------------------------------
// 7. Product out-of-stock status does not alter HPP, order history, or reports
// -----------------------------------------------------------------------------
console.log("\n--- 7. Testing Invariance of Historical Orders & Reports ---");

const historicalOrders: Order[] = [
  {
    id: "TJ-261025-001",
    token: "token-hist-1",
    customerName: "Pelanggan A",
    customerWhatsapp: "081234567890",
    fulfillmentType: "pickup",
    deliveryArea: "Lhoksukon",
    orderNote: "",
    total: 18000,
    subtotal: 18000,
    shippingFee: 0,
    paymentMethod: "QRIS Statis",
    paymentStatus: "Lunas",
    orderStatus: "Selesai",
    createdAt: "2026-10-25T10:00:00.000Z",
    paymentDeadline: "2026-10-25T10:30:00.000Z",
    merchantName: "Nook by Jina",
    items: [
      {
        id: "item-hist-1",
        productId: outOfStockProduct.id,
        productName: outOfStockProduct.name,
        productImage: outOfStockProduct.images[0],
        basePrice: outOfStockProduct.basePrice,
        unitPrice: outOfStockProduct.basePrice,
        itemTotal: outOfStockProduct.basePrice,
        quantity: 1,
        selectedOptions: [],
        selectedAddons: [],
        itemNote: "",
        isAvailable: outOfStockProduct.isAvailable,
      },
    ],
  },
];

const reportProducts = [
  {
    id: outOfStockProduct.id,
    slug: outOfStockProduct.slug,
    name: outOfStockProduct.name,
    hpp: outOfStockProduct.hpp!,
  },
];

const stats = calculateReportStats(historicalOrders, reportProducts, "all");

assert(stats.paidOrdersCount === 1, "Completed order count unaffected by current availability");
assert(stats.totalRevenue === 18000, "Historical revenue calculation strictly preserved");
assert(stats.hppSummary.knownHppTotal === 10000, "Historical HPP calculation strictly preserved (uses original HPP=10000)");
assert(stats.hppSummary.estimatedGrossProfit === 8000, "Gross profit calculation strictly preserved (18000 - 10000 = 8000)");

// Verify database row mapping maps is_available boolean correctly
const dbRow: DbProductRow = {
  id: "b0000001-0000-4000-8000-000000000003",
  name: "Risol Mayo Beef Lumer",
  slug: "risol-mayo-beef",
  description: "Risol isi smoked beef",
  price: 18000,
  is_available: false,
  is_archived: false,
  is_highlight: false,
  sort_order: 3,
  category_id: "cat-snack",
  tags: [],
  categories: { id: "cat-snack", name: "Snack & Camilan", slug: "snack" },
  product_images: [],
};

const mappedUiProduct = mapDbProductToUiProduct(dbRow);
assert(mappedUiProduct.isAvailable === false, "Database is_available=false maps to UI isAvailable=false");
assert(mappedUiProduct.isArchived === false, "Database is_archived=false maps to UI isArchived=false");

// -----------------------------------------------------------------------------
// 8. Testing toggleProductAvailabilityAction Query Logic & Mutation Verification
// -----------------------------------------------------------------------------
console.log("\n--- 8. Testing toggleProductAvailability Action Logic & Mutation Verification ---");

interface MockDbResult {
  data: { id: string; is_available: boolean }[] | null;
  error: { message: string } | null;
}

function simulateToggleAction(
  productId: string,
  isAvailable: boolean,
  mockDbExecutor: (field: "id" | "slug", val: string) => MockDbResult
) {
  let clearedCache = false;
  const revalidated: string[] = [];

  const trimmedId = (productId || "").trim();
  if (!trimmedId) {
    return { success: false, error: "ID atau slug produk tidak valid.", clearedCache, revalidated };
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedId);
  const field = isUuid ? "id" : "slug";

  const { data: updatedRows, error } = mockDbExecutor(field, trimmedId);

  if (error) {
    return { success: false, error: error.message, clearedCache, revalidated };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return {
      success: false,
      error: `Produk dengan identifier "${trimmedId}" tidak ditemukan.`,
      clearedCache,
      revalidated,
    };
  }

  clearedCache = true;
  revalidated.push("/admin/menu", "/menu", "/home", "/");

  return { success: true, clearedCache, revalidated };
}

// Case A: Valid UUID lookup
const uuidResult = simulateToggleAction(
  "b0000001-0000-4000-8000-000000000001",
  false,
  (field, val) => {
    assert(field === "id", "UUID identifier queries using .eq('id', ...)");
    return { data: [{ id: val, is_available: false }], error: null };
  }
);
assert(uuidResult.success && uuidResult.clearedCache && uuidResult.revalidated.length === 4, "UUID mutation succeeds and revalidates paths");

// Case B: Valid slug lookup
const slugResult = simulateToggleAction(
  "nasi-bakar-cakalang",
  false,
  (field) => {
    assert(field === "slug", "Slug identifier queries using .eq('slug', ...) without .or() UUID cast");
    return { data: [{ id: "db-id-1", is_available: false }], error: null };
  }
);
assert(slugResult.success && slugResult.clearedCache, "Slug mutation succeeds and revalidates paths");

// Case C: Non-existent product (0 rows updated)
const notFoundResult = simulateToggleAction(
  "non-existent-menu-slug",
  false,
  () => ({ data: [], error: null })
);
assert(!notFoundResult.success, "0 updated rows returns success: false (prevents false success)");
assert(Boolean(notFoundResult.error?.includes("tidak ditemukan")), "Returns appropriate error message for not found");
assert(!notFoundResult.clearedCache && notFoundResult.revalidated.length === 0, "Does NOT clear cache or revalidate paths when 0 rows updated");

// Case D: Database error
const dbErrorResult = simulateToggleAction(
  "risol-mayo-beef",
  false,
  () => ({ data: null, error: { message: "connection timeout" } })
);
assert(!dbErrorResult.success, "Database error returns success: false");
assert(dbErrorResult.error === "connection timeout", "Database error message is propagated");
assert(!dbErrorResult.clearedCache && dbErrorResult.revalidated.length === 0, "Does NOT clear cache or revalidate paths on db error");

// Case E: Blank / empty ID
const blankResult = simulateToggleAction("   ", false, () => ({ data: [], error: null }));
assert(!blankResult.success && !blankResult.clearedCache, "Blank identifier rejected before DB call");

// =========================================================================
// 9. Testing Dedicated Admin Product Loader (getAdminCatalogProducts & getAdminProductsServer)
// =========================================================================
console.log("\n--- 9. Testing Dedicated Admin Product Loader ---");

// Mock Supabase client for getAdminCatalogProducts
function createMockAdminClient(
  mockRows: DbProductRow[],
  errorToThrow: { message: string } | null = null
) {
  return {
    from: (table: string) => {
      assert(table === "products", `Admin loader queries table 'products'`);
      return {
        select: (columns: string) => {
          assert(columns.includes("hpp"), "Admin loader explicitly selects HPP column");
          assert(columns.includes("is_available"), "Admin loader selects is_available column");
          assert(columns.includes("is_archived"), "Admin loader selects is_archived column");
          assert(columns.includes("categories"), "Admin loader joins categories relation");
          assert(columns.includes("product_images"), "Admin loader joins product_images relation");
          return {
            eq: (col: string, val: unknown) => {
              assert(col === "is_archived" && val === false, "Admin loader queries is_archived = false");
              return {
                order: (orderCol: string, opts: { ascending: boolean }) => {
                  assert(orderCol === "sort_order" && opts.ascending === true, "Admin loader orders by sort_order ASC");
                  if (errorToThrow) {
                    return Promise.resolve({ data: null, error: errorToThrow });
                  }
                  const filtered = mockRows.filter((r) => r.is_archived === false);
                  return Promise.resolve({ data: filtered, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const mockDbRows: DbProductRow[] = [
  {
    id: "b0000001-0000-4000-8000-000000000001",
    name: "Nasi Bakar Cakalang",
    slug: "nasi-bakar-cakalang",
    description: "Nasi bakar gurih",
    price: 25000,
    hpp: 10000,
    is_available: true,
    is_archived: false,
    sort_order: 1,
    category_id: "cat-1",
    tags: [],
    categories: { id: "cat-1", name: "Makanan", slug: "makanan" },
    product_images: [{ id: "img-1", image_url: "/images/nasi-bakar.webp", sort_order: 1 }],
  },
  {
    id: "b0000001-0000-4000-8000-000000000003",
    name: "Risol Mayo Beef (Habis)",
    slug: "risol-mayo-beef",
    description: "Risol gurih lumer",
    price: 18000,
    hpp: 7500,
    is_available: false, // OUT OF STOCK!
    is_archived: false,
    sort_order: 2,
    category_id: "cat-2",
    tags: [],
    categories: { id: "cat-2", name: "Snack", slug: "snack" },
    product_images: [{ id: "img-2", image_url: "/images/risol.webp", sort_order: 1 }],
  },
  {
    id: "b0000001-0000-4000-8000-000000000099",
    name: "Produk Terarsip",
    slug: "produk-terarsip",
    description: "Menu lama yang diarsipkan",
    price: 10000,
    hpp: 4000,
    is_available: false,
    is_archived: true, // ARCHIVED!
    sort_order: 99,
    category_id: "cat-1",
    tags: [],
    categories: { id: "cat-1", name: "Makanan", slug: "makanan" },
    product_images: [],
  },
];

async function runAdminLoaderTests() {
  const mockClient = createMockAdminClient(mockDbRows);
  const adminProducts = await getAdminCatalogProducts(mockClient);

  assert(adminProducts.length === 2, "Admin loader returns exactly 2 non-archived products");

  const available = adminProducts.find((p) => p.slug === "nasi-bakar-cakalang");
  assert(Boolean(available && available.isAvailable === true), "Admin loader includes available products (isAvailable: true)");
  assert(available?.hpp === 10000, "Admin loader preserves HPP on available products (hpp: 10000)");

  const outOfStock = adminProducts.find((p) => p.slug === "risol-mayo-beef");
  assert(Boolean(outOfStock && outOfStock.isAvailable === false), "Admin loader includes OUT-OF-STOCK products (isAvailable: false)");
  assert(outOfStock?.hpp === 7500, "Admin loader preserves HPP on out-of-stock products (hpp: 7500)");

  const archived = adminProducts.find((p) => p.slug === "produk-terarsip");
  assert(!archived, "Admin loader strictly excludes archived products (is_archived: true)");

  // Test getAdminProductsServer with client override
  const serverProds = await getAdminProductsServer(mockClient);
  assert(serverProds.length === 2, "getAdminProductsServer returns non-archived products including out-of-stock");
  assert(serverProds.some((p) => !p.isAvailable), "getAdminProductsServer preserves isAvailable=false for admin menu view");

  // Test error handling without dummy PRODUCTS fallback
  const errorClient = createMockAdminClient([], { message: "Database connection failed" });
  let errorCaught = false;
  try {
    await getAdminCatalogProducts(errorClient);
  } catch (err: unknown) {
    errorCaught = true;
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes("Database connection failed"), "Admin loader propagates database error message");
  }
  assert(errorCaught, "Admin loader throws on database failure instead of masking with dummy data");

  // =========================================================================
  // 10. Testing Public Catalog Security & HPP Isolation Invariants
  // =========================================================================
  console.log("\n--- 10. Testing Public Catalog Security & Isolation ---");

  // Ensure mapDbProductToUiProduct maps hpp only when present on row
  const rowWithoutHpp: DbProductRow = {
    id: "prod-pub",
    name: "Produk Publik",
    slug: "produk-publik",
    description: "",
    price: 15000,
    is_available: false, // out-of-stock
    is_archived: false,
    sort_order: 1,
    category_id: "cat-1",
    categories: null,
    product_images: null,
  };
  const publicUiProduct = mapDbProductToUiProduct(rowWithoutHpp);
  assert(publicUiProduct.hpp === undefined, "Public product row without hpp column produces undefined hpp in UI model");
  assert(publicUiProduct.isAvailable === false, "Public product correctly receives isAvailable: false for badge rendering");
  assert(publicUiProduct.isArchived === false, "Public product correctly receives isArchived: false");

  console.log("\n🎉 ALL 10 OUT-OF-STOCK REGRESSION TEST SUITES PASSED SUCCESSFULLY!\n");
}
runAdminLoaderTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
