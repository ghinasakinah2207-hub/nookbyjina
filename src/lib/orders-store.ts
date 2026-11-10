import { Order, OrderStatus, PaymentStatus } from "@/types";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { hashOrderToken, isValidTokenFormat } from "@/lib/token-security";
import { normalizeProductType, ProductType } from "@/lib/product-type";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrderFinalTotal,
  isOrderExpired,
  normalizeOrder,
  normalizePaymentMethod,
  normalizePaymentStatus,
} from "./order-normalizer";

export * from "./order-normalizer";

// In-memory cache for catalog product types to enrich orders lacking items_snapshot.productType
let productTypeCache: { data: Map<string, ProductType>; timestamp: number } | null = null;
const PRODUCT_TYPE_CACHE_TTL_MS = 60 * 1000; // 1 minute

export async function getProductTypesMap(client?: SupabaseClient | null): Promise<Map<string, ProductType>> {
  const now = Date.now();
  if (productTypeCache && now - productTypeCache.timestamp < PRODUCT_TYPE_CACHE_TTL_MS) {
    return productTypeCache.data;
  }

  const map = new Map<string, ProductType>();
  const activeClient = client || getServiceRoleSupabaseClient();
  if (!activeClient) {
    return map;
  }

  try {
    const { data, error } = await activeClient
      .from("products")
      .select("id, slug, name, product_type");

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const pType = normalizeProductType(row.product_type);
        if (row.id) map.set(String(row.id).toLowerCase(), pType);
        if (row.slug) map.set(String(row.slug).toLowerCase(), pType);
        if (row.name) map.set(String(row.name).trim().toLowerCase(), pType);
      }
      productTypeCache = { data: map, timestamp: now };
    }
  } catch (err) {
    console.error("[orders-store] Failed to fetch product types map:", err);
  }

  return map;
}

/**
 * Derives current date string in store-local Asia/Jakarta (WIB) timezone: 'YYMMDD'
 */
export function getWIBDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const yy = parts.find((p) => p.type === "year")?.value || "";
  const mm = parts.find((p) => p.type === "month")?.value || "";
  const dd = parts.find((p) => p.type === "day")?.value || "";
  return `${yy}${mm}${dd}`;
}

/**
 * Generates an atomic daily order sequence number formatted as:
 *   TJ-YYMMDD-NNN
 *
 * Concurrency Safety:
 * Queries the database-side daily sequence or counter table with transactional lock,
 * ensuring zero duplicate order numbers across concurrent requests.
 * Sequences >= 1000 dynamically expand (e.g. TJ-YYMMDD-1000) without collisions or truncation.
 */
export async function generateDailyOrderNumber(): Promise<string> {
  const client = getServiceRoleSupabaseClient();
  const wibDate = getWIBDateString();

  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi. " +
        "Atur environment variable SUPABASE_SERVICE_ROLE_KEY di .env.local dan Vercel Project Settings."
      );
    }
    // Development-only fallback when no database is configured
    return `TJ-${wibDate}-001`;
  }

  // Atomic PostgreSQL RPC — the only safe source of daily order numbers.
  // No client-side fallbacks: count-based or upsert-based strategies cannot
  // guarantee uniqueness under concurrent requests.
  const { data: rpcNumber, error: rpcErr } = await client.rpc("generate_daily_order_number");
  if (!rpcErr && rpcNumber && typeof rpcNumber === "string") {
    return rpcNumber;
  }

  // Fail closed: do not fabricate a potentially duplicate order number.
  const safeMsg = rpcErr?.message || "RPC generate_daily_order_number gagal.";
  console.error("[generateDailyOrderNumber] RPC failed:", safeMsg);
  throw new Error(
    "Gagal menghasilkan nomor pesanan harian. Silakan coba lagi dalam beberapa saat."
  );
}

export * from "./order-normalizer";

/**
 * Maps a raw Supabase database row to the application's Order type.
 */
