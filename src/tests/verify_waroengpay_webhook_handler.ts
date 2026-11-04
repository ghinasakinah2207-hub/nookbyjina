import assert from "node:assert";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { POST as handleWebhook } from "../app/api/payments/waroengpay/webhook/route";
import { saveOrder, getOrderByToken } from "../lib/orders-store";
import { Order } from "../types";

console.log("================================================================================");
console.log("TEST SUITE: WaroengPay Webhook Handler — End-to-End Event Processing");
console.log("================================================================================");

let testsPassed = 0;
let testsFailed = 0;

async function runAsyncTest(name: string, fn: () => Promise<void>) {
  try {
    process.stdout.write(`--- ${name} --- \n`);
    await fn();
    console.log(`✅ Passed: ${name}\n`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ Failed: ${name}`);
    console.error(err);
    console.log();
    testsFailed++;
  }
}

const TEST_SECRET = "whsec_test_secret_for_webhook_tests_123456";
process.env.WAROENGPAY_WEBHOOK_SECRET = TEST_SECRET;
process.env.WAROENGPAY_API_KEY = "wp_test_mock_api_key_123";

function buildSignedWebhookRequest(eventObj: Record<string, unknown>, secret = TEST_SECRET, timestampDelta = 0): NextRequest {
  const rawBody = JSON.stringify(eventObj);
  const timestamp = String(Math.floor(Date.now() / 1000) + timestampDelta);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return new NextRequest("http://localhost:3000/api/payments/waroengpay/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-waroengpay-timestamp": timestamp,
      "x-signature": signature,
      "x-waroengpay-event": String(eventObj.event || "payment.paid"),
    },
    body: rawBody,
  });
}

async function main() {
  // -----------------------------------------------------------------------------
  // Test 1: Reject Missing Headers (HTTP 401)
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 1: Reject Missing Headers", async () => {
    const req = new NextRequest("http://localhost:3000/api/payments/waroengpay/webhook", {
      method: "POST",
      body: JSON.stringify({ event: "ping" }),
    });

    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 401);
  });

  // -----------------------------------------------------------------------------
  // Test 2: Reject Invalid Signature (HTTP 401)
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 2: Reject Invalid Signature", async () => {
    const req = buildSignedWebhookRequest({ event: "ping" }, "wrong_secret_123");
    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 401);
  });

  // -----------------------------------------------------------------------------
  // Test 3: Ping Event Returns HTTP 200 Pong
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 3: Ping Event Returns HTTP 200 Pong", async () => {
    const req = buildSignedWebhookRequest({
      id: "evt_ping_1",
      event: "ping",
      created_at: new Date().toISOString(),
      livemode: false,
    });
    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.message, "pong");
  });

  // -----------------------------------------------------------------------------
  // Test 4: Successful Payment (`payment.paid`) Marks Order Lunas
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 4: Successful Payment Marks Order Lunas", async () => {
    const token = "tok_test_waroengpay_001_1234567890ab";
    const testOrder: Order = {
      id: "TJ-WP-001",
      token,
      createdAt: new Date().toISOString(),
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      deliveryArea: "Pickup Toko (Lhoksukon)",
      orderNote: "",
      items: [
        {
          id: "item-1",
          productId: "prod-1",
          productName: "Kopi Susu Gula Aren",
          productImage: "/images/kopi.jpg",
          basePrice: 25000,
          unitPrice: 25000,
          quantity: 2,
          itemTotal: 50000,
          itemNote: "",
          isAvailable: true,
          productType: "ready",
          selectedOptions: [],
          selectedAddons: [],
        },
      ],
      subtotal: 50000,
      shippingFee: 0,
      total: 50000,
      orderStatus: "Pesanan baru",
      paymentStatus: "Menunggu Pembayaran",
      paymentMethod: "QRIS",
      paymentDeadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      merchantName: "Nook by Jina",
      gatewayProvider: "waroengpay",
      waroengpayInvoiceId: "WRG-SUCCESS-001",
    };

    await saveOrder(testOrder);

    const paidEvent = {
      id: "evt_paid_1",
      event: "payment.paid",
      created_at: new Date().toISOString(),
      livemode: true,
      data: {
        id: "WRG-SUCCESS-001",
        reference: "TJ-WP-001",
        status: "paid",
        base_amount: 50000,
        amount: 50137,
        unique_code: 137,
        late: false,
        livemode: true,
      },
    };

    const req = buildSignedWebhookRequest(paidEvent);
    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 200);

    const updated = await getOrderByToken(token);
    assert.ok(updated);
    assert.strictEqual(updated.paymentStatus, "Lunas");
    assert.strictEqual(updated.orderStatus, "Diproses");
  });

  // -----------------------------------------------------------------------------
  // Test 5: Amount Mismatch Rejected (HTTP 400)
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 5: Amount Mismatch Rejected", async () => {
    const token = "tok_test_waroengpay_002_1234567890ab";
    const testOrder: Order = {
      id: "TJ-WP-002",
      token,
      createdAt: new Date().toISOString(),
      customerName: "Andi",
      customerWhatsapp: "081234567891",
      fulfillmentType: "pickup",
      deliveryArea: "Pickup Toko",
      orderNote: "",
      items: [],
      subtotal: 100000,
      shippingFee: 0,
      total: 100000, // Expected 100.000
      orderStatus: "Pesanan baru",
      paymentStatus: "Menunggu Pembayaran",
      paymentMethod: "QRIS",
      paymentDeadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      merchantName: "Nook by Jina",
      gatewayProvider: "waroengpay",
      waroengpayInvoiceId: "WRG-MISMATCH-002",
    };

    await saveOrder(testOrder);

    // Attacker sends payment.paid for 10.000 instead of 100.000
    const tamperedAmountEvent = {
      id: "evt_mismatch_1",
      event: "payment.paid",
      created_at: new Date().toISOString(),
      livemode: true,
      data: {
        id: "WRG-MISMATCH-002",
        reference: "TJ-WP-002",
        status: "paid",
        base_amount: 10000, // Mismatch!
        amount: 10137,
        late: false,
        livemode: true,
      },
    };

    const req = buildSignedWebhookRequest(tamperedAmountEvent);
    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 400);

    // Verify order was NOT marked Lunas
    const orderAfter = await getOrderByToken(token);
    assert.ok(orderAfter);
    assert.notStrictEqual(orderAfter.paymentStatus, "Lunas");
  });

  // -----------------------------------------------------------------------------
  // Test 6: Idempotent Delivery of payment.paid Returns 200 Without Duplicate Mutation
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 6: Duplicate payment.paid Is Idempotent", async () => {
    const paidEvent = {
      id: "evt_paid_1",
      event: "payment.paid",
      created_at: new Date().toISOString(),
      livemode: true,
      data: {
        id: "WRG-SUCCESS-001",
        reference: "TJ-WP-001",
        status: "paid",
        base_amount: 50000,
        amount: 50137,
        late: false,
        livemode: true,
      },
    };

    // Re-send the same payment.paid event
    const req = buildSignedWebhookRequest(paidEvent);
    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.message, "Order already settled");
  });

  // -----------------------------------------------------------------------------
  // Test 7: Expiration Event Marks Pending Order Dibatalkan
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 7: Expiration Event Marks Pending Order Dibatalkan", async () => {
    const token = "tok_test_waroengpay_003_1234567890ab";
    const testOrder: Order = {
      id: "TJ-WP-003",
      token,
      createdAt: new Date().toISOString(),
      customerName: "Citra",
      customerWhatsapp: "081234567892",
      fulfillmentType: "pickup",
      deliveryArea: "Pickup Toko",
      orderNote: "",
      items: [],
      subtotal: 35000,
      shippingFee: 0,
      total: 35000,
      orderStatus: "Pesanan baru",
      paymentStatus: "Menunggu Pembayaran",
      paymentMethod: "QRIS",
      paymentDeadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      merchantName: "Nook by Jina",
      gatewayProvider: "waroengpay",
      waroengpayInvoiceId: "WRG-EXPIRE-003",
    };

    await saveOrder(testOrder);

    const expiredEvent = {
      id: "evt_exp_1",
      event: "payment.expired",
      created_at: new Date().toISOString(),
      livemode: true,
      data: {
        id: "WRG-EXPIRE-003",
        reference: "TJ-WP-003",
        status: "expired",
      },
    };

    const req = buildSignedWebhookRequest(expiredEvent);
    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 200);

    const updated = await getOrderByToken(token);
    assert.ok(updated);
    assert.strictEqual(updated.paymentStatus, "Dibatalkan");
    assert.strictEqual(updated.orderStatus, "Dibatalkan");
  });

  // -----------------------------------------------------------------------------
  // Test 8: Cancellation Event Marks Pending Order Dibatalkan
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 8: Cancellation Event Marks Pending Order Dibatalkan", async () => {
    const token = "tok_test_waroengpay_004_1234567890ab";
    const testOrder: Order = {
      id: "TJ-WP-004",
      token,
      createdAt: new Date().toISOString(),
      customerName: "Dedi",
      customerWhatsapp: "081234567893",
      fulfillmentType: "pickup",
      deliveryArea: "Pickup Toko",
      orderNote: "",
      items: [],
      subtotal: 40000,
      shippingFee: 0,
      total: 40000,
      orderStatus: "Pesanan baru",
      paymentStatus: "Menunggu Pembayaran",
      paymentMethod: "QRIS",
      paymentDeadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      merchantName: "Nook by Jina",
      gatewayProvider: "waroengpay",
      waroengpayInvoiceId: "WRG-CANCEL-004",
    };

    await saveOrder(testOrder);

    const cancelEvent = {
      id: "evt_cancel_1",
      event: "payment.cancelled",
      created_at: new Date().toISOString(),
      livemode: true,
      data: {
        id: "WRG-CANCEL-004",
        reference: "TJ-WP-004",
        status: "cancelled",
      },
    };

    const req = buildSignedWebhookRequest(cancelEvent);
    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 200);

    const updated = await getOrderByToken(token);
    assert.ok(updated);
    assert.strictEqual(updated.paymentStatus, "Dibatalkan");
    assert.strictEqual(updated.orderStatus, "Dibatalkan");
  });

  // -----------------------------------------------------------------------------
  // Test 9: Late Payment (late: true) Allowed on Previously Cancelled Order
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 9: Late Payment (late: true) Handled Gracefully", async () => {
    // Order was previously cancelled/expired (e.g. TJ-WP-003)
    const lateEvent = {
      id: "evt_late_1",
      event: "payment.paid",
      created_at: new Date().toISOString(),
      livemode: true,
      data: {
        id: "WRG-EXPIRE-003",
        reference: "TJ-WP-003",
        status: "paid",
        base_amount: 35000,
        amount: 35120,
        late: true, // Matched manually by WaroengPay admin after expiry
        livemode: true,
      },
    };

    const req = buildSignedWebhookRequest(lateEvent);
    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.late, true);
  });

  // -----------------------------------------------------------------------------
  // Test 10: Production Sandbox Event Isolation
  // -----------------------------------------------------------------------------
  await runAsyncTest("TEST 10: Production Protection (Sandbox events ignored in Production)", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevKey = process.env.WAROENGPAY_API_KEY;

    // Simulate production environment with live API key
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.WAROENGPAY_API_KEY = "wp_live_production_key_12345";

    const sandboxEvent = {
      id: "evt_sandbox_test",
      event: "payment.paid",
      created_at: new Date().toISOString(),
      livemode: false, // Sandbox test mode
      data: {
        id: "WRG-SANDBOX-TEST",
        reference: "TJ-WP-PROD",
        status: "paid",
        base_amount: 50000,
        amount: 50137,
        livemode: false,
      },
    };

    const req = buildSignedWebhookRequest(sandboxEvent);
    const res = await handleWebhook(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.message, "Sandbox event ignored on live production server");

    // Restore env
    (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
    process.env.WAROENGPAY_API_KEY = prevKey;
  });

  console.log("================================================================================");
  if (testsFailed === 0) {
    console.log(`🎉 ALL ${testsPassed} WAROENGPAY WEBHOOK TESTS PASSED (0 FAILURES)!`);
  } else {
    console.error(`💥 ${testsFailed} TESTS FAILED out of ${testsPassed + testsFailed}`);
    process.exit(1);
  }
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Test runner threw unhandled error:", err);
  process.exit(1);
});
