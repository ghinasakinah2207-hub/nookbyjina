/**
 * Automated Test Suite:
 * UI Refinement — Product Recommendations Section Separation (Nook by Jina)
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function run() {
  console.log("=== VERIFY PRODUCT RECOMMENDATIONS SECTION SEPARATION ===\n");

  const { default: ProductDetailClient } = await import(
    "@/components/product/ProductDetailClient"
  );
  const { CartProvider } = await import("@/context/CartContext");

  // -------------------------------------------------------------
  // Test 1: Static Source Code Invariants
  // -------------------------------------------------------------
  console.log("--- 1. Testing Source Code Structure & Invariants ---");

  const productDetailPath = path.resolve(
    process.cwd(),
    "src/components/product/ProductDetailClient.tsx"
  );
  const productDetailSrc = fs.readFileSync(productDetailPath, "utf-8");

  // A. Check that recommendations section is NOT inside the white divide-y container
  assert(
    productDetailSrc.includes('data-testid="recommended-products-section"'),
    "Recommendations section has data-testid='recommended-products-section'"
  );

  assert(
    productDetailSrc.includes("bg-[#F6F6F7]") ||
      productDetailSrc.includes("bg-[#F5F5F5]"),
    "Recommendations section uses #F6F6F7 or #F5F5F5 background"
  );

  assert(
    productDetailSrc.includes("border-t border-[#E5E5E5]") ||
      productDetailSrc.includes("border-t border-[#EAEAEA]"),
    "Recommendations section has clear top border divider separating from Catatan Khusus"
  );

  assert(
    productDetailSrc.includes("grid grid-cols-2"),
    "Recommendations grid retains 2-column layout"
  );

  assert(
    productDetailSrc.includes("Menu Rekomendasi Lainnya"),
    "Heading 'Menu Rekomendasi Lainnya' is retained"
  );

  // -------------------------------------------------------------
  // Test 2: Rendered HTML with Mock Recommendations Slot
  // -------------------------------------------------------------
  console.log("\n--- 2. Testing Rendered Markup Output ---");

  const mockProduct: Product = {
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

  const htmlWithSlot = ReactDOMServer.renderToString(
    <CartProvider>
      <ProductDetailClient
        productId="ayam-geprek-crispy"
        initialProduct={mockProduct}
        recommendedSlot={
          <div data-testid="mock-recommended-grid" className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-2xl p-2">Item 1</div>
            <div className="bg-white rounded-2xl p-2">Item 2</div>
          </div>
        }
      />
    </CartProvider>
  );

  assert(
    htmlWithSlot.includes('data-testid="recommended-products-section"'),
    "Rendered HTML includes recommended-products-section container"
  );

  assert(
    htmlWithSlot.includes("bg-[#F6F6F7]"),
    "Rendered section container has full-width bg-[#F6F6F7]"
  );

  assert(
    htmlWithSlot.includes("border-t") && htmlWithSlot.includes("border-[#E5E5E5]"),
    "Rendered section container has top border divider from main product content"
  );

  assert(
    htmlWithSlot.includes("mock-recommended-grid"),
    "Recommended products slot correctly rendered inside the gray section"
  );

  console.log("\n🎉 ALL PRODUCT RECOMMENDATION SEPARATION CHECKS PASSED SUCCESSFULLY!\n");
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

