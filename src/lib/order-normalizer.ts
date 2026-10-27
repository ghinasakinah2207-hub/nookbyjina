import { Order, OrderStatus, PaymentMethod, PaymentStatus } from "@/types";

/**
 * Normalizes payment status from raw database representations, RPC responses,
 * or UI strings into the canonical PaymentStatus enum.
 */
export function normalizePaymentStatus(rawStatus?: unknown, rawMethod?: unknown): PaymentStatus {
  const statusStr = String(rawStatus || "").trim().toLowerCase();
  const methodStr = String(rawMethod || "").trim().toLowerCase();
  const isCash = methodStr.includes("cash");

  if (
    statusStr === "menunggu verifikasi admin" ||
    statusStr === "menunggu verifikasi" ||
    statusStr.includes("verifikasi")
  ) {
    return "Menunggu Verifikasi";
  }
  if (
    statusStr === "menunggu pembayaran" ||
    statusStr.includes("pembayaran")
  ) {
    return "Menunggu Pembayaran";
  }
  if (statusStr === "lunas") {
    return "Lunas";
  }
  if (statusStr === "dibatalkan" || statusStr === "gagal") {
    return "Dibatalkan";
  }

  return isCash ? "Menunggu Pembayaran" : "Menunggu Verifikasi";
}

/**
 * Normalizes payment method into canonical PaymentMethod enum ("QRIS Statis" | "Cash").
 */
export function normalizePaymentMethod(rawMethod?: unknown): PaymentMethod {
  const methodStr = String(rawMethod || "").trim().toLowerCase();
  if (methodStr === "cash" || methodStr.includes("cash") || methodStr.includes("tunai")) {
    return "Cash";
  }
  return "QRIS Statis";
}

export function isQrisMethod(method?: unknown): boolean {
  if (!method) return true;
  const s = String(method).trim().toLowerCase();
  return s === "qris" || s === "qris statis" || s.includes("qris");
}

export function isPendingQrisStatus(status?: unknown): boolean {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === "menunggu verifikasi" || s === "menunggu verifikasi admin" || s.includes("verifikasi");
}

export function isPendingCashStatus(status?: unknown): boolean {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === "menunggu pembayaran" || s.includes("pembayaran");
}

export function isPaidStatus(status?: unknown): boolean {
  if (!status) return false;
  return String(status).trim().toLowerCase() === "lunas";
}

export const ORDER_PAYMENT_DEADLINE_MS = 30 * 60 * 1000;

/**
 * Checks whether an order has exceeded its authoritative 30-minute QRIS payment window.
 *
 * Invariants:
 * 1. Paid orders ("Lunas") never expire.
 * 2. In-progress or completed orders ("Diproses", "Siap", "Selesai") never expire.
 * 3. Already cancelled orders return true (already expired/cancelled).
 * 4. Applies to QRIS orders waiting for verification or initial order creation.
 * 5. Uses UTC timestamp parsing for timezone-agnostic comparison against nowMs (default: Date.now()).
 */
export function isOrderExpired(
  order?: {
    paymentMethod?: unknown;
    payment_method?: unknown;
    paymentDeadline?: unknown;
    payment_deadline?: unknown;
    paymentStatus?: unknown;
    payment_status?: unknown;
    orderStatus?: unknown;
    order_status?: unknown;
    createdAt?: unknown;
    created_at?: unknown;
  } | null,
  nowMs: number = Date.now()
): boolean {
  if (!order) return false;

  const paymentStatus = String(order.paymentStatus || order.payment_status || "").trim().toLowerCase();
  const orderStatus = String(order.orderStatus || order.order_status || "").trim();
  const paymentMethod = String(order.paymentMethod || order.payment_method || "").trim();

  // 1. Paid orders never expire
  if (isPaidStatus(paymentStatus)) {
    return false;
  }

  // 2. Orders that are being processed, ready, or completed never expire
  if (orderStatus === "Diproses" || orderStatus === "Siap" || orderStatus === "Selesai") {
    return false;
  }

  // 3. Already cancelled orders are terminal and not pending expiration
  if (orderStatus === "Dibatalkan" || paymentStatus === "dibatalkan" || paymentStatus === "gagal") {
    return false;
  }

  // 4. Only QRIS payment method is subject to the 30-minute verification window
  if (!isQrisMethod(paymentMethod)) {
    return false;
  }

  // 5. Must be an unpaid order waiting for verification or in newly created state
  const isPending = isPendingQrisStatus(paymentStatus) || orderStatus === "Pesanan baru";
  if (!isPending) {
    return false;
  }

  // 6. Authoritative deadline check
  const rawDeadline = String(order.paymentDeadline || order.payment_deadline || "").trim();
  const rawCreatedAt = String(order.createdAt || order.created_at || "").trim();

  let deadlineMs: number;
  if (rawDeadline && !isNaN(Date.parse(rawDeadline))) {
    deadlineMs = new Date(rawDeadline).getTime();
  } else if (rawCreatedAt && !isNaN(Date.parse(rawCreatedAt))) {
    deadlineMs = new Date(rawCreatedAt).getTime() + ORDER_PAYMENT_DEADLINE_MS;
  } else {
    return false;
  }

  return nowMs >= deadlineMs;
}

/**
 * Normalizes any Order object or raw RPC/row object to guarantee canonical field types.
 */
export function normalizeOrder(order: unknown): Order {
  if (!order || typeof order !== "object") return order as Order;

  const o = order as Record<string, unknown>;
  const rawMethod = o.paymentMethod || o.payment_method;
  const rawStatus = o.paymentStatus || o.payment_status;

  const normalizedMethod = normalizePaymentMethod(rawMethod);
  const normalizedStatus = normalizePaymentStatus(rawStatus, normalizedMethod);

  const rawItems = Array.isArray(o.items) ? o.items : [];

  return {
    ...(o as unknown as Order),
    id: String(o.id || o.orderNumber || o.order_number || ""),
    orderStatus: (o.orderStatus || o.order_status || "Pesanan baru") as OrderStatus,
    paymentStatus: normalizedStatus,
    paymentMethod: normalizedMethod,
    merchantName: String(o.merchantName || o.merchant_name || "Nook by Jina"),
    items: rawItems.map((item: unknown) => {
      const it = (item || {}) as Record<string, unknown>;
      const rawOptions = Array.isArray(it.selectedOptions) ? it.selectedOptions : [];
      return {
        ...(it as unknown as Order["items"][number]),
        selectedOptions: rawOptions.map((opt: unknown) => {
          const op = (opt || {}) as Record<string, unknown>;
          return {
            groupId: String(op.groupId || op.optionName || ""),
            groupName: String(op.groupName || op.optionName || ""),
            optionName: String(op.optionName || op.groupName || ""),
            valueId: String(op.valueId || op.optionValueId || ""),
            valueName: String(op.valueName || op.optionValue || ""),
            optionValueId: String(op.optionValueId || op.valueId || ""),
            optionValue: String(op.optionValue || op.valueName || ""),
            priceDelta: Number(op.priceDelta || 0),
          };
        }),
      };
    }),
  };
}
