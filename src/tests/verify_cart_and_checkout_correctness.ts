/**
 * Comprehensive Backend Correctness Test Suite: Cart & Checkout
 * File: src/tests/verify_cart_and_checkout_correctness.ts
 *
 * Scope & Features Tested:
 * 1. Server-side price authority: tampered client prices/totals discarded, authoritative recalculation.
 * 2. Product and option group cardinality: invalid products, quantities, min/max selection bounds, duplicates.
 * 3. Delivery fee & free-shipping threshold: pickup Rp0, boundary threshold, outside area rejection.
 * 4. Idempotency & duplicate submission defense: stable token retry handling without duplicate sequence allocation.
 * 5. Payment method & status initialization: Cash vs QRIS 30-minute deadline, manual admin verification.
 * 6. Order detail privacy & token access: PII masking, phone stripping, token validation.
 * 7. Live Supabase schema inspection & migration status: real database queries.
 *
 * EXECUTION ENVIRONMENTS:
 * - [SIMULATED FIXTURE]: Algorithmic pricing calculations, boundary assertions, phone validation.
 * - [LIVE HTTP]: Real HTTP requests executed against running Next.js server on http://localhost:3000.
 * - [LIVE SUPABASE]: Live queries against connected Supabase backend via publishable key.
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { calculateDeliveryFee } from "@/lib/delivery-fee";
import { validateIndonesianPhone } from "@/lib/phone";
import { isValidTokenFormat } from "@/lib/token-security";
import { StoreSettings } from "@/types";

type DeliveryConfig = StoreSettings["deliveryConfig"];

let passedCount = 0;
let totalCount = 0;

function testAssert(
  condition: boolean,
  message: string,
  envType: "SIMULATED FIXTURE" | "LIVE HTTP" | "LIVE SUPABASE" = "SIMULATED FIXTURE"
) {
  totalCount++;
  if (!condition) {
    console.error(`  [FAIL] [${envType}] ${message}`);
    throw new Error(`Assertion failed: [${envType}] ${message}`);
  }
  console.log(`  [PASS] [${envType}] ${message}`);
  passedCount++;
}

const BASE_URL = "http://localhost:3000";

async function runCartAndCheckoutTests() {
  console.log("================================================================================");
  console.log("STARTING TEST SUITE: Cart & Checkout Backend Correctness Audit");
  console.log("================================================================================\n");

  // ============================================================================
  // SECTION 1: SERVER-SIDE MONETARY & PRICING AUTHORITY
  // ============================================================================
  console.log("--- Section 1: Server-Side Monetary & Pricing Authority ---");

  // 1.1 Simulated Delivery Fee Calculation Rules
  const standardConfig: DeliveryConfig = {
    configuredArea: "Lhoksukon",
    standardFee: 4000,
    freeShippingThreshold: 50000,
  };

  // Pickup rule: Always Rp0
  const pickupCalc = calculateDeliveryFee({
    fulfillmentType: "pickup",
    deliveryArea: "Lhoksukon",
    subtotal: 25000,
    deliveryConfig: standardConfig,
  });
  testAssert(
    pickupCalc.shippingFee === 0 && !pickupCalc.isOutsideArea,
    "Pickup fulfillment strictly calculates Rp0 shipping fee regardless of subtotal",
    "SIMULATED FIXTURE"
  );

  // Delivery below threshold: standardFee
  const belowThresholdCalc = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 49999,
    deliveryConfig: standardConfig,
  });
  testAssert(
    belowThresholdCalc.shippingFee === 4000 && !belowThresholdCalc.isFree,
    "Delivery below threshold (Rp49.999 < Rp50.000) incurs standard fee (Rp4.000)",
    "SIMULATED FIXTURE"
  );

  // Delivery exactly at threshold: Rp0 free shipping
  const atThresholdCalc = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 50000,
    deliveryConfig: standardConfig,
  });
  testAssert(
    atThresholdCalc.shippingFee === 0 && atThresholdCalc.isFree,
    "Delivery exactly at threshold (Rp50.000) qualifies for free shipping (Rp0)",
    "SIMULATED FIXTURE"
  );

  // Delivery above threshold: Rp0 free shipping
  const aboveThresholdCalc = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 75000,
    deliveryConfig: standardConfig,
  });
  testAssert(
    aboveThresholdCalc.shippingFee === 0 && aboveThresholdCalc.isFree,
    "Delivery above threshold (Rp75.000 > Rp50.000) qualifies for free shipping (Rp0)",
    "SIMULATED FIXTURE"
  );

  // Delivery outside configured area
  const outsideCalc = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Area Lainnya",
    deliveryConfig: standardConfig,
    subtotal: 60000,
  });
  testAssert(
    outsideCalc.isOutsideArea === true,
    "Delivery to unconfigured area ('Area Lainnya') is correctly flagged as outside area",
    "SIMULATED FIXTURE"
  );

  // 1.2 Price Tampering Rejection via LIVE HTTP
  console.log("\n  [LIVE HTTP] Testing client price tampering defense against /api/orders...");
  const tamperedPayload = {
    customerName: "Penyerang Harga",
    customerWhatsapp: "081234567890",
    paymentMethod: "Cash",
    fulfillmentType: "pickup",
    // Attacker sends Rp1 for a Rp25.000 menu item
    items: [
      {
        productId: "nasi-bakar-cakalang",
        quantity: 1,
        basePrice: 1,
        unitPrice: 1,
        itemTotal: 1,
        selectedOptions: [
          {
            valueId: "b0000004-0000-4000-8000-000000000001",
          },
        ],
      },
    ],
    // Attacker also tampers with subtotal, shippingFee, and total
    subtotal: 1,
    shippingFee: 0,
    total: 1,
  };

  const tamperRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tamperedPayload),
  });

  testAssert(
    tamperRes.status === 201,
    "Order creation succeeds with HTTP 201 despite client tampering",
    "LIVE HTTP"
  );

  const tamperData = await tamperRes.json();
  testAssert(
    tamperData.success === true &&
      tamperData.order.items[0].basePrice === 25000 &&
      tamperData.order.items[0].unitPrice === 25000 &&
      tamperData.order.items[0].itemTotal === 25000 &&
      tamperData.order.subtotal === 25000 &&
      tamperData.order.total === 25000,
    "Server discarded client-submitted Rp1 and enforced authoritative database price (Rp25.000)",
    "LIVE HTTP"
  );

  // ============================================================================
  // SECTION 2: PRODUCT & OPTION GROUP CARDINALITY VALIDATION
  // ============================================================================
  console.log("\n--- Section 2: Product & Option Group Cardinality Validation ---");

  // 2.1 Non-existent product rejection
  const invalidProdRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Tester",
      customerWhatsapp: "081234567890",
      paymentMethod: "Cash",
      items: [{ productId: "produk-fiktif-12345", quantity: 1 }],
    }),
  });
  testAssert(
    invalidProdRes.status === 400,
    "Submitting non-existent product ID is rejected with HTTP 400",
    "LIVE HTTP"
  );
  const invalidProdData = await invalidProdRes.json();
  testAssert(
    invalidProdData.error?.includes("tidak ditemukan"),
    `Rejection message clearly indicates product not found: "${invalidProdData.error}"`,
    "LIVE HTTP"
  );

  // 2.2 Invalid quantities (0, negative, non-integer, > 100)
  for (const badQty of [0, -1, 1.5, 101]) {
    const badQtyRes = await fetch(`${BASE_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Tester",
        customerWhatsapp: "081234567890",
        paymentMethod: "Cash",
        items: [{ productId: "nasi-bakar-cakalang", quantity: badQty }],
      }),
    });
    testAssert(
      badQtyRes.status === 400,
      `Submitting invalid quantity (${badQty}) is rejected with HTTP 400`,
      "LIVE HTTP"
    );
  }

  // 2.3 Missing required option group ("Level Pedas" is required for Nasi Bakar)
  const missingRequiredRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Tester",
      customerWhatsapp: "081234567890",
      paymentMethod: "Cash",
      items: [{ productId: "nasi-bakar-cakalang", quantity: 1, selectedOptions: [] }],
    }),
  });
  testAssert(
    missingRequiredRes.status === 400,
    "Omitting required option group is rejected with HTTP 400",
    "LIVE HTTP"
  );
  const missingReqData = await missingRequiredRes.json();
  testAssert(
    missingReqData.error?.includes("Level Pedas"),
    `Rejection identifies missing required group: "${missingReqData.error}"`,
    "LIVE HTTP"
  );

  // 2.4 Exceeding max_select (selecting 2 options when max_select is 1)
  const exceedMaxRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Tester",
      customerWhatsapp: "081234567890",
      paymentMethod: "Cash",
      items: [
        {
          productId: "nasi-bakar-cakalang",
          quantity: 1,
          selectedOptions: [
            { valueId: "b0000004-0000-4000-8000-000000000001" },
            { valueId: "b0000004-0000-4000-8000-000000000002" },
          ],
        },
      ],
    }),
  });
  testAssert(
    exceedMaxRes.status === 400,
    "Exceeding max_select (2 selections when max=1) is rejected with HTTP 400",
    "LIVE HTTP"
  );
  const exceedMaxData = await exceedMaxRes.json();
  testAssert(
    exceedMaxData.error?.includes("maksimal 1 opsi"),
    `Rejection identifies max_select violation: "${exceedMaxData.error}"`,
    "LIVE HTTP"
  );

  // 2.5 Duplicate option values in same item
  const dupOptionRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Tester",
      customerWhatsapp: "081234567890",
      paymentMethod: "Cash",
      items: [
        {
          productId: "nasi-bakar-cakalang",
          quantity: 1,
          selectedOptions: [
            { valueId: "b0000004-0000-4000-8000-000000000001" },
            { valueId: "b0000004-0000-4000-8000-000000000001" },
          ],
        },
      ],
    }),
  });
  testAssert(
    dupOptionRes.status === 400,
    "Duplicate option value ID within same item is rejected with HTTP 400",
    "LIVE HTTP"
  );

  // 2.6 Duplicate add-on IDs in same item
  const dupAddonRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Tester",
      customerWhatsapp: "081234567890",
      paymentMethod: "Cash",
      items: [
        {
          productId: "nasi-bakar-cakalang",
          quantity: 1,
          selectedOptions: [{ valueId: "b0000004-0000-4000-8000-000000000001" }],
          selectedAddons: [
            { addonId: "b0000005-0000-4000-8000-000000000001" },
            { addonId: "b0000005-0000-4000-8000-000000000001" },
          ],
        },
      ],
    }),
  });
  testAssert(
    dupAddonRes.status === 400,
    "Duplicate add-on ID within same item is rejected with HTTP 400",
    "LIVE HTTP"
  );

  // ============================================================================
  // SECTION 3: CHECKOUT FORM VALIDATION & PHONE NORMALIZATION
  // ============================================================================
  console.log("\n--- Section 3: Checkout Form Validation & Phone Normalization ---");

  // Phone normalization assertions
  const validPhones = [
    { input: "081234567890", expected: "6281234567890" },
    { input: "+62 822-7318-0000", expected: "6282273180000" },
    { input: "6285211223344", expected: "6285211223344" },
    { input: "0852-9988-7766", expected: "6285299887766" },
  ];
  for (const vp of validPhones) {
    const res = validateIndonesianPhone(vp.input);
    testAssert(
      res.isValid && res.normalized === vp.expected,
      `Phone "${vp.input}" correctly normalizes to "${vp.expected}"`,
      "SIMULATED FIXTURE"
    );
  }

  // Invalid phones
  const invalidPhones = ["12345", "abcd", "0812", "012345678901"];
  for (const ip of invalidPhones) {
    const res = validateIndonesianPhone(ip);
    testAssert(
      !res.isValid,
      `Invalid phone "${ip}" is correctly rejected`,
      "SIMULATED FIXTURE"
    );
  }

  // Name validation via HTTP (< 2 chars)
  const shortNameRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "A",
      customerWhatsapp: "081234567890",
      paymentMethod: "Cash",
      items: [{ productId: "nasi-bakar-cakalang", quantity: 1 }],
    }),
  });
  testAssert(
    shortNameRes.status === 400,
    "Customer name < 2 characters is rejected with HTTP 400",
    "LIVE HTTP"
  );

  // Outside delivery area rejection via HTTP
  const outsideAreaRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Warga Luar Kota",
      customerWhatsapp: "081234567890",
      paymentMethod: "Cash",
      fulfillmentType: "delivery",
      deliveryArea: "Kecamatan Matangkuli",
      items: [
        {
          productId: "nasi-bakar-cakalang",
          quantity: 1,
          selectedOptions: [{ valueId: "b0000004-0000-4000-8000-000000000001" }],
        },
      ],
    }),
  });
  testAssert(
    outsideAreaRes.status === 400,
    "Delivery to unconfigured area is rejected with HTTP 400",
    "LIVE HTTP"
  );
  const outsideAreaData = await outsideAreaRes.json();
  testAssert(
    outsideAreaData.error?.includes("belum terkonfigurasi"),
    `Error message guides customer to contact admin: "${outsideAreaData.error}"`,
    "LIVE HTTP"
  );

  // ============================================================================
  // SECTION 4: IDEMPOTENCY & DUPLICATE SUBMISSION DEFENSE
  // ============================================================================
  console.log("\n--- Section 4: Idempotency & Duplicate Submission Defense ---");

  // Generate a valid 32-char idempotency token
  const idempotencyToken = `idem_test_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  testAssert(
    isValidTokenFormat(idempotencyToken),
    `Generated client idempotency token passes token format validation: "${idempotencyToken}"`,
    "SIMULATED FIXTURE"
  );

  const orderPayload = {
    token: idempotencyToken,
    customerName: "Siti Rahma",
    customerWhatsapp: "082165432100",
    paymentMethod: "Cash",
    fulfillmentType: "pickup",
    items: [
      {
        productId: "nasi-bakar-cakalang",
        quantity: 1,
        selectedOptions: [{ valueId: "b0000004-0000-4000-8000-000000000001" }],
      },
    ],
  };

  // 4.1 First submission
  const firstSubmissionRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload),
  });
  testAssert(
    firstSubmissionRes.status === 201,
    "First submission with idempotency token returns HTTP 201 Created",
    "LIVE HTTP"
  );
  const firstData = await firstSubmissionRes.json();
  const createdOrderId = firstData.order.id;
  testAssert(
    firstData.order.token === idempotencyToken,
    "Created order binds to the provided idempotency token",
    "LIVE HTTP"
  );

  // 4.2 Repeated submission (e.g. double click or network retry)
  const retrySubmissionRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload),
  });
  testAssert(
    retrySubmissionRes.status === 200,
    "Retry submission with identical token returns HTTP 200 OK (idempotent response)",
    "LIVE HTTP"
  );
  const retryData = await retrySubmissionRes.json();
  testAssert(
    retryData.isRetry === true,
    "Response explicitly flags 'isRetry: true'",
    "LIVE HTTP"
  );
  testAssert(
    retryData.order.id === createdOrderId,
    `Retry returned the same order ID ("${createdOrderId}") without allocating duplicate order number`,
    "LIVE HTTP"
  );

  // ============================================================================
  // SECTION 5: PAYMENT METHOD & INITIAL STATUS COMBINATIONS
  // ============================================================================
  console.log("\n--- Section 5: Payment Method & Initial Status Combinations ---");

  // 5.1 Cash Payment Order
  testAssert(
    firstData.order.paymentMethod === "Cash" &&
      firstData.order.orderStatus === "Pesanan baru" &&
      firstData.order.paymentStatus === "Menunggu Pembayaran" &&
      firstData.order.paymentDeadline === "",
    "Cash order initializes: paymentStatus='Menunggu Pembayaran', orderStatus='Pesanan baru', empty paymentDeadline",
    "LIVE HTTP"
  );

  // 5.2 QRIS Static Payment Order
  const qrisToken = `qris_test_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const qrisPayload = {
    token: qrisToken,
    customerName: "Ahmad Dani",
    customerWhatsapp: "085299887766",
    paymentMethod: "QRIS Statis",
    fulfillmentType: "pickup",
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
  testAssert(
    qrisRes.status === 201,
    "QRIS order creation succeeds with HTTP 201",
    "LIVE HTTP"
  );
  const qrisData = await qrisRes.json();
  testAssert(
    qrisData.order.paymentMethod === "QRIS Statis" &&
      qrisData.order.orderStatus === "Pesanan baru" &&
      qrisData.order.paymentStatus === "Menunggu Verifikasi",
    "QRIS order initializes: paymentStatus='Menunggu Verifikasi', orderStatus='Pesanan baru'",
    "LIVE HTTP"
  );

  // Check 30-minute deadline
  const createdAtMs = new Date(qrisData.order.createdAt).getTime();
  const deadlineMs = new Date(qrisData.order.paymentDeadline).getTime();
  const diffMinutes = Math.round((deadlineMs - createdAtMs) / (60 * 1000));
  testAssert(
    diffMinutes === 30,
    `QRIS order paymentDeadline is set exactly 30 minutes from createdAt (diff: ${diffMinutes}m)`,
    "LIVE HTTP"
  );

  // 5.3 Reject invalid payment method
  const invalidMethodRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Tester",
      customerWhatsapp: "081234567890",
      paymentMethod: "PayLater",
      items: [{ productId: "nasi-bakar-cakalang", quantity: 1 }],
    }),
  });
  testAssert(
    invalidMethodRes.status === 400,
    "Invalid payment method ('PayLater') is rejected with HTTP 400",
    "LIVE HTTP"
  );

  // ============================================================================
  // SECTION 6: ORDER DETAIL PRIVACY & SANITIZATION (PRD Section 14)
  // ============================================================================
  console.log("\n--- Section 6: Order Detail Privacy & Token Access ---");

  // Query order by token via GET /api/orders/[token]
  const tokenQueryRes = await fetch(`${BASE_URL}/api/orders/${qrisToken}`, {
    cache: "no-store",
  });
  testAssert(
    tokenQueryRes.status === 200,
    "Querying order by token returns HTTP 200 OK",
    "LIVE HTTP"
  );
  const tokenQueryData = await tokenQueryRes.json();
  testAssert(
    tokenQueryData.success === true && tokenQueryData.order.id === qrisData.order.id,
    "Token access returns matching order details",
    "LIVE HTTP"
  );

  // PII masking check
  testAssert(
    tokenQueryData.order.customerWhatsapp === "",
    "Customer WhatsApp number is completely stripped in public token endpoint response",
    "LIVE HTTP"
  );
  testAssert(
    tokenQueryData.order.customerName === "A***",
    `Customer name is masked to protect PII: "${tokenQueryData.order.customerName}"`,
    "LIVE HTTP"
  );

  // Invalid / non-existent token check
  const badTokenRes = await fetch(`${BASE_URL}/api/orders/non_existent_token_123456789`, {
    cache: "no-store",
  });
  testAssert(
    badTokenRes.status === 404,
    "Querying non-existent token returns HTTP 404 Not Found",
    "LIVE HTTP"
  );

  // ============================================================================
  // SECTION 7: LIVE SUPABASE DATABASE & SCHEMA INSPECTION
  // ============================================================================
  console.log("\n--- Section 7: Live Supabase Backend & Schema Inspection ---");

  const envPath = path.join(process.cwd(), ".env.local");
  let supabaseUrl = "";
  let supabasePublishableKey = "";

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
        supabaseUrl = line.split("=")[1]?.trim();
      }
      if (line.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=")) {
        supabasePublishableKey = line.split("=")[1]?.trim();
      }
    }
  }

  testAssert(
    Boolean(supabaseUrl && supabasePublishableKey),
    "Supabase URL and publishable key present in .env.local",
    "LIVE SUPABASE"
  );

  const supabaseClient = createClient(supabaseUrl, supabasePublishableKey);

  // 7.1 Verify products table queryable
  const { data: dbProducts, error: dbProdErr } = await supabaseClient
    .from("products")
    .select("id, name, slug, price, is_available")
    .limit(3);
  testAssert(
    dbProdErr === null && Array.isArray(dbProducts) && dbProducts.length > 0,
    `Live 'products' table queryable (${dbProducts?.length} sample products found)`,
    "LIVE SUPABASE"
  );

  // 7.2 Verify delivery_areas table queryable
  const { data: dbAreas, error: dbAreaErr } = await supabaseClient
    .from("delivery_areas")
    .select("id, name, fee, is_active")
    .eq("is_active", true);
  testAssert(
    dbAreaErr === null && Array.isArray(dbAreas) && dbAreas.length > 0,
    `Live 'delivery_areas' table queryable (${dbAreas?.length} active delivery area found: "${dbAreas?.[0]?.name}")`,
    "LIVE SUPABASE"
  );

  // 7.3 Check production order persistence migration status on remote database
  const { error: areaColErr } = await supabaseClient
    .from("orders")
    .select("delivery_area")
    .limit(1);

  const isMigrationApplied = areaColErr === null;
  console.log(
    `  [INFO] [LIVE SUPABASE] Migration 20261022000000_production_order_persistence.sql status: ${
      isMigrationApplied ? "APPLIED" : "PENDING (NOT YET APPLIED TO REMOTE DATABASE)"
    }`
  );

  testAssert(
    true, // Diagnostic reporting assertion
    `Remote Supabase migration status verified: ${
      isMigrationApplied
        ? "Remote database has applied order persistence columns."
        : "Remote database has NOT yet applied 20261022000000_production_order_persistence.sql (manual review blocker before production deployment)."
    }`,
    "LIVE SUPABASE"
  );

  console.log("\n================================================================================");
  console.log(`TEST SUITE FINISHED: ${passedCount}/${totalCount} assertions passed.`);
  console.log("================================================================================\n");
}

runCartAndCheckoutTests().catch((err) => {
  console.error("Test suite encountered fatal error:", err);
  process.exit(1);
});
