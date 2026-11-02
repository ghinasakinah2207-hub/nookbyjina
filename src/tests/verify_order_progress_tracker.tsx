import React from "react";
import fs from "fs";
import path from "path";
import assert from "assert";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderProgressTracker, computeOrderProgress } from "../components/orders/OrderProgressTracker";
import { Order } from "../types";

console.log("================================================================================");
console.log("TEST SUITE: Customer Order History Horizontal Progress Tracker Redesign");
console.log("================================================================================\n");

function createMockOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "TJ-261102-001",
    token: "mock-token-1234567890abcdef",
    createdAt: new Date().toISOString(),
    customerName: "Budi Santoso",
    customerWhatsapp: "081234567890",
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    orderNote: "",
    items: [
      {
        id: "item-1",
        productId: "prod-1",
        productName: "Dimsum Mentai",
        productImage: "/images/dimsum-mentai.webp",
        basePrice: 25000,
        unitPrice: 25000,
        quantity: 2,
        itemTotal: 50000,
        selectedOptions: [],
        selectedAddons: [],
        itemNote: "",
        isAvailable: true,
      },
    ],
    subtotal: 50000,
    shippingFee: 4000,
    total: 54000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Pembayaran",
    paymentMethod: "QRIS Statis",
    paymentDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    merchantName: "Nook by Jina",
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Section 1: Scenario A — Awaiting Payment
// -----------------------------------------------------------------------------
console.log("--- Section 1: Scenario A — Awaiting Payment ---");
const orderAwaitingPay = createMockOrder({
  orderStatus: "Pesanan baru",
  paymentStatus: "Menunggu Pembayaran",
});
const progressA = computeOrderProgress(orderAwaitingPay);
assert(!progressA.isCancelled, "Not cancelled");
assert.strictEqual(progressA.stages[0].status, "active", "Stage 1 (Pembayaran) is active");
assert.strictEqual(progressA.stages[1].status, "upcoming", "Stage 2 (Diproses) is upcoming");
assert.strictEqual(progressA.stages[2].status, "upcoming", "Stage 3 (Fulfillment) is upcoming");
assert.strictEqual(progressA.stages[3].status, "upcoming", "Stage 4 (Selesai) is upcoming");
assert(!progressA.line0Active, "Connecting line 0 is inactive");
assert(!progressA.line1Active, "Connecting line 1 is inactive");
assert(!progressA.line2Active, "Connecting line 2 is inactive");
console.log("  [PASS] Awaiting Payment correctly sets Stage 1 as active and lines inactive");

// -----------------------------------------------------------------------------
// Section 2: Scenario B — Payment Successful, Waiting for Kitchen Preparation
// -----------------------------------------------------------------------------
console.log("\n--- Section 2: Scenario B — Paid, Waiting for Preparation ---");
const orderPaidWaiting = createMockOrder({
  orderStatus: "Pesanan baru",
  paymentStatus: "Lunas",
});
const progressB = computeOrderProgress(orderPaidWaiting);
assert(!progressB.isCancelled, "Not cancelled");
assert.strictEqual(progressB.stages[0].status, "completed", "Stage 1 (Pembayaran) is completed");
assert.strictEqual(progressB.stages[1].status, "upcoming", "Stage 2 (Diproses) remains upcoming before kitchen starts");
assert.strictEqual(progressB.stages[2].status, "upcoming", "Stage 3 (Fulfillment) is upcoming");
assert.strictEqual(progressB.stages[3].status, "upcoming", "Stage 4 (Selesai) is upcoming");
assert(progressB.statusSummaryText.includes("Menunggu"), "Displays waiting status without falsely claiming preparation started");
console.log("  [PASS] Paid order waiting for prep: Stage 1 completed, Stage 2 upcoming, accurate waiting summary");

