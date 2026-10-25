import { Order } from "@/types";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAdminOrdersServer,
  isQrisMethod,
  isPendingQrisStatus,
  isPendingCashStatus,
  isPaidStatus,
} from "@/lib/orders-store";

export type ReportTimeRange = "today" | "7days" | "30days" | "all";

export interface DashboardMetrics {
  newOrdersCount: number;
  pendingQrisCount: number;
  inProgressCount: number;
  completedCount: number;
  cancelledCount: number;
  totalOrdersCount: number;
  totalRevenue: number; // verified paid, non-cancelled
  todayOrdersCount: number;
  todayRevenue: number;
  unpaidOrdersCount: number;
  paymentBreakdown: {
    lunas: number;
    menungguVerifikasi: number;
    menungguPembayaran: number;
    dibatalkan: number;
  };
  recentOrders: Order[];
}

export interface SalesChartPoint {
  dateKey: string; // YYYY-MM-DD in WIB
  label: string; // e.g. "Kam, 22 Okt"
  revenue: number; // in Rupiah
  orderCount: number; // number of paid orders
  totalOrders: number; // total orders placed
}

export interface TopProductReport {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  ordersCount: number;
  unitHpp: number | null;
  totalHpp: number | null;
  grossProfit: number | null;
  hasHpp: boolean;
}

export interface HppSummary {
  knownHppTotal: number;
  itemsWithHppCount: number;
  itemsWithoutHppCount: number;
  totalItemsSold: number;
  hppCoveragePercentage: number;
  isHppIncomplete: boolean;
  estimatedGrossProfit: number;
}

export interface ReportStats {
  range: ReportTimeRange;
  rangeLabel: string;
  startDateWIB: string;
  endDateWIB: string;
  totalRevenue: number;
  itemRevenue: number;
  shippingRevenue: number;
  paidOrdersCount: number;
  totalOrdersCount: number;
  cancelledOrdersCount: number;
  averageOrderValue: number;
  hppSummary: HppSummary;
  deliveryCount: number;
  pickupCount: number;
  qrisCount: number;
  cashCount: number;
  topProducts: TopProductReport[];
  chartData: SalesChartPoint[];
}

export interface ProductHppMapItem {
  id: string;
  slug?: string;
  name: string;
  hpp?: number | null;
}

// ============================================================================
// DATE & TIMEZONE HELPERS (ASIA/JAKARTA - WIB, UTC+7)
// ============================================================================

/**
 * Returns YYYY-MM-DD formatted string in Asia/Jakarta (WIB) timezone.
 */
export function getWIBDateKey(dateInput: string | number | Date = new Date()): string {
  const d = typeof dateInput === "object" ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Formats a WIB date string into an Indonesian short label: "Kam, 22 Okt"
 */
export function formatWIBDateLabel(dateKey: string): string {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const [year, month, day] = dateKey.split("-").map(Number);
  // Construct date at noon UTC to prevent cross-day shifting
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/**
 * Returns boundary Date object representing 00:00:00.000 WIB for a given YYYY-MM-DD.
 */
export function getWIBDayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+07:00`);
}

/**
 * Returns boundary Date object representing 23:59:59.999 WIB for a given YYYY-MM-DD.
 */
export function getWIBDayEnd(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59.999+07:00`);
}

/**
 * Shifts a YYYY-MM-DD string by a number of days.
 */
export function shiftWIBDateKey(baseDateKey: string, dayOffset: number): string {
  const [year, month, day] = baseDateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return getWIBDateKey(d);
}

// ============================================================================
// METRICS COMPUTATION (PURE FUNCTIONS FOR ACCURACY & TESTABILITY)
// ============================================================================

/**
 * Calculates operational dashboard metrics from order records.
 * Rules:
 * - Revenue ONLY includes orders with paymentStatus === "Lunas" AND orderStatus !== "Dibatalkan".
 * - Cancelled orders are excluded from revenue.
 * - Unpaid or unverified orders are excluded from revenue.
 * - Today's metrics are bounded strictly within Asia/Jakarta (WIB) current calendar day.
 */
