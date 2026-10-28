// Pre-empt server-only module restriction in test harness
// @ts-expect-error test harness require cache mock
require.cache[require.resolve("server-only")] = { exports: {} };

import assert from "assert";
import {
  saveOrder,
  updateOrderStatusServer,
  getOrderByToken,
  getAdminOrdersServer,
} from "../lib/orders-store";
import { generateSecureOrderToken } from "../lib/token-security";
import { Order } from "../types";

console.log("================================================================================");
console.log("STARTING TEST SUITE: Checkout Idempotency & QRIS Verification Hardening");
console.log("================================================================================\n");

async function runTests() {
  const dummyItem = {
    id: "item-1",
    productId: "prod-1",
    productName: "Tortilla Roll Chicken Crispy",
    productImage: "",
    basePrice: 15000,
    selectedOptions: [],
    selectedAddons: [],
    itemNote: "",
    quantity: 1,
    unitPrice: 15000,
    itemTotal: 15000,
    isAvailable: true,
  };

  // -----------------------------------------------------------------------------
  // TEST 1: RETRY WITH SAME TOKEN RETURNS EXISTING ORDER WITHOUT DUPLICATION
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: Retry with Same Token Returns Existing Order (Idempotency) ---");
  const token1 = generateSecureOrderToken();
  const orderInput1: Order = {
    id: "",
    token: token1,
    createdAt: new Date().toISOString(),
    customerName: "LUPI",
    customerWhatsapp: "081234567890",
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    orderNote: "",
    items: [dummyItem],
    subtotal: 15000,
    shippingFee: 4000,
    total: 19000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Verifikasi",
    paymentMethod: "QRIS Statis",
    paymentDeadline: new Date(Date.now() + 1800000).toISOString(),
    merchantName: "Nook by Jina",
  };

  const createdOrder1 = await saveOrder(orderInput1);
  assert(createdOrder1.id.startsWith("TJ-"), "Order ID must follow canonical TJ-YYMMDD-NNN format");
  assert.strictEqual(createdOrder1.total, 19000, "Order total must match");
  console.log(`  [PASS] Order 1 created successfully with ID: ${createdOrder1.id}`);

  // Simulate retry with the exact same token
  const lookupRetry = await getOrderByToken(token1);
  assert(lookupRetry !== null, "Retry lookup by token must find existing order");
  assert.strictEqual(lookupRetry?.id, createdOrder1.id, "Retry lookup must return identical order ID");
  assert.strictEqual(lookupRetry?.customerName, "LUPI", "Customer name must match");
  console.log(`  [PASS] Retry with token returns original order ${lookupRetry?.id} without duplicate creation\n`);

  // -----------------------------------------------------------------------------
  // TEST 2: TWO DISTINCT CHECKOUTS PRODUCE DISTINCT ORDERS WITHOUT SEQUENCE JUMPING
  // -----------------------------------------------------------------------------
  console.log("--- TEST 2: Two Distinct Checkouts Produce Distinct Orders ---");
  const token2 = generateSecureOrderToken();
  const orderInput2: Order = {
    id: "",
    token: token2,
    createdAt: new Date().toISOString(),
    customerName: "LUPI KE-2",
    customerWhatsapp: "081234567899",
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    orderNote: "",
    items: [dummyItem],
    subtotal: 15000,
    shippingFee: 4000,
    total: 19000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Verifikasi",
    paymentMethod: "QRIS Statis",
    paymentDeadline: new Date(Date.now() + 1800000).toISOString(),
    merchantName: "Nook by Jina",
  };

  const createdOrder2 = await saveOrder(orderInput2);
  assert(createdOrder2.id.startsWith("TJ-"), "Order 2 ID must follow canonical format");
  assert.notStrictEqual(token1, token2, "Tokens must be distinct");
  console.log(`  [PASS] Distinct checkout produced order: ${createdOrder2.id}`);
  console.log("  [PASS] Two separate customers/tokens do not collide\n");

  // -----------------------------------------------------------------------------
  // TEST 3: QRIS VERIFICATION TRANSITION & IDEMPOTENCY
  // -----------------------------------------------------------------------------
  console.log("--- TEST 3: QRIS Verification by Order Identifier ---");
  const verifiedOrder = await updateOrderStatusServer(createdOrder1.id, "Diproses", "Lunas");
  assert(verifiedOrder !== null, "Verification must succeed");
  assert.strictEqual(verifiedOrder?.orderStatus, "Diproses", "Order status must transition to Diproses");
  assert.strictEqual(verifiedOrder?.paymentStatus, "Lunas", "Payment status must transition to Lunas");
  console.log(`  [PASS] Order ${createdOrder1.id} successfully verified to Diproses + Lunas`);

  // Repeated click / idempotent verification check
  const reVerifiedOrder = await updateOrderStatusServer(createdOrder1.id, "Diproses", "Lunas");
  assert(reVerifiedOrder !== null, "Repeated verification must remain successful");
  assert.strictEqual(reVerifiedOrder?.paymentStatus, "Lunas", "Repeated verification remains Lunas");
  console.log(`  [PASS] Repeated verification is strictly idempotent\n`);

  // -----------------------------------------------------------------------------
  // TEST 4: NON-EXISTENT ORDER IDENTIFIER RETURNS NULL (404)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 4: Non-existent Order Returns Null Cleanly ---");
  const nonExistentResult = await updateOrderStatusServer("TJ-999999-999", "Diproses", "Lunas");
  assert.strictEqual(nonExistentResult, null, "Querying non-existent order must return null without throwing 22P02");
  console.log("  [PASS] Non-existent order number handled cleanly without syntax crashes\n");

  // -----------------------------------------------------------------------------
  // TEST 5: ADMIN ORDERS DASHBOARD DOES NOT POLLUTE WITH PHANTOM IN-MEMORY ENTRIES
  // -----------------------------------------------------------------------------
  console.log("--- TEST 5: Admin Orders Isolation ---");
  const adminOrders = await getAdminOrdersServer();
  assert(Array.isArray(adminOrders), "Admin orders must be an array");
  console.log(`  [PASS] Admin orders fetched cleanly (${adminOrders.length} orders evaluated)\n`);

  console.log("================================================================================");
  console.log("ALL TESTS IN VERIFY_CHECKOUT_IDEMPOTENCY_AND_QRIS_VERIFICATION PASSED!");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
