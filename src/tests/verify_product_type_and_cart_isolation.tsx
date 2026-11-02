import assert from "assert";
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  normalizeProductType,
  getProductType,
  getProductTypeConfig,
  getCartProductType,
  canAddToCart,
} from "../lib/product-type";
import { Product, CartItem } from "../types";
import { normalizeOrder } from "../lib/order-normalizer";
import { ProductCard } from "../components/product/ProductCard";
import { CartProvider } from "../context/CartContext";

console.log("================================================================================");
console.log("TEST SUITE: Nook by Jina — Ready & Pre-Order Product Type Implementation");
console.log("================================================================================\n");

// -----------------------------------------------------------------------------
// SECTION 1: Product Type Data Model & Normalization
// -----------------------------------------------------------------------------
console.log("--- Section 1: Product Type Data Model & Normalization ---");

// 1.1 Legacy / Missing product type defaults to 'preorder'
assert.strictEqual(
  normalizeProductType(undefined),
  "preorder",
  "Undefined product type must default to 'preorder'"
);
assert.strictEqual(
  normalizeProductType(null),
  "preorder",
  "Null product type must default to 'preorder'"
);
assert.strictEqual(
  normalizeProductType(""),
  "preorder",
  "Empty string product type must default to 'preorder'"
);
assert.strictEqual(
  normalizeProductType("unknown_value"),
  "preorder",
  "Unrecognized product type must default to 'preorder'"
);

// 1.2 READY product type normalization
assert.strictEqual(
  normalizeProductType("ready"),
  "ready",
  "Lowercase 'ready' is recognized"
);
assert.strictEqual(
  normalizeProductType("READY"),
  "ready",
  "Uppercase 'READY' is normalized to 'ready'"
);
assert.strictEqual(
  normalizeProductType(" ready "),
  "ready",
  "Whitespace-padded ' ready ' is trimmed"
);

// 1.3 PRE-ORDER variants
assert.strictEqual(
  normalizeProductType("preorder"),
  "preorder",
  "'preorder' is recognized"
);
assert.strictEqual(
  normalizeProductType("PRE-ORDER"),
  "preorder",
  "'PRE-ORDER' is recognized"
);
assert.strictEqual(
  normalizeProductType("pre_order"),
  "preorder",
  "'pre_order' is recognized"
);

// 1.4 Helper extraction from objects
const mockLegacyProd: Product = {
  id: "legacy-prod",
  slug: "legacy-prod",
  name: "Nasi Bakar Legacy",
  description: "Desc",
  categoryId: "cat-1",
  categoryName: "Makanan",
  basePrice: 25000,
  isAvailable: true,
  images: ["/images/test.webp"],
  optionGroups: [],
  addons: [],
};
assert.strictEqual(
  getProductType(mockLegacyProd),
  "preorder",
  "Product without productType property defaults to 'preorder'"
);

const mockReadyProd: Product = {
  ...mockLegacyProd,
  id: "ready-prod",
  name: "Kopi Susu Ready",
  productType: "ready",
};
assert.strictEqual(
  getProductType(mockReadyProd),
  "ready",
  "Product with productType='ready' returns 'ready'"
);

// 1.5 Configuration and estimates
const readyCfg = getProductTypeConfig("ready");
assert.strictEqual(readyCfg.label, "READY");
assert.strictEqual(readyCfg.estimate, "15–20 menit");
assert.strictEqual(readyCfg.checkoutIndicator, "READY · Estimasi persiapan 15–20 menit");
assert(readyCfg.description.includes("siap diproses"));

const preorderCfg = getProductTypeConfig("preorder");
assert.strictEqual(preorderCfg.label, "PRE-ORDER");
assert.strictEqual(preorderCfg.estimate, "1 day");
assert.strictEqual(preorderCfg.checkoutIndicator, "PRE-ORDER · Estimasi persiapan 1 day");
assert(preorderCfg.description.includes("1 hari"));

console.log("  [PASS] Product Type data model, defaults, and estimates verified successfully");

// -----------------------------------------------------------------------------
// SECTION 2: Cart Single-Type Isolation Rules
// -----------------------------------------------------------------------------
console.log("\n--- Section 2: Cart Single-Type Isolation Rules ---");

const itemReady1: CartItem = {
  id: "r1",
  productId: "ready-1",
  productName: "Ready Item 1",
  productImage: "",
  basePrice: 15000,
  selectedOptions: [],
  selectedAddons: [],
  itemNote: "",
  quantity: 1,
  unitPrice: 15000,
  itemTotal: 15000,
  isAvailable: true,
  productType: "ready",
};

