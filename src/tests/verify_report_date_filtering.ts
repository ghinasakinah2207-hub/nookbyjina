import assert from "assert";
import { Order } from "@/types";
import {
  calculateReportStats,
  fetchAdminDashboardDataServer,
  fetchAdminDashboardOverviewDataServer,
  getReportDateFilterBounds,
  getWIBDateKey,
  ProductHppMapItem,
  ReportTimeRange,
} from "@/lib/admin-reports";
import { getAdminOrdersServer } from "@/lib/orders-store";

function createTestOrder(
  id: string,
  createdAt: string,
  total: number,
  orderStatus: Order["orderStatus"],
  paymentStatus: Order["paymentStatus"],
  paymentMethod: Order["paymentMethod"],
  itemQuantity: number = 1,
  deliveryType: "delivery" | "pickup" = "delivery",
  shippingFee: number = 0
): Order {
  const itemTotal = total - shippingFee;
  return {
    id,
    token: `tok_abcdef1234567890_${id}`,
    createdAt,
    customerName: `Customer ${id}`,
    customerWhatsapp: "081234567890",
    fulfillmentType: deliveryType,
    deliveryArea: deliveryType === "delivery" ? "Lhoksukon" : "",
    orderNote: "",
    items: [
      {
        id: `item-${id}-1`,
        productId: "prod-1",
        productName: "Nasi Goreng Spesial",
        productImage: "",
        basePrice: itemTotal / itemQuantity,
        unitPrice: itemTotal / itemQuantity,
        quantity: itemQuantity,
        itemTotal,
        itemNote: "",
        isAvailable: true,
        selectedOptions: [],
        selectedAddons: [],
      },
    ],
    subtotal: itemTotal,
    shippingFee,
    total,
    orderStatus,
    paymentStatus,
    paymentMethod,
    paymentDeadline: "",
    merchantName: "Nook by Jina",
  };
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("TEST SUITE: P2.1 — Optimasi Filter Tanggal Laporan di Database");
  console.log("==================================================================\n");

  const fixedRefDate = new Date("2026-10-27T14:30:00+07:00");
  const todayKey = getWIBDateKey(fixedRefDate); // "2026-10-27"
  console.log(`Reference Date (WIB): ${fixedRefDate.toISOString()} => WIB Key: ${todayKey}\n`);

  const mockProducts: ProductHppMapItem[] = [
    {
      id: "prod-1",
      slug: "nasi-goreng-spesial",
      name: "Nasi Goreng Spesial",
      hpp: 15000,
    },
  ];

  // -------------------------------------------------------------------------
  // 1. Boundary Timestamp Calculations
  // -------------------------------------------------------------------------
  // Exact boundaries for WIB
  const day0_0000 = "2026-10-27T00:00:00.000+07:00"; // 2026-10-26T17:00:00.000Z
  const day0_2359 = "2026-10-27T23:59:59.999+07:00"; // 2026-10-27T16:59:59.999Z

  const prevDay_2359 = "2026-10-26T23:59:59.999+07:00"; // 2026-10-26T16:59:59.999Z
  const nextDay_0000 = "2026-10-28T00:00:00.000+07:00"; // 2026-10-27T17:00:00.000Z

  const day6Ago_0000 = "2026-10-21T00:00:00.000+07:00"; // 7days boundary start
  const day7Ago_2359 = "2026-10-20T23:59:59.999+07:00"; // Just outside 7days

  const day29Ago_0000 = "2026-09-28T00:00:00.000+07:00"; // 30days boundary start
  const day30Ago_2359 = "2026-09-27T23:59:59.999+07:00"; // Just outside 30days

  const day60Ago = "2026-08-28T12:00:00.000+07:00"; // Old historical order

  // Build comprehensive fixture
  const fixtureOrders: Order[] = [
    // Today: exactly at 00:00:00.000 WIB
    createTestOrder("ORD-T0", new Date(day0_0000).toISOString(), 50000, "Selesai", "Lunas", "QRIS Statis", 2, "delivery", 10000),
    // Today: middle of day
    createTestOrder("ORD-TM", new Date("2026-10-27T12:00:00+07:00").toISOString(), 30000, "Diproses", "Lunas", "Cash", 1, "pickup", 0),
    // Today: exactly at 23:59:59.999 WIB
    createTestOrder("ORD-TE", new Date(day0_2359).toISOString(), 25000, "Selesai", "Lunas", "Cash", 1, "delivery", 5000),
    // Today: cancelled order (should not count as revenue)
    createTestOrder("ORD-TC", new Date("2026-10-27T10:00:00+07:00").toISOString(), 40000, "Dibatalkan", "Dibatalkan", "QRIS Statis", 1),

    // Yesterday just before midnight (excluded from today, included in 7days)
    createTestOrder("ORD-Y1", new Date(prevDay_2359).toISOString(), 60000, "Selesai", "Lunas", "QRIS Statis", 2, "delivery", 10000),
    createTestOrder("ORD-Y2", new Date("2026-10-25T15:00:00+07:00").toISOString(), 45000, "Selesai", "Lunas", "Cash", 1),

    // Day 6 ago: exactly at 00:00:00.000 WIB (included in 7days)
    createTestOrder("ORD-7D-START", new Date(day6Ago_0000).toISOString(), 70000, "Selesai", "Lunas", "QRIS Statis", 2),
    // Day 7 ago: 23:59:59.999 WIB (excluded from 7days, included in 30days)
    createTestOrder("ORD-7D-OUT", new Date(day7Ago_2359).toISOString(), 35000, "Selesai", "Lunas", "Cash", 1),

    // Day 29 ago: exactly at 00:00:00.000 WIB (included in 30days)
    createTestOrder("ORD-30D-START", new Date(day29Ago_0000).toISOString(), 80000, "Selesai", "Lunas", "QRIS Statis", 3),
    // Day 30 ago: 23:59:59.999 WIB (excluded from 30days, included in all)
    createTestOrder("ORD-30D-OUT", new Date(day30Ago_2359).toISOString(), 90000, "Selesai", "Lunas", "Cash", 2),

    // 60 days ago: (included in all only)
    createTestOrder("ORD-HIST-60", new Date(day60Ago).toISOString(), 120000, "Selesai", "Lunas", "QRIS Statis", 4),

    // Tomorrow at 00:00:00.000 WIB (future edge case: should be excluded from all ranges up to today)
    createTestOrder("ORD-FUT-0", new Date(nextDay_0000).toISOString(), 50000, "Pesanan baru", "Menunggu Verifikasi", "QRIS Statis"),
  ];

  // Set up development in-memory store
  const globalStore = globalThis as unknown as { __devOrdersById?: Map<string, Order> };
  if (!globalStore.__devOrdersById) {
    globalStore.__devOrdersById = new Map<string, Order>();
  }
  globalStore.__devOrdersById.clear();
  for (const o of fixtureOrders) {
    globalStore.__devOrdersById.set(o.id, o);
  }

  // -------------------------------------------------------------------------
  // TEST 1: Date Filter Bounds Math & UTC Conversion
  // -------------------------------------------------------------------------
  console.log("--- TEST 1: Bounds Math & UTC Conversion ---");
  const todayBounds = getReportDateFilterBounds("today", fixedRefDate);
  assert.strictEqual(todayBounds.startDateKey, "2026-10-27");
  assert.strictEqual(todayBounds.endDateKey, "2026-10-27");
  assert.strictEqual(todayBounds.startUtcIso, "2026-10-26T17:00:00.000Z");
  assert.strictEqual(todayBounds.endUtcIso, "2026-10-27T17:00:00.000Z");
  console.log("PASS: today bounds exact UTC ISO match: [2026-10-26T17:00:00.000Z, 2026-10-27T17:00:00.000Z)");

  const sevenDaysBounds = getReportDateFilterBounds("7days", fixedRefDate);
  assert.strictEqual(sevenDaysBounds.startDateKey, "2026-10-21");
  assert.strictEqual(sevenDaysBounds.endDateKey, "2026-10-27");
  assert.strictEqual(sevenDaysBounds.startUtcIso, "2026-10-20T17:00:00.000Z");
  assert.strictEqual(sevenDaysBounds.endUtcIso, "2026-10-27T17:00:00.000Z");
  console.log("PASS: 7days bounds exact UTC ISO match: [2026-10-20T17:00:00.000Z, 2026-10-27T17:00:00.000Z)");

  const thirtyDaysBounds = getReportDateFilterBounds("30days", fixedRefDate);
  assert.strictEqual(thirtyDaysBounds.startDateKey, "2026-09-28");
  assert.strictEqual(thirtyDaysBounds.endDateKey, "2026-10-27");
  assert.strictEqual(thirtyDaysBounds.startUtcIso, "2026-09-27T17:00:00.000Z");
  assert.strictEqual(thirtyDaysBounds.endUtcIso, "2026-10-27T17:00:00.000Z");
  console.log("PASS: 30days bounds exact UTC ISO match: [2026-09-27T17:00:00.000Z, 2026-10-27T17:00:00.000Z)");

  const allBounds = getReportDateFilterBounds("all", fixedRefDate);
  assert.strictEqual(allBounds.startUtcIso, null);
  assert.strictEqual(allBounds.endUtcIso, null);
  console.log("PASS: all bounds returns null (unrestricted full history query)\n");

  // -------------------------------------------------------------------------
  // TEST 2: Exact Equivalence Between Database Filter and In-Memory Baseline
  // -------------------------------------------------------------------------
  console.log("--- TEST 2: Baseline vs Filtered Reports Equivalence ---");
  const ranges: ReportTimeRange[] = ["today", "7days", "30days", "all"];

  for (const range of ranges) {
    // 1. Baseline: calculateReportStats across all raw orders
    const baselineReport = calculateReportStats(fixtureOrders, mockProducts, range, fixedRefDate);

    // 2. Optimized: query using getAdminOrdersServer with database date bounds
    const bounds = getReportDateFilterBounds(range, fixedRefDate);
    const orderOptions = bounds.startUtcIso
      ? {
          startDate: bounds.startUtcIso,
          endDate: bounds.endUtcIso || undefined,
          endDateExclusive: true,
        }
      : undefined;

    const filteredOrders = await getAdminOrdersServer(orderOptions);
    const optimizedReport = calculateReportStats(filteredOrders, mockProducts, range, fixedRefDate);

    // 3. Strict assertion of parity
    assert.strictEqual(
      optimizedReport.totalRevenue,
      baselineReport.totalRevenue,
      `[${range}] totalRevenue mismatch: ${optimizedReport.totalRevenue} vs ${baselineReport.totalRevenue}`
    );
    assert.strictEqual(
      optimizedReport.itemRevenue,
      baselineReport.itemRevenue,
      `[${range}] itemRevenue mismatch`
    );
    assert.strictEqual(
      optimizedReport.shippingRevenue,
      baselineReport.shippingRevenue,
      `[${range}] shippingRevenue mismatch`
    );
    assert.strictEqual(
      optimizedReport.paidOrdersCount,
      baselineReport.paidOrdersCount,
      `[${range}] paidOrdersCount mismatch`
    );
    assert.strictEqual(
      optimizedReport.totalOrdersCount,
      baselineReport.totalOrdersCount,
      `[${range}] totalOrdersCount mismatch`
    );
    assert.strictEqual(
      optimizedReport.cancelledOrdersCount,
      baselineReport.cancelledOrdersCount,
      `[${range}] cancelledOrdersCount mismatch`
    );
    assert.strictEqual(
      optimizedReport.deliveryCount,
      baselineReport.deliveryCount,
      `[${range}] deliveryCount mismatch`
    );
    assert.strictEqual(
      optimizedReport.pickupCount,
      baselineReport.pickupCount,
      `[${range}] pickupCount mismatch`
    );
    assert.strictEqual(
      optimizedReport.qrisCount,
      baselineReport.qrisCount,
      `[${range}] qrisCount mismatch`
    );
    assert.strictEqual(
      optimizedReport.cashCount,
      baselineReport.cashCount,
      `[${range}] cashCount mismatch`
    );
    assert.strictEqual(
      optimizedReport.averageOrderValue,
      baselineReport.averageOrderValue,
      `[${range}] averageOrderValue mismatch`
    );
    assert.strictEqual(
      optimizedReport.hppSummary.knownHppTotal,
      baselineReport.hppSummary.knownHppTotal,
      `[${range}] knownHppTotal mismatch`
    );
    assert.strictEqual(
      optimizedReport.hppSummary.itemsWithHppCount,
      baselineReport.hppSummary.itemsWithHppCount,
      `[${range}] itemsWithHppCount mismatch`
    );
    assert.strictEqual(
      optimizedReport.hppSummary.itemsWithoutHppCount,
      baselineReport.hppSummary.itemsWithoutHppCount,
      `[${range}] itemsWithoutHppCount mismatch`
    );
    assert.strictEqual(
      optimizedReport.topProducts.length,
      baselineReport.topProducts.length,
      `[${range}] topProducts length mismatch`
    );
    assert.deepStrictEqual(
      optimizedReport.chartData,
      baselineReport.chartData,
      `[${range}] chartData mismatch`
    );

    console.log(
      `PASS [${range}]: 100% identical. Revenue: Rp${optimizedReport.totalRevenue.toLocaleString(
        "id-ID"
      )}, Paid Orders: ${optimizedReport.paidOrdersCount}, Total Orders: ${optimizedReport.totalOrdersCount}, HPP: Rp${optimizedReport.hppSummary.knownHppTotal.toLocaleString(
        "id-ID"
      )}`
    );
  }
  console.log();

  // -------------------------------------------------------------------------
  // TEST 3: Edge Boundary Verification
  // -------------------------------------------------------------------------
  console.log("--- TEST 3: WIB Boundary Edge Cases ---");
  // Today filter:
  const boundsToday = getReportDateFilterBounds("today", fixedRefDate);
  const todayOrders = await getAdminOrdersServer({
    startDate: boundsToday.startUtcIso!,
    endDate: boundsToday.endUtcIso!,
    endDateExclusive: true,
  });
  const todayIds = new Set(todayOrders.map((o) => o.id));

  // Assert inclusion
  assert.ok(todayIds.has("ORD-T0"), "ORD-T0 at 00:00:00.000 WIB must be included in today");
  assert.ok(todayIds.has("ORD-TM"), "ORD-TM in mid-day must be included in today");
  assert.ok(todayIds.has("ORD-TE"), "ORD-TE at 23:59:59.999 WIB must be included in today");
  assert.ok(todayIds.has("ORD-TC"), "ORD-TC cancelled today must be included in today (for cancelled stats)");

  // Assert exclusion
  assert.ok(!todayIds.has("ORD-Y1"), "ORD-Y1 at 23:59:59.999 WIB yesterday must NOT be included in today");
  assert.ok(!todayIds.has("ORD-FUT-0"), "ORD-FUT-0 at 00:00:00.000 WIB tomorrow must NOT be included in today");
  console.log("PASS: 00:00:00.000 WIB, 23:59:59.999 WIB, and prior/future day exclusions are exact.");

  // 7 days filter:
  const bounds7 = getReportDateFilterBounds("7days", fixedRefDate);
  const orders7 = await getAdminOrdersServer({
    startDate: bounds7.startUtcIso!,
    endDate: bounds7.endUtcIso!,
    endDateExclusive: true,
  });
  const ids7 = new Set(orders7.map((o) => o.id));
  assert.ok(ids7.has("ORD-7D-START"), "ORD-7D-START at 00:00:00.000 WIB on day -6 must be included in 7days");
  assert.ok(!ids7.has("ORD-7D-OUT"), "ORD-7D-OUT at 23:59:59.999 WIB on day -7 must NOT be included in 7days");
  console.log("PASS: 7-day calendar boundary is exact.");

  // 30 days filter:
  const bounds30 = getReportDateFilterBounds("30days", fixedRefDate);
  const orders30 = await getAdminOrdersServer({
    startDate: bounds30.startUtcIso!,
    endDate: bounds30.endUtcIso!,
    endDateExclusive: true,
  });
  const ids30 = new Set(orders30.map((o) => o.id));
  assert.ok(ids30.has("ORD-30D-START"), "ORD-30D-START at 00:00:00.000 WIB on day -29 must be included in 30days");
  assert.ok(!ids30.has("ORD-30D-OUT"), "ORD-30D-OUT at 23:59:59.999 WIB on day -30 must NOT be included in 30days");
  console.log("PASS: 30-day calendar boundary is exact.");

  // Range "all":
  const ordersAll = await getAdminOrdersServer();
  assert.strictEqual(ordersAll.length, fixtureOrders.length, "Range 'all' must return every single order without truncation");
  console.log(`PASS: Range 'all' returns all ${ordersAll.length} orders across full history.\n`);

  // -------------------------------------------------------------------------
  // TEST 4: fetchAdminDashboardDataServer Integration
  // -------------------------------------------------------------------------
  console.log("--- TEST 4: fetchAdminDashboardDataServer Integration ---");
  const dashData = await fetchAdminDashboardDataServer("today", fixedRefDate);
  assert.strictEqual(dashData.reports.range, "today");
  assert.strictEqual(dashData.reports.totalRevenue, 105000); // 50000 + 30000 + 25000
  assert.strictEqual(dashData.reports.paidOrdersCount, 3);
  assert.strictEqual(dashData.reports.cancelledOrdersCount, 1);
  console.log("PASS: fetchAdminDashboardDataServer('today') returns accurate, filtered report metrics.\n");

  // -------------------------------------------------------------------------
  // TEST 5: fetchAdminDashboardOverviewDataServer Invariant (P2.3 Fast Path)
  // -------------------------------------------------------------------------
  console.log("--- TEST 5: P2.3 Dashboard Fast Path Invariant ---");
  const overview = await fetchAdminDashboardOverviewDataServer(fixedRefDate);
  assert.ok(overview.metrics, "Operational metrics must be present");
  assert.ok(overview.recentOrders.length <= 5, "Recent orders strictly capped to 5");
  console.log(`PASS: Dashboard overview returns ${overview.recentOrders.length} recent orders and valid metrics.\n`);

  console.log("==================================================================");
  console.log("ALL P2.1 REPORT DATE FILTERING REGRESSION TESTS PASSED!");
  console.log("==================================================================");
}

runTestSuite().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
