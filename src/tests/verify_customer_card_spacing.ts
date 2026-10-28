/**
 * Test Suite: Customer Card Spacing Refinement Verification
 * File: src/tests/verify_customer_card_spacing.ts
 *
 * Verifies:
 * 1. External card spacing reduction (~23%) across customer pages.
 * 2. Keranjang: items list space-y-2 (was space-y-2.5), main space-y-2.5 (was space-y-3).
 * 3. Pesanan: orders list space-y-2 (was space-y-2.5), main space-y-2.5 (was space-y-3).
 * 4. Detail Pesanan: main card stack space-y-2.5 (was space-y-3).
 * 5. Checkout: form space-y-2.5 (was space-y-3), shipping options space-y-2 (was space-y-2.5).
 * 6. Pembayaran: main space-y-2 (was space-y-2.5).
 * 7. Sukses: main space-y-2.5 (was space-y-3).
 * 8. Internal card padding and layout properties are preserved without degradation.
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

function verifyCustomerCardSpacing() {
  console.log("================================================================================");
  console.log("TEST SUITE: Customer Card Spacing (~23% Reduction) Verifications");
  console.log("================================================================================\n");

  // 1. Keranjang
  console.log("--- Section 1: Keranjang (/keranjang) ---");
  const cartFile = path.resolve(process.cwd(), "src/components/cart/CartClient.tsx");
  assert(fs.existsSync(cartFile), "CartClient.tsx exists");
  const cartContent = fs.readFileSync(cartFile, "utf-8");
  assert(
    cartContent.includes('className="max-w-md mx-auto px-4 pt-4 space-y-2.5"'),
    "Keranjang: main container card stack uses space-y-2.5 (10px, reduced from 12px)"
  );
  assert(
    cartContent.includes('{/* Cart Items List */}\n            <div className="space-y-2">'),
    "Keranjang: cart item cards list uses space-y-2 (8px, reduced from 10px / 20% reduction)"
  );

  // 2. Pesanan
  console.log("\n--- Section 2: Pesanan (/pesanan) ---");
  const pesananFile = path.resolve(process.cwd(), "src/app/pesanan/page.tsx");
  assert(fs.existsSync(pesananFile), "pesanan/page.tsx exists");
  const pesananContent = fs.readFileSync(pesananFile, "utf-8");
  assert(
    pesananContent.includes('className="max-w-md mx-auto px-4 pt-4 space-y-2.5"'),
    "Pesanan: main container card stack uses space-y-2.5 (10px, reduced from 12px)"
  );
  assert(
    pesananContent.includes('<div className="space-y-2">'),
    "Pesanan: order cards list uses space-y-2 (8px, reduced from 10px / 20% reduction)"
  );

  // 3. Detail Pesanan
  console.log("\n--- Section 3: Detail Pesanan (/pesanan/[token]) ---");
  const detailFile = path.resolve(process.cwd(), "src/app/pesanan/[token]/page.tsx");
  assert(fs.existsSync(detailFile), "pesanan/[token]/page.tsx exists");
  const detailContent = fs.readFileSync(detailFile, "utf-8");
  assert(
    detailContent.includes('className="max-w-md mx-auto px-4 pt-4 space-y-2.5"'),
    "Detail Pesanan: main card stack uses space-y-2.5 (10px, reduced from 12px / 17% reduction)"
  );

  // 4. Checkout
  console.log("\n--- Section 4: Checkout (/checkout) ---");
  const checkoutFile = path.resolve(process.cwd(), "src/components/checkout/CheckoutClient.tsx");
  assert(fs.existsSync(checkoutFile), "CheckoutClient.tsx exists");
  const checkoutContent = fs.readFileSync(checkoutFile, "utf-8");
  assert(
    checkoutContent.includes('className="max-w-md mx-auto px-4 pt-3 space-y-2.5"'),
    "Checkout: main container uses space-y-2.5 (10px, reduced from 12px)"
  );
  assert(
    checkoutContent.includes('id="checkout-form" onSubmit={handleCreateOrder} className="space-y-2.5"'),
    "Checkout: form cards stack uses space-y-2.5 (10px, reduced from 12px)"
  );
  assert(
    checkoutContent.includes('role="radiogroup" aria-label="Opsi Pengiriman" className="space-y-2"'),
    "Checkout: shipping options cards list uses space-y-2 (8px, reduced from 10px / 20% reduction)"
  );

  // 5. Pembayaran QRIS
  console.log("\n--- Section 5: Pembayaran QRIS (/pembayaran/[order]) ---");
  const payFile = path.resolve(process.cwd(), "src/app/pembayaran/[order]/page.tsx");
  assert(fs.existsSync(payFile), "pembayaran/[order]/page.tsx exists");
  const payContent = fs.readFileSync(payFile, "utf-8");
  assert(
    payContent.includes('className="max-w-md mx-auto px-3 sm:px-4 pt-3.5 space-y-2"'),
    "Pembayaran: main card stack uses space-y-2 (8px, reduced from 10px / 20% reduction)"
  );
  assert(
    payContent.includes('/* Active Payment: 30-Minute Countdown & Subtle Pending Guidance */') &&
    payContent.includes('<div className="space-y-2">'),
    "Pembayaran: active countdown/guidance cards stack uses space-y-2 (8px, reduced from 10px)"
  );

  // 6. Sukses Pesanan
  console.log("\n--- Section 6: Sukses Pesanan (/sukses) ---");
  const suksesFile = path.resolve(process.cwd(), "src/app/sukses/page.tsx");
  assert(fs.existsSync(suksesFile), "sukses/page.tsx exists");
  const suksesContent = fs.readFileSync(suksesFile, "utf-8");
  assert(
    suksesContent.includes('className="max-w-md mx-auto px-4 pt-5 space-y-2.5"'),
    "Sukses: main card stack uses space-y-2.5 (10px, reduced from 12px)"
  );

  // 7. Detail Produk
  console.log("\n--- Section 7: Detail Produk (/produk/[id]) ---");
  const productFile = path.resolve(process.cwd(), "src/components/product/ProductDetailClient.tsx");
  assert(fs.existsSync(productFile), "ProductDetailClient.tsx exists");
  const productContent = fs.readFileSync(productFile, "utf-8");
  assert(
    productContent.includes('className="max-w-md mx-auto px-3.5 pt-3 space-y-2.5"'),
    "Detail Produk: main cards stack uses space-y-2.5 (10px, reduced from 12px)"
  );

  // 8. Internal Padding Invariance
  console.log("\n--- Section 8: Internal Card Padding Invariants ---");
  assert(
    cartContent.includes("p-3.5") || cartContent.includes("p-4"),
    "Cart card internal padding (p-3.5 / p-4) is preserved"
  );
  assert(
    pesananContent.includes("p-4"),
    "Pesanan card internal padding (p-4) is preserved"
  );
  assert(
    detailContent.includes("p-4"),
    "Detail pesanan card internal padding (p-4) is preserved"
  );
  assert(
    checkoutContent.includes("p-4"),
    "Checkout card internal padding (p-4) is preserved"
  );
  assert(
    payContent.includes("p-4"),
    "Pembayaran card internal padding (p-4) is preserved"
  );

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} assertions PASSED (0 failures)`);
  console.log("================================================================================\n");
}

verifyCustomerCardSpacing();
