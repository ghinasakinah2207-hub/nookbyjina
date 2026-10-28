/**
 * Test Suite: Clean Card Outlines Verification
 * File: src/tests/verify_clean_card_outlines.ts
 *
 * Verifies:
 * 1. ProductCard outer border is removed (clean, borderless cards).
 * 2. Cart item cards and order note cards have no outer border.
 * 3. Checkout cards (5 cards) have no outer border.
 * 4. Pesanan list and detail cards have no outer border.
 * 5. Pembayaran QRIS cards have no outer border.
 * 6. Sukses pesanan cards have no outer border.
 * 7. Interactive inputs, buttons, selectors, and internal dividers retain their borders.
 * 8. Admin shell and layout remain untouched.
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

function verifyCleanCardOutlines() {
  console.log("================================================================================");
  console.log("TEST SUITE: Customer Clean Borderless Cards Verifications");
  console.log("================================================================================\n");

  // 1. ProductCard
  console.log("--- Section 1: ProductCard ---");
  const productCardFile = path.resolve(process.cwd(), "src/components/product/ProductCard.tsx");
  const productCardContent = fs.readFileSync(productCardFile, "utf-8");
  assert(
    !productCardContent.includes("border border-[#E5E5E5] rounded-2xl"),
    "ProductCard outer border is removed"
  );
  assert(
    productCardContent.includes("bg-[#FFFFFF] rounded-2xl overflow-hidden"),
    "ProductCard retains clean white background and rounded-2xl shape"
  );

  // 2. Keranjang
  console.log("\n--- Section 2: Keranjang (/keranjang) ---");
  const cartFile = path.resolve(process.cwd(), "src/components/cart/CartClient.tsx");
  const cartContent = fs.readFileSync(cartFile, "utf-8");
  assert(
    cartContent.includes("bg-white rounded-2xl p-3.5 space-y-3"),
    "Cart item cards have no outer border"
  );
  assert(
    cartContent.includes("bg-white rounded-2xl p-4 space-y-2"),
    "Cart general order note card has no outer border"
  );
  assert(
    cartContent.includes("border-t border-[#E5E5E5]"),
    "Cart internal dividers are preserved"
  );
  assert(
    cartContent.includes("border border-[#E5E5E5] rounded-xl"),
    "Cart note textarea retains input border for affordance"
  );

  // 3. Checkout
  console.log("\n--- Section 3: Checkout (/checkout) ---");
  const checkoutFile = path.resolve(process.cwd(), "src/components/checkout/CheckoutClient.tsx");
  const checkoutContent = fs.readFileSync(checkoutFile, "utf-8");
  assert(
    !checkoutContent.includes("bg-white border border-[#E5E5E5] rounded-2xl"),
    "Checkout section cards have no outer border"
  );
  assert(
    checkoutContent.includes("bg-white rounded-2xl p-4 space-y-3.5"),
    "Checkout customer info card uses clean bg-white rounded-2xl"
  );
  assert(
    checkoutContent.includes("border rounded-xl") && checkoutContent.includes("border-[#E5E5E5] focus:border-[#F25B09]"),
    "Checkout inputs retain input border for affordance"
  );

  // 4. Pesanan
  console.log("\n--- Section 4: Pesanan (/pesanan) ---");
  const pesananFile = path.resolve(process.cwd(), "src/app/pesanan/page.tsx");
  const pesananContent = fs.readFileSync(pesananFile, "utf-8");
  assert(
    pesananContent.includes("bg-white rounded-2xl p-4 space-y-3"),
    "Pesanan order cards have no outer border"
  );
  assert(
    pesananContent.includes("border-t border-[#E5E5E5]/60"),
    "Pesanan items summary internal divider is preserved"
  );

  // 5. Detail Pesanan
  console.log("\n--- Section 5: Detail Pesanan (/pesanan/[token]) ---");
  const detailFile = path.resolve(process.cwd(), "src/app/pesanan/[token]/page.tsx");
  const detailContent = fs.readFileSync(detailFile, "utf-8");
  assert(
    !detailContent.includes("bg-white border border-[#E5E5E5] rounded-2xl"),
    "Detail pesanan section cards have no outer border"
  );
  assert(
    detailContent.includes("bg-white rounded-2xl p-4 space-y-3"),
    "Detail pesanan sections use clean bg-white rounded-2xl"
  );

  // 6. Pembayaran QRIS
  console.log("\n--- Section 6: Pembayaran QRIS (/pembayaran/[order]) ---");
  const payFile = path.resolve(process.cwd(), "src/app/pembayaran/[order]/page.tsx");
  const payContent = fs.readFileSync(payFile, "utf-8");
  assert(
    payContent.includes("bg-white rounded-2xl p-4 sm:p-5 space-y-3.5"),
    "Order summary card has no outer border"
  );
  assert(
    payContent.includes("bg-white rounded-2xl p-3 sm:p-4 flex flex-col items-center"),
    "QR image card has no outer border"
  );
  assert(
    payContent.includes("bg-white rounded-2xl p-4 sm:p-5 text-xs text-[#737373] space-y-2"),
    "Payment instructions card has no outer border"
  );

  // 7. Sukses Pesanan
  console.log("\n--- Section 7: Sukses Pesanan (/sukses) ---");
  const suksesFile = path.resolve(process.cwd(), "src/app/sukses/page.tsx");
  const suksesContent = fs.readFileSync(suksesFile, "utf-8");
  assert(
    suksesContent.includes("bg-white rounded-2xl p-6 text-center space-y-3"),
    "Success icon card has no outer border"
  );
  assert(
    suksesContent.includes("bg-white rounded-2xl p-4 space-y-3"),
    "Share link box card has no outer border"
  );

  // 8. Admin Shell Untouched
  console.log("\n--- Section 8: Admin Shell Invariants ---");
  const adminFile = path.resolve(process.cwd(), "src/components/admin/AdminShell.tsx");
  const adminContent = fs.readFileSync(adminFile, "utf-8");
  assert(
    adminContent.includes("hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-[#E5E5E5]"),
    "Admin desktop sidebar is completely untouched"
  );

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} assertions PASSED (0 failures)`);
  console.log("================================================================================\n");
}

verifyCleanCardOutlines();