// -----------------------------------------------------------------------------
// Section 3: Scenario C — Preparing (Diproses)
// -----------------------------------------------------------------------------
console.log("\n--- Section 3: Scenario C — Preparing (Diproses) ---");
const orderPreparing = createMockOrder({
  orderStatus: "Diproses",
  paymentStatus: "Lunas",
});
const progressC = computeOrderProgress(orderPreparing);
assert(!progressC.isCancelled, "Not cancelled");
assert.strictEqual(progressC.stages[0].status, "completed", "Stage 1 (Pembayaran) is completed");
assert.strictEqual(progressC.stages[1].status, "active", "Stage 2 (Diproses) is active");
assert.strictEqual(progressC.stages[2].status, "upcoming", "Stage 3 is upcoming");
assert.strictEqual(progressC.stages[3].status, "upcoming", "Stage 4 is upcoming");
assert(progressC.line0Active, "Line 0 is active (connecting to active Stage 2)");
assert(!progressC.line1Active, "Line 1 is inactive");
assert(!progressC.line2Active, "Line 2 is inactive");
console.log("  [PASS] Diproses: Stage 1 completed, Stage 2 active, Line 0 active");

// -----------------------------------------------------------------------------
// Section 4: Scenario D — Ready for Pickup
// -----------------------------------------------------------------------------
console.log("\n--- Section 4: Scenario D — Ready for Pickup ---");
const orderReadyPickup = createMockOrder({
  orderStatus: "Siap",
  paymentStatus: "Lunas",
  fulfillmentType: "pickup",
});
const progressD = computeOrderProgress(orderReadyPickup);
assert(!progressD.isCancelled, "Not cancelled");
assert.strictEqual(progressD.stages[0].status, "completed", "Stage 1 is completed");
assert.strictEqual(progressD.stages[1].status, "completed", "Stage 2 is completed");
assert.strictEqual(progressD.stages[2].status, "active", "Stage 3 is active");
assert.strictEqual(progressD.stages[2].label, "Siap Diambil", "Pickup label is 'Siap Diambil'");
assert.strictEqual(progressD.stages[3].status, "upcoming", "Stage 4 is upcoming");
assert(progressD.line0Active && progressD.line1Active, "Lines 0 and 1 are active");
assert(!progressD.line2Active, "Line 2 is inactive");
console.log("  [PASS] Ready for Pickup: Label 'Siap Diambil', Stage 3 active");

// -----------------------------------------------------------------------------
// Section 5: Scenario E — Out for Delivery
// -----------------------------------------------------------------------------
console.log("\n--- Section 5: Scenario E — Out for Delivery ---");
const orderOutDelivery = createMockOrder({
  orderStatus: "Siap",
  paymentStatus: "Lunas",
  fulfillmentType: "delivery",
});
const progressE = computeOrderProgress(orderOutDelivery);
assert(!progressE.isCancelled, "Not cancelled");
assert.strictEqual(progressE.stages[0].status, "completed", "Stage 1 is completed");
assert.strictEqual(progressE.stages[1].status, "completed", "Stage 2 is completed");
assert.strictEqual(progressE.stages[2].status, "active", "Stage 3 is active");
assert.strictEqual(progressE.stages[2].label, "Dalam Pengiriman", "Delivery label is 'Dalam Pengiriman'");
assert.strictEqual(progressE.stages[3].status, "upcoming", "Stage 4 is upcoming");
assert(progressE.line0Active && progressE.line1Active, "Lines 0 and 1 are active");
assert(!progressE.line2Active, "Line 2 is inactive");
console.log("  [PASS] Out for Delivery: Label 'Dalam Pengiriman', Stage 3 active");

// -----------------------------------------------------------------------------
// Section 6: Scenario F — Completed
// -----------------------------------------------------------------------------
console.log("\n--- Section 6: Scenario F — Completed ---");
const orderCompleted = createMockOrder({
  orderStatus: "Selesai",
  paymentStatus: "Lunas",
});
const progressF = computeOrderProgress(orderCompleted);
assert(!progressF.isCancelled, "Not cancelled");
assert.strictEqual(progressF.stages[0].status, "completed", "Stage 1 completed");
assert.strictEqual(progressF.stages[1].status, "completed", "Stage 2 completed");
assert.strictEqual(progressF.stages[2].status, "completed", "Stage 3 completed");
assert.strictEqual(progressF.stages[3].status, "completed", "Stage 4 completed");
assert(progressF.line0Active && progressF.line1Active && progressF.line2Active, "All 3 lines are active");
console.log("  [PASS] Completed: All 4 stages and all 3 lines are marked completed");

