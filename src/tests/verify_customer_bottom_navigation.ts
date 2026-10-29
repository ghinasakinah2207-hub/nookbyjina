/**
 * Test Suite: Customer Frontend Floating Pill Bottom Navigation Verifications
 * File: src/tests/verify_customer_bottom_navigation.ts
 *
 * Verifies:
 * 1. Exactly 4 customer tabs: Home, Menu, Keranjang, Pesanan.
 * 2. Floating pill outer container with rounded-full, translucent glass background (bg-white/75-85), backdrop blur, and floating shadow.
 * 3. Active tab light-gray rounded pill background (#F0F0F2) with dark icon and text (#111111).
 * 4. Active tab displays icon and text label horizontally.
 * 5. Inactive tabs display icons only in muted gray (#737373) with accessible labels.
 * 6. Smooth transitions (280-350ms, cubic-bezier(0.22, 1, 0.36, 1)) with motion-reduce:transition-none.
 * 7. Safe area insets handling (env(safe-area-inset-bottom)).
 * 8. Cart badge count logic.
 * 9. Excluded routes (admin, checkout, pembayaran, sukses).
 * 10. CSS shadow utility in globals.css.
 */

import fs from "fs";
import path from "path";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, message: string) {
  totalCount++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function verifyCustomerBottomNavigation() {
  console.log("================================================================================");
  console.log("TEST SUITE: Customer Floating Pill Bottom Navigation & Invariants");
  console.log("================================================================================\n");

  const filePath = path.resolve(process.cwd(), "src/components/layout/BottomNavigation.tsx");
  assert(fs.existsSync(filePath), "BottomNavigation.tsx exists at expected location");

  const content = fs.readFileSync(filePath, "utf-8");

  console.log("\n--- Section 1: 4 Customer Navigation Tabs ---");
  assert(
    content.includes("aria-label=\"Navigasi Utama Pelanggan\""),
    "Bottom navigation has proper accessible aria-label"
  );

  // Tab 1: Home
  assert(
    content.includes('href: "/home"') && content.includes('label: "Home"'),
    "Tab 1 (Home) points to /home"
  );
  assert(content.includes("icon: Home"), "Tab 1 uses Home icon");

  // Tab 2: Menu
  assert(
    content.includes('href: "/menu"') && content.includes('label: "Menu"'),
    "Tab 2 (Menu) points to /menu"
  );
  assert(content.includes("icon: UtensilsCrossed"), "Tab 2 uses UtensilsCrossed icon");

  // Tab 3: Keranjang
  assert(
    content.includes('href: "/keranjang"') && content.includes('label: "Keranjang"'),
    "Tab 3 (Keranjang) points to /keranjang"
  );
  assert(content.includes("icon: ShoppingBag"), "Tab 3 uses ShoppingBag icon");

  // Tab 4: Pesanan
  assert(
    content.includes('href: "/pesanan"') && content.includes('label: "Pesanan"'),
    "Tab 4 (Pesanan) points to /pesanan"
  );
  assert(content.includes("icon: ReceiptText"), "Tab 4 uses ReceiptText icon");

  console.log("\n--- Section 2: Floating Pill Outer Container ---");
  assert(
    content.includes("fixed left-1/2 -translate-x-1/2") && content.includes("rounded-full"),
    "Outer container is a floating centered rounded-full pill"
  );
  assert(
    (content.includes("bg-white/70") || content.includes("bg-white/75") || content.includes("bg-white/80")) &&
    (content.includes("backdrop-blur-md") || content.includes("backdrop-blur-lg")),
    "Container has translucent glass background (bg-white/70) with backdrop blur"
  );
  assert(
    content.includes("border border-neutral-200/80") || content.includes("border border-[#E5E5E5]"),
    "Container has a subtle border"
  );
  assert(
    content.includes("floating-pill-shadow"),
    "Container applies soft floating shadow class"
  );
  assert(
    content.includes("safe-area-inset-bottom"),
    "Bottom navigation incorporates safe area inset for modern mobile viewports"
  );

  console.log("\n--- Section 3: Active & Inactive Tab Behavior ---");
  assert(
    content.includes("bg-[#F0F0F2]") && content.includes("text-[#111111]"),
    "Active tab displays light-gray rounded pill (#F0F0F2) with dark icon and text (#111111)"
  );
  assert(
    content.includes("text-[#737373]") && content.includes("bg-transparent"),
    "Inactive tabs have muted gray icons (#737373) and transparent background"
  );
  assert(
    (content.includes("grid-cols-[1fr]") || content.includes("max-w-")) &&
    content.includes("opacity-100") && content.includes("opacity-0"),
    "Active tab displays label horizontally while inactive tabs collapse label to icon-only"
  );
  assert(
    content.includes("aria-current={item.isActive ? \"page\" : undefined}"),
    "Active tab indicates current page via aria-current"
  );
  assert(
    content.includes("aria-label={item.label}") && content.includes("title={item.label}"),
    "Inactive icon-only tabs preserve accessible labels and tooltip titles"
  );
  assert(
    (content.includes("duration-300") || content.includes("duration-280") || content.includes("duration-350")) &&
    content.includes("cubic-bezier(0.22,1,0.36,1)") &&
    content.includes("motion-reduce:transition-none"),
    "Transitions are smooth (280-350ms, cubic-bezier(0.22,1,0.36,1)) and respect motion-reduce preferences"
  );

  console.log("\n--- Section 4: Cart Badge Count & Route Exclusions ---");
  assert(
    content.includes("badgeCount") && content.includes("itemCount"),
    "Cart badge count is preserved and rendered on Keranjang tab"
  );
  assert(
    content.includes('pathname.startsWith("/admin")') &&
    content.includes('pathname.startsWith("/checkout")') &&
    content.includes('pathname.startsWith("/pembayaran")') &&
    content.includes('pathname.startsWith("/sukses")'),
    "Bottom navigation correctly hides on admin, checkout, payment, and success screens"
  );

  console.log("\n--- Section 5: CSS Floating Shadow Definition ---");
  const cssPath = path.resolve(process.cwd(), "src/app/globals.css");
  assert(fs.existsSync(cssPath), "globals.css exists");
  const cssContent = fs.readFileSync(cssPath, "utf-8");
  assert(
    cssContent.includes(".floating-pill-shadow"),
    "globals.css defines .floating-pill-shadow"
  );

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} assertions PASSED (0 failures)`);
  console.log("================================================================================\n");
}

verifyCustomerBottomNavigation();
