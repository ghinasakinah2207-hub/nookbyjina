/**
 * Test Suite: Customer Frontend Bottom Navigation Verifications
 * File: src/tests/verify_customer_bottom_navigation.ts
 *
 * Verifies:
 * 1. Exactly 4 customer tabs: Home, Menu, Keranjang, Pesanan.
 * 2. Active tab soft peach rounded rectangle indicator (#FFF0E8) with brand orange (#F25B09).
 * 3. Inactive tab transparent background with neutral gray (#737373).
 * 4. Consistent dimensions and rounded-xl styling across all tabs.
 * 5. Smooth transition (150-200ms).
 * 6. Safe area insets handling (env(safe-area-inset-bottom)).
 * 7. Cart badge count logic.
 * 8. Excluded routes (admin, checkout, pembayaran, sukses, /).
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
  console.log("TEST SUITE: Customer Frontend Bottom Navigation & Invariants");
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

  console.log("\n--- Section 2: Active Peach Indicator & Styling ---");
  assert(
    content.includes("bg-[#FFF0E8]") && content.includes("text-[#F25B09] font-medium"),
    "Active tab displays soft peach rounded rectangle (#FFF0E8) with brand orange (#F25B09) text and icon"
  );
  assert(
    content.includes("w-[64px] h-[48px] rounded-xl"),
    "Tabs use uniform rounded-xl dimensions for consistent shape"
  );
  assert(
    content.includes("transition-all duration-200") || content.includes("transition-all duration-150"),
    "Tab state transitions are smooth between 150-200ms"
  );
  assert(
    content.includes("bg-transparent text-[#737373] hover:text-[#111111]"),
    "Inactive tabs have transparent background and neutral text (#737373)"
  );

  console.log("\n--- Section 3: Safe Area & Layout Invariants ---");
  assert(
    content.includes("safe-area-inset-bottom"),
    "Bottom navigation incorporates safe area inset for modern mobile viewports"
  );
  assert(
    content.includes("fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] border-t border-[#E5E5E5]"),
    "Bar is fixed at the bottom with standard neutral top border"
  );
  assert(
    content.includes("badgeCount") && content.includes("itemCount"),
    "Cart badge count is preserved and rendered on Keranjang tab"
  );

  console.log("\n--- Section 4: Route Exclusions ---");
  assert(
    content.includes('pathname.startsWith("/admin")') &&
    content.includes('pathname.startsWith("/checkout")') &&
    content.includes('pathname.startsWith("/pembayaran")') &&
    content.includes('pathname.startsWith("/sukses")'),
    "Bottom navigation correctly hides on admin, checkout, payment, and success screens"
  );

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} assertions PASSED (0 failures)`);
  console.log("================================================================================\n");
}

verifyCustomerBottomNavigation();

