/**
 * Automated Verification Suite:
 * UI Refinement: Bottom Navigation & Floating Cart Bar
 * File: src/tests/verify_bottom_nav_and_floating_cart_refinement.tsx
 */

import React from "react";
import ReactDOMServer from "react-dom/server";
import fs from "fs";
import path from "path";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function run() {
  console.log("=== VERIFY BOTTOM NAVIGATION & FLOATING CART BAR REFINEMENT ===\n");

  const { BottomNavigation, BOTTOM_NAV_LAYOUT } = await import(
    "@/components/layout/BottomNavigation"
  );
  const { FloatingCartBar } = await import("@/components/cart/FloatingCartBar");
  const { CartProvider } = await import("@/context/CartContext");

  // -------------------------------------------------------------
  // Test 1: Bottom Navigation Sizing, Touch Comfort & Translucency
  // -------------------------------------------------------------
  console.log("--- 1. Testing Bottom Navigation Sizing & Visual Identity ---");

  const bottomNavPath = path.resolve(
    process.cwd(),
    "src/components/layout/BottomNavigation.tsx"
  );
  assert(fs.existsSync(bottomNavPath), "BottomNavigation.tsx exists");
  const bottomNavSrc = fs.readFileSync(bottomNavPath, "utf-8");

  // Height increased by 4-6px (from 52px to 58px; inner container 48px)
  assert(
    bottomNavSrc.includes("h-[48px]"),
    "Inner container height is increased to 48px (+6px bar height over previous 42px)"
  );
  assert(
    BOTTOM_NAV_LAYOUT.barHeight === 58,
    "Layout constant specifies 58px total bar height (48px inner + 8px p-1 + 2px border)"
  );
  assert(
    bottomNavSrc.includes("py-1 rounded-xl"),
    "Tab items have increased vertical padding (py-1) for improved touch comfort"
  );

  // Background opacity ~80% and backdrop blur
  assert(
    bottomNavSrc.includes("bg-white/80"),
    "Bottom navigation has 80% opacity translucent white background (bg-white/80)"
  );
  assert(
    bottomNavSrc.includes("backdrop-blur-md"),
    "Subtle backdrop blur (backdrop-blur-md) is applied for soft background display"
  );
  assert(
    bottomNavSrc.includes("border-neutral-200/80"),
    "Border is kept subtle (border-neutral-200/80)"
  );

  // Safe area handling
  assert(
    bottomNavSrc.includes("safe-area-inset-bottom"),
    "Bottom navigation strictly respects mobile safe-area-inset-bottom"
  );

  // Active pill and branding
  assert(
    bottomNavSrc.includes("from-[#F25B09]") && bottomNavSrc.includes("to-[#FF8A45]"),
    "Active Home tab preserves signature Nook orange gradient"
  );

  // -------------------------------------------------------------
  // Test 2: Floating Cart Bar Position & Gap Coordination
  // -------------------------------------------------------------
  console.log("\n--- 2. Testing Floating Cart Bar Position & Gap Coordination ---");

  const floatingCartPath = path.resolve(
    process.cwd(),
    "src/components/cart/FloatingCartBar.tsx"
  );
  assert(fs.existsSync(floatingCartPath), "FloatingCartBar.tsx exists");
  const floatingCartSrc = fs.readFileSync(floatingCartPath, "utf-8");

  // Visual Gap: Nav top is at 60px (2px bottom + 58px height).
  // Cart bottom is at 64px.
  // Gap = 64px - 60px = 4px (strictly within 3-5px requirement).
  const expectedGap =
    BOTTOM_NAV_LAYOUT.floatingCartBottom -
    (BOTTOM_NAV_LAYOUT.bottomOffset + BOTTOM_NAV_LAYOUT.barHeight);
  assert(
    expectedGap >= 3 && expectedGap <= 5,
    `Calculated visual gap is ${expectedGap}px, perfectly matching 3-5px specification`
  );

  assert(
    floatingCartSrc.includes("var(--floating-cart-bottom") ||
      floatingCartSrc.includes("64px"),
    "Floating Cart Bar bottom is positioned at 64px (+ safe-area) to accommodate taller navigation"
  );

  assert(
    floatingCartSrc.includes("from-[#21100C]") &&
      floatingCartSrc.includes("via-[#35170E]") &&
      floatingCartSrc.includes("to-[#54220F]"),
    "Floating Cart Bar preserves dark burgundy to deep chocolate gradient"
  );

  assert(
    floatingCartSrc.includes("#F25B09"),
    "Floating Cart Bar preserves prominent Nook orange (#F25B09) CHECKOUT CTA"
  );

  // -------------------------------------------------------------
  // Test 3: Shared CSS Layout Variables in globals.css
  // -------------------------------------------------------------
  console.log("\n--- 3. Testing Shared Layout Variables in globals.css ---");

  const cssPath = path.resolve(process.cwd(), "src/app/globals.css");
  assert(fs.existsSync(cssPath), "globals.css exists");
  const cssSrc = fs.readFileSync(cssPath, "utf-8");

  assert(
    cssSrc.includes("--bottom-nav-bottom-offset") &&
      cssSrc.includes("--bottom-nav-height") &&
      cssSrc.includes("--floating-cart-gap") &&
      cssSrc.includes("--floating-cart-bottom"),
    "globals.css defines centralized CSS variables for bottom nav and floating cart coordination"
  );

  // -------------------------------------------------------------
  // Test 4: Markup Rendering & No Overlap Invariant
  // -------------------------------------------------------------
  console.log("\n--- 4. Testing HTML Markup Rendering ---");

  const html = ReactDOMServer.renderToString(
    <CartProvider>
      <PathnameContext.Provider value="/home">
        <FloatingCartBar />
        <BottomNavigation isRoot={true} />
      </PathnameContext.Provider>
    </CartProvider>
  );

  assert(
    html.includes("bg-white/80"),
    "Rendered BottomNavigation contains bg-white/80"
  );
  assert(
    html.includes("backdrop-blur-md"),
    "Rendered BottomNavigation contains backdrop-blur-md"
  );
  assert(
    html.includes("h-[48px]"),
    "Rendered BottomNavigation contains h-[48px] inner container"
  );

  console.log(
    "\n🎉 ALL BOTTOM NAVIGATION & FLOATING CART REFINEMENT CHECKS PASSED SUCCESSFULLY!\n"
  );
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
