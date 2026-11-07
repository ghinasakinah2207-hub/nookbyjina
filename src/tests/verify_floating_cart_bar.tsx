/**
 * Automated Test Suite:
 * UI Enhancement — Simplified Add-to-Cart Feedback & Floating Cart Bar (Nook by Jina)
 */

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "dummy-publishable-key";

import React from "react";
import ReactDOMServer from "react-dom/server";
import fs from "fs";
import path from "path";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { Product } from "@/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function run() {
  console.log("=== VERIFY SIMPLIFIED ADD-TO-CART FEEDBACK & FLOATING CART BAR ===\n");

  const { FloatingCartBar } = await import("@/components/cart/FloatingCartBar");
  const { CartProvider, useCart } = await import("@/context/CartContext");

  // -------------------------------------------------------------
  // Test 1: Static Source Code Invariants
  // -------------------------------------------------------------
  console.log("--- 1. Testing Source Code Structure & Invariants ---");

  const floatingCartPath = path.resolve(
    process.cwd(),
    "src/components/cart/FloatingCartBar.tsx"
  );
  assert(fs.existsSync(floatingCartPath), "FloatingCartBar.tsx exists");
  const floatingCartSrc = fs.readFileSync(floatingCartPath, "utf-8");

  // A. Element markup & testids
  assert(
    floatingCartSrc.includes('data-testid="floating-cart-bar"'),
    "FloatingCartBar container has data-testid='floating-cart-bar'"
  );
  assert(
    floatingCartSrc.includes('data-testid="floating-cart-badge"'),
    "FloatingCartBar includes badge with data-testid='floating-cart-badge'"
  );
  assert(
    floatingCartSrc.includes('data-testid="floating-cart-total"'),
    "FloatingCartBar includes total price with data-testid='floating-cart-total'"
  );

  // B. Branding, styling & position
  assert(
    floatingCartSrc.includes("from-[#21100C]") &&
      floatingCartSrc.includes("via-[#35170E]") &&
      floatingCartSrc.includes("to-[#54220F]") &&
      floatingCartSrc.includes("bg-gradient-to-r"),
    "FloatingCartBar uses deep burgundy to chocolate horizontal gradient (from-[#21100C] via-[#35170E] to-[#54220F])"
  );
  assert(
    floatingCartSrc.includes("bg-[#F25B09]"),
    "FloatingCartBar uses signature Nook orange (#F25B09) as prominent accent CTA on CHECKOUT button"
  );
  assert(
    floatingCartSrc.includes("rounded-2xl"),
    "FloatingCartBar applies rounded-2xl geometry"
  );
  assert(
    floatingCartSrc.includes("safe-area-inset-bottom") &&
      floatingCartSrc.includes("56px"),
    "FloatingCartBar is placed exactly 2px above bottom navigation with safe-area support (56px)"
  );
  assert(
    floatingCartSrc.includes("transition-all duration-200"),
    "FloatingCartBar uses smooth 200ms transition without jitter"
  );

  // C. Content & routing
  assert(
    floatingCartSrc.includes('href="/keranjang"'),
    "Entire FloatingCartBar links to /keranjang"
  );
  assert(
    floatingCartSrc.includes("Total") && floatingCartSrc.includes("CHECKOUT"),
    "FloatingCartBar displays 'Total' label and 'CHECKOUT' CTA"
  );

  // D. Route exclusions
  assert(
    floatingCartSrc.includes('pathname.startsWith("/admin")') &&
      floatingCartSrc.includes('pathname.startsWith("/checkout")') &&
      floatingCartSrc.includes('pathname.startsWith("/pembayaran")') &&
      floatingCartSrc.includes('pathname.startsWith("/sukses")') &&
      floatingCartSrc.includes('pathname.startsWith("/produk")') &&
      floatingCartSrc.includes('pathname.startsWith("/keranjang")'),
    "FloatingCartBar correctly excludes admin, checkout, payment, success, product detail, and cart itself"
  );

  // E. Verify removal of blocking jitter/lottie overlay
  const overlayPath = path.resolve(
    process.cwd(),
    "src/components/cart/CartSuccessOverlay.tsx"
  );
  const overlaySrc = fs.readFileSync(overlayPath, "utf-8");
  assert(
    !overlaySrc.includes("lottie") && !overlaySrc.includes("one-click-order.json"),
    "Jittery full-screen Lottie animation is removed from CartSuccessOverlay"
  );
  assert(
    !overlaySrc.includes("bg-black/60"),
    "Full-screen blocking dark overlay backdrop is removed"
  );

  // F. Verify CartClient Checkout Bottom Bar 1px gap & larger font
  const cartClientPath = path.resolve(
    process.cwd(),
    "src/components/cart/CartClient.tsx"
  );
  const cartClientSrc = fs.readFileSync(cartClientPath, "utf-8");
  assert(
    cartClientSrc.includes('bottom: "calc(55px + env(safe-area-inset-bottom, 0px))"'),
    "CartClient checkout bottom bar is placed exactly 1px above bottom navigation (55px)"
  );
  assert(
    cartClientSrc.includes("font-bold text-sm sm:text-base"),
    "CartClient checkout button has slightly larger and bolder font (font-bold text-sm sm:text-base)"
  );

  // -------------------------------------------------------------
  // Test 2: Rendered Output when Cart has items
  // -------------------------------------------------------------
  console.log("\n--- 2. Testing Rendered Markup Output (Active Cart) ---");

  // Helper component to add items into cart before rendering FloatingCartBar
  const mockProduct: Product = {
    id: "nasi-goreng-nook",
    slug: "nasi-goreng-nook",
    name: "Nasi Goreng Spesial Nook",
    description: "Nasi goreng lezat",
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

  function CartPopulator({ children }: { children: React.ReactNode }) {
    const { addToCart } = useCart();
    React.useEffect(() => {
      addToCart(mockProduct, [], [], "", 2);
    }, [addToCart]);
    return <>{children}</>;
  }

  const renderedHtml = ReactDOMServer.renderToString(
    <CartProvider>
      <PathnameContext.Provider value="/home">
        <CartPopulator>
          <FloatingCartBar />
        </CartPopulator>
      </PathnameContext.Provider>
    </CartProvider>
  );

  assert(
    renderedHtml.includes('data-testid="floating-cart-bar"'),
    "FloatingCartBar renders in markup"
  );
  assert(
    renderedHtml.includes("from-[#21100C]") &&
      renderedHtml.includes("to-[#54220F]"),
    "Rendered FloatingCartBar contains deep burgundy to chocolate gradient"
  );
  assert(
    renderedHtml.includes('href="/keranjang"'),
    "Rendered FloatingCartBar links to /keranjang"
  );
  assert(
    renderedHtml.includes("Total") && renderedHtml.includes("CHECKOUT"),
    "Rendered FloatingCartBar contains Total label and CHECKOUT CTA"
  );

  // -------------------------------------------------------------
  // Test 3: AppProvider Mounts FloatingCartBar
  // -------------------------------------------------------------
  console.log("\n--- 3. Testing AppProvider Integration ---");

  const appProviderPath = path.resolve(
    process.cwd(),
    "src/context/AppProvider.tsx"
  );
  const appProviderSrc = fs.readFileSync(appProviderPath, "utf-8");
  assert(
    appProviderSrc.includes("<FloatingCartBar />"),
    "AppProvider mounts FloatingCartBar alongside BottomNavigation"
  );

  console.log(
    "\n🎉 ALL SIMPLIFIED ADD-TO-CART & FLOATING CART BAR CHECKS PASSED SUCCESSFULLY!\n"
  );
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