// -----------------------------------------------------------------------------
// Section 7: Scenario G, H, I — Cancelled Order States
// -----------------------------------------------------------------------------
console.log("\n--- Section 7: Cancelled & Expired States ---");
// Case G: Cancelled unpaid
const orderCancelledUnpaid = createMockOrder({
  orderStatus: "Dibatalkan",
  paymentStatus: "Dibatalkan",
});
const progressG = computeOrderProgress(orderCancelledUnpaid);
assert(progressG.isCancelled, "Recognized as cancelled");
assert.strictEqual(progressG.stages.length, 0, "No 5th stage, normal tracker replaced");

// Case H: Cancelled paid
const orderCancelledPaid = createMockOrder({
  orderStatus: "Dibatalkan",
  paymentStatus: "Lunas",
});
const progressH = computeOrderProgress(orderCancelledPaid);
assert(progressH.isCancelled, "Recognized as cancelled");
assert(progressH.desc.includes("refund"), "Mentions refund instructions");

// Case I: Expired QRIS
const orderExpiredQris = createMockOrder({
  orderStatus: "Pesanan baru",
  paymentStatus: "Menunggu Verifikasi",
  paymentMethod: "QRIS Statis",
  createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  paymentDeadline: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
});
const progressI = computeOrderProgress(orderExpiredQris);
assert(progressI.isCancelled, "Expired order recognized as cancelled");
console.log("  [PASS] Cancelled and expired orders use dedicated state");

// -----------------------------------------------------------------------------
// Section 8: Card Layout Integration in pesanan/page.tsx
// -----------------------------------------------------------------------------
console.log("\n--- Section 8: Card Layout Integration in pesanan/page.tsx ---");
const pesananPageSrc = fs.readFileSync(path.resolve(process.cwd(), "src/app/pesanan/page.tsx"), "utf-8");
assert(pesananPageSrc.includes("OrderProgressTracker"), "OrderProgressTracker imported in pesanan/page.tsx");
assert(pesananPageSrc.includes("<OrderProgressTracker order={order} />"), "OrderProgressTracker mounted in order card");
assert(pesananPageSrc.includes("order.id"), "Order ID preserved");
assert(pesananPageSrc.includes("formattedDate"), "Order date preserved");
assert(pesananPageSrc.includes("StatusBadge"), "Status badge preserved");
assert(pesananPageSrc.includes("<StatusBadge"), "StatusBadge mounted");
assert(!pesananPageSrc.includes('type="payment"'), "Payment status badge completely removed from order cards");
assert(pesananPageSrc.includes("showDot={false}"), "Status badge renders text-only without colored dot");
assert(pesananPageSrc.includes("item.productName"), "Product names preserved");
assert(pesananPageSrc.includes("order.total"), "Total order amount preserved");
assert(pesananPageSrc.includes("Detail"), "Detail button preserved");
console.log("  [PASS] Order History Card hierarchy correctly places single dotless status badge & progress tracker");

// -----------------------------------------------------------------------------
// Section 9: SSR Rendering Tests
// -----------------------------------------------------------------------------
console.log("\n--- Section 9: SSR Rendering Tests ---");
const htmlActive = renderToStaticMarkup(<OrderProgressTracker order={orderOutDelivery} />);
assert(htmlActive.includes("Pembayaran"), "Rendered active order contains 'Pembayaran'");
assert(htmlActive.includes("Diproses"), "Rendered active order contains 'Diproses'");
assert(htmlActive.includes("Dalam Pengiriman"), "Rendered delivery order contains 'Dalam Pengiriman'");
assert(htmlActive.includes("Selesai"), "Rendered active order contains 'Selesai'");

const htmlPickup = renderToStaticMarkup(<OrderProgressTracker order={orderReadyPickup} />);
assert(htmlPickup.includes("Siap Diambil"), "Rendered pickup order contains 'Siap Diambil'");

const htmlCancelled = renderToStaticMarkup(<OrderProgressTracker order={orderCancelledPaid} />);
assert(htmlCancelled.includes("Pesanan Dibatalkan"), "Rendered cancelled order contains 'Pesanan Dibatalkan'");
assert(!htmlCancelled.includes("Pembayaran: Lunas"), "Cancelled order does not display duplicate payment status badge");
console.log("  [PASS] Static markup renders without hydration issues");

console.log("\n================================================================================");
console.log("ALL ASSERTIONS PASSED! Order Progress Tracker Implementation Verified.");
console.log("================================================================================\n");
