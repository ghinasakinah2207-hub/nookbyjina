import assert from "assert";
import { saveOrder, updateOrderStatusServer, getOrderByToken } from "@/lib/orders-store";
import { generateSecureOrderToken } from "@/lib/token-security";
import { Order } from "@/types";

async function runInvariantTests() {
  console.log("==================================================================");
  console.log("TEST SUITE: Order Status Transition Invariants & Immutability");
  console.log("==================================================================\n");

  const createTestOrder = async (overrides: Partial<Order> = {}): Promise<Order> => {
    const rawToken = generateSecureOrderToken();
    const orderId = `TJ-INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const baseOrder: Order = {
      id: orderId,
      token: rawToken,
      createdAt: new Date().toISOString(),
      customerName: "Pelanggan Uji",
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
      ...overrides,
    };
    return await saveOrder(baseOrder);
  };

  // -----------------------------------------------------------------------------
  // 1. COMPLETED-ORDER IMMUTABILITY
  // -----------------------------------------------------------------------------
  console.log("=== 1. Testing Completed-Order Immutability ===");
  const completedOrder = await createTestOrder({ orderStatus: "Pesanan baru", paymentStatus: "Menunggu Verifikasi" });
  await updateOrderStatusServer(completedOrder.id, "Diproses", "Lunas");
  await updateOrderStatusServer(completedOrder.id, "Selesai");

  // Verify completed order cannot be changed to 'Dibatalkan'
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(completedOrder.id, "Dibatalkan");
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("selesai tidak dapat diubah") ||
        err.message.includes("Lunas tidak dapat dibatalkan")
      );
      return true;
    },
    "Completed order must strictly reject transition to Dibatalkan"
  );

  // Verify completed order cannot be changed to preliminary states
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(completedOrder.id, "Diproses");
    },
    (err: Error) => {
      assert.ok(err.message.includes("selesai tidak dapat diubah"));
      return true;
    },
    "Completed order must reject reverting to Diproses"
  );

  // Verify completed order payment status cannot be changed to Dibatalkan
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(completedOrder.id, undefined, "Dibatalkan");
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("selesai tidak dapat diubah") ||
        err.message.includes("Lunas tidak dapat dibatalkan")
      );
      return true;
    },
    "Completed order payment status cannot be changed to Dibatalkan"
  );

  // Verify unpaid completed order payment status cannot be modified
  const unpaidCompleted = await createTestOrder({ orderStatus: "Pesanan baru", paymentStatus: "Menunggu Verifikasi" });
  await updateOrderStatusServer(unpaidCompleted.id, "Selesai");
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(unpaidCompleted.id, undefined, "Dibatalkan");
    },
    (err: Error) => {
      assert.ok(err.message.includes("selesai tidak dapat diubah"));
      return true;
    },
    "Unpaid completed order payment status cannot be modified"
  );

  // Idempotent update: passing the same status 'Selesai' is allowed
  const idempotentCompleted = await updateOrderStatusServer(completedOrder.id, "Selesai");
  assert.strictEqual(idempotentCompleted?.orderStatus, "Selesai", "Idempotently re-sending Selesai is permitted");
  console.log("✅ PASSED: Completed order status and payment status are strictly immutable.\n");

  // -----------------------------------------------------------------------------
  // 2. PAID ORDERS CANNOT BE CANCELLED
  // -----------------------------------------------------------------------------
  console.log("=== 2. Testing Paid Order Cancellation Rejection ===");
  const paidOrder = await createTestOrder({ orderStatus: "Diproses", paymentStatus: "Menunggu Verifikasi" });
  await updateOrderStatusServer(paidOrder.id, undefined, "Lunas");

  // Verify paid order cannot be cancelled via order status
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(paidOrder.id, "Dibatalkan");
    },
    (err: Error) => {
      assert.ok(err.message.includes("Lunas tidak dapat dibatalkan"));
      return true;
    },
    "Paid order cannot have orderStatus set to Dibatalkan"
  );

  // Verify paid order cannot be cancelled via payment status
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(paidOrder.id, undefined, "Dibatalkan");
    },
    (err: Error) => {
      assert.ok(err.message.includes("Lunas tidak dapat dibatalkan"));
      return true;
    },
    "Paid order cannot have paymentStatus set to Dibatalkan"
  );
  console.log("✅ PASSED: Cancellation of paid orders is strictly rejected.\n");

  // -----------------------------------------------------------------------------
  // 3. CANCELLED-ORDER RESURRECTION DEFENSE
  // -----------------------------------------------------------------------------
  console.log("=== 3. Testing Cancelled Order Resurrection Defense ===");
  const cancelledOrder = await createTestOrder({ orderStatus: "Pesanan baru", paymentStatus: "Menunggu Verifikasi" });
  await updateOrderStatusServer(cancelledOrder.id, "Dibatalkan", "Dibatalkan");

  // Verify cancelled order cannot be reactivated
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(cancelledOrder.id, "Diproses");
    },
    (err: Error) => {
      assert.ok(err.message.includes("dibatalkan tidak dapat diaktifkan kembali"));
      return true;
    },
    "Cancelled order cannot transition back to active order states"
  );
  console.log("✅ PASSED: Cancelled orders cannot be resurrected.\n");

  // -----------------------------------------------------------------------------
  // 4. CANCELLED PAYMENT CANNOT RECEIVE PAYMENT
  // -----------------------------------------------------------------------------
  console.log("=== 4. Testing Cancelled Payment to Paid Rejection ===");
  const cancelledPayOrder = await createTestOrder({ orderStatus: "Pesanan baru", paymentStatus: "Menunggu Verifikasi" });
  await updateOrderStatusServer(cancelledPayOrder.id, "Dibatalkan", "Dibatalkan");

  // Verify cancelled payment cannot be marked Lunas
  await assert.rejects(
    async () => {
      await updateOrderStatusServer(cancelledPayOrder.id, undefined, "Lunas");
    },
    (err: Error) => {
      assert.ok(err.message.includes("dibatalkan tidak dapat") || err.message.includes("Lunas"));
      return true;
    },
    "Cancelled order/payment cannot transition to Lunas"
  );
  console.log("✅ PASSED: Cancelled payment rejection verified.\n");

  // -----------------------------------------------------------------------------
  // 5. REPEATED PAID STATUS REQUESTS (IDEMPOTENCY & TIMESTAMP PRESERVATION)
  // -----------------------------------------------------------------------------
  console.log("=== 5. Testing Repeated Paid Status Idempotency ===");
  const repeatPayOrder = await createTestOrder({ orderStatus: "Diproses", paymentStatus: "Menunggu Verifikasi" });
  const firstPaid = await updateOrderStatusServer(repeatPayOrder.id, undefined, "Lunas");
  assert.strictEqual(firstPaid?.paymentStatus, "Lunas", "First update sets paymentStatus to Lunas");

  // Repeated call to Lunas
  const secondPaid = await updateOrderStatusServer(repeatPayOrder.id, undefined, "Lunas");
  assert.strictEqual(secondPaid?.paymentStatus, "Lunas", "Second update idempotently maintains Lunas");

  // Advance orderStatus to Siap while keeping Lunas
  const thirdUpdate = await updateOrderStatusServer(repeatPayOrder.id, "Siap", "Lunas");
  assert.strictEqual(thirdUpdate?.orderStatus, "Siap", "Advances to Siap");
  assert.strictEqual(thirdUpdate?.paymentStatus, "Lunas", "Maintains Lunas");
  console.log("✅ PASSED: Repeated paid-status requests are idempotent and stable.\n");

  // -----------------------------------------------------------------------------
  // 6. SINGLE-STATUS SYNCHRONIZATION POLICY
  // -----------------------------------------------------------------------------
  console.log("=== 6. Testing Single-Status Synchronization Policy ===");
  const syncOrder = await createTestOrder({ orderStatus: "Pesanan baru", paymentStatus: "Menunggu Verifikasi" });

  // Supply only orderStatus = 'Dibatalkan' -> auto-syncs paymentStatus to 'Dibatalkan'
  const autoSynced = await updateOrderStatusServer(syncOrder.id, "Dibatalkan");
  assert.strictEqual(autoSynced?.orderStatus, "Dibatalkan", "Order status is Dibatalkan");
  assert.strictEqual(autoSynced?.paymentStatus, "Dibatalkan", "Payment status was auto-synchronized to Dibatalkan");
  console.log("✅ PASSED: Single-status cancellation synchronization verified.\n");

  // -----------------------------------------------------------------------------
  // 7. CONCURRENT STATUS UPDATES
  // -----------------------------------------------------------------------------
  console.log("=== 7. Testing Concurrent Status Updates ===");
  const concurrentOrder = await createTestOrder({ orderStatus: "Pesanan baru", paymentStatus: "Menunggu Verifikasi" });

  // Fire concurrent status updates simulating race conditions
  const results = await Promise.allSettled([
    updateOrderStatusServer(concurrentOrder.id, "Diproses"),
    updateOrderStatusServer(concurrentOrder.id, undefined, "Lunas"),
  ]);

  // Both operations should resolve safely without throwing invariant collision
  for (const r of results) {
    assert.strictEqual(r.status, "fulfilled", "Concurrent valid updates must fulfill");
  }

  const finalCheck = await getOrderByToken(concurrentOrder.token);
  assert.strictEqual(finalCheck?.orderStatus, "Diproses", "Order is in Diproses status");
  assert.strictEqual(finalCheck?.paymentStatus, "Lunas", "Payment is in Lunas status");
  console.log("✅ PASSED: Concurrent status updates processed consistently.\n");

  console.log("==================================================================");
  console.log("🎉 ALL ORDER STATUS INVARIANT TESTS PASSED (0 FAILURES)!");
  console.log("==================================================================");
}

runInvariantTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
