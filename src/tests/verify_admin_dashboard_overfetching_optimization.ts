import assert from "assert";
import { Order } from "@/types";
import {
  calculateDashboardMetrics,
  fetchAdminDashboardOverviewDataServer,
} from "@/lib/admin-reports";

function createTestOrder(
  id: string,
  createdAt: string,
  total: number,
  orderStatus: Order["orderStatus"],
  paymentStatus: Order["paymentStatus"],
  paymentMethod: Order["paymentMethod"],
  paymentDeadline: string = ""
): Order {
  return {
    id,
    token: `tok_abcdef1234567890_${id}`,
    createdAt,
    customerName: `Pelanggan ${id}`,
    customerWhatsapp: "081234567890",
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    orderNote: "",
    items: [
      {
        id: `item-${id}-1`,
        productId: "prod-1",
        productName: "Nasi Bakar Cakalang",
        productImage: "",
        basePrice: 25000,
        unitPrice: 25000,
        quantity: 1,
        itemTotal: total,
        itemNote: "",
        isAvailable: true,
        selectedOptions: [],
        selectedAddons: [],
      },
    ],
    subtotal: total,
    shippingFee: 0,
    total,
    orderStatus,
    paymentStatus,
    paymentMethod,
    paymentDeadline,
    merchantName: "Nook by Jina",
  };
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("TEST SUITE: P2.3 — Optimasi Overfetching Halaman Utama Dashboard");
  console.log("==================================================================\n");

  const now = new Date();
  const nowMs = now.getTime();

  // Create a 20-order fixture with diverse statuses and dates
  const fixtureOrders: Order[] = [
    // Today orders
    createTestOrder("ORD-01", new Date(nowMs - 5 * 60 * 1000).toISOString(), 50000, "Pesanan baru", "Menunggu Verifikasi", "QRIS Statis", new Date(nowMs + 25 * 60 * 1000).toISOString()),
    createTestOrder("ORD-02", new Date(nowMs - 10 * 60 * 1000).toISOString(), 25000, "Pesanan baru", "Menunggu Pembayaran", "Cash"),
    createTestOrder("ORD-03", new Date(nowMs - 15 * 60 * 1000).toISOString(), 75000, "Diproses", "Lunas", "QRIS Statis"),
    createTestOrder("ORD-04", new Date(nowMs - 20 * 60 * 1000).toISOString(), 30000, "Siap", "Lunas", "Cash"),
    createTestOrder("ORD-05", new Date(nowMs - 25 * 60 * 1000).toISOString(), 100000, "Selesai", "Lunas", "QRIS Statis"),
    createTestOrder("ORD-06", new Date(nowMs - 35 * 60 * 1000).toISOString(), 45000, "Dibatalkan", "Dibatalkan", "QRIS Statis", new Date(nowMs - 5 * 60 * 1000).toISOString()),
    createTestOrder("ORD-07", new Date(nowMs - 40 * 60 * 1000).toISOString(), 60000, "Selesai", "Lunas", "Cash"),
    createTestOrder("ORD-08", new Date(nowMs - 50 * 60 * 1000).toISOString(), 35000, "Diproses", "Lunas", "QRIS Statis"),
    createTestOrder("ORD-09", new Date(nowMs - 60 * 60 * 1000).toISOString(), 80000, "Pesanan baru", "Menunggu Pembayaran", "Cash"),
    createTestOrder("ORD-10", new Date(nowMs - 70 * 60 * 1000).toISOString(), 20000, "Dibatalkan", "Dibatalkan", "Cash"),

    // Historical orders (yesterday / prior days)
    createTestOrder("ORD-11", new Date(nowMs - 24 * 3600 * 1000).toISOString(), 120000, "Selesai", "Lunas", "QRIS Statis"),
    createTestOrder("ORD-12", new Date(nowMs - 25 * 3600 * 1000).toISOString(), 40000, "Selesai", "Lunas", "Cash"),
    createTestOrder("ORD-13", new Date(nowMs - 26 * 3600 * 1000).toISOString(), 55000, "Selesai", "Lunas", "QRIS Statis"),
    createTestOrder("ORD-14", new Date(nowMs - 48 * 3600 * 1000).toISOString(), 90000, "Selesai", "Lunas", "Cash"),
    createTestOrder("ORD-15", new Date(nowMs - 72 * 3600 * 1000).toISOString(), 65000, "Selesai", "Lunas", "QRIS Statis"),
    createTestOrder("ORD-16", new Date(nowMs - 96 * 3600 * 1000).toISOString(), 30000, "Dibatalkan", "Dibatalkan", "QRIS Statis"),
    createTestOrder("ORD-17", new Date(nowMs - 120 * 3600 * 1000).toISOString(), 85000, "Selesai", "Lunas", "Cash"),
    createTestOrder("ORD-18", new Date(nowMs - 144 * 3600 * 1000).toISOString(), 40000, "Selesai", "Lunas", "QRIS Statis"),
    createTestOrder("ORD-19", new Date(nowMs - 168 * 3600 * 1000).toISOString(), 110000, "Selesai", "Lunas", "Cash"),
    createTestOrder("ORD-20", new Date(nowMs - 192 * 3600 * 1000).toISOString(), 50000, "Dibatalkan", "Dibatalkan", "Cash"),
  ];

  // Populate orders in development store
  const globalStore = globalThis as unknown as { __devOrdersById?: Map<string, Order> };
  if (!globalStore.__devOrdersById) {
    globalStore.__devOrdersById = new Map<string, Order>();
  }
  globalStore.__devOrdersById.clear();
  for (const o of fixtureOrders) {
    globalStore.__devOrdersById.set(o.id, o);
  }

  // -------------------------------------------------------------------------
  // TEST 1: Metrik Sebelum vs Sesudah Identik 100%
  // -------------------------------------------------------------------------
  console.log("=== Test 1: Membandingkan metrik sebelum vs sesudah optimasi ===");

  // Ground-truth direct calculation
  const directMetrics = calculateDashboardMetrics(fixtureOrders, now);

  // New optimized server function for dashboard
  const optimizedData = await fetchAdminDashboardOverviewDataServer(now);

  // Assert every single metric field matches exactly
  assert.strictEqual(
    optimizedData.metrics.newOrdersCount,
    directMetrics.newOrdersCount,
    "newOrdersCount identik"
  );
  assert.strictEqual(
    optimizedData.metrics.pendingQrisCount,
    directMetrics.pendingQrisCount,
    "pendingQrisCount identik"
  );
  assert.strictEqual(
    optimizedData.metrics.inProgressCount,
    directMetrics.inProgressCount,
    "inProgressCount identik"
  );
  assert.strictEqual(
    optimizedData.metrics.completedCount,
    directMetrics.completedCount,
    "completedCount identik"
  );
  assert.strictEqual(
    optimizedData.metrics.cancelledCount,
    directMetrics.cancelledCount,
    "cancelledCount identik"
  );
  assert.strictEqual(
    optimizedData.metrics.totalOrdersCount,
    directMetrics.totalOrdersCount,
    "totalOrdersCount identik (mencakup seluruh histori pesanan toko)"
  );
  assert.strictEqual(
    optimizedData.metrics.totalRevenue,
    directMetrics.totalRevenue,
    "totalRevenue identik (akumulasi omzet terverifikasi seluruh histori)"
  );
  assert.strictEqual(
    optimizedData.metrics.todayOrdersCount,
    directMetrics.todayOrdersCount,
    "todayOrdersCount identik"
  );
  assert.strictEqual(
    optimizedData.metrics.todayRevenue,
    directMetrics.todayRevenue,
    "todayRevenue identik"
  );
  assert.strictEqual(
    optimizedData.metrics.unpaidOrdersCount,
    directMetrics.unpaidOrdersCount,
    "unpaidOrdersCount identik"
  );
  assert.deepStrictEqual(
    optimizedData.metrics.paymentBreakdown,
    directMetrics.paymentBreakdown,
    "paymentBreakdown identik"
  );

  console.log("✓ Semua nilai kartu metrik operasional identik 100% antara sebelum dan sesudah optimasi.");

  // -------------------------------------------------------------------------
  // TEST 2: Pembatasan Pesanan Dashboard ke Maksimal 5 Pesanan Terbaru
  // -------------------------------------------------------------------------
  console.log("\n=== Test 2: Verifikasi pembatasan pesanan dashboard maksimal 5 pesanan ===");

  // Verifikasi bahwa data.recentOrders dibatasi tepat 5 pesanan
  assert(
    Array.isArray(optimizedData.recentOrders),
    "recentOrders berupa Array"
  );
  assert.strictEqual(
    optimizedData.recentOrders.length,
    5,
    `recentOrders harus tepat 5 pesanan (diterima: ${optimizedData.recentOrders.length}), bukan seluruh 20 pesanan`
  );

  // Verifikasi bahwa 5 pesanan tersebut adalah 5 pesanan paling baru berdasarkan waktu
  const expectedTop5Ids = ["ORD-01", "ORD-02", "ORD-03", "ORD-04", "ORD-05"];
  const actualTop5Ids = optimizedData.recentOrders.map((o) => o.id);
  assert.deepStrictEqual(
    actualTop5Ids,
    expectedTop5Ids,
    "recentOrders berisi 5 pesanan dengan createdAt terbaru secara descending"
  );

  console.log(`✓ Dashboard hanya menerima ${optimizedData.recentOrders.length} pesanan terbaru (ORD-01 s/d ORD-05), mencegah overfetching ${fixtureOrders.length - 5} pesanan.`);

  // -------------------------------------------------------------------------
  // TEST 3: Tidak Ada Limit Global pada Data Pesanan / Laporan Historis
  // -------------------------------------------------------------------------
  console.log("\n=== Test 3: Memastikan tidak ada limit global pada metrik dan laporan historis ===");

  // Bukti total orders count tetap 20 (bukan 5)
  assert.strictEqual(
    optimizedData.metrics.totalOrdersCount,
    20,
    "totalOrdersCount mencatat 20 pesanan, membuktikan query DB tidak di-limit global ke 5"
  );

  // Bukti total revenue mencakup pesanan dari hari-hari sebelumnya
  // Hari ini: ORD-03 (75k) + ORD-04 (30k) + ORD-05 (100k) + ORD-07 (60k) + ORD-08 (35k) = 300,000
  // Kemarin & lampau: ORD-11 (120k) + ORD-12 (40k) + ORD-13 (55k) + ORD-14 (90k) + ORD-15 (65k) + ORD-17 (85k) + ORD-18 (40k) + ORD-19 (110k) = 605,000
  // Total = 905,000
  assert.strictEqual(
    optimizedData.metrics.todayRevenue,
    300000,
    "todayRevenue mencakup seluruh transaksi lunas hari ini (Rp300.000)"
  );
  assert.strictEqual(
    optimizedData.metrics.totalRevenue,
    905000,
    "totalRevenue mencakup seluruh histori lunas (Rp905.000), bukan hanya 5 pesanan awal"
  );

  console.log("✓ Invariant terjaga: Tidak ada limit global pada data pesanan atau laporan historis.");

  // -------------------------------------------------------------------------
  // TEST 4: Verifikasi Kemandirian Metrik dari Data Produk / HPP
  // -------------------------------------------------------------------------
  console.log("\n=== Test 4: Verifikasi metrik dashboard tidak bergantung pada produk/HPP ===");

  // calculateDashboardMetrics hanya menerima orders (dan opsional referenceDate), tidak ada parameter products/HPP
  assert(
    calculateDashboardMetrics.length >= 1,
    "calculateDashboardMetrics menerima orders tanpa parameter products/HPP"
  );
  // Verifikasi eksekusi mandiri tanpa produk/HPP menghasilkan metrik lengkap
  const standaloneMetrics = calculateDashboardMetrics(fixtureOrders);
  assert(standaloneMetrics.totalRevenue > 0, "Metrik pendapatan terhitung tanpa produk/HPP");
  assert(standaloneMetrics.newOrdersCount > 0, "Metrik pesanan baru terhitung tanpa produk/HPP");

  console.log("✓ Terkonfirmasi: Metrik dashboard murni berbasis status/nominal pesanan tanpa membutuhkan produk/HPP.");

  console.log("\n==================================================================");
  console.log("🎉 SEMUA 4 PENGUJIAN P2.3 OPTIMASI OVERFETCHING DASHBOARD LOLOS (0 GAGAL)!");
  console.log("==================================================================");
}

runTestSuite().catch((err) => {
  console.error("❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
