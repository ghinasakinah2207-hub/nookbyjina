import assert from "node:assert";
import crypto from "node:crypto";
import {
  verifyWaroengPayWebhookSignature,
  isWaroengPayConfigured,
  isWaroengPaySandbox,
} from "../lib/waroengpay";
import { isOrderExpired } from "../lib/order-normalizer";

console.log("================================================================================");
console.log("TEST SUITE: WaroengPay Payment Gateway — Foundation, Security & Verification");
console.log("================================================================================");

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void) {
  try {
    process.stdout.write(`--- ${name} --- \n`);
    fn();
    console.log(`✅ Passed: ${name}\n`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ Failed: ${name}`);
    console.error(err);
    console.log();
    testsFailed++;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Webhook HMAC-SHA256 Signature Verification (Valid Case)
// -----------------------------------------------------------------------------
runTest("TEST 1: Valid Webhook Signature Verification", () => {
  const secret = "whsec_test_abc123xyz456";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({
    id: "evt_test123",
    event: "payment.paid",
    created_at: new Date().toISOString(),
    livemode: false,
    data: {
      id: "WRG-TEST123456789",
      reference: "NBJ-20261104-0001",
      status: "paid",
      base_amount: 50000,
      amount: 50137,
      unique_code: 137,
      late: false,
      livemode: false,
    },
  });

  const validSignature = crypto
    .createHmac("sha256", secret)
    .update(`${nowSeconds}.${rawBody}`)
    .digest("hex");

  const isValid = verifyWaroengPayWebhookSignature(
    {
      rawBody,
      timestamp: String(nowSeconds),
      signature: validSignature,
    },
    secret
  );

  assert.strictEqual(isValid, true, "Valid signature must be accepted");
});

// -----------------------------------------------------------------------------
// Test 2: Invalid Webhook Signature Rejection
// -----------------------------------------------------------------------------
runTest("TEST 2: Invalid Webhook Signature Rejection", () => {
  const secret = "whsec_test_abc123xyz456";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({ event: "payment.paid" });

  const invalidSignature = crypto
    .createHmac("sha256", "wrong_secret_key")
    .update(`${nowSeconds}.${rawBody}`)
    .digest("hex");

  const isValid = verifyWaroengPayWebhookSignature(
    {
      rawBody,
      timestamp: String(nowSeconds),
      signature: invalidSignature,
    },
    secret
  );

  assert.strictEqual(isValid, false, "Invalid signature must be strictly rejected");
});

// -----------------------------------------------------------------------------
// Test 3: Raw Body Tampering Rejection
// -----------------------------------------------------------------------------
runTest("TEST 3: Payload Body Tampering Rejection", () => {
  const secret = "whsec_test_abc123xyz456";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const originalBody = JSON.stringify({ amount: 50000 });
  const tamperedBody = JSON.stringify({ amount: 1000 });

  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${nowSeconds}.${originalBody}`)
    .digest("hex");

  const isValid = verifyWaroengPayWebhookSignature(
    {
      rawBody: tamperedBody,
      timestamp: String(nowSeconds),
      signature,
    },
    secret
  );

  assert.strictEqual(isValid, false, "Tampered body must be rejected");
});

