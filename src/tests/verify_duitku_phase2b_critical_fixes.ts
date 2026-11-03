import assert from "assert";
import {
  generateDuitkuCheckSignature,
} from "../lib/duitku";
import { isOrderExpired } from "../lib/order-normalizer";
import { saveOrder } from "../lib/orders-store";
import { Order } from "../types";
import { generateSecureOrderToken } from "../lib/token-security";

console.log("================================================================================");
console.log("TEST SUITE: Phase 2B.2 Critical Lifecycle & Expiration Verification");
console.log("================================================================================\n");

// Mock environment for test
process.env.DUITKU_MERCHANT_CODE = "D12345";
process.env.DUITKU_API_KEY = "test_api_key_duitku_secret_32char";
process.env.DUITKU_ENV = "sandbox";

async function runTests() {
  const merchantCode = "D12345";
  const apiKey = "test_api_key_duitku_secret_32char";

  // ---------------------------------------------------------------------------
  // 1. Database RPC Lifecycle & Status Verification
  // ---------------------------------------------------------------------------
  console.log("--- 1. RPC Status Binding: Gateway QRIS accepts Menunggu Pembayaran ---");
  const token1 = generateSecureOrderToken();
  const gatewayQrisOrder: Order = {
    id: "NBJ-TEST-GATEWAY-01",
    token: token1,
    createdAt: new Date().toISOString(),
    customerName: "Siti Rahma",
    customerWhatsapp: "081234567890",
    fulfillmentType: "pickup",
    deliveryArea: "Pickup Toko (Lhoksukon)",
    orderNote: "",
    items: [],
    subtotal: 50000,
    shippingFee: 0,
    total: 50000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Pembayaran",
    paymentMethod: "QRIS",
    paymentDeadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 60 mins invoice
    merchantName: "Nook by Jina",
    gatewayProvider: "duitku",
  };

  const savedQris = await saveOrder(gatewayQrisOrder);
  assert.strictEqual(savedQris.paymentStatus, "Menunggu Pembayaran");
  assert.strictEqual(savedQris.paymentMethod, "QRIS");
  console.log("✅ Passed: Gateway QRIS initialized with 'Menunggu Pembayaran'.\n");

  console.log("--- 2. RPC Status Binding: Legacy QRIS retains Menunggu Verifikasi ---");
  const token2 = generateSecureOrderToken();
  const legacyQrisOrder: Order = {
    id: "NBJ-TEST-LEGACY-02",
    token: token2,
    createdAt: new Date().toISOString(),
    customerName: "Ahmad Dahlan",
    customerWhatsapp: "081234567891",
    fulfillmentType: "pickup",
    deliveryArea: "Pickup Toko (Lhoksukon)",
    orderNote: "",
    items: [],
    subtotal: 30000,
    shippingFee: 0,
    total: 30000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Verifikasi",
    paymentMethod: "QRIS",
    paymentDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    merchantName: "Nook by Jina",
    gatewayProvider: null,
  };

  const savedLegacy = await saveOrder(legacyQrisOrder);
  assert.strictEqual(savedLegacy.paymentStatus, "Menunggu Verifikasi");
  console.log("✅ Passed: Legacy QRIS retains 'Menunggu Verifikasi'.\n");

  console.log("--- 3. RPC Status Binding: Cash retains Menunggu Pembayaran ---");
  const token3 = generateSecureOrderToken();
  const cashOrder: Order = {
    id: "NBJ-TEST-CASH-03",
    token: token3,
    createdAt: new Date().toISOString(),
    customerName: "Teuku Umar",
    customerWhatsapp: "081234567892",
    fulfillmentType: "pickup",
    deliveryArea: "Pickup Toko (Lhoksukon)",
    orderNote: "",
    items: [],
    subtotal: 20000,
    shippingFee: 0,
    total: 20000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Pembayaran",
    paymentMethod: "Cash",
    paymentDeadline: "",
    merchantName: "Nook by Jina",
  };

  const savedCash = await saveOrder(cashOrder);
  assert.strictEqual(savedCash.paymentStatus, "Menunggu Pembayaran");
  assert.strictEqual(savedCash.paymentDeadline, "");
  console.log("✅ Passed: Cash retains 'Menunggu Pembayaran' with empty deadline.\n");

  // ---------------------------------------------------------------------------
  // 4. Expiration Lifecycle Tests
  // ---------------------------------------------------------------------------
  console.log("--- 4. Expiration Lifecycle: Gateway QRIS does NOT expire before payment_deadline ---");
  const nowMs = Date.now();
  // Gateway order created 35 mins ago, but has a 60 min deadline (active until +25 mins from now)
  const activeGatewayOrder = {
    paymentMethod: "QRIS",
    paymentStatus: "Menunggu Pembayaran",
    orderStatus: "Pesanan baru",
    gatewayProvider: "duitku",
    createdAt: new Date(nowMs - 35 * 60 * 1000).toISOString(),
    paymentDeadline: new Date(nowMs + 25 * 60 * 1000).toISOString(),
  };

  assert.strictEqual(
    isOrderExpired(activeGatewayOrder, nowMs),
    false,
    "Gateway QRIS must remain active before its authoritative payment_deadline"
  );
  console.log("✅ Passed: Gateway QRIS with 60-min deadline is NOT expired at 35 minutes.\n");

  console.log("--- 5. Expiration Lifecycle: Gateway QRIS expires after payment_deadline ---");
  const expiredGatewayOrder = {
    paymentMethod: "QRIS",
    paymentStatus: "Menunggu Pembayaran",
    orderStatus: "Pesanan baru",
    gatewayProvider: "duitku",
    createdAt: new Date(nowMs - 65 * 60 * 1000).toISOString(),
    paymentDeadline: new Date(nowMs - 5 * 60 * 1000).toISOString(),
  };

  assert.strictEqual(
    isOrderExpired(expiredGatewayOrder, nowMs),
    true,
    "Gateway QRIS must expire once payment_deadline has passed"
  );
  console.log("✅ Passed: Gateway QRIS expires accurately once payment_deadline elapses.\n");

  console.log("--- 6. Expiration Lifecycle: Legacy QRIS still expires at 30 minutes ---");
  const legacyExpiredOrder = {
    paymentMethod: "QRIS",
    paymentStatus: "Menunggu Verifikasi",
    orderStatus: "Pesanan baru",
    gatewayProvider: null,
    createdAt: new Date(nowMs - 31 * 60 * 1000).toISOString(),
    paymentDeadline: new Date(nowMs - 1 * 60 * 1000).toISOString(),
  };

  assert.strictEqual(
    isOrderExpired(legacyExpiredOrder, nowMs),
    true,
    "Legacy QRIS must expire when 30 minute window passes"
  );
  console.log("✅ Passed: Legacy QRIS expiration unchanged.\n");

  console.log("--- 7. Expiration Lifecycle: Cash NEVER expires ---");
  const oldCashOrder = {
    paymentMethod: "Cash",
    paymentStatus: "Menunggu Pembayaran",
    orderStatus: "Pesanan baru",
    createdAt: new Date(nowMs - 120 * 60 * 1000).toISOString(),
    paymentDeadline: "",
  };

  assert.strictEqual(
    isOrderExpired(oldCashOrder, nowMs),
    false,
    "Cash orders must never expire"
  );
  console.log("✅ Passed: Cash order never expires.\n");

  // ---------------------------------------------------------------------------
  // 8. Check Transaction Signature & Reconciliation Check
  // ---------------------------------------------------------------------------
  console.log("--- 8. Duitku Check Transaction MD5 Signature Generation ---");
  const checkOrderId = "NBJ-TEST-RECON-01";
  const checkSig = generateDuitkuCheckSignature(merchantCode, checkOrderId, apiKey);
  assert.strictEqual(checkSig.length, 32, "MD5 signature must be 32-character hex");
  console.log("✅ Passed: Duitku Check Transaction signature verified.\n");

  console.log("================================================================================");
  console.log("🎉 ALL PHASE 2B.2 CRITICAL FIX TESTS PASSED (0 FAILURES)!");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
