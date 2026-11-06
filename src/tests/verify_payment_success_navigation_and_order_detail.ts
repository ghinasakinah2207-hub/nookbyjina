import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { formatRupiah } from "../data/dummy-data";
import { normalizeOrder } from "../lib/order-normalizer";
import { isValidTokenFormat } from "../lib/token-security";
import { Order } from "../types";

console.log("=== RUNNING PAYMENT SUCCESS NAVIGATION & ORDER DETAIL VERIFICATION ===");

// ============================================================================
// TEST 1: formatRupiah Resilience against undefined, null, NaN
// ============================================================================
console.log("\n[TEST 1] Verifying formatRupiah robustness...");

assert.strictEqual(formatRupiah(15000), "Rp15.000");
assert.strictEqual(formatRupiah(0), "Rp0");
assert.strictEqual(formatRupiah(undefined), "Rp0", "formatRupiah(undefined) must not throw and return Rp0");
assert.strictEqual(formatRupiah(null), "Rp0", "formatRupiah(null) must not throw and return Rp0");
assert.strictEqual(formatRupiah(NaN), "Rp0", "formatRupiah(NaN) must not throw and return Rp0");
assert.strictEqual(formatRupiah(-500), "Rp-500");

console.log("  ✓ [PASS] formatRupiah safely handles missing and invalid inputs without throwing.");

// ============================================================================
// TEST 2: Order Normalization & Automatic itemTotal Calculation
// ============================================================================
console.log("\n[TEST 2] Verifying itemTotal normalization from database snapshot...");

const rawSnapshotOrder = {
  id: "TJ-261106-001",
  orderNumber: "TJ-261106-001",
  customerName: "Budi",
  subtotal: 30000,
  delivery_fee: 5000,
  total: 35000,
  paymentMethod: "QRIS",
  paymentStatus: "Lunas",
  orderStatus: "Pesanan baru",
  items: [
    {
      id: "item-1",
      productId: "prod-1",
      productName: "Nasi Ayam Geprek",
      productType: "ready",
      unitPrice: 15000,
      quantity: 2,
      // NOTE: itemTotal is deliberately absent, simulating raw items_snapshot from database
    },
  ],
};

const normalized = normalizeOrder(rawSnapshotOrder as unknown as Order);

assert.strictEqual(normalized.items.length, 1);
assert.strictEqual(
  normalized.items[0].itemTotal,
  30000,
  "itemTotal must be dynamically derived as unitPrice * quantity (15000 * 2 = 30000)"
);
assert.strictEqual(normalized.items[0].productType, "ready");
assert.strictEqual(normalized.total, 35000);

console.log("  ✓ [PASS] normalizeOrder correctly calculates itemTotal for database snapshot items.");

// ============================================================================
// TEST 3: Code AST & Invariants in src/app/pesanan/[token]/page.tsx
// ============================================================================
console.log("\n[TEST 3] Auditing src/app/pesanan/[token]/page.tsx...");

const orderDetailPath = path.join(process.cwd(), "src/app/pesanan/[token]/page.tsx");
assert(fs.existsSync(orderDetailPath), "src/app/pesanan/[token]/page.tsx must exist");
const orderDetailCode = fs.readFileSync(orderDetailPath, "utf-8");

// Check defensive date handling
assert(
  orderDetailCode.includes("validDate"),
  "OrderDetailContent must defensively validate dateObj with validDate"
);

// Check fallback in item total formatting
assert(
  orderDetailCode.includes("item.itemTotal ??"),
  "Item rendering must include nullish coalescing fallback for itemTotal"
);

// Check Array.isArray check on order.items
assert(
  orderDetailCode.includes("Array.isArray(order.items)"),
  "order.items iteration must guard with Array.isArray(order.items)"
);

console.log("  ✓ [PASS] src/app/pesanan/[token]/page.tsx is fully protected against undefined itemTotal and dates.");

// ============================================================================
// TEST 4: Code AST & Invariants in src/app/pembayaran/[order]/page.tsx
// ============================================================================
console.log("\n[TEST 4] Auditing src/app/pembayaran/[order]/page.tsx...");

const paymentPath = path.join(process.cwd(), "src/app/pembayaran/[order]/page.tsx");
assert(fs.existsSync(paymentPath), "src/app/pembayaran/[order]/page.tsx must exist");
const paymentCode = fs.readFileSync(paymentPath, "utf-8");

// Check useSearchParams token resolution
assert(
  paymentCode.includes("useSearchParams"),
  "PaymentContent must use useSearchParams to retrieve query token"
);

// Check token validation against TJ- order ID
assert(
  paymentCode.includes("!queryToken.startsWith(\"TJ-\")") ||
  paymentCode.includes("!orderId.startsWith(\"TJ-\")"),
  "PaymentContent must strictly reject TJ- order IDs as secret tokens"
);

// Check Back button navigation handling
assert(
  paymentCode.includes("handleBackNavigation"),
  "PaymentContent must implement handleBackNavigation"
);
assert(
  paymentCode.includes("onBack={handleBackNavigation}"),
  "Header on payment page must accept onBack={handleBackNavigation}"
);

// Check popstate interception when paid
assert(
  paymentCode.includes("addEventListener(\"popstate\""),
  "PaymentContent must listen for popstate when order is paid"
);

// Check 'Lihat Detail Pesanan' button href and onClick
assert(
  paymentCode.includes("Lihat Detail Pesanan"),
  "PaymentContent must have 'Lihat Detail Pesanan' button"
);
assert(
  paymentCode.includes("router.push(`/pesanan/${encodeURIComponent(resolvedToken)}`)"),
  "Button or handler must navigate directly to /pesanan/[token]"
);

console.log("  ✓ [PASS] src/app/pembayaran/[order]/page.tsx enforces robust Back & Detail navigation.");

// ============================================================================
// TEST 5: Code AST in src/components/checkout/CheckoutClient.tsx
// ============================================================================
console.log("\n[TEST 5] Auditing src/components/checkout/CheckoutClient.tsx...");

const checkoutPath = path.join(process.cwd(), "src/components/checkout/CheckoutClient.tsx");
assert(fs.existsSync(checkoutPath), "src/components/checkout/CheckoutClient.tsx must exist");
const checkoutCode = fs.readFileSync(checkoutPath, "utf-8");

assert(
  checkoutCode.includes("/pembayaran/${encodeURIComponent(data.order.id)}?token="),
  "CheckoutClient must pass the secret order token as query parameter when routing to payment"
);

console.log("  ✓ [PASS] CheckoutClient preserves token in query parameter for seamless transition.");

// ============================================================================
// TEST 6: Token Format Invariants
// ============================================================================
console.log("\n[TEST 6] Validating token format rules...");

const validToken = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6";
const orderNumber = "TJ-261106-001";
const shortToken = "abc";

assert.strictEqual(isValidTokenFormat(validToken), true, "32-char token must be valid");
assert.strictEqual(isValidTokenFormat(shortToken), false, "Short token (<16 chars) must be invalid");
assert.strictEqual(isValidTokenFormat(orderNumber), false, "Order ID with hyphen length 13 must be invalid");

console.log("  ✓ [PASS] Token validation strictly prevents order numbers from masquerading as tokens.");

console.log("\n=== ALL PAYMENT SUCCESS & ORDER DETAIL TESTS PASSED! ===");
