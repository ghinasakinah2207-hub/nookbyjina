import { Order, OrderStatus, PaymentMethod, PaymentStatus } from "@/types";
import { normalizeProductType, ProductType } from "@/lib/product-type";

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
 * Normalizes payment method into canonical PaymentMethod enum ("QRIS" | "Cash" | "QRIS Statis").
 */
export function normalizePaymentMethod(rawMethod?: unknown): PaymentMethod {
  const methodStr = String(rawMethod || "").trim().toLowerCase();
  if (methodStr === "cash" || methodStr.includes("cash") || methodStr.includes("tunai")) {
    return "Cash";
  }
  if (methodStr === "qris statis") {
    return "QRIS Statis";
  }
  return "QRIS";
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
 * Calculates the authoritative final total for an order, ensuring that any unique payment code
 * is correctly accounted for without double-counting.
 *
 * Rule 1: If rawAmount (authoritative payment gateway invoice amount) is present and > 0, use it.
 * Rule 2: If uniqueCode > 0:
 *   - Base total is (subtotal + shippingFee).
 *   - If order.total is already >= baseTotal + uniqueCode, order.total already includes the unique code.
 *   - Otherwise, the authoritative final total is baseTotal + uniqueCode.
 * Rule 3: Otherwise, use order.total || baseTotal.
 */
export function getOrderFinalTotal(order?: {
  subtotal?: number | null;
  shippingFee?: number | null;
  delivery_fee?: number | null;
  uniqueCode?: number | null;
  rawAmount?: number | null;
  total?: number | null;
} | null): number {
  if (!order) return 0;
  const subtotal = Number(order.subtotal || 0);
  const shippingFee = Number(
    order.shippingFee !== undefined && order.shippingFee !== null
      ? order.shippingFee
      : (order.delivery_fee || 0)
  );
  const baseTotal = subtotal + shippingFee;
  const uniqueCode = Number(order.uniqueCode || 0);
  const rawAmount = Number(order.rawAmount || 0);
  const storedTotal = Number(order.total || 0);

  // 1. Authoritative stored transaction amount (e.g. from payment gateway)
  if (rawAmount > 0) {
    return rawAmount;
  }

  // 2. If unique code exists, ensure it is included without double-adding
  if (uniqueCode > 0) {
    if (storedTotal >= baseTotal + uniqueCode) {
      return storedTotal;
    }
    return baseTotal + uniqueCode;
  }

  // 3. Fallback to stored total or baseTotal
  return storedTotal > 0 ? storedTotal : baseTotal;
}

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
    gatewayProvider?: unknown;
    gateway_provider?: unknown;
  } | null,
  nowMs: number = Date.now()
): boolean {
  if (!order) return false;

  const paymentStatus = String(order.paymentStatus || order.payment_status || "").trim().toLowerCase();
  const orderStatus = String(order.orderStatus || order.order_status || "").trim();
  const paymentMethod = String(order.paymentMethod || order.payment_method || "").trim();
  const gatewayProvider = String(order.gatewayProvider || order.gateway_provider || "").trim().toLowerCase();

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

  // 4. Cash never expires due to payment deadline
  if (!isQrisMethod(paymentMethod)) {
    return false;
  }

  // 5. Must be an unpaid order in pending/initial state
  const isPending =
    isPendingQrisStatus(paymentStatus) ||
    orderStatus === "Pesanan baru" ||
    (paymentStatus === "menunggu pembayaran" && (gatewayProvider === "waroengpay" || gatewayProvider === "duitku"));

  if (!isPending) {
    return false;
  }

  // 6. Authoritative deadline check
  // WaroengPay documentation specifies a 5-minute grace period after expires_at
  // before an unpaid invoice is marked expired.
  const rawDeadline = String(order.paymentDeadline || order.payment_deadline || "").trim();
  const rawCreatedAt = String(order.createdAt || order.created_at || "").trim();

  let deadlineMs: number;
  if (rawDeadline && !isNaN(Date.parse(rawDeadline))) {
    const baseDeadline = new Date(rawDeadline).getTime();
    if (gatewayProvider === "waroengpay") {
      deadlineMs = baseDeadline + 5 * 60 * 1000;
    } else {
      deadlineMs = baseDeadline;
    }
  } else if (rawCreatedAt && !isNaN(Date.parse(rawCreatedAt))) {
    // For legacy static QRIS without explicit payment_deadline, fall back to 30 mins
    deadlineMs = new Date(rawCreatedAt).getTime() + ORDER_PAYMENT_DEADLINE_MS;
  } else {
    return false;
  }

  return nowMs >= deadlineMs;
}

/**
 * Normalizes any Order object or raw RPC/row object to guarantee canonical field types.
 */
