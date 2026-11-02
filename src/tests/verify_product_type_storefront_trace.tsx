import assert from "assert";
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  mapDbProductToUiProduct,
  DbProductRow,
} from "@/lib/supabase/catalog";
import {
  getProductType,
  getProductTypeConfig,
} from "@/lib/product-type";
import { ProductCard } from "@/components/product/ProductCard";
import { CartProvider } from "@/context/CartContext";

const PRODUCT_A = {
  id: "c588c623-3391-4150-bf4c-ac5e5fada576",
  name: "Nasi Ayam Geprek",
  slug: "nasi-ayam-geprek",
  product_type: "ready",
  is_available: true,
  is_archived: false,
  price: 22000,
  category_id: "cat-geprek",
  categories: { id: "cat-geprek", name: "Geprek", slug: "geprek" },
  product_images: [{ id: "img-1", image_url: "/images/hero-food.webp", sort_order: 0 }],
};

const PRODUCT_B = {
  id: "b47df29a-befe-4489-bf1b-11b577f28865",
  name: "Nasi Ayam Geprek + Es Teh Manis",
  slug: "nasi-ayam-geprek-es-teh-manis",
  product_type: "ready",
  is_available: true,
  is_archived: false,
  price: 25000,
  category_id: "cat-paket",
  categories: { id: "cat-paket", name: "Paket", slug: "paket" },
  product_images: [{ id: "img-2", image_url: "/images/hero-food.webp", sort_order: 0 }],
};

