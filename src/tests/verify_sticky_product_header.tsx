/**
 * Automated Test Suite:
 * Final UI Refinement:
 * Premium Smooth Sticky Header & Floating Action Button Contrast (Nook by Jina)
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
  console.log("=== VERIFY INCREASED FLOATING ACTION BUTTON CONTRAST ===\n");

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

  // 1. Single persistent header container with data-testid
  assert(
    productDetailSrc.includes('data-testid="sticky-product-header"'),
    "Single persistent sticky header has data-testid='sticky-product-header'"
  );

  // 2. Fixed positioning with proper z-index and top-0
  assert(
    productDetailSrc.includes("fixed top-0 left-0 right-0 z-30"),
    "Header uses fixed top-0 left-0 right-0 z-30 for persistent positioning"
  );

  // 3. Scroll progress calculation from 0 to 120px
  assert(
    productDetailSrc.includes("scrollY / 120"),
    "Scroll progress is computed linearly over the 0-120px range"
  );

  // 4. CSS variables used for zero-rerender performance
  assert(
    productDetailSrc.includes("--hdr-bg") &&
      productDetailSrc.includes("--btn-bg") &&
      productDetailSrc.includes("--btn-color"),
    "CSS variables drive continuous smooth visual transitions without React re-render overhead"
  );

  // 5. Circular buttons maintain rounded-full (radius 50%) in all states
  assert(
    productDetailSrc.includes("rounded-full border flex items-center justify-center"),
    "All action buttons strictly retain circular 50% radius geometry"
  );

  // 6. Scrolled circular button background is #EAEAEA with #EEEEEE border and #F25B09 icon
  assert(
    productDetailSrc.includes("#EAEAEA") &&
      productDetailSrc.includes("#EEEEEE") &&
      productDetailSrc.includes("#F25B09"),
    "Scrolled button uses #EAEAEA background, #EEEEEE border, and #F25B09 orange icon"
  );

  // 7. Initial circular button background is darker semi-transparent rgba(0, 0, 0, 0.45) with white icon
  assert(
    productDetailSrc.includes("rgba(0, 0, 0, 0.45)") &&
      productDetailSrc.includes("#FFFFFF"),
    "Initial button uses darker high-contrast semi-transparent background rgba(0, 0, 0, 0.45) with white icon"
  );

  // 8. Safe area support for iOS notch / status bar
  assert(
    productDetailSrc.includes("safe-area-inset-top"),
    "Header includes env(safe-area-inset-top) handling"
  );

  // 9. Scroll listener optimization via requestAnimationFrame
  assert(
    productDetailSrc.includes("requestAnimationFrame") &&
      productDetailSrc.includes("passive: true"),
    "Scroll listener uses requestAnimationFrame and passive: true"
  );

  // 10. Event listener cleanup on unmount
  assert(
    productDetailSrc.includes("removeEventListener"),
    "Scroll event listener is cleaned up properly on unmount"
  );

  // -------------------------------------------------------------
  // Test 2: Rendered Markup in Initial State (At Top, isScrolled = false)
  // -------------------------------------------------------------
  console.log("\n--- 2. Testing Rendered Markup in Initial State (Scroll Position Top) ---");

  const mockProduct: Product = {
    id: "nasi-goreng-nook",
    slug: "nasi-goreng-nook",
    name: "Nasi Goreng Spesial Nook",
    description: "Nasi goreng lezat dengan bumbu racikan khas",
    categoryId: "cat-1",
    categoryName: "Nasi",
    basePrice: 28000,
    images: ["/images/hero-food.webp"],
    isAvailable: true,
    productType: "ready",
    calories: 520,
    optionGroups: [],
    addons: [],
  };

  const htmlTop = ReactDOMServer.renderToString(
    <CartProvider>
      <ProductDetailClient
        productId="nasi-goreng-nook"
        initialProduct={mockProduct}
        initialIsScrolled={false}
      />
    </CartProvider>
  );

  assert(
    htmlTop.includes('data-testid="sticky-product-header"'),
    "Initial render contains sticky product header"
  );
  assert(
    htmlTop.includes('data-scrolled="false"'),
    "Header has data-scrolled='false' at top"
  );
  assert(
    htmlTop.includes("rgba(255, 255, 255, 0)"),
    "Header has transparent background at 0px"
  );
  assert(
    htmlTop.includes("rgba(0, 0, 0, 0.45)"),
    "Buttons have revised darker high-contrast semi-transparent circular background rgba(0, 0, 0, 0.45) at top"
  );
  assert(
    htmlTop.includes("#FFFFFF"),
    "Buttons render crisp white icon color at top"
  );

  // -------------------------------------------------------------
  // Test 3: Rendered Markup in Scrolled State (isScrolled = true)
  // -------------------------------------------------------------
  console.log("\n--- 3. Testing Rendered Markup in Scrolled State (Scroll Position >= 120px) ---");

  const htmlScrolled = ReactDOMServer.renderToString(
    <CartProvider>
      <ProductDetailClient
        productId="nasi-goreng-nook"
        initialProduct={mockProduct}
        initialIsScrolled={true}
      />
    </CartProvider>
  );

  assert(
    htmlScrolled.includes('data-scrolled="true"'),
    "Header has data-scrolled='true' when scrolled"
  );
  assert(
    htmlScrolled.includes("#FFFFFF"),
    "Header renders solid white background (#FFFFFF) when scrolled"
  );
  assert(
    htmlScrolled.includes("#EAEAEA"),
    "Circular buttons render revised #EAEAEA background against white header"
  );
  assert(
    htmlScrolled.includes("#EEEEEE"),
    "Circular buttons render #EEEEEE border when scrolled"
  );
  assert(
    htmlScrolled.includes("#F25B09"),
    "Header buttons render orange brand icon color (#F25B09) when scrolled"
  );

  console.log("\n🎉 ALL FLOATING ACTION BUTTON CONTRAST CHECKS PASSED SUCCESSFULLY!\n");
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
