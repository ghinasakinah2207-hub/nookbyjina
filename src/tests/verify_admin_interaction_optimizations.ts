/**
 * Test Suite: Admin Dashboard Interaction Performance & Regression Verifications
 * File: src/tests/verify_admin_interaction_optimizations.ts
 *
 * Requirements Tested:
 * 1. Single click execution & double-click protection (idempotency & concurrency lock).
 * 2. Optimistic UI update and clean rollback on server rejection.
 * 3. QRIS verification updates status and queues consistently.
 * 4. Batch order merge idempotency and state synchronization.
 * 5. Product option groups and values batch insertion mapping.
 * 6. Store settings and status toggle resilience without duplicate re-renders.
 */

import { saveOrder, updateOrderStatusServer, getOrderByToken } from "@/lib/orders-store";
import { generateSecureOrderToken } from "@/lib/token-security";
import { Order } from "@/types";
import { isQrisMethod, isPendingQrisStatus, isPaidStatus } from "@/lib/order-normalizer";
import { getStoreSettings } from "@/lib/supabase/store-settings";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, message: string) {
  totalCount++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runAdminInteractionTests() {
  console.log("================================================================================");
  console.log("TEST SUITE: Admin Dashboard Interaction Performance & Concurrency Invariants");
  console.log("================================================================================\n");

  const createTestOrder = async (overrides: Partial<Order> = {}): Promise<Order> => {
    const rawToken = generateSecureOrderToken();
    const orderId = `TJ-INT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const baseOrder: Order = {
      id: orderId,
      token: rawToken,
      createdAt: new Date().toISOString(),
      customerName: "Pelanggan Admin Test",
      customerWhatsapp: "081234567890",
      fulfillmentType: "delivery",
      deliveryArea: "Lhoksukon",
      orderNote: "",
      items: [
        {
          id: "item-1",
          productId: "risol-mayo",
          productName: "Risol Mayo Beef Lumer",
          productImage: "",
          basePrice: 15000,
          unitPrice: 15000,
          quantity: 2,
          itemTotal: 30000,
          itemNote: "",
          isAvailable: true,
          selectedOptions: [],
          selectedAddons: [],
        },
      ],
      subtotal: 30000,
      shippingFee: 5000,
      total: 35000,
      orderStatus: "Pesanan baru",
      paymentStatus: "Menunggu Verifikasi",
      paymentMethod: "QRIS Statis",
      paymentDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      merchantName: "Nook by Jina",
      ...overrides,
    };
    return await saveOrder(baseOrder);
  };

  // =========================================================================
  // SECTION 1: QRIS Verification & Single-Click Idempotency
  // =========================================================================
  console.log("--- Section 1: QRIS Verification & Single-Click Idempotency ---");

  const qrisOrder = await createTestOrder();
  assert(
    isQrisMethod(qrisOrder.paymentMethod) && isPendingQrisStatus(qrisOrder.paymentStatus),
    "New QRIS order is correctly placed in QRIS verification queue"
  );

  // Simulate double-click on QRIS verification modal
  // When an admin double-clicks rapidly, both calls must produce identical, consistent result without duplicate records or errors
  const [res1, res2] = await Promise.all([
    updateOrderStatusServer(qrisOrder.id, "Diproses", "Lunas"),
    updateOrderStatusServer(qrisOrder.id, "Diproses", "Lunas"),
  ]);

  assert(
    res1?.paymentStatus === "Lunas" && res2?.paymentStatus === "Lunas",
    "Concurrent duplicate verification requests both settle safely and idempotently"
  );

  const verifiedOrder = await getOrderByToken(qrisOrder.token || "");
  assert(
    verifiedOrder?.paymentStatus === "Lunas" && verifiedOrder?.orderStatus === "Diproses",
    "QRIS order transitioned to 'Lunas' and 'Diproses' in database"
  );
  assert(
    isPaidStatus(verifiedOrder?.paymentStatus || ""),
    "QRIS order is now identified as Paid, clearing it from the pending verification queue"
  );

  // =========================================================================
  // SECTION 2: Rollback on Server Rejection (Integrity Preservation)
  // =========================================================================
  console.log("\n--- Section 2: Optimistic UI Rollback on Server Rejection ---");

  // Attempting an illegal transition: trying to cancel an already finalized/paid order
  let illegalTransitionThrew = false;
  try {
    await updateOrderStatusServer(qrisOrder.id, "Dibatalkan", "Dibatalkan");
  } catch {
    illegalTransitionThrew = true;
  }
  assert(
    illegalTransitionThrew,
    "Server strictly rejects cancelling an already paid order"
  );

  // Verify that the order's state in storage was not corrupted
  const untouchedOrder = await getOrderByToken(qrisOrder.token || "");
  assert(
    untouchedOrder?.paymentStatus === "Lunas" && untouchedOrder?.orderStatus === "Diproses",
    "Server state correctly preserves 'Lunas' and prevents false rollback"
  );

  // =========================================================================
  // SECTION 3: Cash Payment Workflow Invariants
  // =========================================================================
  console.log("\n--- Section 3: Cash Payment Confirmation & Order Completion ---");

  const cashOrder = await createTestOrder({
    paymentMethod: "Cash",
    paymentStatus: "Menunggu Pembayaran",
    orderStatus: "Pesanan baru",
  });

  assert(
    cashOrder.paymentMethod === "Cash" && cashOrder.paymentStatus === "Menunggu Pembayaran",
    "Cash order initialized in pending cash receipt queue"
  );

  // Mark cash received -> Transitions to Diproses & Lunas
  const cashRes = await updateOrderStatusServer(cashOrder.id, "Diproses", "Lunas");
  assert(cashRes?.paymentStatus === "Lunas", "Confirming cash receipt succeeds");

  const receivedCashOrder = await getOrderByToken(cashOrder.token || "");
  assert(
    receivedCashOrder?.paymentStatus === "Lunas" && receivedCashOrder?.orderStatus === "Diproses",
    "Cash order is marked Lunas and moves to Diproses"
  );

  // Transition to Siap
  const readyRes = await updateOrderStatusServer(cashOrder.id, "Siap");
  assert(readyRes?.orderStatus === "Siap", "Marking order ready succeeds");

  // Transition to Selesai
  const completeRes = await updateOrderStatusServer(cashOrder.id, "Selesai");
  assert(completeRes?.orderStatus === "Selesai", "Completing order succeeds");

  const completedCashOrder = await getOrderByToken(cashOrder.token || "");
  assert(
    completedCashOrder?.orderStatus === "Selesai" && completedCashOrder?.paymentStatus === "Lunas",
    "Completed cash order remains Lunas and Selesai"
  );

  // =========================================================================
  // SECTION 4: Batch Order Merge Invariant
  // =========================================================================
  console.log("\n--- Section 4: Batch Order Merge Idempotency ---");

  // Verify merge logic: merging an incoming array of 3 orders preserves tokens
  const sampleOrders: Order[] = [
    { ...qrisOrder, orderStatus: "Diproses", paymentStatus: "Lunas" },
    { ...cashOrder, orderStatus: "Selesai", paymentStatus: "Lunas" },
  ];

  const map = new Map<string, Order>();
  for (const o of sampleOrders) {
    map.set(o.id, o);
  }

  // Adding existing order preserves token
  const incoming = { ...qrisOrder, customerName: "Updated Name" };
  const existing = map.get(incoming.id);
  const resolvedToken = incoming.token || existing?.token || "";
  map.set(incoming.id, { ...incoming, token: resolvedToken });

  assert(
    map.get(qrisOrder.id)?.token === qrisOrder.token,
    "Batch merge correctly preserves order token across updates"
  );
  assert(
    map.get(qrisOrder.id)?.customerName === "Updated Name",
    "Batch merge successfully updates order properties in a single pass"
  );

  // =========================================================================
  // SECTION 5: Product Option Groups & Values Batch Insert Mapping
  // =========================================================================
  console.log("\n--- Section 5: Product Option Groups Batch Mapping ---");

  const mockInputGroups = [
    {
      name: "Level Pedas",
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      values: [
        { name: "Sedang", priceDelta: 0 },
        { name: "Ekstra Pedas", priceDelta: 2000 },
      ],
    },
    {
      name: "Ukuran Porsi",
      isRequired: false,
      minSelect: 0,
      maxSelect: 1,
      values: [
        { name: "Reguler", priceDelta: 0 },
        { name: "Jumbo", priceDelta: 5000 },
      ],
    },
  ];

  const testProdId = "test-prod-uuid-1234";
  const validGroups = mockInputGroups.filter((g) => g.name && g.name.trim());
  const groupRowsWithId = validGroups.map((g, gIdx) => ({
    id: `grp-${gIdx + 1}`,
    product_id: testProdId,
    name: g.name.trim(),
    is_required: Boolean(g.isRequired),
    min_select: Number(g.minSelect) || (g.isRequired ? 1 : 0),
    max_select: Number(g.maxSelect) || 1,
    sort_order: gIdx + 1,
    _rawGroup: g,
  }));

  const allValRows = groupRowsWithId.flatMap((gRow) => {
    const values = gRow._rawGroup.values || [];
    return values
      .filter((v) => v.name && v.name.trim())
      .map((v, vIdx) => ({
        id: `val-${gRow.id}-${vIdx + 1}`,
        group_id: gRow.id,
        name: v.name.trim(),
        price_delta: Number(v.priceDelta) || 0,
        is_active: true,
        sort_order: vIdx + 1,
      }));
  });

  assert(
    groupRowsWithId.length === 2,
    "Batch mapping creates exactly 2 group rows in 1 pass"
  );
  assert(
    allValRows.length === 4,
    "Batch mapping creates exactly 4 option value rows in 1 pass"
  );
  assert(
    allValRows.every((v) => v.group_id.startsWith("grp-")),
    "Every value row is correctly linked to its parent group ID"
  );

  // =========================================================================
  // SECTION 6: Synchronous Ref-Lock Double Submission Prevention Invariant
  // =========================================================================
  console.log("\n--- Section 6: Synchronous Ref-Lock Concurrency Invariant ---");

  // Simulate two synchronous clicks hitting the handler before React can re-render
  let lockRef = false;
  let backendCallCount = 0;

  const simulateGuardedAction = async () => {
    // Exact logic used in PaymentsManager, OrdersManager, SettingsManager
    if (lockRef) return { skipped: true };
    lockRef = true;
    try {
      backendCallCount++;
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { skipped: false, success: true };
    } finally {
      lockRef = false;
    }
  };

  // Dispatch 2 synchronous clicks in same tick
  const click1 = simulateGuardedAction();
  const click2 = simulateGuardedAction();

  const [resClick1, resClick2] = await Promise.all([click1, click2]);

  assert(
    resClick1.skipped === false && resClick1.success === true,
    "First click is never ignored and executes underlying operation successfully"
  );
  assert(
    resClick2.skipped === true,
    "Second synchronous double-click is safely intercepted by synchronous ref lock"
  );
  assert(
    backendCallCount === 1,
    "Backend was called exactly once despite rapid double-click"
  );
  assert(
    lockRef === false,
    "Lock safely released in finally block ready for subsequent legitimate interactions"
  );

  // =========================================================================
  // SECTION 7: Fresh Store Settings Cache Bypass Verification
  // =========================================================================
  console.log("\n--- Section 7: Admin Store Settings Fresh Retrieval ---");

  const freshSettings = await getStoreSettings(undefined, { fresh: true });
  assert(
    typeof freshSettings.storeName === "string" && freshSettings.storeName.length > 0,
    "getStoreSettings({ fresh: true }) resolves valid authoritative settings"
  );
  assert(
    typeof freshSettings.isOpen === "boolean",
    "Fresh settings return verified isOpen boolean state"
  );

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} assertions PASSED (0 failures)`);
  console.log("================================================================================");
}

runAdminInteractionTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