function mapDatabaseRowToOrder(
  row: Record<string, unknown>,
  rawToken?: string,
  productTypeMap?: Map<string, ProductType>
): Order {
  const normalizedMethod = normalizePaymentMethod(row.payment_method);
  const normalizedPaymentStatus = normalizePaymentStatus(row.payment_status, normalizedMethod);

  const rawUuid = typeof row.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)
    ? row.id
    : (row.uuid as string) || undefined;

  return {
    id: (row.order_number as string) || (row.id as string),
    uuid: rawUuid,
    token: rawToken || "",
    createdAt: (row.created_at as string) || new Date().toISOString(),
    customerName: (row.customer_name as string) || "",
    customerWhatsapp: (row.customer_whatsapp as string) || "",
    fulfillmentType: ((row.fulfillment_method as string) || "delivery") as "pickup" | "delivery",
    deliveryArea: (row.delivery_area as string) || "Lhoksukon",
    orderNote: (row.customer_note as string) || "",
    items: Array.isArray(row.items_snapshot)
      ? (row.items_snapshot as Order["items"]).map((item) => {
          let resolvedType: ProductType | undefined = undefined;
          if (item.productType) {
            resolvedType = normalizeProductType(item.productType);
          } else if (productTypeMap) {
            if (item.productId) {
              resolvedType = productTypeMap.get(String(item.productId).toLowerCase());
            }
            if (!resolvedType && item.productName) {
              resolvedType = productTypeMap.get(String(item.productName).trim().toLowerCase());
            }
          }

          const unitPrice = Number(item.unitPrice ?? item.basePrice ?? 0);
          const quantity = Math.max(1, Number(item.quantity || 1));
          const itemTotal = Number(
            item.itemTotal !== undefined && item.itemTotal !== null
              ? item.itemTotal
              : unitPrice * quantity
          );

          return {
            ...item,
            unitPrice,
            quantity,
            itemTotal,
            itemNote: String(item.itemNote || ""),
            productType: resolvedType || normalizeProductType(item.productType),
            selectedOptions: Array.isArray(item.selectedOptions)
              ? item.selectedOptions.map((opt) => ({
                  ...opt,
                  groupId: opt.groupId || opt.optionName || "",
                  groupName: opt.groupName || opt.optionName || "",
                  optionName: opt.optionName || opt.groupName || "",
                  valueId: opt.valueId || opt.optionValueId || "",
                  valueName: opt.valueName || opt.optionValue || "",
                  optionValueId: opt.optionValueId || opt.valueId || "",
                  optionValue: opt.optionValue || opt.valueName || "",
                  priceDelta: Number(opt.priceDelta || 0),
                }))
              : [],
            selectedAddons: Array.isArray(item.selectedAddons)
              ? item.selectedAddons.map((rawAd) => {
                  const ad = (rawAd || {}) as unknown as Record<string, unknown>;
                  return {
                    addonId: String(ad.addonId || ad.id || ""),
                    addonName: String(ad.addonName || ad.name || "Add-on"),
                    price: Number(ad.price || 0),
                  };
                })
              : [],
          };
        })
      : [],
    subtotal: Number(row.subtotal || 0),
    shippingFee: Number(row.delivery_fee || 0),
    total: Number(row.total || 0),
    orderStatus: (row.order_status as OrderStatus) || "Pesanan baru",
    paymentStatus: normalizedPaymentStatus,
    paymentMethod: normalizedMethod,
    paymentDeadline: row.payment_deadline ? (row.payment_deadline as string) : null,
    merchantName: (row.merchant_name as string) || "Nook by Jina",
    gatewayProvider: (row.gateway_provider as Order["gatewayProvider"]) || undefined,
    duitkuReference: (row.duitku_reference as string) || undefined,
    paymentUrl: (row.payment_url as string) || undefined,
  };
}

// In-memory development store fallback for non-production environments when SUPABASE_SERVICE_ROLE_KEY is absent
interface GlobalOrdersStore {
  __devOrdersByHash?: Map<string, Order>;
  __devOrdersById?: Map<string, Order>;
}
const globalOrdersStore = globalThis as unknown as GlobalOrdersStore;
if (!globalOrdersStore.__devOrdersByHash) {
  globalOrdersStore.__devOrdersByHash = new Map<string, Order>();
}
if (!globalOrdersStore.__devOrdersById) {
  globalOrdersStore.__devOrdersById = new Map<string, Order>();
}
const devOrdersByHash = globalOrdersStore.__devOrdersByHash;
const devOrdersById = globalOrdersStore.__devOrdersById;

/**
 * Saves a new or updated order in the authoritative Supabase PostgreSQL store.
 * Uses atomic transaction via RPC or structured multi-table insert.
 */