export function calculateDashboardMetrics(
  orders: Order[],
  referenceDate: Date = new Date()
): DashboardMetrics {
  const todayKey = getWIBDateKey(referenceDate);

  let newOrdersCount = 0;
  let pendingQrisCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let totalRevenue = 0;
  let todayOrdersCount = 0;
  let todayRevenue = 0;
  let unpaidOrdersCount = 0;

  let lunas = 0;
  let menungguVerifikasi = 0;
  let menungguPembayaran = 0;
  let dibatalkanPayment = 0;

  for (const order of orders) {
    const isCancelled = order.orderStatus === "Dibatalkan";
    const isPaid = order.paymentStatus === "Lunas";
    const orderWibKey = getWIBDateKey(order.createdAt);
    const isToday = orderWibKey === todayKey;

    // Order status counts
    if (order.orderStatus === "Pesanan baru") {
      newOrdersCount++;
    } else if (order.orderStatus === "Diproses" || order.orderStatus === "Siap") {
      inProgressCount++;
    } else if (order.orderStatus === "Selesai") {
      completedCount++;
    } else if (isCancelled) {
      cancelledCount++;
    }

    const isQris = isQrisMethod(order.paymentMethod);
    const isPendingVerifikasi = isPendingQrisStatus(order.paymentStatus);
    const isPendingPembayaran = isPendingCashStatus(order.paymentStatus);
    const isPaidOrder = isPaidStatus(order.paymentStatus);

    // Payment verification antrean
    if (isQris && isPendingVerifikasi) {
      pendingQrisCount++;
    }

    // Payment status distribution
    if (isPaidOrder) {
      lunas++;
    } else if (isPendingVerifikasi) {
      menungguVerifikasi++;
      unpaidOrdersCount++;
    } else if (isPendingPembayaran) {
      menungguPembayaran++;
      unpaidOrdersCount++;
    } else if (
      order.paymentStatus === "Dibatalkan" ||
      String(order.paymentStatus || "").toLowerCase() === "dibatalkan" ||
      String(order.paymentStatus || "").toLowerCase() === "gagal"
    ) {
      dibatalkanPayment++;
    }

    // Revenue calculation: MUST be Lunas and NOT Dibatalkan
    if (isPaid && !isCancelled) {
      totalRevenue += Number(order.total || 0);
      if (isToday) {
        todayRevenue += Number(order.total || 0);
      }
    }

    if (isToday) {
      todayOrdersCount++;
    }
  }

  // Recent orders sorted by createdAt descending, limited to 5
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return {
    newOrdersCount,
    pendingQrisCount,
    inProgressCount,
    completedCount,
    cancelledCount,
    totalOrdersCount: orders.length,
    totalRevenue,
    todayOrdersCount,
    todayRevenue,
    unpaidOrdersCount,
    paymentBreakdown: {
      lunas,
      menungguVerifikasi,
      menungguPembayaran,
      dibatalkan: dibatalkanPayment,
    },
    recentOrders,
  };
}

/**
 * Calculates financial and operational report statistics for a chosen time range.
 *
 * Rules:
 * - Respects time range in Asia/Jakarta (WIB).
 * - Revenue only from verified paid, non-cancelled orders.
 * - HPP is calculated ONLY from matching products that genuinely have an HPP value.
 * - Does NOT invent a 45% fake margin.
 * - Honestly reports HPP coverage (items with HPP vs items without).
 */
