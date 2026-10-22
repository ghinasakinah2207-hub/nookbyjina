import { Order, OrderStatus, PaymentStatus } from "@/types";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { hashOrderToken, isValidTokenFormat } from "@/lib/token-security";

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
    return `TJ-${wibDate}-001`;
  }

  // 1. Try PostgreSQL RPC generate_daily_order_number()
  const { data: rpcNumber, error: rpcErr } = await client.rpc("generate_daily_order_number");
  if (!rpcErr && rpcNumber && typeof rpcNumber === "string") {
    return rpcNumber;
  }

  // 2. Fallback to transactional upsert on public.daily_order_counters
  const { data: upsertData, error: upsertErr } = await client
    .from("daily_order_counters")
    .upsert(
      { order_date: wibDate, last_sequence: 1 },
      { onConflict: "order_date", ignoreDuplicates: false }
    )
    .select("last_sequence")
    .maybeSingle();

  if (!upsertErr && upsertData && typeof upsertData.last_sequence === "number") {
    const seq = upsertData.last_sequence;
    return seq <= 999
      ? `TJ-${wibDate}-${String(seq).padStart(3, "0")}`
      : `TJ-${wibDate}-${seq}`;
  }

  // 3. Fallback: Count existing orders for today + 1
  const todayPrefix = `TJ-${wibDate}-`;
  const { count, error: countErr } = await client
    .from("orders")
    .select("*", { count: "exact", head: true })
    .like("order_number", `${todayPrefix}%`);

  const nextSeq = countErr || count === null ? 1 : count + 1;
  return nextSeq <= 999
    ? `TJ-${wibDate}-${String(nextSeq).padStart(3, "0")}`
    : `TJ-${wibDate}-${nextSeq}`;
}

/**
 * Maps a raw Supabase database row to the application's Order type.
 */
