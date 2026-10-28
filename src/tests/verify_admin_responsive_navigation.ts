/**
 * Test Suite: Admin Responsive Navigation Verifications
 * File: src/tests/verify_admin_responsive_navigation.ts
 *
 * Verifies:
 * 1. Mobile bottom tab bar structure with md:hidden.
 * 2. Exactly 5 tabs: Dasbor, Pesanan, Menu, QRIS, Lainnya.
 * 3. Active indicator color #F25B09.
 * 4. Queue badge count rendering logic.
 * 5. Lainnya bottom sheet containing Seksi Beranda, Laporan, Pengaturan, Logout.
 * 6. Desktop sidebar preservation (hidden md:flex md:w-64).
 * 7. Mobile content padding to prevent bottom bar overlap.
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

function verifyAdminResponsiveNavigation() {
  console.log("================================================================================");
  console.log("TEST SUITE: Admin Responsive Navigation & Layout Invariants");
  console.log("================================================================================\n");

  const filePath = path.resolve(process.cwd(), "src/components/admin/AdminShell.tsx");
  assert(fs.existsSync(filePath), "AdminShell.tsx exists at expected location");

  const content = fs.readFileSync(filePath, "utf-8");

  console.log("\n--- Section 1: Mobile Bottom Tab Bar (5 Tabs) ---");
  assert(
    content.includes("aria-label=\"Navigasi Utama Admin Mobile\""),
    "Mobile bottom navigation has proper accessible aria-label"
  );
  assert(
    content.includes("md:hidden") && content.includes("fixed bottom-0 left-0 right-0"),
    "Bottom navigation is fixed at bottom and scoped strictly to mobile viewport (md:hidden)"
  );
  assert(
    content.includes("safe-area-inset-bottom"),
    "Bottom navigation accounts for mobile safe area insets"
  );

  // Tab 1: Dasbor
  assert(
    content.includes('href="/admin"') && content.includes(">Dasbor<"),
    "Tab 1 (Dasbor) links to /admin with label 'Dasbor'"
  );
  assert(
    content.includes("LayoutDashboard"),
    "Tab 1 uses LayoutDashboard icon"
  );

  // Tab 2: Pesanan
  assert(
    content.includes('href="/admin/pesanan"') && content.includes(">Pesanan<"),
    "Tab 2 (Pesanan) links to /admin/pesanan with label 'Pesanan'"
  );
  assert(
    content.includes("ShoppingBag"),
    "Tab 2 uses ShoppingBag icon"
  );

  // Tab 3: Menu
  assert(
    content.includes('href="/admin/menu"') && content.includes(">Menu<"),
    "Tab 3 (Menu) links to /admin/menu with label 'Menu'"
  );
  assert(
    content.includes("UtensilsCrossed"),
    "Tab 3 uses UtensilsCrossed icon"
  );

  // Tab 4: QRIS
  assert(
    content.includes('href="/admin/pembayaran"') && content.includes(">QRIS<"),
    "Tab 4 (QRIS) links to /admin/pembayaran with label 'QRIS'"
  );
  assert(
    content.includes("QrCode"),
    "Tab 4 uses QrCode icon"
  );

  // Tab 5: Lainnya
  assert(
    content.includes(">Lainnya<") && content.includes("setMoreSheetOpen"),
    "Tab 5 (Lainnya) toggles bottom sheet"
  );
  assert(
    content.includes("MoreHorizontal"),
    "Tab 5 uses MoreHorizontal icon"
  );

  console.log("\n--- Section 2: Active Indicators & Queue Badges ---");
  assert(
    content.includes("text-[#F25B09] font-medium"),
    "Active tabs use Temu by Jina orange (#F25B09) and font-medium"
  );
  assert(
    content.includes("text-[#737373] hover:text-[#111111]"),
    "Inactive tabs use neutral muted text (#737373) with hover transition"
  );
  assert(
    content.includes("orderQueueCount > 0"),
    "Pesanan tab renders queue badge when pending orders exist"
  );
  assert(
    content.includes("qrisQueueCount > 0"),
    "QRIS tab renders queue badge when pending verifications exist"
  );

  console.log("\n--- Section 3: 'Lainnya' Bottom Sheet Modal ---");
  assert(
    content.includes('id="admin-more-sheet"') && content.includes('role="dialog"'),
    "Bottom sheet modal has proper dialog semantics and ID"
  );
  assert(
    content.includes('href="/admin/beranda"') && content.includes("Seksi Beranda"),
    "Bottom sheet includes Seksi Beranda navigation"
  );
  assert(
    content.includes('href="/admin/laporan"') && content.includes("Laporan Penjualan"),
    "Bottom sheet includes Laporan Penjualan navigation"
  );
  assert(
    content.includes('href="/admin/pengaturan"') && content.includes("Pengaturan Toko"),
    "Bottom sheet includes Pengaturan Toko navigation"
  );
  assert(
    content.includes("logoutAction") && content.includes("Keluar dari Dasbor"),
    "Bottom sheet includes secure Logout button calling logoutAction"
  );
  assert(
    content.includes("setMoreSheetOpen(false)"),
    "Bottom sheet items and backdrop safely close the sheet on interaction"
  );

  console.log("\n--- Section 4: Desktop Sidebar Invariants ---");
  assert(
    content.includes("hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0"),
    "Desktop sidebar layout is preserved intact with hidden md:flex md:w-64"
  );
  assert(
    content.includes("Menu Operasional") && content.includes("Analitik & Pengaturan"),
    "Desktop sidebar navigation sections remain intact"
  );

  console.log("\n--- Section 5: Mobile Viewport Bottom Padding ---");
  assert(
    content.includes("pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-6") ||
    content.includes("pb-24 md:pb-6"),
    "Main content container has mobile bottom padding to clear the fixed tab bar"
  );

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} assertions PASSED (0 failures)`);
  console.log("================================================================================\n");
}

verifyAdminResponsiveNavigation();

