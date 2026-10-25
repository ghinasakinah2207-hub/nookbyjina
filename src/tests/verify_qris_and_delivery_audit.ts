import assert from "assert";
import { calculateDeliveryFee } from "@/lib/delivery-fee";
import {
  generateSecureOrderToken,
  hashOrderToken,
  isValidTokenFormat,
} from "@/lib/token-security";
import {
  getWIBDateString,
} from "@/lib/orders-store";

const BASE_URL = "http://localhost:3000";

async function runAuditTests() {
  console.log("==================================================================");
  console.log("TEMU BY JINA — PRODUCTION AUDIT RECOVERY TEST SUITE");
  console.log("==================================================================\n");

  // -----------------------------------------------------------------------------
  // TEST SUITE 1: Delivery Fee Threshold (> Rp50,000 strictly)
  // -----------------------------------------------------------------------------
  console.log("=== 1. Delivery Fee Threshold Boundary Tests ===");
  const standardConfig = {
    standardFee: 4000,
    freeShippingThreshold: 50000,
    configuredArea: "Lhoksukon",
  };

  // Case 1A: Subtotal < 50,000
  const fee49999 = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 49999,
    deliveryConfig: standardConfig,
  });
  assert.strictEqual(fee49999.shippingFee, 4000, "Subtotal 49,999 incurs standard fee Rp4,000");
  assert.strictEqual(fee49999.isFree, false, "Subtotal 49,999 is not free");
  assert.strictEqual(fee49999.remainingToFreeShipping, 2, "Remaining to free shipping for 49,999 is 2");

  // Case 1B: Subtotal == 50,000 (EXACT BOUNDARY: MUST INCUR STANDARD FEE)
  const fee50000 = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 50000,
    deliveryConfig: standardConfig,
  });
  assert.strictEqual(
    fee50000.shippingFee,
    4000,
    "CRITICAL: Subtotal exactly 50,000 MUST incur configured delivery fee (Rp4,000)"
  );
  assert.strictEqual(
    fee50000.isFree,
    false,
    "CRITICAL: Subtotal exactly 50,000 must NOT be free shipping"
  );
  assert.strictEqual(
    fee50000.remainingToFreeShipping,
    1,
    "Remaining amount for subtotal 50,000 must be Rp1 (strictly > 50,000 required)"
  );

  // Case 1C: Subtotal == 50,001 (STRICTLY GREATER: QUALIFIES FOR FREE SHIPPING)
  const fee50001 = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 50001,
    deliveryConfig: standardConfig,
  });
  assert.strictEqual(fee50001.shippingFee, 0, "Subtotal 50,001 qualifies for Rp0 free delivery");
  assert.strictEqual(fee50001.isFree, true, "Subtotal 50,001 isFree must be true");
  assert.strictEqual(fee50001.remainingToFreeShipping, 0, "Remaining for 50,001 is 0");

  // Case 1D: Pickup is always Rp0
  const pickupFee = calculateDeliveryFee({
    fulfillmentType: "pickup",
    deliveryArea: "Lhoksukon",
    subtotal: 10000,
    deliveryConfig: standardConfig,
  });
  assert.strictEqual(pickupFee.shippingFee, 0, "Pickup fulfillment fee is always Rp0");
  assert.strictEqual(pickupFee.isFree, true, "Pickup fulfillment isFree is true");

  console.log("✅ PASSED: All delivery fee threshold boundary conditions verified.\n");

  // -----------------------------------------------------------------------------
  // TEST SUITE 2: Payment Method Invariants (QRIS-Only Enforcement)
  // -----------------------------------------------------------------------------
  console.log("=== 2. Payment Method Invariants (QRIS-Only API Validation) ===");

  // Case 2A: Cash rejection at API level
  const cashPayload = {
    customerName: "Budi Santoso",
    customerWhatsapp: "081234567890",
    fulfillmentType: "pickup",
    paymentMethod: "Cash",
    items: [
      {
        productId: "nasi-bakar-cakalang",
        quantity: 1,
        selectedOptions: [{ valueId: "b0000004-0000-4000-8000-000000000001" }],
      },
    ],
  };

  const cashRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cashPayload),
  });
  assert.strictEqual(cashRes.status, 400, "POST /api/orders with paymentMethod='Cash' is rejected with HTTP 400");
  const cashBody = await cashRes.json();
  assert.strictEqual(cashBody.success, false, "Cash response success is false");
  assert.ok(
    cashBody.error.includes("Cash (Tunai) belum tersedia"),
    `Error explains Cash is disabled in MVP: got "${cashBody.error}"`
  );

  // Case 2B: Arbitrary payment method rejection
  const invalidMethodRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...cashPayload, paymentMethod: "CreditCard" }),
  });
  assert.strictEqual(invalidMethodRes.status, 400, "Unknown payment method rejected with HTTP 400");

  // Case 2C: QRIS Statis acceptance
  const qrisToken = `tok_audit_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const qrisPayload = {
    token: qrisToken,
    customerName: "Siti Rahma",
    customerWhatsapp: "081298765432",
    fulfillmentType: "pickup",
    paymentMethod: "QRIS Statis",
    items: [
      {
        productId: "nasi-bakar-cakalang",
        quantity: 1,
        selectedOptions: [{ valueId: "b0000004-0000-4000-8000-000000000001" }],
      },
    ],
  };

  const qrisRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(qrisPayload),
  });
  assert.strictEqual(qrisRes.status, 201, "POST /api/orders with QRIS Statis succeeds with HTTP 201");
  const qrisBody = await qrisRes.json();
  assert.strictEqual(qrisBody.success, true, "QRIS order creation reports success: true");
  assert.strictEqual(qrisBody.order.paymentMethod, "QRIS Statis", "Created order paymentMethod is QRIS Statis");
  assert.strictEqual(qrisBody.order.paymentStatus, "Menunggu Verifikasi", "QRIS initial paymentStatus is Menunggu Verifikasi");
  assert.strictEqual(qrisBody.order.orderStatus, "Pesanan baru", "Initial orderStatus is Pesanan baru");

  // Verify 30-minute payment deadline
  const createdMs = new Date(qrisBody.order.createdAt).getTime();
  const deadlineMs = new Date(qrisBody.order.paymentDeadline).getTime();
  const diffMinutes = Math.round((deadlineMs - createdMs) / (60 * 1000));
  assert.strictEqual(diffMinutes, 30, "QRIS payment deadline is exactly 30 minutes from creation");

  console.log("✅ PASSED: QRIS-only enforcement, status initialization, and deadline verified.\n");

  // -----------------------------------------------------------------------------
  // TEST SUITE 3: Customer Privacy & Scoped Order Lookup
  // -----------------------------------------------------------------------------
  console.log("=== 3. Customer PII Sanitization & Zero-Trust Token Lookup ===");

  // Lookup order by token
  const lookupRes = await fetch(`${BASE_URL}/api/orders/${qrisToken}`);
  assert.strictEqual(lookupRes.status, 200, "GET /api/orders/[token] succeeds with HTTP 200");
  const lookupBody = await lookupRes.json();
  assert.strictEqual(lookupBody.order.customerWhatsapp, "", "Customer phone number is stripped in public token lookup");
  assert.ok(lookupBody.order.customerName.includes("***"), "Customer name is masked in public token lookup");
  assert.strictEqual(lookupBody.order.id, qrisBody.order.id, "Looked up order ID matches created order");

  // Lookup by non-existent token
  const notFoundRes = await fetch(`${BASE_URL}/api/orders/non_existent_token_99999999`);
  assert.strictEqual(notFoundRes.status, 404, "Invalid token returns HTTP 404 Not Found");

  console.log("✅ PASSED: Customer PII sanitization and token privacy verified.\n");

  // -----------------------------------------------------------------------------
  // TEST SUITE 4: Status Transition Security & Zero-Trust Mutations
  // -----------------------------------------------------------------------------
  console.log("=== 4. Zero-Trust Status Mutation Boundaries ===");

  // Customer attempts to self-mark as Lunas
  const mutatePaidRes = await fetch(`${BASE_URL}/api/orders/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: qrisBody.order.id,
      paymentStatus: "Lunas",
    }),
  });
  assert.strictEqual(
    mutatePaidRes.status,
    403,
    "Customer attempt to mark order as 'Lunas' is blocked with HTTP 403 Forbidden"
  );

  // Customer attempts to advance order preparation state
  const mutateProgressRes = await fetch(`${BASE_URL}/api/orders/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: qrisBody.order.id,
      orderStatus: "Diproses",
    }),
  });
  assert.strictEqual(
    mutateProgressRes.status,
    403,
    "Customer attempt to mark order as 'Diproses' is blocked with HTTP 403 Forbidden"
  );

  // Customer cancelling WITH secret token is allowed
  const cancelRes = await fetch(`${BASE_URL}/api/orders/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: qrisToken,
      orderStatus: "Dibatalkan",
      paymentStatus: "Dibatalkan",
    }),
  });
  assert.strictEqual(cancelRes.status, 200, "Customer cancellation with valid token succeeds with HTTP 200");
  const cancelBody = await cancelRes.json();
  assert.strictEqual(cancelBody.order.orderStatus, "Dibatalkan", "Order status transitioned to Dibatalkan");
  assert.strictEqual(cancelBody.order.paymentStatus, "Dibatalkan", "Payment status synchronized to Dibatalkan");

  console.log("✅ PASSED: Status transition authorization and cancellation verified.\n");

  // -----------------------------------------------------------------------------
  // TEST SUITE 5: Orders Store Token Hashing & Safe Logging Invariants
  // -----------------------------------------------------------------------------
  console.log("=== 5. Token Cryptography & WIB Date Invariants ===");
  const testTok = generateSecureOrderToken();
  assert.ok(isValidTokenFormat(testTok), "Generated token satisfies format constraints");
  const hashVal = hashOrderToken(testTok);
  assert.strictEqual(hashVal.length, 64, "Token hash is 64-char SHA-256");
  assert.strictEqual(/^[0-9a-f]{64}$/.test(hashVal), true, "Hash is valid hex string");
  assert.ok(!hashVal.includes(testTok), "Hash does not expose raw token string");

  const wib = getWIBDateString();
  assert.strictEqual(wib.length, 6, "WIB date is 6 characters YYMMDD");
  assert.strictEqual(/^\d{6}$/.test(wib), true, "WIB date is numeric");

  console.log("✅ PASSED: Token cryptography and date invariants verified.\n");

  console.log("==================================================================");
  console.log("🎉 ALL AUDIT RECOVERY TESTS PASSED (0 FAILURES)!");
  console.log("==================================================================");
}

runAuditTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
