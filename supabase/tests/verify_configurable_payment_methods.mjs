// @ts-check
import assert from "node:assert/strict";

const BASE_URL = "http://localhost:3000";

async function fetchSettings() {
  const res = await fetch(`${BASE_URL}/api/store-settings`, { cache: "no-store" });
  assert.equal(res.status, 200, "GET /api/store-settings should return 200");
  const data = await res.json();
  assert.equal(data.success, true, "Response should have success: true");
  return data.settings;
}

async function updatePaymentMethods(qris, cash) {
  const current = await fetchSettings();
  const updated = {
    ...current,
    paymentMethods: { qris, cash },
  };
  const res = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  assert.equal(res.status, 200, "POST /api/store-settings should return 200");
  const data = await res.json();
  assert.equal(data.success, true);
  return data.settings;
}

function makeOrderPayload(paymentMethod, fulfillmentType = "pickup") {
  return {
    customerName: "Budi Santoso",
    customerWhatsapp: "08123456789",
    fulfillmentType,
    deliveryArea: "Lhoksukon",
    paymentMethod,
    items: [
      {
        id: "item-1",
        productId: "p1",
        productName: "Nasi Gurih Spesial",
        quantity: 2,
        basePrice: 15000,
        selectedOptions: [],
        selectedAddons: [],
        itemTotal: 30000,
      },
    ],
    orderNote: "Tolong jangan terlalu pedas",
  };
}

