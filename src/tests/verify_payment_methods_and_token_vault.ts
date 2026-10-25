import assert from "assert";
import { saveOrder, updateOrderStatusServer, getOrderByToken, getOrdersByTokens } from "@/lib/orders-store";
import { generateSecureOrderToken } from "@/lib/token-security";
import { Order } from "@/types";

async function runTests() {
  console.log("==================================================================");
  console.log("TEST SUITE: Payment Methods (QRIS & Cash) and Token Vault Safety");
  console.log("==================================================================\n");

  // 1. Create QRIS Order
  console.log("=== 1. Testing QRIS Order Creation & Verification ===");
  const qrisToken = generateSecureOrderToken();
  const qrisOrderId = `TJ-QRIS-${Date.now()}`;
  const qrisOrder: Order = {
    id: qrisOrderId,
    token: qrisToken,
    createdAt: new Date().toISOString(),
    customerName: "Pelanggan QRIS",
    customerWhatsapp: "081234567890",
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    orderNote: "",
    items: [
      {
        id: "item-1",
        productId: "nasi-bakar-cakalang",
        productName: "Nasi Bakar Cakalang",
        productImage: "",
        basePrice: 25000,
        unitPrice: 25000,
        quantity: 1,
        itemTotal: 25000,
        itemNote: "",
        isAvailable: true,
        selectedOptions: [],
        selectedAddons: [],
      },
    ],
    subtotal: 25000,
    shippingFee: 4000,
    total: 29000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Verifikasi",
    paymentMethod: "QRIS Statis",
    paymentDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    merchantName: "Nook by Jina",
  };

  const savedQris = await saveOrder(qrisOrder);
  assert.strictEqual(savedQris.paymentMethod, "QRIS Statis", "QRIS method preserved");
  assert.strictEqual(savedQris.paymentStatus, "Menunggu Verifikasi", "QRIS initial payment status is Menunggu Verifikasi");
  assert.strictEqual(savedQris.token, qrisToken, "QRIS order token is preserved on save");

  // Lookup by token
  const retrievedQris = await getOrderByToken(qrisToken);
  assert(retrievedQris !== null, "QRIS order retrievable by secret token");
  assert.strictEqual(retrievedQris?.paymentMethod, "QRIS Statis");
  assert.strictEqual(retrievedQris?.token, qrisToken, "Token matches retrieved order");
  console.log("✅ PASSED: QRIS order creation and token lookup verified.");

  // 2. Create Cash Order
  console.log("\n=== 2. Testing Cash Order Creation & Fulfillment Flow ===");
  const cashToken = generateSecureOrderToken();
  const cashOrderId = `TJ-CASH-${Date.now()}`;
  const cashOrder: Order = {
    id: cashOrderId,
    token: cashToken,
    createdAt: new Date().toISOString(),
    customerName: "Pelanggan Tunai",
    customerWhatsapp: "081298765432",
    fulfillmentType: "pickup",
    deliveryArea: "Pickup Toko (Lhoksukon)",
    orderNote: "Bayar tunai di kasir",
    items: [
      {
        id: "item-2",
        productId: "nasi-bakar-ayam",
        productName: "Nasi Bakar Ayam Suwir",
        productImage: "",
        basePrice: 22000,
        unitPrice: 22000,
        quantity: 2,
        itemTotal: 44000,
        itemNote: "",
        isAvailable: true,
        selectedOptions: [],
        selectedAddons: [],
      },
    ],
    subtotal: 44000,
    shippingFee: 0,
    total: 44000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Pembayaran",
    paymentMethod: "Cash",
    paymentDeadline: "",
    merchantName: "Nook by Jina",
  };

  const savedCash = await saveOrder(cashOrder);
  assert.strictEqual(savedCash.paymentMethod, "Cash", "Cash method preserved");
  assert.strictEqual(savedCash.paymentStatus, "Menunggu Pembayaran", "Cash initial payment status is Menunggu Pembayaran");
  assert.strictEqual(savedCash.token, cashToken, "Cash order token is preserved on save");

  // Advance cash order through fulfillment without marking paid prematurely
  const diprosesOrder = await updateOrderStatusServer(cashOrderId, "Diproses");
  assert.strictEqual(diprosesOrder?.orderStatus, "Diproses", "Cash order can be processed before payment");
  assert.strictEqual(diprosesOrder?.paymentStatus, "Menunggu Pembayaran", "Payment remains Menunggu Pembayaran during cooking");

  const siapOrder = await updateOrderStatusServer(cashOrderId, "Siap");
  assert.strictEqual(siapOrder?.orderStatus, "Siap", "Cash order can be ready before payment");
  assert.strictEqual(siapOrder?.paymentStatus, "Menunggu Pembayaran", "Payment remains Menunggu Pembayaran when food is ready");

  // Admin marks cash received upon pickup & completes order
  const selesaiOrder = await updateOrderStatusServer(cashOrderId, "Selesai", "Lunas");
  assert.strictEqual(selesaiOrder?.orderStatus, "Selesai", "Cash order completed");
  assert.strictEqual(selesaiOrder?.paymentStatus, "Lunas", "Cash order marked Lunas upon cash receipt");
  console.log("✅ PASSED: Cash order fulfillment lifecycle verified.");

  // 3. Batch Token Lookup Preserves Tokens
  console.log("\n=== 3. Testing Batch Token History Retrieval ===");
  const history = await getOrdersByTokens([qrisToken, cashToken]);
  assert.strictEqual(history.length, 2, "Both customer orders found");
  const foundQris = history.find((o) => o.id === qrisOrderId);
  const foundCash = history.find((o) => o.id === cashOrderId);
  assert(foundQris !== undefined, "QRIS order present in history");
  assert(foundCash !== undefined, "Cash order present in history");
  assert.strictEqual(foundQris?.token, qrisToken, "QRIS order in history has its token preserved");
  assert.strictEqual(foundCash?.token, cashToken, "Cash order in history has its token preserved");
  console.log("✅ PASSED: Batch token lookup preserves secret customer tokens.");

  // 4. Strict Initial Status Binding & Mismatch Rejection
  console.log("\n=== 4. Testing Strict Initial Status Binding & Mismatch Rejection ===");
  
  // 4a. QRIS with 'Menunggu Pembayaran' must be rejected
  await assert.rejects(
    async () => {
      await saveOrder({
        ...qrisOrder,
        id: `TJ-QRIS-MISMATCH-${Date.now()}`,
        token: generateSecureOrderToken(),
        paymentMethod: "QRIS Statis",
        paymentStatus: "Menunggu Pembayaran",
      });
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("tidak valid untuk metode QRIS"),
        `Expected error message about invalid QRIS status, got: ${err.message}`
      );
      return true;
    },
    "QRIS with Menunggu Pembayaran must be rejected"
  );

  // 4b. Cash with 'Menunggu Verifikasi' must be rejected
  await assert.rejects(
    async () => {
      await saveOrder({
        ...cashOrder,
        id: `TJ-CASH-MISMATCH-${Date.now()}`,
        token: generateSecureOrderToken(),
        paymentMethod: "Cash",
        paymentStatus: "Menunggu Verifikasi",
      });
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("tidak valid untuk metode Cash"),
        `Expected error message about invalid Cash status, got: ${err.message}`
      );
      return true;
    },
    "Cash with Menunggu Verifikasi must be rejected"
  );

  // 4c. Non-initial status 'Lunas' on order creation must be rejected
  await assert.rejects(
    async () => {
      await saveOrder({
        ...qrisOrder,
        id: `TJ-QRIS-LUNAS-${Date.now()}`,
        token: generateSecureOrderToken(),
        paymentMethod: "QRIS Statis",
        paymentStatus: "Lunas",
      });
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("tidak valid untuk metode QRIS"),
        `Expected error message rejecting non-initial status, got: ${err.message}`
      );
      return true;
    },
    "Order creation with non-initial status Lunas must be rejected"
  );

  // 4d. Transitioning active Cash order to Menunggu Verifikasi must be rejected
  const activeCashOrder = await saveOrder({
    ...cashOrder,
    id: `TJ-CASH-ACTIVE-${Date.now()}`,
    token: generateSecureOrderToken(),
  });
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(activeCashOrder.id, undefined, "Menunggu Verifikasi");
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("Metode pembayaran Cash tidak valid dengan status"),
        `Expected error rejecting Cash transition to Menunggu Verifikasi, got: ${err.message}`
      );
      return true;
    },
    "Transitioning Cash order to Menunggu Verifikasi must be rejected"
  );

  // 4e. Transitioning QRIS order to Menunggu Pembayaran must be rejected
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(qrisOrderId, undefined, "Menunggu Pembayaran");
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("Metode pembayaran QRIS tidak valid dengan status"),
        `Expected error rejecting QRIS transition to Menunggu Pembayaran, got: ${err.message}`
      );
      return true;
    },
    "Transitioning QRIS order to Menunggu Pembayaran must be rejected"
  );
  console.log("✅ PASSED: Mismatched, non-initial, and invalid lifecycle transitions are strictly rejected.");

  console.log("\n==================================================================");
  console.log("🎉 ALL PAYMENT & TOKEN VAULT INVARIANT TESTS PASSED (0 FAILURES)!");
  console.log("==================================================================\n");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
