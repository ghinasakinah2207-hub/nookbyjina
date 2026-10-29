/**
 * Test Suite: Customer Frontend Floating Pill Bottom Navigation Verifications (Restored Light Design)
 * File: src/tests/verify_customer_bottom_navigation.ts
 *
 * Verifies:
 * 1. Exactly 4 customer tabs: Home, Menu, Keranjang, Pesanan.
 * 2. Floating pill outer container with rounded-full, 60% translucent white background (bg-white/60), backdrop-blur-md, and floating shadow.
 * 3. Vertical icon-over-label layout for all tabs (all 4 labels always visible beneath icons).
 * 4. Active tab indicator uses softly rounded light-gray background (rounded-2xl bg-[#F0F0F2]) with dark text and icon (#111111).
 * 5. Inactive tabs display muted gray icons and labels (#737373) with accessible labels.
 * 6. Shared sliding active indicator gliding between tabs using CSS transforms (translateX, duration-350, cubic-bezier(0.22, 1, 0.36, 1)).
 * 7. Comfortable horizontal and vertical breathing room (px-3.5, mt-1 gap).
 * 8. Smooth transitions with motion-reduce:transition-none.
 * 9. Safe area insets handling (env(safe-area-inset-bottom)).
 * 10. Cart badge count logic without overlapping icon or label.
 * 11. Excluded routes (admin, checkout, pembayaran, sukses).
 * 12. CSS shadow utility in globals.css.
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
  console.log("TEST SUITE: Customer Floating Pill Bottom Navigation (Restored Light Design)");
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

  console.log("\n--- Section 2: Floating Pill Outer Container (Translucent White bg-white/60) ---");
  assert(
    content.includes("fixed left-1/2 -translate-x-1/2") && content.includes("rounded-full"),
    "Outer container is a floating centered rounded-full pill"
  );
  assert(
    content.includes("bg-white/60") && content.includes("backdrop-blur-md"),
    "Container has 60% opacity white background (bg-white/60) with backdrop-blur-md"
  );
  assert(
    content.includes("border border-neutral-200/80") || content.includes("border border-[#E5E5E5]"),
    "Container has a subtle neutral border"
  );
  assert(
    content.includes("floating-pill-shadow"),
    "Container applies soft floating shadow class"
  );
  assert(
    (content.includes("px-3.5") || content.includes("px-3") || content.includes("px-2.5")) && content.includes("py-1.5"),
    "Outer container has comfortable horizontal padding (px-3.5 or px-3) with py-1.5"
  );
  assert(
    content.includes("safe-area-inset-bottom"),
    "Bottom navigation incorporates safe area inset for modern mobile viewports"
  );

  console.log("\n--- Section 3: Vertical Icon-Over-Label Layout & Light Active Pill ---");
  assert(
    content.includes("flex-col items-center justify-center"),
    "Tabs use vertical icon-over-label layout for all tabs"
  );
  assert(
    (content.includes("translate3d") || content.includes("translateX")) &&
      (content.includes("currentIndex") || content.includes("activeIndex")),
    "Shared active indicator glides smoothly using hardware-accelerated CSS transform"
  );
  assert(
    content.includes("bg-[#F0F0F2]") && content.includes("rounded-2xl"),
    "Active tab indicator uses softly rounded light-gray pill background (rounded-2xl bg-[#F0F0F2])"
  );
  assert(
    content.includes("text-[#111111]"),
    "Active tab uses neutral dark icon and text (#111111)"
  );
  assert(
    content.includes("text-[#737373]"),
    "Inactive tabs use muted neutral gray (#737373)"
  );
  assert(
    content.includes("px-3.5") || content.includes("px-4"),
    "Tabs use comfortable horizontal padding (px-3.5 / px-4) for breathing room"
  );
  assert(
    content.includes("mt-1"),
    "Tabs maintain a balanced 4-6px gap (mt-1) between icon and label"
  );
  assert(
    content.includes('aria-current={isSelected ? "page" : undefined}') ||
      content.includes('aria-current={item.isActive ? "page" : undefined}'),
    "Active tab indicates current page via aria-current"
  );
  assert(
    content.includes("aria-label={item.label}") && content.includes("title={item.label}"),
    "Tabs preserve accessible labels and tooltip titles"
  );
  assert(
    (content.includes("duration-400") || content.includes("duration-350")) &&
    content.includes("cubic-bezier(0.22,1,0.36,1)") &&
    content.includes("motion-reduce:transition-none"),
    "Indicator glides smoothly (350-400ms, cubic-bezier(0.22,1,0.36,1)) and respects motion-reduce preferences"
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
    content.includes('pathname.startsWith("/sukses")') &&
    content.includes('pathname.startsWith("/produk")'),
    "Bottom navigation correctly hides on admin, checkout, payment, success, and product detail screens"
  );

  console.log("\n--- Section 5: CSS Floating Shadow Definition ---");
  const cssPath = path.resolve(process.cwd(), "src/app/globals.css");
  assert(fs.existsSync(cssPath), "globals.css exists");
  const cssContent = fs.readFileSync(cssPath, "utf-8");
  assert(
    cssContent.includes(".floating-pill-shadow"),
    "globals.css defines .floating-pill-shadow"
  );

  console.log("\n--- Section 6: Persistent Root Mounting & Lifecycle Stability ---");
  assert(
    content.includes("export const BottomNavContext = React.createContext") ||
      content.includes("export const BottomNavContext = createContext"),
    "BottomNavContext is exported for persistent root navigation lifecycle"
  );
  assert(
    content.includes("isRoot") && content.includes("isInsideRootNav"),
    "BottomNavigation prevents duplicate instances when mounted at root level"
  );

  const providerPath = path.resolve(process.cwd(), "src/context/AppProvider.tsx");
  assert(fs.existsSync(providerPath), "AppProvider.tsx exists");
  const providerContent = fs.readFileSync(providerPath, "utf-8");
  assert(
    providerContent.includes("<BottomNavigation isRoot />") &&
      providerContent.includes("BottomNavContext.Provider"),
    "AppProvider mounts persistent root BottomNavigation with BottomNavContext.Provider"
  );

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} assertions PASSED (0 failures)`);
  console.log("================================================================================\n");
}

verifyCustomerBottomNavigation();