function runLayerByLayerTrace() {
  console.log("================================================================================");
  console.log("TEST SUITE: Product Type Trace & Verification for Verified Production Records");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // LAYER 1: Supabase Raw SELECT Query Verification (catalog.ts source inspection)
  // --------------------------------------------------------------------------
  console.log("--- Layer 1: Supabase Raw SELECT Query Invariant ---");
  const catalogSource = fs.readFileSync(
    path.join(process.cwd(), "src/lib/supabase/catalog.ts"),
    "utf-8"
  );

  // Check getVisibleProducts query contains product_type
  const getVisibleProductsMatch = catalogSource.match(
    /export async function getVisibleProducts[\s\S]*?\.from\("products"\)[\s\S]*?\.select\(`([\s\S]*?)`\)/
  );
  assert.ok(getVisibleProductsMatch, "getVisibleProducts query must be defined");
  assert.ok(
    getVisibleProductsMatch[1].includes("product_type"),
    "getVisibleProducts select clause MUST include 'product_type'"
  );

  // Check getAdminCatalogProducts query contains product_type
  const getAdminCatalogProductsMatch = catalogSource.match(
    /export async function getAdminCatalogProducts[\s\S]*?\.from\("products"\)[\s\S]*?\.select\(`([\s\S]*?)`\)/
  );
  assert.ok(getAdminCatalogProductsMatch, "getAdminCatalogProducts query must be defined");
  assert.ok(
    getAdminCatalogProductsMatch[1].includes("product_type"),
    "getAdminCatalogProducts select clause MUST include 'product_type'"
  );

  // Check getRecommendedProducts query contains product_type
  const getRecommendedProductsMatch = catalogSource.match(
    /export async function getRecommendedProducts[\s\S]*?\.from\("products"\)[\s\S]*?\.select\(`([\s\S]*?)`\)/
  );
  assert.ok(getRecommendedProductsMatch, "getRecommendedProducts query must be defined");
  assert.ok(
    getRecommendedProductsMatch[1].includes("product_type"),
    "getRecommendedProducts select clause MUST include 'product_type'"
  );

  // Check getProductBySlugOrId query contains product_type
  const getProductBySlugOrIdMatch = catalogSource.match(
    /export async function getProductBySlugOrId[\s\S]*?\.from\("products"\)[\s\S]*?\.select\(`([\s\S]*?)`\)/
  );
  assert.ok(getProductBySlugOrIdMatch, "getProductBySlugOrId query must be defined");
  assert.ok(
    getProductBySlugOrIdMatch[1].includes("product_type"),
    "getProductBySlugOrId select clause MUST include 'product_type'"
  );

  console.log("  [PASS] Layer 1: Supabase SELECT queries now include 'product_type' across all catalog entry points");

  // --------------------------------------------------------------------------
  // LAYER 2: Catalog Mapper Input & Output Verification (mapDbProductToUiProduct)
  // --------------------------------------------------------------------------
  console.log("\n--- Layer 2: Catalog Mapper Input & Output Trace ---");

  // Trace Product A
  const uiProductA = mapDbProductToUiProduct(PRODUCT_A as unknown as DbProductRow);
  console.log(`Product A (${PRODUCT_A.name}):`);
  console.log(`  Mapper Input (row.product_type): "${PRODUCT_A.product_type}"`);
  console.log(`  Mapper Output (product.productType): "${uiProductA.productType}"`);
  assert.strictEqual(uiProductA.productType, "ready", "Product A must map to productType 'ready'");

  // Trace Product B
  const uiProductB = mapDbProductToUiProduct(PRODUCT_B as unknown as DbProductRow);
  console.log(`Product B (${PRODUCT_B.name}):`);
  console.log(`  Mapper Input (row.product_type): "${PRODUCT_B.product_type}"`);
  console.log(`  Mapper Output (product.productType): "${uiProductB.productType}"`);
  assert.strictEqual(uiProductB.productType, "ready", "Product B must map to productType 'ready'");

  // Verify Bug Case: when row.product_type was undefined (prior to fix)
  const omittedRow: DbProductRow = {
    ...PRODUCT_A,
    product_type: undefined,
  } as unknown as DbProductRow;
  const omittedMapped = mapDbProductToUiProduct(omittedRow);
  console.log(`Previous Bug Case (when product_type was omitted from SELECT query):`);
  console.log(`  Input (row.product_type): undefined`);
  console.log(`  Output: "${omittedMapped.productType}" (demonstrates why it previously displayed PRE-ORDER)`);
  assert.strictEqual(omittedMapped.productType, "preorder");

  console.log("  [PASS] Layer 2: Mapper correctly retains 'ready' when supplied by Supabase query");

  // --------------------------------------------------------------------------
  // LAYER 3 & 4: UI Helper & Config Layer Trace
  // --------------------------------------------------------------------------
  console.log("\n--- Layer 3 & 4: Product Type Config & Badge Resolution ---");
  const configA = getProductTypeConfig(getProductType(uiProductA));
  assert.strictEqual(configA.type, "ready");
  assert.strictEqual(configA.label, "READY");
  assert.strictEqual(configA.estimate, "15–20 menit");

  const configB = getProductTypeConfig(getProductType(uiProductB));
  assert.strictEqual(configB.type, "ready");
  assert.strictEqual(configB.label, "READY");
  assert.strictEqual(configB.estimate, "15–20 menit");

  console.log("  [PASS] Layer 3 & 4: Helper & Config resolve badge to 'READY' and estimate to '15–20 menit'");

  // --------------------------------------------------------------------------
  // LAYER 5: ProductCard UI Badge Rendering
  // --------------------------------------------------------------------------
  console.log("\n--- Layer 5: ProductCard Component Rendering ---");
  const cardHtmlA = renderToStaticMarkup(
    <CartProvider>
      <ProductCard
        product={uiProductA}
      />
    </CartProvider>
  );
  assert.ok(cardHtmlA.includes("READY"), "ProductCard A must render 'READY' badge");
  assert.ok(!cardHtmlA.includes("PRE-ORDER"), "ProductCard A must NOT render 'PRE-ORDER' badge");

  const cardHtmlB = renderToStaticMarkup(
    <CartProvider>
      <ProductCard
        product={uiProductB}
      />
    </CartProvider>
  );
  assert.ok(cardHtmlB.includes("READY"), "ProductCard B must render 'READY' badge");
  assert.ok(!cardHtmlB.includes("PRE-ORDER"), "ProductCard B must NOT render 'PRE-ORDER' badge");

  console.log("  [PASS] Layer 5: Storefront ProductCard renders 'READY' badge");

  console.log("\n================================================================================");
  console.log("✓ ALL LAYERS VERIFIED! The root cause was isolated and fixed in Layer 1.");
  console.log("================================================================================");
}

runLayerByLayerTrace();