export async function saveOrder(order: Order): Promise<Order> {
  if (!order.token || !isValidTokenFormat(order.token)) {
    throw new Error("Token akses pesanan tidak valid atau belum disertakan.");
  }

  const isCash = order.paymentMethod === "Cash";
  const rawStatus = (order.paymentStatus || "") as string;
  if (isCash) {
    if (
      rawStatus &&
      rawStatus !== "Menunggu Pembayaran" &&
      rawStatus !== "Menunggu pembayaran"
    ) {
      throw new Error(
        `Status pembayaran awal "${rawStatus}" tidak valid untuk metode Cash (harus "Menunggu pembayaran").`
      );
    }
  } else {
    // QRIS can be either "Menunggu Verifikasi" (legacy static) or "Menunggu Pembayaran" (Duitku gateway)
    if (
      rawStatus &&
      rawStatus !== "Menunggu Verifikasi" &&
      rawStatus !== "Menunggu verifikasi admin" &&
      rawStatus !== "Menunggu Pembayaran" &&
      rawStatus !== "Menunggu pembayaran"
    ) {
      throw new Error(
        `Status pembayaran awal "${rawStatus}" tidak valid untuk metode QRIS.`
      );
    }
  }

  const tokenHash = hashOrderToken(order.token);

  const client = getServiceRoleSupabaseClient();
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi. " +
        "Atur environment variable SUPABASE_SERVICE_ROLE_KEY di .env.local dan Vercel Project Settings."
      );
    }
    // Only in development when no Supabase database is configured
    const assignedId = order.id && order.id.length > 0 ? order.id : `TJ-${getWIBDateString()}-001`;
    const devOrderEntry: Order = { ...order, id: assignedId };
    devOrdersByHash.set(tokenHash, devOrderEntry);
    devOrdersById.set(assignedId, devOrderEntry);
    return devOrderEntry;
  }

  // Atomic PostgreSQL RPC — the only safe way to persist orders.
  // The RPC validates prices, calculates totals from the catalog, persists all
  // related rows (order, items, options, token, payment) in a single transaction,
  // and handles idempotency via advisory lock on the token hash.
  // NO direct-insert fallback: it would omit required fields (subtotal, etc.),
  // create partial/orphaned data, and bypass server-side price validation.
  const { data: rpcResult, error: rpcErr } = await client.rpc("create_order_atomic", {
    p_order: order,
    p_token_hash: tokenHash,
  });

  if (!rpcErr && rpcResult && typeof rpcResult === "object") {
    const rawOrder = rpcResult as Order;
    const normalizedItems = Array.isArray(rawOrder.items)
      ? rawOrder.items.map((item, idx) => ({
          ...item,
          productType: normalizeProductType(item.productType || order.items?.[idx]?.productType),
          selectedOptions: Array.isArray(item.selectedOptions)
            ? item.selectedOptions.map((opt) => ({
                ...opt,
                groupId: opt.groupId || opt.optionName || "",
                groupName: opt.groupName || opt.optionName || "",
                optionName: opt.optionName || opt.groupName || "",
                valueId: opt.valueId || opt.optionValueId || "",
                valueName: opt.valueName || opt.optionValue || "",
                optionValueId: opt.optionValueId || opt.valueId || "",
                optionValue: opt.optionValue || opt.valueName || "",
                priceDelta: Number(opt.priceDelta || 0),
              }))
            : [],
        }))
      : [];

    return normalizeOrder({
      ...rawOrder,
      items: normalizedItems,
      token: order.token, // preserve raw token for customer checkout response
    });
  }

  // Fail closed: do not attempt direct table inserts that bypass validation.
  const rawMsg = rpcErr?.message || "";
  console.error("[saveOrder] Atomic RPC failed:", {
    code: rpcErr?.code,
    message: rawMsg,
    details: rpcErr?.details,
    hint: rpcErr?.hint,
    orderId: order.id,
    paymentMethod: order.paymentMethod,
    fulfillmentType: order.fulfillmentType,
    total: order.total,
    itemsCount: order.items?.length,
  });

  const isIntentionalMessage =
    rawMsg.includes("tidak valid") ||
    rawMsg.includes("tidak ditemukan") ||
    rawMsg.includes("tidak tersedia") ||
    rawMsg.includes("belum dipilih") ||
    rawMsg.includes("belum terkonfigurasi") ||
    rawMsg.includes("wajib") ||
    rawMsg.includes("tidak didukung") ||
    rawMsg.includes("melebihi") ||
    rawMsg.includes("Akses ditolak") ||
    rawMsg.includes("dicabut") ||
    rawMsg.includes("kedaluwarsa");

  const safeMsg = isIntentionalMessage
    ? rawMsg
    : "Gagal menyimpan pesanan ke database. Silakan coba lagi dalam beberapa saat.";
  throw new Error(safeMsg);
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  if (!orderId) return null;
  const client = getServiceRoleSupabaseClient();
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.");
    }
    const devOrder = devOrdersById.get(orderId);
    return devOrder ? { ...devOrder } : null;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
  let orderQuery = client
    .from("orders")
    .select("id, order_number, total, payment_method, payment_status, order_status, paid_at, cancelled_at");

  if (isUuid) {
    orderQuery = orderQuery.eq("id", orderId);
  } else {
    orderQuery = orderQuery.eq("order_number", orderId);
  }

  const { data: order, error } = await orderQuery.maybeSingle();
  if (error || !order) return null;
  return mapDatabaseRowToOrder(order);
}

/**
 * Retrieves an order authoritatively from Supabase by its secret access token.
 * Validates the SHA-256 hash against anonymous_order_tokens.
 */
