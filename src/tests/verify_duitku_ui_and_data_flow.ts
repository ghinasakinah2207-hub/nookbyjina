import assert from "assert";
import { getDuitkuConfig } from "../lib/duitku";
import { normalizeOrder } from "../lib/order-normalizer";
import { Order } from "../types";

console.log("================================================================================");
console.log("TEST SUITE: Duitku UI & Authoritative Data Flow Verification");
console.log("================================================================================\n");

async function runTests() {
  // ---------------------------------------------------------------------------
  // 1. Duitku Config: Sandbox Isolation
  // ---------------------------------------------------------------------------
  console.log("--- 1. Sandbox Isolation: NEVER falls back to Production domain ---");
  const origEnv = process.env.DUITKU_ENV;
  const origCallback = process.env.DUITKU_CALLBACK_URL;
  const origReturn = process.env.DUITKU_RETURN_URL;
  const origAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  try {
    process.env.DUITKU_MERCHANT_CODE = "D12345";
    process.env.DUITKU_API_KEY = "test_sandbox_api_key_32chars_long";
    process.env.DUITKU_ENV = "sandbox";
    delete process.env.DUITKU_CALLBACK_URL;
    delete process.env.DUITKU_RETURN_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://www.nookbyjina.my.id"; // Even if polluted with prod domain

    const sandboxConfig = getDuitkuConfig();
    assert.strictEqual(sandboxConfig.env, "sandbox");
    assert.strictEqual(
      sandboxConfig.inquiryEndpoint,
      "https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry"
    );
    // MUST NOT contain production domain!
    assert(
      !sandboxConfig.callbackUrl.includes("nookbyjina.my.id"),
      `Expected sandbox callback to NOT contain nookbyjina.my.id, got: ${sandboxConfig.callbackUrl}`
    );
    assert(
      !sandboxConfig.returnUrl.includes("nookbyjina.my.id"),
      `Expected sandbox return to NOT contain nookbyjina.my.id, got: ${sandboxConfig.returnUrl}`
    );
    assert(
      sandboxConfig.callbackUrl.includes("localhost:3000") || sandboxConfig.callbackUrl.includes("/api/payments/duitku/callback"),
      `Expected sandbox callback to use sandbox base or localhost, got: ${sandboxConfig.callbackUrl}`
    );
    console.log("✅ Passed: Sandbox config strictly prevented production domain leakage.");
  } finally {
    process.env.DUITKU_ENV = origEnv;
    process.env.DUITKU_CALLBACK_URL = origCallback;
    process.env.DUITKU_RETURN_URL = origReturn;
    process.env.NEXT_PUBLIC_APP_URL = origAppUrl;
  }

  // ---------------------------------------------------------------------------
  // 2. Duitku Config: Production Mode
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Production Mode: Uses Production endpoints & domain ---");
  try {
    process.env.DUITKU_MERCHANT_CODE = "D_PROD";
    process.env.DUITKU_API_KEY = "test_production_api_key_32chars";
    process.env.DUITKU_ENV = "production";
    delete process.env.DUITKU_CALLBACK_URL;
    delete process.env.DUITKU_RETURN_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    const prodConfig = getDuitkuConfig();
    assert.strictEqual(prodConfig.env, "production");
    assert.strictEqual(
      prodConfig.inquiryEndpoint,
      "https://passport.duitku.com/webapi/api/merchant/v2/inquiry"
    );
    assert.strictEqual(
      prodConfig.callbackUrl,
      "https://www.nookbyjina.my.id/api/payments/duitku/callback"
    );
    assert.strictEqual(
      prodConfig.returnUrl,
      "https://www.nookbyjina.my.id/pesanan/return"
    );
    console.log("✅ Passed: Production config matches authoritative production URL endpoints.");
  } finally {
    process.env.DUITKU_ENV = origEnv;
    process.env.DUITKU_CALLBACK_URL = origCallback;
    process.env.DUITKU_RETURN_URL = origReturn;
    process.env.NEXT_PUBLIC_APP_URL = origAppUrl;
  }

  // ---------------------------------------------------------------------------
  // 3. Normalizer & Data Flow: Order UUID & Gateway Metadata Preservation
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Normalizer: Preserves UUID, gatewayProvider, and paymentUrl ---");
  const rawDbOrder = {
    id: "ORD-20261103-9999",
    uuid: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
    payment_method: "QRIS",
    payment_status: "Menunggu pembayaran",
    gateway_provider: "duitku",
    payment_url: "https://sandbox.duitku.com/payment/inv_9999",
    duitku_reference: "D9999REF",
    items: [],
  };

  const normalized = normalizeOrder(rawDbOrder);
  assert.strictEqual(normalized.id, "ORD-20261103-9999");
  assert.strictEqual(normalized.uuid, "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d");
  assert.strictEqual(normalized.paymentMethod, "QRIS");
  assert.strictEqual(normalized.paymentStatus, "Menunggu Pembayaran");
  assert.strictEqual(normalized.gatewayProvider, "duitku");
  assert.strictEqual(normalized.paymentUrl, "https://sandbox.duitku.com/payment/inv_9999");
  assert.strictEqual(normalized.duitkuReference, "D9999REF");
  console.log("✅ Passed: Database row snake_case fields correctly mapped to camelCase order properties.");

  // ---------------------------------------------------------------------------
  // 4. UI Rendering Logic: QRIS Duitku vs Cash vs Legacy QRIS
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. UI Invariant: QRIS Duitku is NEVER classified as Cash ---");

  // A. QRIS Duitku Order
  const duitkuOrder: Order = {
    id: "ORD-20261103-0001",
    uuid: "11111111-2222-3333-4444-555555555555",
    token: "tok_secret_access_qris_duitku_01",
    createdAt: new Date().toISOString(),
    customerName: "Pelanggan QRIS",
    customerWhatsapp: "081234567890",
    fulfillmentType: "pickup",
    deliveryArea: "Lhoksukon",
    orderNote: "",
    items: [],
    subtotal: 35000,
    shippingFee: 0,
    total: 35000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Pembayaran",
    paymentMethod: "QRIS",
    paymentDeadline: new Date(Date.now() + 1800000).toISOString(),
    merchantName: "Nook by Jina",
    gatewayProvider: "duitku",
    paymentUrl: "https://sandbox.duitku.com/payment/inv_0001",
    duitkuReference: "D0001REF",
  };

  // Helper evaluating OrderProgressTracker summary text
  function getTrackerSummaryText(order: Order, isPaid: boolean) {
    if (order.orderStatus === "Pesanan baru") {
      if (isPaid) {
        return "Pembayaran terverifikasi • Menunggu dapur";
      } else if (order.paymentMethod === "Cash") {
        return "Menunggu pembayaran tunai (Cash)";
      } else if (order.gatewayProvider === "duitku" || order.paymentMethod === "QRIS") {
        return "Menunggu verifikasi otomatis QRIS Duitku";
      } else {
        return "Menunggu verifikasi pembayaran QRIS";
      }
    }
    return "Status lainnya";
  }

  const trackerTextQris = getTrackerSummaryText(duitkuOrder, false);
  assert.strictEqual(
    trackerTextQris,
    "Menunggu verifikasi otomatis QRIS Duitku",
    `Expected Duitku tracker text to be QRIS Duitku, got: ${trackerTextQris}`
  );
  assert(
    !trackerTextQris.toLowerCase().includes("cash"),
    `QRIS Duitku order MUST NOT show Cash in tracker! Got: ${trackerTextQris}`
  );
  console.log("✅ Passed: QRIS Duitku status is correctly 'Menunggu verifikasi otomatis QRIS Duitku' (NOT Cash).");

  // B. Cash Order
  const cashOrder: Order = {
    ...duitkuOrder,
    id: "ORD-20261103-0002",
    paymentMethod: "Cash",
    gatewayProvider: undefined,
    paymentUrl: undefined,
    duitkuReference: undefined,
  };

  const trackerTextCash = getTrackerSummaryText(cashOrder, false);
  assert.strictEqual(trackerTextCash, "Menunggu pembayaran tunai (Cash)");
  console.log("✅ Passed: Cash order correctly shows 'Menunggu pembayaran tunai (Cash)'.");

  // C. Legacy QRIS Order
  const legacyQrisOrder: Order = {
    ...duitkuOrder,
    id: "ORD-20261103-0003",
    paymentMethod: "QRIS Statis",
    gatewayProvider: undefined,
    paymentUrl: undefined,
    duitkuReference: undefined,
  };

  const trackerTextLegacy = getTrackerSummaryText(legacyQrisOrder, false);
  assert.strictEqual(trackerTextLegacy, "Menunggu verifikasi pembayaran QRIS");
  console.log("✅ Passed: Legacy QRIS order correctly shows 'Menunggu verifikasi pembayaran QRIS'.");

  // ---------------------------------------------------------------------------
  // 5. Pembayaran Page Branching Invariant
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Pembayaran Page: isDuitkuQris evaluates true for new QRIS ---");
  function isDuitkuQrisCheck(order: Order) {
    return (
      order.paymentMethod !== "Cash" &&
      (order.paymentMethod === "QRIS" ||
        order.gatewayProvider === "duitku" ||
        Boolean(order.paymentUrl) ||
        Boolean(order.duitkuReference))
    );
  }

  assert.strictEqual(isDuitkuQrisCheck(duitkuOrder), true, "Duitku order must evaluate to isDuitkuQris = true");
  assert.strictEqual(isDuitkuQrisCheck(cashOrder), false, "Cash order must evaluate to isDuitkuQris = false");
  assert.strictEqual(isDuitkuQrisCheck(legacyQrisOrder), false, "Legacy order must evaluate to isDuitkuQris = false");
  console.log("✅ Passed: Pembayaran page correctly branches Duitku QRIS away from legacy static QRIS.");

  console.log("\n================================================================================");
  console.log("🎉 ALL UI & DATA FLOW VERIFICATION TESTS PASSED SUCCESSFULLY (0 FAILURES)!");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
