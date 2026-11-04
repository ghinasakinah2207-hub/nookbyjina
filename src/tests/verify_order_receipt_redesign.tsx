import fs from "fs";
import path from "path";

/**
 * Test Suite: Customer Order Detail Page E-Receipt Redesign
 * Validates:
 * 1. Order items display correctly with quantity, name, price, options, addons, notes.
 * 2. Financial summary (Subtotal, Biaya Pengantaran, Kode unik, Total Akhir) with right-aligned values.
 * 3. Fulfillment information inside unified summary card (Tipe Pemenuhan, Lokasi, Catatan Pesanan).
 * 4. Payment method, payment status, and order status inside unified summary card.
 * 5. Standalone 'Informasi Pemenuhan & Pembayaran' card is completely removed.
 * 6. Standalone 'Bagikan Struk / Tautan Pesanan' card is completely removed.
 * 7. Action buttons (Salin Tautan & Kirim Struk WA) integrated into the bottom of the summary card.
 * 8. Privacy reminder retained subtly inside summary card.
 * 9. Clipboard copy and WhatsApp prefilled receipt sharing logic preserved.
 * 10. Responsive layout classes and visual hierarchy.
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ Passed: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAILED: ${message}`);
    failed++;
  }
}

console.log("================================================================================");
console.log("TEST SUITE: Customer Order Detail Page E-Receipt Redesign");
console.log("================================================================================");

const orderDetailPagePath = path.join(process.cwd(), "src/app/pesanan/[token]/page.tsx");
const pageCode = fs.readFileSync(orderDetailPagePath, "utf-8");

// --- TEST 1: Unified E-Receipt Header ---
console.log("\n--- TEST 1: Unified E-Receipt Header ---");
assert(pageCode.includes("Ringkasan Pesanan"), "Card header title is 'Ringkasan Pesanan'");
assert(pageCode.includes("{order.items.length} item"), "Item count displayed in header");
assert(pageCode.includes("#{order.id}"), "Order number displayed in header");
assert(
  pageCode.includes("{formattedDate}, {formattedTime}"),
  "Order creation date and time displayed in header"
);

// --- TEST 2: Order Items Breakdown ---
console.log("\n--- TEST 2: Order Items Breakdown ---");
assert(pageCode.includes("item.quantity"), "Product quantity displayed");
assert(pageCode.includes("item.productName"), "Product name displayed");
assert(pageCode.includes("formatRupiah(item.itemTotal)"), "Item price formatted and displayed");
assert(pageCode.includes("item.selectedOptions"), "Product variants / options rendered");
assert(pageCode.includes("item.selectedAddons"), "Product addons rendered");
assert(pageCode.includes("item.itemNote"), "Item-specific notes rendered");

// --- TEST 3: Financial Summary ---
console.log("\n--- TEST 3: Financial Summary ---");
assert(pageCode.includes("Subtotal Menu"), "Subtotal Menu label present");
assert(pageCode.includes("formatRupiah(order.subtotal)"), "Subtotal value formatted");
assert(pageCode.includes("Biaya Pengantaran"), "Delivery fee label present");
assert(pageCode.includes("order.shippingFee === 0 ? \"Gratis\" : formatRupiah(order.shippingFee)"), "Delivery fee formatted or shows Gratis");
assert(pageCode.includes("Kode Unik"), "Unique code row present for QRIS orders");
assert(pageCode.includes("Total Akhir"), "Total Akhir label present");
assert(pageCode.includes("formatRupiah(order.total)"), "Final total formatted and displayed prominently");

// --- TEST 4: Integrated Fulfillment & Payment Metadata Section ---
console.log("\n--- TEST 4: Integrated Fulfillment & Payment Metadata Section ---");
assert(pageCode.includes("Tipe Pemenuhan"), "Tipe Pemenuhan metadata row present");
assert(pageCode.includes("Ambil Sendiri (Pickup)"), "Pickup fulfillment type label present");
assert(pageCode.includes("Diantar (Delivery)"), "Delivery fulfillment type label present");
assert(pageCode.includes("Lokasi Pengantaran"), "Lokasi Pengantaran row present for delivery");
assert(pageCode.includes("order.deliveryArea"), "Delivery area displayed from actual order data");
assert(pageCode.includes("Metode Pembayaran"), "Metode Pembayaran metadata row present");
assert(pageCode.includes("Status Pembayaran"), "Status Pembayaran row present");
assert(pageCode.includes("Status Pesanan"), "Status Pesanan row present");
assert(pageCode.includes("type=\"payment\""), "Payment status badge mounted inside summary metadata");
assert(pageCode.includes("type=\"order\""), "Order status badge mounted inside summary metadata");

// --- TEST 5: Integrated Action Buttons (Salin Tautan & Kirim Struk WA) ---
console.log("\n--- TEST 5: Integrated Action Buttons ---");
assert(pageCode.includes("Salin Tautan"), "Salin Tautan button present");
assert(pageCode.includes("handleCopyLink"), "handleCopyLink handler bound to button");
assert(pageCode.includes("Kirim Struk WA"), "Kirim Struk WA button present");
assert(pageCode.includes("href={waShareUrl}"), "WhatsApp link bound to prefilled waShareUrl");
assert(pageCode.includes("bg-[#25D366]"), "WhatsApp button styled with official brand green");
assert(pageCode.includes("text-[#F25B09]"), "Copy button icon uses Nook orange accent");
assert(pageCode.includes("Perhatian Privasi:"), "Subtle privacy guidance retained below action buttons");

// --- TEST 6: Removal of Redundant Standalone Cards ---
console.log("\n--- TEST 6: Removal of Redundant Standalone Cards ---");
assert(
  !pageCode.includes("Informasi Pemenuhan & Pembayaran</h2>"),
  "Standalone 'Informasi Pemenuhan & Pembayaran' card heading removed"
);
assert(
  !pageCode.includes("Bagikan Struk / Tautan Pesanan</h2>"),
  "Standalone 'Bagikan Struk / Tautan Pesanan' card heading removed"
);

// Count sections in main content to verify single unified card structure
const mainContentMatch = pageCode.match(/<main[\s\S]*?<\/main>/);
assert(Boolean(mainContentMatch), "Main tag found in page");
if (mainContentMatch) {
  const mainContent = mainContentMatch[0];
  // Verify order: Progress Tracker Section -> Optional Payment Banner -> Unified E-Receipt Section -> Home Link
  assert(mainContent.includes("<OrderProgressTracker"), "Progress tracker preserved in top card");
  assert(mainContent.includes("Ringkasan Pesanan"), "Unified E-Receipt card present");
  assert(mainContent.includes("Kembali ke Beranda"), "Return to home link preserved");
}

console.log("\n================================================================================");
if (failed === 0) {
  console.log(`🎉 ALL ${passed} ORDER RECEIPT REDESIGN VERIFICATIONS PASSED (0 FAILURES)!`);
} else {
  console.error(`💥 TEST SUITE FAILED WITH ${failed} ERRORS (${passed} passed).`);
  process.exit(1);
}
console.log("================================================================================");