export function normalizeOrder(order: unknown, productTypeMap?: Map<string, ProductType>): Order {
  if (!order || typeof order !== "object") return order as Order;

  const o = order as Record<string, unknown>;
  const rawMethod = o.paymentMethod || o.payment_method;
  const rawStatus = o.paymentStatus || o.payment_status;

  const rawGatewayProvider = (o.gatewayProvider || o.gateway_provider) as Order["gatewayProvider"] | undefined;
  const rawPaymentUrl = (o.paymentUrl || o.payment_url) as string | undefined;
  const rawDuitkuRef = (o.duitkuReference || o.duitku_reference) as string | undefined;
  const rawWaroengPayId = (o.waroengpayInvoiceId || o.waroengpay_invoice_id || (o.raw_response as Record<string, unknown> | undefined)?.id) as string | undefined;
  const rawQrisPayload = (o.qrisPayload || o.qris_payload || (o.raw_response as Record<string, unknown> | undefined)?.qris) as string | undefined;
  const rawUniqueCode = o.uniqueCode !== undefined ? Number(o.uniqueCode) : (o.raw_response as Record<string, unknown> | undefined)?.unique_code !== undefined ? Number((o.raw_response as Record<string, unknown>).unique_code) : undefined;
  const rawAmountVal = o.rawAmount !== undefined ? Number(o.rawAmount) : (o.raw_response as Record<string, unknown> | undefined)?.amount !== undefined ? Number((o.raw_response as Record<string, unknown>).amount) : undefined;
  const rawExpiresAt = (o.expiresAt || o.expires_at || (o.raw_response as Record<string, unknown> | undefined)?.expires_at) as string | undefined;
  const rawLivemode = o.livemode !== undefined ? Boolean(o.livemode) : (o.raw_response as Record<string, unknown> | undefined)?.livemode !== undefined ? Boolean((o.raw_response as Record<string, unknown>).livemode) : undefined;

  const rawUuid = (o.uuid || (typeof o.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(o.id) ? o.id : undefined)) as string | undefined;

  let normalizedMethod = normalizePaymentMethod(rawMethod);
  if ((rawGatewayProvider === "waroengpay" || rawGatewayProvider === "duitku") && normalizedMethod === "QRIS Statis") {
    normalizedMethod = "QRIS";
  }
  const normalizedStatus = normalizePaymentStatus(rawStatus, normalizedMethod);

  const rawItems = Array.isArray(o.items) ? o.items : [];

  const rawSubtotal = Number(o.subtotal || 0);
  const rawShipping = Number(
    o.shippingFee !== undefined && o.shippingFee !== null
      ? o.shippingFee
      : (o.delivery_fee || 0)
  );
  const finalTotal = getOrderFinalTotal({
    subtotal: rawSubtotal,
    shippingFee: rawShipping,
    uniqueCode: rawUniqueCode,
    rawAmount: rawAmountVal,
    total: o.total !== undefined ? Number(o.total) : undefined,
  });

  return {
    ...(o as unknown as Order),
    id: String(o.id || o.orderNumber || o.order_number || ""),
    uuid: rawUuid,
    orderStatus: (o.orderStatus || o.order_status || "Pesanan baru") as OrderStatus,
    paymentStatus: normalizedStatus,
    paymentMethod: normalizedMethod,
    subtotal: rawSubtotal,
    shippingFee: rawShipping,
    total: finalTotal,
    merchantName: String(o.merchantName || o.merchant_name || "Nook by Jina"),
    gatewayProvider: rawGatewayProvider || undefined,
    paymentUrl: rawPaymentUrl || undefined,
    duitkuReference: rawDuitkuRef || undefined,
    waroengpayInvoiceId: rawWaroengPayId || undefined,
    qrisPayload: rawQrisPayload || undefined,
    uniqueCode: rawUniqueCode,
    rawAmount: rawAmountVal,
    expiresAt: rawExpiresAt || undefined,
    livemode: rawLivemode,
    items: rawItems.map((item: unknown) => {
      const it = (item || {}) as Record<string, unknown>;
      let resolvedType: ProductType | undefined = undefined;
      if (it.productType) {
        resolvedType = normalizeProductType(it.productType);
      } else if (productTypeMap) {
        if (it.productId) {
          resolvedType = productTypeMap.get(String(it.productId).toLowerCase());
        }
        if (!resolvedType && it.productName) {
          resolvedType = productTypeMap.get(String(it.productName).trim().toLowerCase());
        }
      }

      const rawOptions = Array.isArray(it.selectedOptions) ? it.selectedOptions : [];
      const rawAddons = Array.isArray(it.selectedAddons) ? it.selectedAddons : [];
      const unitPrice = Number(it.unitPrice ?? it.unit_price ?? it.basePrice ?? 0);
      const quantity = Math.max(1, Number(it.quantity || 1));
      const itemTotal = Number(
        it.itemTotal !== undefined && it.itemTotal !== null
          ? it.itemTotal
          : (it.line_total !== undefined && it.line_total !== null ? it.line_total : unitPrice * quantity)
      );

      return {
        ...(it as unknown as Order["items"][number]),
        unitPrice,
        quantity,
        itemTotal,
        itemNote: String(it.itemNote || it.note || ""),
        productType: resolvedType || normalizeProductType(it.productType),
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
        selectedAddons: rawAddons.map((addon: unknown) => {
          const ad = (addon || {}) as Record<string, unknown>;
          return {
            addonId: String(ad.addonId || ad.id || ""),
            addonName: String(ad.addonName || ad.name || "Add-on"),
            price: Number(ad.price || 0),
          };
        }),
      };
    }),
  };
}
