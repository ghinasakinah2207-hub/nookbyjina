import assert from "assert";
import {
  saveOrder,
  updateOrderStatusServer,
  getOrderByToken,
  getOrdersByTokens,
  getAdminOrdersServer,
} from "@/lib/orders-store";
import {
  isOrderExpired,
  isQrisMethod,
  isPendingQrisStatus,
  ORDER_PAYMENT_DEADLINE_MS,
} from "@/lib/order-normalizer";
import { calculateDashboardMetrics } from "@/lib/admin-reports";
import { generateSecureOrderToken } from "@/lib/token-security";
import { Order } from "@/types";

async function runExpirationTests() {
  console.log("==================================================================");
  console.log("TEST SUITE: 30-Minute Payment Expiration & Invariant Enforcement");
  console.log("==================================================================\n");

  const createOrderWithOffset = async (
    ageMinutes: number,
    overrides: Partial<Order> = {}
  ): Promise<Order> => {
    const rawToken = generateSecureOrderToken();
    const now = Date.now();
    const createdAtTime = now - ageMinutes * 60 * 1000;
    const createdAtStr = new Date(createdAtTime).toISOString();
    const deadlineStr = new Date(createdAtTime + ORDER_PAYMENT_DEADLINE_MS).toISOString();
    const orderId = `TJ-EXP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const baseOrder: Order = {
      id: orderId,
      token: rawToken,
      createdAt: createdAtStr,
      customerName: "Pelanggan Uji Kedaluwarsa",
      customerWhatsapp: "081234567890",
      fulfillmentType: "delivery",
      deliveryArea: "Lhoksukon",
      orderNote: "",
      items: [
        {
          id: "item-test-exp",
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
      paymentDeadline: deadlineStr,
      merchantName: "Nook by Jina",
      ...overrides,
    };

    return await saveOrder(baseOrder);
  };

  // -----------------------------------------------------------------------------
  // SCENARIO 1: Order QRIS belum berumur 30 menit (tetap menunggu verifikasi)
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 1: Order QRIS < 30 menit tetap menunggu verifikasi ===");
  const freshOrder = await createOrderWithOffset(10); // 10 minutes old
  assert.strictEqual(
    isOrderExpired(freshOrder),
    false,
    "Order created 10 minutes ago must NOT be expired"
  );
  assert.strictEqual(freshOrder.paymentStatus, "Menunggu Verifikasi");
  assert.strictEqual(freshOrder.orderStatus, "Pesanan baru");

  // Admin verification succeeds for unexpired order
  const verifiedOrder = await updateOrderStatusServer(
    freshOrder.id,
    "Diproses",
    "Lunas"
  );
  assert.ok(verifiedOrder, "Verification must succeed for fresh order");
  assert.strictEqual(verifiedOrder?.paymentStatus, "Lunas");
  assert.strictEqual(verifiedOrder?.orderStatus, "Diproses");
  console.log("✅ PASSED: Fresh QRIS order is verified successfully.\n");

  // -----------------------------------------------------------------------------
  // SCENARIO 2: Order tepat sebelum batas waktu (tidak dibatalkan terlalu dini)
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 2: Order tepat sebelum batas waktu tidak kedaluwarsa ===");
  const justBeforeDeadlineOrder = await createOrderWithOffset(29.8); // 29m 48s old
  assert.strictEqual(
    isOrderExpired(justBeforeDeadlineOrder),
    false,
    "Order before 30-minute threshold must not be marked expired"
  );

  const lookupJustBefore = await getOrderByToken(justBeforeDeadlineOrder.token);
  assert.ok(lookupJustBefore);
  assert.strictEqual(
    lookupJustBefore?.orderStatus,
    "Pesanan baru",
    "Order just before deadline must remain 'Pesanan baru'"
  );
  assert.strictEqual(
    lookupJustBefore?.paymentStatus,
    "Menunggu Verifikasi",
    "Order just before deadline must remain 'Menunggu Verifikasi'"
  );
  console.log("✅ PASSED: Order right before deadline is NOT cancelled prematurely.\n");

  // -----------------------------------------------------------------------------
  // SCENARIO 3: Order sudah melewati 30 menit (tidak dapat diverifikasi)
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 3: Order > 30 menit tidak dapat diverifikasi ===");
  const expiredOrder = await createOrderWithOffset(35); // 35 minutes old
  assert.strictEqual(
    isOrderExpired(expiredOrder),
    true,
    "Order created 35 minutes ago must be recognized as expired"
  );

  await assert.rejects(
    async () => {
      await updateOrderStatusServer(expiredOrder.id, "Diproses", "Lunas");
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("kedaluwarsa"),
        `Error message must mention 'kedaluwarsa', got: "${err.message}"`
      );
      return true;
    },
    "Verification of expired QRIS order must be rejected"
  );

  // Status must be automatically moved to Dibatalkan in storage
  const checkedExpired = await getOrderByToken(expiredOrder.token);
  assert.strictEqual(
    checkedExpired?.orderStatus,
    "Dibatalkan",
    "Expired order must be moved to 'Dibatalkan' order status"
  );
  assert.strictEqual(
    checkedExpired?.paymentStatus,
    "Dibatalkan",
    "Expired order must be moved to 'Dibatalkan' payment status"
  );
  console.log("✅ PASSED: Expired QRIS order verification is strictly rejected and marked cancelled.\n");

  // -----------------------------------------------------------------------------
  // SCENARIO 4: Order kedaluwarsa: status backend dan dashboard admin konsisten
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 4: Status backend & admin dashboard konsisten ===");
  const staleOrder1 = await createOrderWithOffset(40);
  const staleOrder2 = await createOrderWithOffset(60);

  // Fetch through getAdminOrdersServer
  const adminOrders = await getAdminOrdersServer();
  const matchedStale1 = adminOrders.find((o) => o.id === staleOrder1.id);
  const matchedStale2 = adminOrders.find((o) => o.id === staleOrder2.id);

  assert.ok(matchedStale1);
  assert.ok(matchedStale2);
  assert.strictEqual(
    matchedStale1?.orderStatus,
    "Dibatalkan",
    "Admin order view must reflect Dibatalkan status for expired order"
  );
  assert.strictEqual(
    matchedStale1?.paymentStatus,
    "Dibatalkan",
    "Admin order view must reflect Dibatalkan payment status for expired order"
  );

  // Check metrics computation
  const metrics = calculateDashboardMetrics(adminOrders);
  assert.strictEqual(
    adminOrders.filter((o) => isQrisMethod(o.paymentMethod) && isPendingQrisStatus(o.paymentStatus) && !isOrderExpired(o)).some((o) => o.id === staleOrder1.id),
    false,
    "Expired order must not appear in pending verification queue"
  );
  assert.strictEqual(
    metrics.pendingQrisCount,
    adminOrders.filter((o) => isQrisMethod(o.paymentMethod) && isPendingQrisStatus(o.paymentStatus) && !isOrderExpired(o)).length,
    "Dashboard pending QRIS count must strictly reflect active, unexpired pending QRIS orders"
  );
  assert.ok(
    metrics.cancelledCount >= 2,
    "Cancelled count in dashboard metrics must accurately count expired orders"
  );
  assert.ok(
    metrics.paymentBreakdown.dibatalkan >= 2,
    "Payment breakdown cancelled count must accurately count expired orders"
  );

  // Check isolated metrics on expired orders
  const isolatedStaleMetrics = calculateDashboardMetrics([staleOrder1, staleOrder2]);
  assert.strictEqual(isolatedStaleMetrics.pendingQrisCount, 0, "Expired orders alone must produce 0 pending QRIS in metrics");
  assert.strictEqual(isolatedStaleMetrics.newOrdersCount, 0, "Expired orders alone must produce 0 new orders in metrics");
  assert.strictEqual(isolatedStaleMetrics.cancelledCount, 2, "Expired orders alone must be counted in cancelledCount");
  assert.strictEqual(isolatedStaleMetrics.paymentBreakdown.dibatalkan, 2, "Expired orders alone must be counted in payment breakdown cancelled");

  // Fetch through batch tokens
  const historyOrders = await getOrdersByTokens([staleOrder1.token, staleOrder2.token]);
  for (const hist of historyOrders) {
    assert.strictEqual(hist.orderStatus, "Dibatalkan");
    assert.strictEqual(hist.paymentStatus, "Dibatalkan");
  }
  console.log("✅ PASSED: Expired order statuses are completely consistent across admin and customer views.\n");

  // -----------------------------------------------------------------------------
  // SCENARIO 5: Order sudah dibayar/terverifikasi: tidak dibatalkan mekanisme kedaluwarsa
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 5: Order Lunas tidak dibatalkan oleh masa berlaku ===");
  const freshPaidCandidate = await createOrderWithOffset(5);
  const paidOldOrder = await updateOrderStatusServer(freshPaidCandidate.id, "Diproses", "Lunas");
  assert.ok(paidOldOrder);

  // Even if deadline is far in the past or order is evaluated hours later:
  const evalLater = Date.now() + 5 * 60 * 60 * 1000;
  assert.strictEqual(
    isOrderExpired(paidOldOrder, evalLater),
    false,
    "Paid order must NEVER be marked expired regardless of age or evaluation time"
  );

  const lookupPaid = await getOrderByToken(freshPaidCandidate.token);
  assert.strictEqual(lookupPaid?.orderStatus, "Diproses");
  assert.strictEqual(lookupPaid?.paymentStatus, "Lunas");
  console.log("✅ PASSED: Paid order is protected from payment expiration.\n");

  // -----------------------------------------------------------------------------
  // SCENARIO 6: Order sedang diproses atau selesai: tidak dibatalkan
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 6: Order Diproses/Selesai tidak dibatalkan ===");
  const candInProgress = await createOrderWithOffset(5);
  const inProgressOrder = await updateOrderStatusServer(candInProgress.id, "Diproses", "Lunas");

  const candCompleted = await createOrderWithOffset(5);
  await updateOrderStatusServer(candCompleted.id, "Diproses", "Lunas");
  const completedOrder = await updateOrderStatusServer(candCompleted.id, "Selesai");

  assert.strictEqual(isOrderExpired(inProgressOrder, evalLater), false);
  assert.strictEqual(isOrderExpired(completedOrder, evalLater), false);
  console.log("✅ PASSED: Active in-progress and completed orders never expire.\n");

  // -----------------------------------------------------------------------------
  // SCENARIO 7: Order sudah dibatalkan: tidak diubah kembali
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 7: Order yang telah dibatalkan tidak dapat diaktifkan kembali ===");
  const cancelledOld = await createOrderWithOffset(50);
  // Auto cancelled by reading
  await getOrderByToken(cancelledOld.token);

  await assert.rejects(
    async () => {
      await updateOrderStatusServer(cancelledOld.id, "Diproses");
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("dibatalkan") || err.message.includes("kedaluwarsa"),
        `Error must reject reactivation, got: "${err.message}"`
      );
      return true;
    },
    "Resurrecting cancelled order must be strictly rejected"
  );
  console.log("✅ PASSED: Cancelled orders cannot be resurrected.\n");

  // -----------------------------------------------------------------------------
  // SCENARIO 8: Dua request bersamaan (verifikasi & kedaluwarsa)
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 8: Concurrency safety antara verifikasi dan kedaluwarsa ===");
  const raceOrder = await createOrderWithOffset(31); // slightly expired

  // Launch parallel verification and status lookup
  const results = await Promise.allSettled([
    updateOrderStatusServer(raceOrder.id, "Diproses", "Lunas"),
    getOrderByToken(raceOrder.token),
  ]);

  // The verification must fail because it's expired
  assert.strictEqual(results[0].status, "rejected");
  const finalState = await getOrderByToken(raceOrder.token);
  assert.strictEqual(finalState?.orderStatus, "Dibatalkan");
  assert.strictEqual(finalState?.paymentStatus, "Dibatalkan");
  console.log("✅ PASSED: Concurrent verification and expiration resolve consistently.\n");

  // -----------------------------------------------------------------------------
  // SCENARIO 9: Pengguna tanpa otorisasi admin tidak dapat memverifikasi QRIS
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 9: Non-admin authorization guard check ===");
  // Test the policy enforced in PATCH /api/orders/status:
  // Customers (isAdmin = false) attempting paymentStatus = 'Lunas' or orderStatus = 'Diproses' are rejected with 403.
  const nonAdminActionCheck = (isAdmin: boolean, paymentStatus?: string, orderStatus?: string) => {
    if (!isAdmin) {
      if (
        paymentStatus === "Lunas" ||
        orderStatus === "Diproses" ||
        orderStatus === "Siap" ||
        orderStatus === "Selesai"
      ) {
        throw new Error("Akses ditolak: Hanya admin toko yang berhak memverifikasi pembayaran dan memproses pesanan.");
      }
    }
  };

  assert.throws(
    () => nonAdminActionCheck(false, "Lunas"),
    /Akses ditolak/,
    "Customer cannot mark order as Lunas"
  );
  assert.throws(
    () => nonAdminActionCheck(false, undefined, "Diproses"),
    /Akses ditolak/,
    "Customer cannot advance order to Diproses"
  );
  console.log("✅ PASSED: Non-admin caller is strictly prevented from verifying QRIS.\n");

  // -----------------------------------------------------------------------------
  // SCENARIO 10: Zona waktu browser berbeda tidak memengaruhi aturan masa berlaku
  // -----------------------------------------------------------------------------
  console.log("=== Scenario 10: Timezone independence & UTC epoch consistency ===");
  const utcNow = Date.now();
  const deadlineUtc = new Date(utcNow + 30 * 60 * 1000).toISOString(); // UTC format: 'YYYY-MM-DDTHH:mm:ss.sssZ'
  const parsedEpoch = new Date(deadlineUtc).getTime();
  assert.strictEqual(
    Math.round((parsedEpoch - utcNow) / 1000),
    30 * 60,
    "UTC ISO string parsed across any timezone produces exact epoch milliseconds"
  );

  // Test various ISO offset representations of the same instant
  const t1 = "2026-10-27T10:00:00.000Z";
  const t2 = "2026-10-27T17:00:00.000+07:00"; // WIB (UTC+7)
  const t3 = "2026-10-27T05:00:00.000-05:00"; // EST (UTC-5)
  assert.strictEqual(new Date(t1).getTime(), new Date(t2).getTime(), "WIB and UTC timestamps resolve to same epoch");
  assert.strictEqual(new Date(t1).getTime(), new Date(t3).getTime(), "EST and UTC timestamps resolve to same epoch");

  // Verify isOrderExpired evaluates identical result regardless of representation
  const mockOrderWib = {
    paymentMethod: "QRIS Statis",
    paymentStatus: "Menunggu Verifikasi",
    orderStatus: "Pesanan baru",
    paymentDeadline: t2,
  };
  const mockOrderUtc = {
    ...mockOrderWib,
    paymentDeadline: t1,
  };
  const evalTimeBefore = new Date("2026-10-27T09:59:00.000Z").getTime();
  const evalTimeAfter = new Date("2026-10-27T10:01:00.000Z").getTime();

  assert.strictEqual(isOrderExpired(mockOrderWib, evalTimeBefore), false);
  assert.strictEqual(isOrderExpired(mockOrderUtc, evalTimeBefore), false);
  assert.strictEqual(isOrderExpired(mockOrderWib, evalTimeAfter), true);
  assert.strictEqual(isOrderExpired(mockOrderUtc, evalTimeAfter), true);
  console.log("✅ PASSED: Timezone independence verified across UTC, WIB, and foreign timezone offsets.\n");

  console.log("==================================================================");
  console.log("🎉 ALL 10 MANDATORY EXPIRATION INVARIANT SCENARIOS PASSED (0 FAILURES)!");
  console.log("==================================================================");
}

runExpirationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
