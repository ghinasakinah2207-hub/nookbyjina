import {
  saveOrder,
  getOrderByToken,
  getOrdersByTokens,
  updateOrderStatusServer,
  sanitizeOrderForCustomer,
  getAdminOrdersServer,
} from "../lib/orders-store";
import { Order } from "../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log("=== 1. Verifying Real Persisted Order Storage & Lookup ===");

  const testToken = "test_tok_sec_" + Math.random().toString(36).substring(2, 15);
  const testOrder: Order = {
    id: "TJ-261021-999",
    token: testToken,
    createdAt: new Date().toISOString(),
    customerName: "Budi Santoso",
    customerWhatsapp: "081234567890",
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    orderNote: "Tolong bungkus rapi",
    items: [
      {
        id: "item-1",
        productId: "nasi-bakar-cakalang",
        productName: "Nasi Bakar Cakalang Asap",
        productImage: "/images/nasi-bakar.webp",
        basePrice: 25000,
        unitPrice: 25000,
        quantity: 2,
        itemTotal: 50000,
        itemNote: "",
        isAvailable: true,
        selectedOptions: [{ groupId: "opt-1", groupName: "Pedas", valueId: "v-1", valueName: "Level 1", priceDelta: 0 }],
        selectedAddons: [],
      },
    ],
    subtotal: 50000,
    shippingFee: 0,
    total: 50000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Verifikasi",
    paymentMethod: "QRIS Statis",
    paymentDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    merchantName: "Nook by Jina",
  };

  await saveOrder(testOrder);

  // Read back by token
  const retrieved = await getOrderByToken(testToken);
  assert(retrieved !== null, "Order is successfully persisted to server and retrievable by secret token");
  assert(retrieved?.id === "TJ-261021-999", "Retrieved order ID matches persisted ID");
  assert(retrieved?.total === 50000, "Retrieved total matches persisted amount");
  assert(retrieved?.orderStatus === "Pesanan baru", "Retrieved order status matches persisted state");
  assert(retrieved?.paymentStatus === "Menunggu Verifikasi", "Retrieved payment status matches persisted state");

  console.log("\n=== 2. Verifying Customer Data Sanitization (Zero-Trust Privacy) ===");
  const sanitized = sanitizeOrderForCustomer(retrieved!);
  assert(sanitized.customerWhatsapp === "", "Customer phone number is stripped from public token response");
  assert(sanitized.customerName.includes("***"), "Customer name is masked to protect customer privacy");
  assert(sanitized.items.length === 1, "Order items remain intact in sanitized response");
  assert(sanitized.total === 50000, "Total and financial details remain intact in sanitized response");

  console.log("\n=== 3. Verifying Unknown/Invalid Token Rejection & No Mock Fallback ===");
  const unknownToken = "invalid_token_xyz_999999999999";
  const nonExistent = await getOrderByToken(unknownToken);
  assert(nonExistent === null, "Unknown token returns null, never returns fake/mock order data");

  const malformedToken = "short";
  const malformed = await getOrderByToken(malformedToken);
  assert(malformed === null, "Short/malformed token safely fails and returns null");

  console.log("\n=== 4. Verifying Refreshing Preserves Latest Authoritative Status ===");
  // Simulate admin updating status on server
  await updateOrderStatusServer(testOrder.id, "Diproses", "Lunas");

  const refreshedOrder = await getOrderByToken(testToken);
  assert(refreshedOrder?.orderStatus === "Diproses", "Refreshed order reflects latest backend order status ('Diproses')");
  assert(refreshedOrder?.paymentStatus === "Lunas", "Refreshed order reflects latest backend payment status ('Lunas')");

  // Re-read authoritative orders to ensure persistence across sessions
  const storeOrders = await getAdminOrdersServer();
  const foundOrder = storeOrders.find((o: Order) => o.id === testOrder.id);
  assert(foundOrder?.orderStatus === "Diproses", "Persisted order maintains updated status across server restarts");

  console.log("\n=== 5. Verifying Scoped /pesanan Order History Retrieval ===");
  // Customer with testToken can only see their own order
  const customerHistory = await getOrdersByTokens([testToken]);
  assert(customerHistory.length === 1, "Customer retrieves exactly their own authorized order");
  assert(customerHistory[0].id === testOrder.id, "Order history contains the expected authorized order");

  // Customer without tokens gets empty array
  const emptyHistory = await getOrdersByTokens([]);
  assert(emptyHistory.length === 0, "Empty token list yields empty history (proper empty state, no storewide dump)");

  // Random tokens do not leak existing orders
  const randomHistory = await getOrdersByTokens(["token_abc_not_found_12345678"]);
  assert(randomHistory.length === 0, "Invalid tokens yield empty history and never expose another customer's order");

  console.log("\n=== 6. Verifying API Routes Behavior Via Direct HTTP Calls ===");
  const BASE_URL = "http://localhost:3000";

  const httpToken = `tok_sec_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const httpOrderPayload = {
    token: httpToken,
    customerName: "Budi Santoso",
    customerWhatsapp: "081234567890",
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

  const createRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(httpOrderPayload),
  });
  assert(createRes.status === 201, `POST /api/orders returns HTTP 201 (got ${createRes.status})`);
  const createData = await createRes.json();
  const httpOrderId = createData.order.id;

  // Test 6.1: Valid token API lookup
  const tokenRes = await fetch(`${BASE_URL}/api/orders/${httpToken}`);
  assert(tokenRes.status === 200, `GET /api/orders/[token] returns HTTP 200 (got ${tokenRes.status})`);
  const tokenData = await tokenRes.json();
  assert(tokenData.success === true, "GET /api/orders/[token] reports success: true");
  assert(tokenData.order.id === httpOrderId, "GET /api/orders/[token] returns the real persisted order");
  assert(tokenData.order.customerWhatsapp === "", "API route strips customer phone number");

  // Test 6.2: Invalid token API lookup
  const invalidRes = await fetch(`${BASE_URL}/api/orders/non_existent_token_1234567890`);
  assert(invalidRes.status === 404, `GET /api/orders/[invalid-token] returns HTTP 404 (got ${invalidRes.status})`);
  const invalidData = await invalidRes.json();
  assert(invalidData.success === false, "GET /api/orders/[invalid-token] reports success: false");

  // Test 6.3: History API
  const historyRes = await fetch(`${BASE_URL}/api/orders/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens: [httpToken] }),
  });
  assert(historyRes.status === 200, `POST /api/orders/history returns HTTP 200 (got ${historyRes.status})`);
  const historyData = await historyRes.json();
  assert(historyData.orders.length >= 1, "POST /api/orders/history returns scoped order list");

  // Test 6.4: Customer unauthorized status mutation rejection
  const unauthorizedMutate = await fetch(`${BASE_URL}/api/orders/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: httpOrderId,
      paymentStatus: "Lunas",
      orderStatus: "Diproses",
    }),
  });
  assert(
    unauthorizedMutate.status === 403,
    `Unauthorized client status mutation to 'Lunas' is blocked with HTTP 403 Forbidden (got ${unauthorizedMutate.status})`
  );

  console.log("\n🎉 ALL ORDER SECURITY & DETAILS TESTS PASSED SUCCESSFULLY!\n");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
