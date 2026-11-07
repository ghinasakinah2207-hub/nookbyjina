/**
 * Automated Test Suite:
 * Premium Gradient Price & Product Title Section (Nook by Jina)
 */

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "dummy-publishable-key";

import React from "react";
import ReactDOMServer from "react-dom/server";
import fs from "fs";
import path from "path";
import { Product } from "@/types";

async function run() {
  const { default: ProductDetailClient } = await import("@/components/product/ProductDetailClient");
  const { CartProvider } = await import("@/context/CartContext");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

const mockProductWithoutDiscount: Product = {
  id: "ayam-geprek-crispy",
  slug: "ayam-geprek-crispy",
  name: "Nasi Ayam Geprek Crispy",
  description: "Ayam geprek renyah pedas nikmat",
  categoryId: "cat-1",
  categoryName: "Ayam",
  basePrice: 20000,
  images: ["/images/ayam-geprek.webp"],
  isAvailable: true,
  productType: "ready",
  calories: 450,
  optionGroups: [],
  addons: [],
};

const mockProductWithDiscount: Product = {
  id: "nasi-bakar-promo",
  slug: "nasi-bakar-promo",
  name: "Nasi Bakar Cakalang Asap Special",
  description: "Nasi bakar gurih dengan ikan asap",
  categoryId: "cat-1",
  categoryName: "Nasi",
  basePrice: 20000,
  originalPrice: 25000,
  discountPercent: 20,
  images: ["/images/hero-food.webp"],
  isAvailable: true,
  productType: "preorder",
  calories: 520,
  optionGroups: [],
  addons: [],
};

console.log("=== VERIFY PREMIUM GRADIENT PRICE & TITLE SECTION ===\n");

// -------------------------------------------------------------
// Test 1: Source Code Audit
// -------------------------------------------------------------
console.log("--- 1. Testing Source Code Structure & Gradient Classes ---");

const productDetailSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/product/ProductDetailClient.tsx"),
  "utf8"
);

assert(
  productDetailSrc.includes("from-[#21100C]") &&
    productDetailSrc.includes("via-[#35170E]") &&
    productDetailSrc.includes("to-[#54220F]"),
  "ProductDetailClient includes dark horizontal gradient from #21100C via #35170E to #54220F"
);

assert(
  productDetailSrc.includes("bg-gradient-to-r"),
  "Gradient direction is horizontal (bg-gradient-to-r)"
);

assert(
  productDetailSrc.includes("data-testid=\"product-price-title-panel\""),
  "Unified panel has data-testid='product-price-title-panel'"
);

// Verify edge-to-edge full width and 0 radius (no rounded class on panel)
const panelMatch = productDetailSrc.match(/<section[^>]*data-testid="product-price-title-panel"[^>]*className="([^"]*)"/);
assert(panelMatch && panelMatch[1], "Found product-price-title-panel className");
const panelClass = panelMatch[1];
assert(panelClass.includes("w-full"), "Panel uses full width (w-full)");
assert(!panelClass.includes("rounded"), "Panel strictly has 0 border-radius (no rounded class on panel)");
assert(panelClass.includes("py-2") && panelClass.includes("px-3.5"), "Panel has compact vertical padding (py-2) and horizontal internal padding");
assert(!panelClass.includes("mx-"), "Panel has no horizontal margin");

assert(
  productDetailSrc.indexOf("data-testid=\"product-price-title-panel\"") <
    productDetailSrc.indexOf("data-testid=\"product-info-cards\""),
  "Gradient panel is placed before the compact info cards"
);

assert(
  productDetailSrc.includes("w-full bg-white divide-y divide-[#EAEAEA]"),
  "Content sections use full-width white container with hairline dividers"
);

assert(
  productDetailSrc.includes("border-r border-[#EAEAEA]"),
  "Info items have vertical hairline dividers between Rating, Estimasi, and Kalori"
);

assert(
  productDetailSrc.includes("min-h-screen bg-white pb-28"),
  "Product detail page background is solid white (#FFFFFF)"
);

assert(
  productDetailSrc.includes("text-white") && productDetailSrc.includes("text-2xl sm:text-3xl font-extrabold text-white"),
  "Price is rendered as the most dominant white text"
);

assert(
  productDetailSrc.includes("<h1 className=\"text-sm sm:text-base font-semibold text-white"),
  "Product title is rendered in white text with high contrast and compact leading"
);

assert(
  productDetailSrc.includes("line-through") && productDetailSrc.includes("text-white/60"),
  "Original price is rendered with strikethrough and subtle opacity"
);

assert(
  productDetailSrc.includes("data-testid=\"product-info-cards\""),
  "Three compact information cards remain intact outside the gradient panel"
);

// -------------------------------------------------------------
// Test 2: Rendered Output Without Discount
// -------------------------------------------------------------
console.log("\n--- 2. Testing Rendered Markup (Standard Product Without Discount) ---");

  const htmlNoDiscount = ReactDOMServer.renderToString(
    <CartProvider>
      <ProductDetailClient
        productId="ayam-geprek-crispy"
        initialProduct={mockProductWithoutDiscount}
      />
    </CartProvider>
  );

assert(
  htmlNoDiscount.includes("from-[#21100C]") &&
    htmlNoDiscount.includes("via-[#35170E]") &&
    htmlNoDiscount.includes("to-[#54220F]"),
  "Panel renders dark gradient background for standard product"
);

assert(
  htmlNoDiscount.includes("20.000"),
  "Panel displays formatted base price (20.000)"
);

assert(
  htmlNoDiscount.includes("Nasi Ayam Geprek Crispy"),
  "Panel renders product title in white"
);

assert(
  htmlNoDiscount.includes("READY"),
  "Panel renders READY ticket badge"
);

assert(
  !htmlNoDiscount.includes("line-through"),
  "Product without discount does NOT render strikethrough price"
);

// -------------------------------------------------------------
// Test 3: Rendered Output With Discount
// -------------------------------------------------------------
console.log("\n--- 3. Testing Rendered Markup (Product With Strikethrough Discount) ---");

  const htmlWithDiscount = ReactDOMServer.renderToString(
    <CartProvider>
      <ProductDetailClient
        productId="nasi-bakar-promo"
        initialProduct={mockProductWithDiscount}
      />
    </CartProvider>
  );

  assert(
    htmlWithDiscount.includes("20.000"),
    "Panel renders discounted active price (20.000)"
  );

  assert(
    htmlWithDiscount.includes("25.000") && htmlWithDiscount.includes("line-through"),
    "Panel renders strikethrough original price (25.000)"
  );

  assert(
    htmlWithDiscount.includes("-20%"),
    "Panel renders discount percentage badge (-20%)"
  );

  assert(
    htmlWithDiscount.includes("PRE-ORDER"),
    "Panel renders PRE-ORDER ticket badge"
  );

  assert(
    htmlWithDiscount.includes("product-info-cards") &&
      htmlWithDiscount.includes("Rating") &&
      htmlWithDiscount.includes("Estimasi") &&
      htmlWithDiscount.includes("Kalori"),
    "Three compact info cards remain rendered below gradient panel"
  );

  console.log("\n🎉 ALL 15 PREMIUM GRADIENT PANEL CHECKS PASSED SUCCESSFULLY!\n");
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