export function calculateReportStats(
  orders: Order[],
  products: ProductHppMapItem[],
  range: ReportTimeRange = "7days",
  referenceDate: Date = new Date()
): ReportStats {
  const todayKey = getWIBDateKey(referenceDate);

  let startDateKey = "";
  const endDateKey = todayKey;
  let rangeLabel = "7 Hari Terakhir";

  if (range === "today") {
    startDateKey = todayKey;
    rangeLabel = "Hari Ini";
  } else if (range === "7days") {
    startDateKey = shiftWIBDateKey(todayKey, -6);
    rangeLabel = "7 Hari Terakhir";
  } else if (range === "30days") {
    startDateKey = shiftWIBDateKey(todayKey, -29);
    rangeLabel = "30 Hari Terakhir";
  } else {
    // "all"
    rangeLabel = "Semua Waktu";
    // Find earliest order date or default to 30 days ago
    if (orders.length > 0) {
      const dates = orders.map((o) => getWIBDateKey(o.createdAt)).filter(Boolean).sort();
      startDateKey = dates[0] || shiftWIBDateKey(todayKey, -29);
    } else {
      startDateKey = shiftWIBDateKey(todayKey, -29);
    }
  }

  // Filter orders falling within WIB date range
  const filteredOrders = orders.filter((order) => {
    const orderKey = getWIBDateKey(order.createdAt);
    if (!orderKey) return false;
    if (range === "all") return true;
    return orderKey >= startDateKey && orderKey <= endDateKey;
  });

  // Build product HPP lookup map (keyed by ID, and lowercase name/slug for fallback)
  const hppByIdMap = new Map<string, number>();
  const hppByNameMap = new Map<string, number>();
  for (const prod of products) {
    if (prod.hpp !== undefined && prod.hpp !== null && typeof prod.hpp === "number" && prod.hpp >= 0) {
      if (prod.id) hppByIdMap.set(prod.id, prod.hpp);
      if (prod.slug) hppByIdMap.set(prod.slug, prod.hpp);
      if (prod.name) hppByNameMap.set(prod.name.trim().toLowerCase(), prod.hpp);
    }
  }

  let totalRevenue = 0;
  let itemRevenue = 0;
  let shippingRevenue = 0;
  let paidOrdersCount = 0;
  let cancelledOrdersCount = 0;
  let deliveryCount = 0;
  let pickupCount = 0;
  let qrisCount = 0;
  let cashCount = 0;

  // HPP and product popularity trackers (from paid, non-cancelled orders only)
  let knownHppTotal = 0;
  let itemsWithHppCount = 0;
  let itemsWithoutHppCount = 0;

  const productAggMap = new Map<
    string,
    {
      productId: string;
      name: string;
      quantity: number;
      revenue: number;
      ordersSet: Set<string>;
      unitHpp: number | null;
      totalHpp: number;
      hasHpp: boolean;
    }
  >();

  for (const order of filteredOrders) {
    const isCancelled = order.orderStatus === "Dibatalkan";
    const isPaid = order.paymentStatus === "Lunas";

    if (isCancelled) {
      cancelledOrdersCount++;
    }

    if (!isPaid || isCancelled) {
      // Excluded from revenue and sales analytics
      continue;
    }

    paidOrdersCount++;
    totalRevenue += Number(order.total || 0);
    itemRevenue += Number(order.subtotal || 0);
    shippingRevenue += Number(order.shippingFee || 0);

    // Fulfillment breakdown
    if (order.fulfillmentType === "delivery") {
      deliveryCount++;
    } else {
      pickupCount++;
    }

    // Payment method breakdown
    if (order.paymentMethod === "Cash") {
      cashCount++;
    } else {
      qrisCount++;
    }

    // Items and HPP breakdown
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const qty = Math.max(1, Number(item.quantity || 1));
      const lineTotal = Number(item.itemTotal || item.unitPrice * qty || 0);

      // Resolve HPP
      let unitHpp: number | null = null;
      if (item.productId && hppByIdMap.has(item.productId)) {
        unitHpp = hppByIdMap.get(item.productId)!;
      } else if (item.productName && hppByNameMap.has(item.productName.trim().toLowerCase())) {
        unitHpp = hppByNameMap.get(item.productName.trim().toLowerCase())!;
      }

      if (unitHpp !== null) {
        knownHppTotal += unitHpp * qty;
        itemsWithHppCount += qty;
      } else {
        itemsWithoutHppCount += qty;
      }

      // Aggregate top product sales
      const aggKey = item.productId || item.productName || "unknown-product";
      const existing = productAggMap.get(aggKey);
      if (existing) {
        existing.quantity += qty;
        existing.revenue += lineTotal;
        existing.ordersSet.add(order.id);
        if (unitHpp !== null) {
          existing.totalHpp += unitHpp * qty;
          existing.hasHpp = true;
          existing.unitHpp = unitHpp;
        }
      } else {
        productAggMap.set(aggKey, {
          productId: item.productId || aggKey,
          name: item.productName || "Produk",
          quantity: qty,
          revenue: lineTotal,
          ordersSet: new Set([order.id]),
          unitHpp: unitHpp,
          totalHpp: unitHpp !== null ? unitHpp * qty : 0,
          hasHpp: unitHpp !== null,
        });
      }
    }
  }

  // Top products list sorted by quantity sold descending
  const topProducts: TopProductReport[] = Array.from(productAggMap.values())
    .map((p) => ({
      productId: p.productId,
      name: p.name,
      quantity: p.quantity,
      revenue: p.revenue,
      ordersCount: p.ordersSet.size,
      unitHpp: p.unitHpp,
      totalHpp: p.hasHpp ? p.totalHpp : null,
      grossProfit: p.hasHpp ? p.revenue - p.totalHpp : null,
      hasHpp: p.hasHpp,
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);

  const totalItemsSold = itemsWithHppCount + itemsWithoutHppCount;
  const hppCoveragePercentage =
    totalItemsSold > 0 ? Math.round((itemsWithHppCount / totalItemsSold) * 100) : 0;
  const isHppIncomplete = itemsWithoutHppCount > 0;
  // Estimated gross profit is based strictly on known HPP (subtotal minus known HPP)
  const estimatedGrossProfit = Math.max(0, itemRevenue - knownHppTotal);

  const averageOrderValue =
    paidOrdersCount > 0 ? Math.round(totalRevenue / paidOrdersCount) : 0;

  // Build daily sales chart
  const chartData = generateSalesChartData(filteredOrders, startDateKey, endDateKey);

  return {
    range,
    rangeLabel,
    startDateWIB: startDateKey,
    endDateWIB: endDateKey,
    totalRevenue,
    itemRevenue,
    shippingRevenue,
    paidOrdersCount,
    totalOrdersCount: filteredOrders.length,
    cancelledOrdersCount,
    averageOrderValue,
    hppSummary: {
      knownHppTotal,
      itemsWithHppCount,
      itemsWithoutHppCount,
      totalItemsSold,
      hppCoveragePercentage,
      isHppIncomplete,
      estimatedGrossProfit,
    },
    deliveryCount,
    pickupCount,
    qrisCount,
    cashCount,
    topProducts,
    chartData,
  };
}

/**
 * Generates continuous daily buckets for the sales chart so no intermediate days are skipped.
 */
export function generateSalesChartData(
  orders: Order[],
  startDateKey: string,
  endDateKey: string
): SalesChartPoint[] {
  // Aggregate orders by WIB date key
  const bucketMap = new Map<string, { revenue: number; orderCount: number; totalOrders: number }>();

  for (const order of orders) {
    const key = getWIBDateKey(order.createdAt);
    if (!key) continue;

    const isPaid = order.paymentStatus === "Lunas";
    const isCancelled = order.orderStatus === "Dibatalkan";

    const bucket = bucketMap.get(key) || { revenue: 0, orderCount: 0, totalOrders: 0 };
    bucket.totalOrders++;

    if (isPaid && !isCancelled) {
      bucket.revenue += Number(order.total || 0);
      bucket.orderCount++;
    }

    bucketMap.set(key, bucket);
  }

  // Generate full calendar series from startDateKey through endDateKey
  const result: SalesChartPoint[] = [];
  let currentKey = startDateKey;

  // Protect against infinite loop if startDateKey > endDateKey
  let iterations = 0;
  while (currentKey <= endDateKey && iterations < 366) {
    const data = bucketMap.get(currentKey) || { revenue: 0, orderCount: 0, totalOrders: 0 };
    result.push({
      dateKey: currentKey,
      label: formatWIBDateLabel(currentKey),
      revenue: data.revenue,
      orderCount: data.orderCount,
      totalOrders: data.totalOrders,
    });
    currentKey = shiftWIBDateKey(currentKey, 1);
    iterations++;
  }

  return result;
}

// ============================================================================
// SERVER-SIDE DATA FETCHING (SERVICE ROLE & AUTHENTICATED FALLBACK)
// ============================================================================

/**
 * Fetches all store products with their authoritative HPP.
 * Queries Supabase service-role client, or authenticated admin client.
 */
export async function getAdminProductsWithHppServer(): Promise<ProductHppMapItem[]> {
  const serviceClient = getServiceRoleSupabaseClient();
  const client = serviceClient || (await createServerSupabaseClient());

  try {
    // 1. Try public.get_admin_products RPC
    const { data: rpcProds, error: rpcErr } = await client.rpc("get_admin_products");
    if (!rpcErr && Array.isArray(rpcProds)) {
      return rpcProds as ProductHppMapItem[];
    }

    // 2. Direct table fallback
    const { data: prods, error: prodsErr } = await client
      .from("products")
      .select("id, slug, name, price, hpp");

    if (!prodsErr && Array.isArray(prods)) {
      return prods as ProductHppMapItem[];
    }
  } catch {
    // Graceful error fallback
  }

  return [];
}

/**
 * Comprehensive server fetch for the Admin Dashboard and Sales Reports.
 * Enforces server-only boundary and returns verified calculated metrics.
 */
export async function fetchAdminDashboardDataServer(range: ReportTimeRange = "7days"): Promise<{
  metrics: DashboardMetrics;
  reports: ReportStats;
  orders: Order[];
}> {
  // Fetch authoritative orders and products in parallel
  const [orders, products] = await Promise.all([
    getAdminOrdersServer(),
    getAdminProductsWithHppServer(),
  ]);

  const metrics = calculateDashboardMetrics(orders);
  const reports = calculateReportStats(orders, products, range);

  return {
    metrics,
    reports,
    orders,
  };
}