const itemReady2: CartItem = {
  id: "r2",
  productId: "ready-2",
  productName: "Ready Item 2",
  productImage: "",
  basePrice: 20000,
  selectedOptions: [],
  selectedAddons: [],
  itemNote: "",
  quantity: 2,
  unitPrice: 20000,
  itemTotal: 40000,
  isAvailable: true,
  productType: "ready",
};

const itemPreorder1: CartItem = {
  id: "po1",
  productId: "po-1",
  productName: "PO Item 1",
  productImage: "",
  basePrice: 25000,
  selectedOptions: [],
  selectedAddons: [],
  itemNote: "",
  quantity: 1,
  unitPrice: 25000,
  itemTotal: 25000,
  isAvailable: true,
  productType: "preorder",
};

const itemPreorder2: CartItem = {
  id: "po2",
  productId: "po-2",
  productName: "PO Item 2",
  productImage: "",
  basePrice: 30000,
  selectedOptions: [],
  selectedAddons: [],
  itemNote: "",
  quantity: 1,
  unitPrice: 30000,
  itemTotal: 30000,
  isAvailable: true,
  productType: "preorder",
};

// 2.1 Empty Cart
assert.strictEqual(getCartProductType([]), null, "Empty cart has null product type");
assert.strictEqual(canAddToCart([], itemReady1), true, "Empty cart allows adding READY product");
assert.strictEqual(canAddToCart([], itemPreorder1), true, "Empty cart allows adding PRE-ORDER product");

// 2.2 Same Type Combinations
assert.strictEqual(canAddToCart([itemReady1], itemReady2), true, "READY + READY is allowed");
assert.strictEqual(canAddToCart([itemPreorder1], itemPreorder2), true, "PRE-ORDER + PRE-ORDER is allowed");

// 2.3 Mixed Type Combinations are Blocked
assert.strictEqual(canAddToCart([itemReady1], itemPreorder1), false, "READY + PRE-ORDER is blocked");
assert.strictEqual(canAddToCart([itemPreorder1], itemReady1), false, "PRE-ORDER + READY is blocked");

console.log("  [PASS] Single-type cart combinations strictly validated (READY+READY allowed, PO+PO allowed, mixed blocked)");

// -----------------------------------------------------------------------------
// SECTION 3: Cart Context Architecture & Confirmation Logic
// -----------------------------------------------------------------------------
console.log("\n--- Section 3: Cart Context Integration Verification ---");

const cartContextSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/context/CartContext.tsx"),
  "utf-8"
);

assert(cartContextSrc.includes("pendingConflict"), "CartContext manages pendingConflict state");
assert(cartContextSrc.includes("Ganti Jenis Pesanan?"), "CartContext contains 'Ganti Jenis Pesanan?' dialog title");
assert(cartContextSrc.includes("Ganti Keranjang"), "CartContext contains 'Ganti Keranjang' action button");
assert(cartContextSrc.includes("Batal"), "CartContext contains 'Batal' action button");
assert(cartContextSrc.includes("cartProductType"), "CartContext exports cartProductType");
assert(cartContextSrc.includes("executeAddToCart"), "CartContext centralizes cart replacement execution");
assert(!cartContextSrc.includes("cart = []"), "Cart is never mutated directly without explicit action");

console.log("  [PASS] CartContext contains centralized conflict modal and single-type validation");

// -----------------------------------------------------------------------------
// SECTION 4: ProductCard & ProductDetailClient Rendering
// -----------------------------------------------------------------------------
console.log("\n--- Section 4: ProductCard & ProductDetail UI Badges ---");

// Static rendering of ProductCard for READY product
const markupReadyCard = renderToStaticMarkup(
  <CartProvider>
    <ProductCard product={mockReadyProd} />
  </CartProvider>
);
assert(markupReadyCard.includes("READY"), "ProductCard renders 'READY' badge");
assert(markupReadyCard.includes("15–20 menit"), "ProductCard displays '15–20 menit' for ready product");
assert(!markupReadyCard.includes(">nook<"), "Legacy nook badge is replaced");

// Static rendering of ProductCard for PRE-ORDER product
const markupPreorderCard = renderToStaticMarkup(
  <CartProvider>
    <ProductCard product={mockLegacyProd} />
  </CartProvider>
);
assert(markupPreorderCard.includes("PRE-ORDER"), "ProductCard renders 'PRE-ORDER' badge for legacy product");
assert(markupPreorderCard.includes("1 day"), "ProductCard displays '1 day' for preorder product");

