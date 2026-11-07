/**
 * Automated Test Suite:
 * UI Refinement — Premium Floating Bottom Navigation (Nook by Jina)
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function run() {
  console.log("=== VERIFY PREMIUM FLOATING BOTTOM NAVIGATION REFINEMENTS ===\n");

  const { BottomNavigation } = await import(
    "@/components/layout/BottomNavigation"
  );
  const { CartProvider } = await import("@/context/CartContext");

  // -------------------------------------------------------------
  // Test 1: Static Source Code Invariants
  // -------------------------------------------------------------
  console.log("--- 1. Testing Source Code Structure & Invariants ---");

  const bottomNavPath = path.resolve(
    process.cwd(),
    "src/components/layout/BottomNavigation.tsx"
  );
  const bottomNavSrc = fs.readFileSync(bottomNavPath, "utf-8");

  // A. Compact sizing & font
  assert(
    bottomNavSrc.includes("text-[9px]"),
    "Label font size is slightly reduced to compact text-[9px]"
  );

  assert(
    bottomNavSrc.includes("h-[42px]") || bottomNavSrc.includes("h-[44px]"),
    "Main container height is reduced to 42-44px for a shorter, sleeker bar"
  );

  assert(
    bottomNavSrc.includes("p-1"),
    "Outer container uses thin uniform padding (p-1) creating consistent gap around active pill"
  );

  assert(
    bottomNavSrc.includes("safe-area-inset-bottom"),
    "Floating position and bottom safe area are strictly preserved"
  );

  assert(
    bottomNavSrc.includes("w-[18px] h-[18px]"),
    "Icon dimensions are balanced at 18px to prevent cramped vertical spacing"
  );

  // B. Active tab shape & gap
  assert(
    bottomNavSrc.includes("rounded-xl"),
    "Active shape uses rounded-xl proportional to the 42px tab bar height"
  );

  assert(
    bottomNavSrc.includes("from-[#F25B09]") && bottomNavSrc.includes("to-[#FF8A45]"),
    "Active tab preserves signature Nook orange gradient"
  );

  assert(
    bottomNavSrc.includes("transition-[transform,opacity]") &&
      bottomNavSrc.includes("cubic-bezier(0.22,1,0.36,1)"),
    "Sliding active shape transition is smooth with cubic-bezier easing"
  );

  // C. Cart Count Badge
  assert(
    !bottomNavSrc.includes("border-2 border-white") &&
      !bottomNavSrc.includes("border-white"),
    "Cart badge removes white stroke/outline completely"
  );

  assert(
    bottomNavSrc.includes("bg-[#F25B09]") &&
      bottomNavSrc.includes("bg-white text-[#F25B09]"),
    "Cart badge uses contrasting background (orange when inactive, white with orange text when active)"
  );

  assert(
    bottomNavSrc.includes("-top-1.5 -right-2.5"),
    "Cart badge is positioned at top-right corner to keep cart icon body visible"
  );

  // -------------------------------------------------------------
  // Test 2: Rendered HTML Markup
  // -------------------------------------------------------------
  console.log("\n--- 2. Testing Rendered Markup Output ---");

  const renderedHtml = ReactDOMServer.renderToString(
    <CartProvider>
      <PathnameContext.Provider value="/home">
        <BottomNavigation isRoot={true} />
      </PathnameContext.Provider>
    </CartProvider>
  );

  assert(
    renderedHtml.includes("Navigasi Utama Pelanggan"),
    "Rendered HTML includes customer navigation aria-label"
  );

  assert(
    renderedHtml.includes("fixed left-1/2 -translate-x-1/2"),
    "Rendered HTML applies floating centered pill layout"
  );

  assert(
    renderedHtml.includes("from-[#F25B09]") &&
      renderedHtml.includes("to-[#FF8A45]"),
    "Rendered HTML applies active orange gradient indicator"
  );

  console.log(
    "\n🎉 ALL PREMIUM BOTTOM NAVIGATION REFINEMENTS VERIFIED SUCCESSFULLY!\n"
  );
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