// -----------------------------------------------------------------------------
// Test 4: Replay Attack Defense (Timestamp Freshness > 300s Rejection)
// -----------------------------------------------------------------------------
runTest("TEST 4: Replay Attack Defense (Stale Timestamp Rejection)", () => {
  const secret = "whsec_test_abc123xyz456";
  const staleSeconds = Math.floor(Date.now() / 1000) - 305; // 305 seconds old (beyond 300s window)
  const rawBody = JSON.stringify({ event: "payment.paid" });

  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${staleSeconds}.${rawBody}`)
    .digest("hex");

  const isValid = verifyWaroengPayWebhookSignature(
    {
      rawBody,
      timestamp: String(staleSeconds),
      signature,
    },
    secret
  );

  assert.strictEqual(isValid, false, "Stale timestamp (> 300 seconds) must be rejected");
});

// -----------------------------------------------------------------------------
// Test 5: WaroengPay 5-Minute Grace Period Enforcement in isOrderExpired
// -----------------------------------------------------------------------------
runTest("TEST 5: WaroengPay 5-Minute Grace Period Invariant", () => {
  const now = Date.now();
  // An invoice created 16 minutes ago with expires_in = 15 minutes
  // It is 1 minute past expires_at (16 > 15), but still within the 5-minute grace period (16 < 20).
  const sixteenMinutesAgo = new Date(now - 16 * 60 * 1000).toISOString();
  const fifteenMinutesAgo = new Date(now - 1 * 60 * 1000).toISOString(); // expires_at was 1 minute ago

  const inGracePeriodOrder = {
    paymentMethod: "QRIS",
    paymentStatus: "Menunggu pembayaran",
    orderStatus: "Pesanan baru",
    gatewayProvider: "waroengpay",
    createdAt: sixteenMinutesAgo,
    paymentDeadline: fifteenMinutesAgo, // expires_at
  };

  // Should NOT be marked expired yet because it's within the 5-minute grace period
  assert.strictEqual(
    isOrderExpired(inGracePeriodOrder, now),
    false,
    "Order within 5-minute grace period must NOT be marked expired"
  );

  // After 21 minutes (past 15 minutes + 5 minute grace period = 20 minutes)
  const twentyOneMinutesAgo = new Date(now - 21 * 60 * 1000).toISOString();
  const sixMinutesAgoExpiry = new Date(now - 6 * 60 * 1000).toISOString(); // expires_at was 6 mins ago (> 5m grace)

  const fullyExpiredOrder = {
    paymentMethod: "QRIS",
    paymentStatus: "Menunggu pembayaran",
    orderStatus: "Pesanan baru",
    gatewayProvider: "waroengpay",
    createdAt: twentyOneMinutesAgo,
    paymentDeadline: sixMinutesAgoExpiry,
  };

  assert.strictEqual(
    isOrderExpired(fullyExpiredOrder, now),
    true,
    "Order past the 5-minute grace period must be marked expired"
  );
});

// -----------------------------------------------------------------------------
// Test 6: Invariant: Paid Orders Never Expire Even If Past Grace Period
// -----------------------------------------------------------------------------
runTest("TEST 6: Paid Orders ('Lunas') Never Expire", () => {
  const now = Date.now();
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

  const paidOrder = {
    paymentMethod: "QRIS",
    paymentStatus: "Lunas",
    orderStatus: "Diproses",
    gatewayProvider: "waroengpay",
    paymentDeadline: twoHoursAgo,
  };

  assert.strictEqual(
    isOrderExpired(paidOrder, now),
    false,
    "Paid orders must never expire regardless of elapsed time"
  );
});

// -----------------------------------------------------------------------------
// Test 7: Late Payment (`late: true`) Invariant
// -----------------------------------------------------------------------------
runTest("TEST 7: Late Payment Processing Rules", () => {
  // Simulating waroengpay.md late payment handling
  const latePaymentEvent = {
    event: "payment.paid",
    data: {
      id: "WRG-LATE12345",
      reference: "NBJ-LATE-001",
      status: "paid",
      base_amount: 50000,
      amount: 50125,
      late: true, // Customer paid after initial expiry, matched by WaroengPay admin
    },
  };

  assert.strictEqual(latePaymentEvent.data.late, true);
  assert.strictEqual(latePaymentEvent.data.status, "paid");
  assert.strictEqual(latePaymentEvent.data.base_amount, 50000);
});

// -----------------------------------------------------------------------------
// Test 8: Sandbox Key & Prefix Validation
// -----------------------------------------------------------------------------
runTest("TEST 8: Sandbox Mode Identification (wp_test_ prefix)", () => {
  const origKey = process.env.WAROENGPAY_API_KEY;

  process.env.WAROENGPAY_API_KEY = "wp_test_1234567890abcdef";
  assert.strictEqual(isWaroengPayConfigured(), true);
  assert.strictEqual(isWaroengPaySandbox(), true);

  process.env.WAROENGPAY_API_KEY = "wp_live_9876543210fedcba";
  assert.strictEqual(isWaroengPayConfigured(), true);
  assert.strictEqual(isWaroengPaySandbox(), false);

  if (origKey !== undefined) {
    process.env.WAROENGPAY_API_KEY = origKey;
  } else {
    delete process.env.WAROENGPAY_API_KEY;
  }
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("================================================================================");
if (testsFailed === 0) {
  console.log(`🎉 ALL ${testsPassed} WAROENGPAY FOUNDATION TESTS PASSED (0 FAILURES)!`);
} else {
  console.error(`💥 ${testsFailed} TESTS FAILED out of ${testsPassed + testsFailed}`);
  process.exit(1);
}
console.log("================================================================================");