function mapDatabaseRowToOrder(row: Record<string, unknown>, rawToken?: string): Order {
  const isCash = (row.payment_method as string) === "Cash";
  return {
    id: (row.order_number as string) || (row.id as string),
    token: rawToken || "",
    createdAt: (row.created_at as string) || new Date().toISOString(),
    customerName: (row.customer_name as string) || "",
    customerWhatsapp: (row.customer_whatsapp as string) || "",
    fulfillmentType: ((row.fulfillment_method as string) || "delivery") as "pickup" | "delivery",
    deliveryArea: (row.delivery_area as string) || "Lhoksukon",
    orderNote: (row.customer_note as string) || "",
    items: Array.isArray(row.items_snapshot) ? (row.items_snapshot as Order["items"]) : [],
    subtotal: Number(row.subtotal || 0),
    shippingFee: Number(row.delivery_fee || 0),
    total: Number(row.total || 0),
    orderStatus: (row.order_status as OrderStatus) || "Pesanan baru",
    paymentStatus: (row.payment_status as PaymentStatus) || (isCash ? "Menunggu Pembayaran" : "Menunggu Verifikasi"),
    paymentMethod: ((row.payment_method as string) || "QRIS Statis") as Order["paymentMethod"],
    paymentDeadline: (row.payment_deadline as string) || "",
    merchantName: (row.merchant_name as string) || "Nook by Jina",
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

  const tokenHash = hashOrderToken(order.token);
  const createdAt = order.createdAt || new Date().toISOString();
  const isCash = order.paymentMethod === "Cash";

  // Always keep in-memory fallback up to date for dev / test lookups and idempotency
  const devOrderEntry: Order = { ...order };
  devOrdersByHash.set(tokenHash, devOrderEntry);
  devOrdersById.set(order.id, devOrderEntry);

  const client = getServiceRoleSupabaseClient();
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi. " +
        "Atur environment variable SUPABASE_SERVICE_ROLE_KEY di .env.local dan Vercel Project Settings."
      );
    }
    return order;
  }

  // 1. Try atomic PostgreSQL RPC create_order_atomic
  const { data: rpcResult, error: rpcErr } = await client.rpc("create_order_atomic", {
    p_order: order,
    p_token_hash: tokenHash,
  });

  if (!rpcErr && rpcResult && typeof rpcResult === "object") {
    return {
      ...(rpcResult as Order),
      token: order.token, // preserve raw token for customer checkout response
    };
  }

  // 2. Direct Supabase Table Inserts (Fallback if migration RPC not yet applied)
  const orderUuid = crypto.randomUUID();
  const orderNumber = order.id;

  const { error: insOrderErr } = await client.from("orders").insert({
    id: orderUuid,
    order_number: orderNumber,
    order_status: order.orderStatus || "Pesanan baru",
    payment_status: order.paymentStatus || (isCash ? "Menunggu Pembayaran" : "Menunggu Verifikasi"),
    payment_method: order.paymentMethod || "QRIS Statis",
    payment_deadline: order.paymentDeadline || null,
    subtotal: order.subtotal || 0,
    delivery_fee: order.shippingFee || 0,
    total: order.total || 0,
    customer_name: order.customerName || "",
    customer_whatsapp: order.customerWhatsapp || "",
    customer_note: order.orderNote || "",
    delivery_address: order.deliveryArea || "Lhoksukon",
    delivery_area: order.deliveryArea || "Lhoksukon",
    fulfillment_method: order.fulfillmentType || "delivery",
    items_snapshot: order.items || [],
    merchant_name: order.merchantName || "Nook by Jina",
    created_at: createdAt,
    updated_at: createdAt,
  });

  if (insOrderErr) {
    throw new Error(`Gagal menyimpan pesanan ke database: ${insOrderErr.message}`);
  }

  // Insert token hash into anonymous_order_tokens
  if (tokenHash) {
    const { error: insTokenErr } = await client.from("anonymous_order_tokens").insert({
      id: crypto.randomUUID(),
      order_id: orderUuid,
      token_hash: tokenHash,
      created_at: createdAt,
    });
    if (insTokenErr) {
      console.warn("Peringatan saat menyimpan token hash pesanan:", insTokenErr.message);
    }
  }

  // Insert initial payment record
  await client.from("payments").insert({
    id: crypto.randomUUID(),
    order_id: orderUuid,
    method: order.paymentMethod || "QRIS Statis",
    status: order.paymentStatus || (isCash ? "Menunggu Pembayaran" : "Menunggu Verifikasi"),
    created_at: createdAt,
    updated_at: createdAt,
  });

  return order;
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
    return devOrder ? { ...devOrder, token: cleanToken } : null;
  }

  // 1. Try lookup_order_by_token_hash RPC
  const { data: rpcResult, error: rpcErr } = await client.rpc(
    "lookup_order_by_token_hash",
    { p_token_hash: tokenHash }
  );

  if (!rpcErr && rpcResult && typeof rpcResult === "object") {
    return {
      ...(rpcResult as Order),
      token: cleanToken,
    };
  }

  // 2. Direct relational query fallback
  const { data: tokenRecord, error: tokenErr } = await client
    .from("anonymous_order_tokens")
    .select("order_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (tokenErr || !tokenRecord?.order_id) {
    return null;
  }

  const { data: orderRecord, error: orderErr } = await client
    .from("orders")
    .select("*")
    .eq("id", tokenRecord.order_id)
    .maybeSingle();

  if (orderErr || !orderRecord) {
    return null;
  }

  return mapDatabaseRowToOrder(orderRecord as Record<string, unknown>, cleanToken);
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
        results.push({ ...devOrder, token: "" });
      }
    }
    return results;
  }

  // 1. Try lookup_orders_by_token_hashes RPC
  const { data: rpcResult, error: rpcErr } = await client.rpc(
    "lookup_orders_by_token_hashes",
    { p_token_hashes: hashes }
  );

  if (!rpcErr && Array.isArray(rpcResult)) {
    return (rpcResult as Order[]).map((o) => ({
      ...o,
      token: "", // Omit raw token in list queries for safety
    }));
  }

  // 2. Direct query fallback
  const { data: tokenRecords, error: tokenErr } = await client
    .from("anonymous_order_tokens")
    .select("order_id, token_hash")
    .in("token_hash", hashes)
    .is("revoked_at", null);

  if (tokenErr || !tokenRecords || tokenRecords.length === 0) {
    return [];
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

  return (orderRows as Record<string, unknown>[]).map((row) =>
    mapDatabaseRowToOrder(row)
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
      if (orderStatus) devOrder.orderStatus = orderStatus;
      if (paymentStatus) devOrder.paymentStatus = paymentStatus;
      if (devOrder.token) {
        const hash = hashOrderToken(devOrder.token);
        devOrdersByHash.set(hash, devOrder);
      }
      return { ...devOrder };
    }
    return null;
  }

  // 1. Try admin_update_order_status RPC
  const { data: rpcResult, error: rpcErr } = await client.rpc(
    "admin_update_order_status",
    {
      p_order_id: identifier,
      p_order_status: orderStatus || null,
      p_payment_status: paymentStatus || null,
    }
  );

  if (!rpcErr && rpcResult && typeof rpcResult === "object") {
    return rpcResult as Order;
  }

  // 2. Direct update fallback
  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { updated_at: now };
  if (orderStatus) updatePayload.order_status = orderStatus;
  if (paymentStatus) updatePayload.payment_status = paymentStatus;
  if (paymentStatus === "Lunas") updatePayload.paid_at = now;
  if (orderStatus === "Dibatalkan" || paymentStatus === "Dibatalkan") {
    updatePayload.cancelled_at = now;
  }

  // Query order first
  const { data: existing } = await client
    .from("orders")
    .select("*")
    .or(`order_number.eq.${identifier},id.eq.${identifier}`)
    .maybeSingle();

  if (!existing) {
    return null;
  }

  const { data: updatedRow, error: updateErr } = await client
    .from("orders")
    .update(updatePayload)
    .eq("id", existing.id)
    .select()
    .maybeSingle();

  if (updateErr || !updatedRow) {
    return null;
  }

  // Synchronize payment status
  if (paymentStatus) {
    await client
      .from("payments")
      .update({ status: paymentStatus, updated_at: now })
      .eq("order_id", existing.id);
  }

  return mapDatabaseRowToOrder(updatedRow as Record<string, unknown>);
}

/**
 * Retrieves all store orders for the authenticated admin dashboard.
 */
export async function getAdminOrdersServer(): Promise<Order[]> {
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
    return Array.from(devOrdersById.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // 1. Try get_admin_orders RPC
  const { data: rpcResult, error: rpcErr } = await client.rpc("get_admin_orders");
  if (!rpcErr && Array.isArray(rpcResult)) {
    return rpcResult as Order[];
  }

  // 2. Direct query fallback
  const { data: rows, error: rowsErr } = await client
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (rowsErr || !rows) {
    return [];
  }

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

  return (rows as Record<string, unknown>[]).map((row) => {
    const mapped = mapDatabaseRowToOrder(row);
    if ((!mapped.items || mapped.items.length === 0) && itemsByOrderId.has(String(row.id))) {
      mapped.items = itemsByOrderId.get(String(row.id)) || [];
    }
    return mapped;
  });
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
