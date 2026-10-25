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