// Check ProductDetailClient source
const productDetailSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/product/ProductDetailClient.tsx"),
  "utf-8"
);
assert(productDetailSrc.includes("getProductTypeConfig"), "ProductDetailClient uses getProductTypeConfig");
assert(productDetailSrc.includes("Estimasi persiapan:"), "ProductDetailClient displays fixed preparation estimate");
assert(!productDetailSrc.includes(">NOOK<"), "NOOK brand text in ProductDetailClient is replaced with product type badge");

console.log("  [PASS] ProductCard and ProductDetailClient render compact badges and fixed estimates");

// -----------------------------------------------------------------------------
// SECTION 5: Admin Add/Edit Product Modal Verification
// -----------------------------------------------------------------------------
console.log("\n--- Section 5: Admin Add/Edit Product Modal ---");

const addModalSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/admin/AddProductModal.tsx"),
  "utf-8"
);

assert(addModalSrc.includes("Tipe Produk"), "AddProductModal includes 'Tipe Produk' section");
assert(addModalSrc.includes("Produk siap diproses"), "AddProductModal describes READY option");
assert(addModalSrc.includes("15–20 menit"), "AddProductModal displays 15–20 menit estimate");
assert(addModalSrc.includes("Pesanan dipersiapkan dalam 1 hari"), "AddProductModal describes PRE-ORDER option");
assert(addModalSrc.includes("1 day"), "AddProductModal displays 1 day estimate");
assert(addModalSrc.includes("productType"), "AddProductModal sends productType in create and update payloads");

const adminActionsSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/app/admin/menu/actions.ts"),
  "utf-8"
);
assert(adminActionsSrc.includes("product_type: finalProductType"), "Admin actions persist product_type to database");
assert(adminActionsSrc.includes("normalizeProductType"), "Admin actions normalize productType input");

console.log("  [PASS] Admin product modal and server actions support READY and PRE-ORDER");

// -----------------------------------------------------------------------------
// SECTION 6: Checkout Preparation Indicator & Order Snapshot
// -----------------------------------------------------------------------------
console.log("\n--- Section 6: Checkout Indicator & Order Snapshot Stability ---");

const checkoutSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/checkout/CheckoutClient.tsx"),
  "utf-8"
);
assert(checkoutSrc.includes("checkoutTypeConfig"), "CheckoutClient calculates checkoutTypeConfig");
assert(checkoutSrc.includes("checkoutIndicator"), "CheckoutClient displays compact checkoutIndicator");

// Test order normalization with and without productType
const mockRawOrder: unknown = {
  id: "TJ-261102-001",
  orderStatus: "Pesanan baru",
  paymentStatus: "Menunggu Verifikasi",
  paymentMethod: "QRIS Statis",
  items: [
    {
      id: "it-1",
      productId: "prod-1",
      productName: "Nasi Bakar Cakalang",
      quantity: 1,
      unitPrice: 25000,
      itemTotal: 25000,
      // productType omitted (legacy order)
    },
    {
      id: "it-2",
      productId: "prod-2",
      productName: "Kopi Susu Ready",
      quantity: 1,
      unitPrice: 15000,
      itemTotal: 15000,
      productType: "ready",
    },
  ],
};

const normalizedOrder = normalizeOrder(mockRawOrder);
assert.strictEqual(
  normalizedOrder.items[0].productType,
  "preorder",
  "Historical order item without productType defaults to 'preorder'"
);
assert.strictEqual(
  normalizedOrder.items[1].productType,
  "ready",
  "Order item with productType='ready' is preserved intact"
);

console.log("  [PASS] Checkout preparation indicator and order item historical snapshots verified");

// -----------------------------------------------------------------------------
// SECTION 7: SQL Migration Verification
// -----------------------------------------------------------------------------
console.log("\n--- Section 7: SQL Migration File ---");

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20261102000000_add_product_type_to_products.sql"
);
assert(fs.existsSync(migrationPath), "Migration file exists");
const migrationContent = fs.readFileSync(migrationPath, "utf-8");
assert(migrationContent.includes("ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'preorder'"), "Adds product_type with default preorder");
assert(migrationContent.includes("CHECK (product_type IN ('ready', 'preorder'))"), "Enforces valid CHECK constraint");
assert(migrationContent.includes("UPDATE public.products"), "Backfills existing null values to preorder");

console.log("  [PASS] SQL migration correctly adds product_type with check constraint and backfill");

console.log("\n================================================================================");
console.log("ALL ASSERTIONS PASSED! Ready & Pre-Order Implementation Verified.");
console.log("================================================================================\n");