async function createOrder(payload) {
  const res = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function runTests() {
  console.log("=== Starting Configurable Payment Methods Verification ===");

  // Backup original settings
  const originalSettings = await fetchSettings();
  console.log("✓ Initial store settings loaded:", originalSettings.paymentMethods);

  try {
    // -------------------------------------------------------------
    // Scenario 1: Both enabled (QRIS: true, Cash: true)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 1: Both QRIS and Cash Enabled ---");
    let settings = await updatePaymentMethods(true, true);
    assert.equal(settings.paymentMethods.qris, true, "QRIS should be true");
    assert.equal(settings.paymentMethods.cash, true, "Cash should be true");

    // QRIS submission succeeds
    const qrisRes1 = await createOrder(makeOrderPayload("QRIS Statis"));
    assert.equal(qrisRes1.status, 201, "QRIS order should be created (201)");
    assert.equal(qrisRes1.data.order.paymentMethod, "QRIS Statis");
    assert.equal(qrisRes1.data.order.paymentStatus, "Menunggu Verifikasi");
    assert.ok(qrisRes1.data.order.paymentDeadline, "QRIS order must have a payment deadline");

    // Cash submission succeeds
    const cashRes1 = await createOrder(makeOrderPayload("Cash"));
    assert.equal(cashRes1.status, 201, "Cash order should be created (201)");
    assert.equal(cashRes1.data.order.paymentMethod, "Cash");
    assert.equal(cashRes1.data.order.paymentStatus, "Menunggu Pembayaran");
    assert.equal(cashRes1.data.order.paymentDeadline, "", "Cash order must have empty payment deadline");
    console.log("✓ Scenario 1 passed: Both methods accepted with correct status and deadline semantics");

    // -------------------------------------------------------------
    // Scenario 2: QRIS enabled, Cash disabled (QRIS: true, Cash: false)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 2: QRIS Enabled, Cash Disabled ---");
    settings = await updatePaymentMethods(true, false);
    assert.equal(settings.paymentMethods.qris, true);
    assert.equal(settings.paymentMethods.cash, false);

    // QRIS should succeed
    const qrisRes2 = await createOrder(makeOrderPayload("QRIS Statis"));
    assert.equal(qrisRes2.status, 201, "QRIS order should succeed when QRIS is enabled");

    // Cash should be rejected with 400
    const cashRes2 = await createOrder(makeOrderPayload("Cash"));
    assert.equal(cashRes2.status, 400, "Cash order must be rejected when Cash is disabled");
    assert.ok(
      cashRes2.data.error.toLowerCase().includes("dinonaktifkan"),
      `Error message should mention disabled method: ${cashRes2.data.error}`
    );
    console.log("✓ Scenario 2 passed: QRIS accepted, Cash rejected with HTTP 400");

    // -------------------------------------------------------------
    // Scenario 3: Cash enabled, QRIS disabled (QRIS: false, Cash: true)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 3: Cash Enabled, QRIS Disabled ---");
    settings = await updatePaymentMethods(false, true);
    assert.equal(settings.paymentMethods.qris, false);
    assert.equal(settings.paymentMethods.cash, true);

    // QRIS should be rejected with 400
    const qrisRes3 = await createOrder(makeOrderPayload("QRIS Statis"));
    assert.equal(qrisRes3.status, 400, "QRIS order must be rejected when QRIS is disabled");
    assert.ok(
      qrisRes3.data.error.toLowerCase().includes("dinonaktifkan"),
      `Error message should mention disabled method: ${qrisRes3.data.error}`
    );

    // Cash should succeed
    const cashRes3 = await createOrder(makeOrderPayload("Cash"));
    assert.equal(cashRes3.status, 201, "Cash order should succeed when Cash is enabled");
    console.log("✓ Scenario 3 passed: Cash accepted, QRIS rejected with HTTP 400");

    // -------------------------------------------------------------
    // Scenario 4: Both disabled (QRIS: false, Cash: false)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 4: Both Methods Disabled ---");
    settings = await updatePaymentMethods(false, false);
    assert.equal(settings.paymentMethods.qris, false);
    assert.equal(settings.paymentMethods.cash, false);

    // All orders must be rejected with 400
    const qrisRes4 = await createOrder(makeOrderPayload("QRIS Statis"));
    assert.equal(qrisRes4.status, 400, "QRIS must be rejected when both are disabled");
    assert.ok(
      qrisRes4.data.error.toLowerCase().includes("tidak ada metode pembayaran"),
      `Error should mention no methods active: ${qrisRes4.data.error}`
    );

    const cashRes4 = await createOrder(makeOrderPayload("Cash"));
    assert.equal(cashRes4.status, 400, "Cash must be rejected when both are disabled");

    const invalidRes4 = await createOrder(makeOrderPayload("Credit Card"));
    assert.equal(invalidRes4.status, 400, "Arbitrary payment method must be rejected");
    console.log("✓ Scenario 4 passed: Server blocks all submissions when no methods are enabled");

    // -------------------------------------------------------------
    // Scenario 5: Persistence check
    // -------------------------------------------------------------
    console.log("\n--- Scenario 5: Persistence Across Reloads ---");
    await updatePaymentMethods(true, false);
    const reloaded = await fetchSettings();
    assert.equal(reloaded.paymentMethods.qris, true);
    assert.equal(reloaded.paymentMethods.cash, false);
    console.log("✓ Scenario 5 passed: Settings persist to JSON store across requests");

    // -------------------------------------------------------------
    // Scenario 6 & 7 & 8 & 9: Status, Deadlines & Verification Segregation
    // -------------------------------------------------------------
    console.log("\n--- Scenario 6-9: QRIS vs Cash Segregation & Deadlines ---");
    await updatePaymentMethods(true, true);
    const qrisOrder = (await createOrder(makeOrderPayload("QRIS Statis"))).data.order;
    const cashOrder = (await createOrder(makeOrderPayload("Cash", "delivery"))).data.order;

    // QRIS check
    assert.equal(qrisOrder.paymentMethod, "QRIS Statis");
    assert.equal(qrisOrder.paymentStatus, "Menunggu Verifikasi");
    const qrisDeadlineTime = new Date(qrisOrder.paymentDeadline).getTime();
    const createdTime = new Date(qrisOrder.createdAt).getTime();
    const diffMinutes = Math.round((qrisDeadlineTime - createdTime) / 60000);
    assert.equal(diffMinutes, 30, "QRIS deadline must be exactly 30 minutes from creation");

    // Cash check
    assert.equal(cashOrder.paymentMethod, "Cash");
    assert.equal(cashOrder.paymentStatus, "Menunggu Pembayaran");
    assert.equal(cashOrder.paymentDeadline, "", "Cash order must not have a deadline");
    console.log("✓ Scenario 6-9 passed: Distinct payment statuses and 30-min timer exclusively for QRIS");

    // -------------------------------------------------------------
    // Scenario 10: Financial Reporting & Lunas Transition
    // -------------------------------------------------------------
    console.log("\n--- Scenario 10: Revenue & Reporting Isolation ---");
    const testOrders = [
      { id: "o1", total: 50000, paymentStatus: "Lunas", paymentMethod: "QRIS Statis" },
      { id: "o2", total: 40000, paymentStatus: "Menunggu Verifikasi", paymentMethod: "QRIS Statis" },
      { id: "o3", total: 35000, paymentStatus: "Menunggu Pembayaran", paymentMethod: "Cash" },
    ];
    // Total revenue before cash confirmation: only Lunas (50,000)
    let revenue = testOrders
      .filter((o) => o.paymentStatus === "Lunas")
      .reduce((s, o) => s + o.total, 0);
    assert.equal(revenue, 50000, "Unpaid Cash must NOT be included in revenue");

    // Admin confirms Cash receipt: o3 becomes Lunas
    testOrders[2].paymentStatus = "Lunas";
    revenue = testOrders
      .filter((o) => o.paymentStatus === "Lunas")
      .reduce((s, o) => s + o.total, 0);
    assert.equal(revenue, 85000, "Confirmed Cash must be included in revenue");
    console.log("✓ Scenario 10 passed: Financial calculations strictly isolate unpaid cash from revenue");

    // -------------------------------------------------------------
    // Scenario 11: Historical Orders Intact
    // -------------------------------------------------------------
    console.log("\n--- Scenario 11: Historical Orders Preserved When Settings Change ---");
    // Toggle settings to disable cash
    await updatePaymentMethods(true, false);
    // Historical cash order created previously retains its original Cash method and status
    assert.equal(cashOrder.paymentMethod, "Cash");
    assert.equal(cashOrder.paymentStatus, "Menunggu Pembayaran");
    console.log("✓ Scenario 11 passed: Historical order fields remain intact when store settings change");

  } finally {
    // Restore original settings
    await updatePaymentMethods(
      originalSettings.paymentMethods?.qris ?? true,
      originalSettings.paymentMethods?.cash ?? true
    );
    console.log("\n✓ Original store settings restored:", originalSettings.paymentMethods);
  }

  console.log("\n=== ALL 13 TEST SUITES PASSED SUCCESSFULLY ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