export async function getOrderByToken(token: string): Promise<Order | null> {
  if (!token || typeof token !== "string" || !isValidTokenFormat(token)) {
    return null;
  }

  const cleanToken = token.trim();
  const tokenHash = hashOrderToken(cleanToken);
  const client = getServiceRoleSupabaseClient();
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.");
    }
    const devOrder = devOrdersByHash.get(tokenHash);
    if (!devOrder) return null;
    if (isOrderExpired(devOrder)) {
      devOrder.orderStatus = "Dibatalkan";
      devOrder.paymentStatus = "Dibatalkan";
      devOrdersById.set(devOrder.id, devOrder);
    }
    return {
      ...devOrder,
      token: cleanToken,
      serverConfirmed: true,
      syncStatus: "confirmed",
    };
  }

  let order: Order | null = null;
  const productTypeMap = await getProductTypesMap(client);

  // 1. Try lookup_order_by_token_hash RPC
  const { data: rpcResult, error: rpcErr } = await client.rpc(
    "lookup_order_by_token_hash",
    { p_token_hash: tokenHash }
  );

  if (!rpcErr && rpcResult && typeof rpcResult === "object") {
    order = normalizeOrder({
      ...(rpcResult as Order),
      token: cleanToken,
    }, productTypeMap);
  } else {
    // 2. Direct relational query fallback
    const { data: tokenRecord, error: tokenErr } = await client
      .from("anonymous_order_tokens")
      .select("order_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (!tokenErr && tokenRecord?.order_id) {
      const { data: orderRecord, error: orderErr } = await client
        .from("orders")
        .select("*")
        .eq("id", tokenRecord.order_id)
        .maybeSingle();

      if (!orderErr && orderRecord) {
        order = mapDatabaseRowToOrder(orderRecord as Record<string, unknown>, cleanToken, productTypeMap);
      }
    }
  }

  // Enrich with payments metadata if available
  if (order && (!order.gatewayProvider || !order.paymentUrl || order.uniqueCode === undefined || !order.rawAmount)) {
    try {
      let orderUuid = order.uuid;
      if (!orderUuid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderUuid)) {
        const { data: oRow } = await client
          .from("orders")
          .select("id")
          .eq("order_number", order.id)
          .maybeSingle();
        if (oRow?.id) {
          orderUuid = oRow.id;
          order.uuid = oRow.id;
        }
      }

      if (orderUuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderUuid)) {
        const { data: payRecord } = await client
          .from("payments")
          .select("gateway_provider, payment_url, duitku_reference, gateway_status, raw_response")
          .eq("order_id", orderUuid)
          .maybeSingle();

        if (payRecord) {
          if (payRecord.gateway_provider) order.gatewayProvider = payRecord.gateway_provider;
          if (payRecord.payment_url) order.paymentUrl = payRecord.payment_url;
          if (payRecord.duitku_reference) order.duitkuReference = payRecord.duitku_reference;
          const rawResp = payRecord.raw_response as Record<string, unknown> | null;
          if (rawResp) {
            if (rawResp.id) order.waroengpayInvoiceId = String(rawResp.id);
            if (rawResp.qris) order.qrisPayload = String(rawResp.qris);
            if (rawResp.unique_code !== undefined) order.uniqueCode = Number(rawResp.unique_code);
            if (rawResp.amount !== undefined) order.rawAmount = Number(rawResp.amount);
            if (rawResp.expires_at) order.expiresAt = String(rawResp.expires_at);
            if (rawResp.livemode !== undefined) order.livemode = Boolean(rawResp.livemode);
          }
        }
      }
    } catch {
      // Graceful fallback if payments columns not yet queried
    }
  }

  if (order) {
    order.serverConfirmed = true;
    order.syncStatus = "confirmed";
    order.total = getOrderFinalTotal(order);
  }

  if (order && isOrderExpired(order)) {
    if (order.orderStatus !== "Dibatalkan" || order.paymentStatus !== "Dibatalkan") {
      try {
        await updateOrderStatusServer(order.id, "Dibatalkan", "Dibatalkan");
      } catch (err) {
        console.error("[getOrderByToken] Auto-cancel expired order failed:", err);
      }
      order.orderStatus = "Dibatalkan";
      order.paymentStatus = "Dibatalkan";
    }
  }

  return order;
}

/**
 * Retrieves multiple orders by an array of secret access tokens.
 * Scoped strictly to the provided tokens — never exposes other customers' orders.
 */
export async function getOrdersByTokens(tokens: string[]): Promise<Order[]> {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return [];
  }

  const validTokens = tokens
    .filter((t): t is string => typeof t === "string" && isValidTokenFormat(t))
    .map((t) => t.trim());

  if (validTokens.length === 0) {
    return [];
  }

  const client = getServiceRoleSupabaseClient();
  const hashes: string[] = [];
  const tokenHashMap = new Map<string, string>(); // tokenHash -> rawToken

  for (const t of validTokens) {
    const hash = hashOrderToken(t);
    tokenHashMap.set(hash, t);
    hashes.push(hash);
  }

  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.");
    }
    const results: Order[] = [];
    for (const h of hashes) {
      const devOrder = devOrdersByHash.get(h);
      if (devOrder) {
        if (isOrderExpired(devOrder)) {
          devOrder.orderStatus = "Dibatalkan";
          devOrder.paymentStatus = "Dibatalkan";
          devOrdersById.set(devOrder.id, devOrder);
        }
        results.push({
          ...devOrder,
          token: tokenHashMap.get(h) || "",
          serverConfirmed: true,
          syncStatus: "confirmed",
        });
      }
    }
    return results;
  }

  let fetchedOrders: Order[] = [];
  const productTypeMap = await getProductTypesMap(client);

  // 1. Try lookup_orders_by_token_hashes RPC
  const { data: rpcResult, error: rpcErr } = await client.rpc(
    "lookup_orders_by_token_hashes",
    { p_token_hashes: hashes }
  );

  if (!rpcErr && Array.isArray(rpcResult)) {
    // Map token hashes to raw tokens via anonymous_order_tokens order_id (UUID)
    const { data: tokenRecords } = await client
      .from("anonymous_order_tokens")
      .select("order_id, token_hash")
      .in("token_hash", hashes)
      .is("revoked_at", null);

    const uuidToTokenMap = new Map<string, string>();
    if (tokenRecords && Array.isArray(tokenRecords)) {
      for (const record of tokenRecords) {
        const rawToken = tokenHashMap.get(record.token_hash);
        if (rawToken && record.order_id) {
          uuidToTokenMap.set(String(record.order_id), rawToken);
        }
      }
    }

    fetchedOrders = (rpcResult as Order[]).map((o) => {
      // Restore client's own token using verified order UUID mapping
      const token = (o.uuid ? uuidToTokenMap.get(String(o.uuid)) : undefined) || "";
      return normalizeOrder({
        ...o,
        token,
        serverConfirmed: true,
        syncStatus: "confirmed",
      }, productTypeMap);
    });
  } else {
    // 2. Direct query fallback
    const { data: tokenRecords, error: tokenErr } = await client
      .from("anonymous_order_tokens")
      .select("order_id, token_hash")
      .in("token_hash", hashes)
      .is("revoked_at", null);

    if (tokenErr || !tokenRecords || tokenRecords.length === 0) {
      return [];
    }

    const orderIdToToken = new Map<string, string>();
    for (const record of tokenRecords) {
      const rawT = tokenHashMap.get(record.token_hash);
      if (rawT && record.order_id) {
        orderIdToToken.set(String(record.order_id), rawT);
      }
    }

    const orderIds = tokenRecords.map((r) => r.order_id);
    const { data: orderRows, error: ordersErr } = await client
      .from("orders")
      .select("*")
      .in("id", orderIds)
      .order("created_at", { ascending: false });

    if (ordersErr || !orderRows) {
      return [];
    }

    fetchedOrders = (orderRows as Record<string, unknown>[]).map((row) => {
      const order = mapDatabaseRowToOrder(row, orderIdToToken.get(String(row.id)), productTypeMap);
      return {
        ...order,
        serverConfirmed: true,
        syncStatus: "confirmed",
      };
    });
  }

  // Enrich fetched orders with payments metadata
  if (client && fetchedOrders.length > 0) {
    try {
      const uuids = fetchedOrders
        .map((o) => o.uuid)
        .filter((u): u is string => typeof u === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u));

      if (uuids.length > 0) {
        const { data: payRecords } = await client
          .from("payments")
          .select("order_id, gateway_provider, payment_url, duitku_reference, gateway_status, raw_response")
          .in("order_id", uuids);

        if (payRecords && Array.isArray(payRecords)) {
          const payMap = new Map(payRecords.map((p) => [String(p.order_id), p]));
          for (const o of fetchedOrders) {
            if (o.uuid && payMap.has(o.uuid)) {
              const p = payMap.get(o.uuid)!;
              if (p.gateway_provider) o.gatewayProvider = p.gateway_provider;
              if (p.payment_url) o.paymentUrl = p.payment_url;
              if (p.duitku_reference) o.duitkuReference = p.duitku_reference;
              const rawResp = p.raw_response as Record<string, unknown> | null;
              if (rawResp) {
                if (rawResp.id) o.waroengpayInvoiceId = String(rawResp.id);
                if (rawResp.qris) o.qrisPayload = String(rawResp.qris);
                if (rawResp.unique_code !== undefined) o.uniqueCode = Number(rawResp.unique_code);
                if (rawResp.amount !== undefined) o.rawAmount = Number(rawResp.amount);
                if (rawResp.expires_at) o.expiresAt = String(rawResp.expires_at);
                if (rawResp.livemode !== undefined) o.livemode = Boolean(rawResp.livemode);
              }
              o.total = getOrderFinalTotal(o);
            }
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  await syncExpiredOrders(fetchedOrders);
  return fetchedOrders;
}

/**
 * Automatically synchronizes any expired unverified QRIS orders to 'Dibatalkan' state
 * across database rows and returned order objects.
 */
async function syncExpiredOrders(orders: Order[]): Promise<void> {
  const expiredOrders = orders.filter(
    (o) => isOrderExpired(o) && o.orderStatus !== "Dibatalkan"
  );
  if (expiredOrders.length === 0) return;

  await Promise.allSettled(
    expiredOrders.map(async (o) => {
      try {
        await updateOrderStatusServer(o.id, "Dibatalkan", "Dibatalkan");
      } catch (err) {
        console.error(`[syncExpiredOrders] Auto-cancel expired order ${o.id} failed:`, err);
      }
      o.orderStatus = "Dibatalkan";
      o.paymentStatus = "Dibatalkan";
    })
  );
}

/**
 * Updates order and/or payment status for an existing order by order_number or id.
 */
export async function updateOrderStatusServer(
  identifier: string,
  orderStatus?: OrderStatus,
  paymentStatus?: PaymentStatus
): Promise<Order | null> {
  if (!identifier) return null;
  const client = getServiceRoleSupabaseClient();
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.");
    }
    const devOrder = devOrdersById.get(identifier);
    if (devOrder) {
      const existingOrderStatus = devOrder.orderStatus;
      const existingPaymentStatus = devOrder.paymentStatus;
      let targetPaymentStatus = paymentStatus;
      let targetOrderStatus = orderStatus;

      // Transition Rule 0: Expired Orders Cannot Be Verified or Re-activated
      if (isOrderExpired(devOrder)) {
        devOrder.orderStatus = "Dibatalkan";
        devOrder.paymentStatus = "Dibatalkan";
        if (devOrder.token) {
          const hash = hashOrderToken(devOrder.token);
          devOrdersByHash.set(hash, devOrder);
        }
        if (
          targetPaymentStatus === "Lunas" ||
          (targetOrderStatus && targetOrderStatus !== "Dibatalkan")
        ) {
          throw new Error(
            "Batas waktu pembayaran pesanan telah kedaluwarsa (30 menit). Pembayaran tidak dapat diverifikasi."
          );
        }
      }

      // Transition Rule 1: Paid Orders Cannot Be Cancelled
      if (existingPaymentStatus === "Lunas") {
        if (targetOrderStatus === "Dibatalkan") {
          throw new Error("Pesanan yang telah berstatus Lunas tidak dapat dibatalkan.");
        }
        if (targetPaymentStatus === "Dibatalkan") {
          throw new Error("Pembayaran yang telah berstatus Lunas tidak dapat dibatalkan.");
        }
      }

      // Transition Rule 2: Cancelled Orders Cannot Be Resurrected
      if (existingOrderStatus === "Dibatalkan" && targetOrderStatus && targetOrderStatus !== "Dibatalkan") {
        throw new Error("Pesanan yang telah dibatalkan tidak dapat diaktifkan kembali.");
      }

      // Transition Rule 3: Cancelled Orders or Payments Cannot Receive Payment
      if (targetPaymentStatus === "Lunas") {
        if (targetOrderStatus === "Dibatalkan" || existingOrderStatus === "Dibatalkan") {
          throw new Error("Pesanan yang dibatalkan tidak dapat menerima status pembayaran Lunas.");
        }
        if (existingPaymentStatus === "Dibatalkan") {
          throw new Error("Pembayaran yang telah dibatalkan tidak dapat diubah statusnya menjadi Lunas.");
        }
      }

      // Transition Rule 4: Completed Orders and Their Payment Status Are Immutable
      if (existingOrderStatus === "Selesai") {
        if (targetOrderStatus && targetOrderStatus !== "Selesai") {
          throw new Error("Pesanan yang telah selesai tidak dapat diubah statusnya.");
        }
        if (targetPaymentStatus && targetPaymentStatus !== existingPaymentStatus) {
          throw new Error("Status pembayaran pesanan yang telah selesai tidak dapat diubah.");
        }
      }

      // Transition Rule 5: Reject Contradictory Active and Cancelled Status Combinations
      if (targetPaymentStatus === "Dibatalkan" || (!targetPaymentStatus && existingPaymentStatus === "Dibatalkan")) {
        if (targetOrderStatus && targetOrderStatus !== "Dibatalkan") {
          throw new Error(`Status pesanan "${targetOrderStatus}" tidak dapat digabungkan dengan status pembayaran "Dibatalkan".`);
        }
      }
      if (targetOrderStatus === "Dibatalkan" || (!targetOrderStatus && existingOrderStatus === "Dibatalkan")) {
        if (targetPaymentStatus && targetPaymentStatus !== "Dibatalkan") {
          throw new Error(`Status pesanan "Dibatalkan" tidak dapat digabungkan dengan status pembayaran aktif ("${targetPaymentStatus}").`);
        }
      }

      // Transition Rule 6: Single-Status Synchronization Policy
      if (targetOrderStatus === "Dibatalkan" && !targetPaymentStatus) {
        targetPaymentStatus = "Dibatalkan";
      }
      if (targetPaymentStatus === "Dibatalkan" && !targetOrderStatus && ["Pesanan baru", "Diproses", "Siap"].includes(existingOrderStatus)) {
        targetOrderStatus = "Dibatalkan";
      }

      // Transition Rule 7: Reject Invalid Payment Method and Status Combinations
      const currentMethod = (devOrder.paymentMethod || "") as string;
      const rawTargetStatus = (targetPaymentStatus || "") as string;
      if (rawTargetStatus) {
        if (
          currentMethod === "Cash" &&
          (rawTargetStatus === "Menunggu Verifikasi" || rawTargetStatus === "Menunggu verifikasi admin")
        ) {
          throw new Error('Metode pembayaran Cash tidak valid dengan status "Menunggu verifikasi admin".');
        }
      }

      if (targetOrderStatus) devOrder.orderStatus = targetOrderStatus;
      if (targetPaymentStatus) devOrder.paymentStatus = targetPaymentStatus;
      if (devOrder.token) {
        const hash = hashOrderToken(devOrder.token);
        devOrdersByHash.set(hash, devOrder);
      }
      return { ...devOrder };
    }
    return null;
  }

  // Verify order payment deadline validity before applying any status transition
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  let query = client
    .from("orders")
    .select("id, order_number, order_status, payment_status, payment_method, payment_deadline, created_at");

  if (isUuid) {
    query = query.eq("id", identifier);
  } else {
    query = query.eq("order_number", identifier);
  }

  const { data: existingRow, error: fetchErr } = await query.maybeSingle();

  if (!fetchErr && existingRow) {
    if (isOrderExpired(existingRow)) {
      // Ensure database state is cancelled if still preliminary
      if (existingRow.order_status !== "Dibatalkan" || existingRow.payment_status !== "Dibatalkan") {
        try {
          await client.rpc("admin_update_order_status", {
            p_order_id: existingRow.order_number || identifier,
            p_order_status: "Dibatalkan",
            p_payment_status: "Dibatalkan",
          });
        } catch {
          // Ignore if already cancelled or locked
        }
      }

      if (
        paymentStatus === "Lunas" ||
        (orderStatus && orderStatus !== "Dibatalkan")
      ) {
        throw new Error(
          "Batas waktu pembayaran pesanan telah kedaluwarsa (30 menit). Pembayaran tidak dapat diverifikasi."
        );
      }
    }
  }

  // Atomic PostgreSQL RPC — the only safe way to update order/payment status.
  // The RPC enforces transition rules (immutable completed orders, no resurrection
  // of cancelled orders, no cancellation of paid orders, status synchronization).
  // NO direct-update fallback: it would bypass all transition enforcement.
  const targetOrderId = existingRow?.order_number || identifier;
  const { data: rpcResult, error: rpcErr } = await client.rpc(
    "admin_update_order_status",
    {
      p_order_id: targetOrderId,
      p_order_status: orderStatus || null,
      p_payment_status: paymentStatus || null,
    }
  );

  if (!rpcErr && rpcResult && typeof rpcResult === "object") {
    const productTypeMap = await getProductTypesMap(client);
    return normalizeOrder(rpcResult as Order, productTypeMap);
  }

  // RPC returned null → order not found
  if (!rpcErr && rpcResult === null) {
    return null;
  }

  // Fail closed: return safe message for system crashes, but preserve intentional business & auth invariant messages
  const rawMsg = rpcErr?.message || "";
  const isIntentionalMessage =
    rawMsg.includes("tidak dapat") ||
    rawMsg.includes("tidak valid") ||
    rawMsg.includes("Akses ditolak") ||
    rawMsg.includes("dibatalkan") ||
    rawMsg.includes("selesai") ||
    rawMsg.includes("kedaluwarsa");

  const safeMsg = isIntentionalMessage
    ? rawMsg
    : "Gagal memperbarui status pesanan. Silakan coba lagi dalam beberapa saat.";
  console.error("[updateOrderStatusServer] RPC failed:", rawMsg || safeMsg);
  throw new Error(safeMsg);
}

/**
 * Retrieves all store orders for the authenticated admin dashboard.
 */
export interface GetAdminOrdersOptions {
  limit?: number;
  startDate?: string;
  endDate?: string;
  endDateExclusive?: boolean;
}

export async function getAdminOrdersServer(options?: GetAdminOrdersOptions): Promise<Order[]> {
  let client = getServiceRoleSupabaseClient();
  if (!client) {
    try {
      const { createServerSupabaseClient } = await import("@/lib/supabase/server");
      client = (await createServerSupabaseClient()) as unknown as ReturnType<typeof getServiceRoleSupabaseClient>;
    } catch {
      // cookies() context not available (e.g. non-request environment)
    }
  }

  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.");
    }
    let devOrders = Array.from(devOrdersById.values());
    if (options?.startDate) {
      const startMs = new Date(options.startDate).getTime();
      devOrders = devOrders.filter((o) => new Date(o.createdAt).getTime() >= startMs);
    }
    if (options?.endDate) {
      const endMs = new Date(options.endDate).getTime();
      if (options.endDateExclusive) {
        devOrders = devOrders.filter((o) => new Date(o.createdAt).getTime() < endMs);
      } else {
        devOrders = devOrders.filter((o) => new Date(o.createdAt).getTime() <= endMs);
      }
    }
    for (const devOrder of devOrders) {
      if (isOrderExpired(devOrder)) {
        devOrder.orderStatus = "Dibatalkan";
        devOrder.paymentStatus = "Dibatalkan";
      }
    }
    return devOrders
      .map((o) => normalizeOrder(o))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  let adminOrders: Order[] = [];

  // Direct table query: fetch authoritative orders ordered by created_at DESC
  let query = client
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.startDate) {
    query = query.gte("created_at", options.startDate);
  }

  if (options?.endDate) {
    if (options.endDateExclusive) {
      query = query.lt("created_at", options.endDate);
    } else {
      query = query.lte("created_at", options.endDate);
    }
  }

  if (options?.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data: rows, error: rowsErr } = await query;

  if (rowsErr || !rows) {
    return [];
  }

  const productTypeMap = await getProductTypesMap(client);

  // Resilient item resolution: if items_snapshot is not yet populated, join order_items
  const hasSnapshot = rows.some((r) => Array.isArray((r as Record<string, unknown>).items_snapshot));
  const itemsByOrderId = new Map<string, Order["items"]>();

  if (!hasSnapshot && rows.length > 0) {
    try {
      const orderIds = rows.map((r) => (r as Record<string, unknown>).id).filter(Boolean);
      const { data: itemRows } = await client
        .from("order_items")
        .select("id, order_id, product_id, product_name, quantity, unit_price, item_note")
        .in("order_id", orderIds);

      if (itemRows && Array.isArray(itemRows)) {
        for (const item of itemRows) {
          const oId = String(item.order_id);
          const list = itemsByOrderId.get(oId) || [];
          const qty = Number(item.quantity) || 1;
          const uPrice = Number(item.unit_price) || 0;
          list.push({
            id: String(item.id),
            productId: String(item.product_id),
            productName: String(item.product_name),
            productType: productTypeMap.get(String(item.product_id).toLowerCase()) || "preorder",
            productImage: "",
            basePrice: uPrice,
            selectedOptions: [],
            selectedAddons: [],
            itemNote: String(item.item_note || ""),
            quantity: qty,
            unitPrice: uPrice,
            itemTotal: uPrice * qty,
            isAvailable: true,
          });
          itemsByOrderId.set(oId, list);
        }
      }
    } catch {
      // Graceful fallback if order_items is not queryable
    }
  }

  adminOrders = (rows as Record<string, unknown>[]).map((row) => {
    const mapped = mapDatabaseRowToOrder(row, undefined, productTypeMap);
    if ((!mapped.items || mapped.items.length === 0) && itemsByOrderId.has(String(row.id))) {
      mapped.items = itemsByOrderId.get(String(row.id)) || [];
    }
    return normalizeOrder(mapped, productTypeMap);
  });

  // Include any in-memory dev/test orders ONLY when operating in non-database dev mode
  if (!client && devOrdersById.size > 0) {
    const dbOrderIds = new Set(adminOrders.map((o) => o.id));
    for (const devOrder of devOrdersById.values()) {
      if (!dbOrderIds.has(devOrder.id)) {
        if (options?.startDate) {
          const startMs = new Date(options.startDate).getTime();
          if (new Date(devOrder.createdAt).getTime() < startMs) continue;
        }
        if (options?.endDate) {
          const endMs = new Date(options.endDate).getTime();
          if (options.endDateExclusive) {
            if (new Date(devOrder.createdAt).getTime() >= endMs) continue;
          } else {
            if (new Date(devOrder.createdAt).getTime() > endMs) continue;
          }
        }
        adminOrders.push(normalizeOrder(devOrder));
      }
    }
    adminOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  await syncExpiredOrders(adminOrders);
  return adminOrders;
}

/**
 * Sanitizes an order for public/customer access through token URL.
 * Per PRD Section 14:
 * "Tautan akses tidak menampilkan nama atau nomor WhatsApp pelanggan.
 * Detail melalui token menampilkan nomor order, waktu order, status order/pembayaran,
 * item, varian, add-on, catatan item, subtotal, ongkir, total, dan metode pembayaran.
 * Jangan menampilkan ulang nama atau nomor WhatsApp pelanggan di halaman detail token."
 */
export function sanitizeOrderForCustomer(order: Order): Order {
  return {
    ...order,
    // Mask / strip sensitive customer PII
    customerWhatsapp: "",
    customerName: order.customerName ? `${order.customerName[0]}***` : "",
  };
}
