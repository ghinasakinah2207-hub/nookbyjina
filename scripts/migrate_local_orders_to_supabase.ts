import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { Order } from "../src/types";
import { hashOrderToken } from "../src/lib/token-security";

// Load environment variables from .env.local if not already in process.env
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isDryRun = process.argv.includes("--dry-run");
const ordersFilePath = path.join(process.cwd(), "src/data/orders-data.json");

async function main() {
  console.log("==================================================================");
  console.log("Nook by Jina — Local Orders to Supabase PostgreSQL Migration Tool");
  console.log(`Mode: ${isDryRun ? "DRY-RUN (Simulasi saja, tidak ada data ditulis)" : "LIVE EXECUTION"}`);
  console.log("==================================================================\n");

  if (!supabaseUrl) {
    console.error("❌ ERROR: NEXT_PUBLIC_SUPABASE_URL tidak ditemukan di environment.");
    process.exit(1);
  }

  if (!serviceRoleKey) {
    console.error("❌ ERROR: SUPABASE_SERVICE_ROLE_KEY wajib diatur di .env.local untuk menjalankan migrasi data.");
    console.error("Panduan: Salin 'service_role secret' dari Dashboard Supabase -> Project Settings -> API.");
    process.exit(1);
  }

  if (!fs.existsSync(ordersFilePath)) {
    console.log(`ℹ️ File ${ordersFilePath} tidak ditemukan. Tidak ada data lokal untuk dimigrasikan.`);
    process.exit(0);
  }

  const rawJson = fs.readFileSync(ordersFilePath, "utf-8");
  let localOrders: Order[] = [];
  try {
    localOrders = JSON.parse(rawJson);
    if (!Array.isArray(localOrders)) {
      console.error("❌ Format JSON di orders-data.json tidak berupa array.");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Gagal membaca atau mem-parse orders-data.json:", err);
    process.exit(1);
  }

  console.log(`Ditemukan ${localOrders.length} pesanan di ${ordersFilePath}.`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Fetch existing order numbers from Supabase to prevent duplicates
  const { data: existingRows, error: fetchErr } = await supabase
    .from("orders")
    .select("order_number");

  if (fetchErr) {
    console.error("❌ Gagal memeriksa duplikasi di Supabase:", fetchErr.message);
    process.exit(1);
  }

  const existingOrderNumbers = new Set(
    (existingRows || []).map((r) => r.order_number).filter(Boolean)
  );

  console.log(`Terdapat ${existingOrderNumbers.size} pesanan yang sudah ada di database Supabase.`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const order of localOrders) {
    const orderNum = order.id;

    if (existingOrderNumbers.has(orderNum)) {
      console.log(`  [LEWATI] ${orderNum} sudah ada di database (mencegah duplikasi).`);
      skippedCount++;
      continue;
    }

    if (isDryRun) {
      console.log(
        `  [DRY-RUN] Akan memigrasikan: ${orderNum} | Pelanggan: ${order.customerName} | Total: Rp ${order.total} | Status: ${order.orderStatus}`
      );
      migratedCount++;
      continue;
    }

    // LIVE MIGRATE
    try {
      const orderUuid = crypto.randomUUID();
      const tokenHash = order.token ? hashOrderToken(order.token) : null;
      const isCash = order.paymentMethod === "Cash";
      const createdAt = order.createdAt || new Date().toISOString();

      // 1. Insert order
      const { error: insOrderErr } = await supabase.from("orders").insert({
        id: orderUuid,
        order_number: orderNum,
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
        throw new Error(`Gagal insert order: ${insOrderErr.message}`);
      }

      // 2. Insert token hash
      if (tokenHash) {
        const { error: insTokenErr } = await supabase
          .from("anonymous_order_tokens")
          .insert({
            id: crypto.randomUUID(),
            order_id: orderUuid,
            token_hash: tokenHash,
            created_at: createdAt,
          });

        if (insTokenErr) {
          console.warn(`    ⚠️ Gagal menyimpan token hash untuk ${orderNum}: ${insTokenErr.message}`);
        }
      }

      // 3. Insert initial payment record
      await supabase.from("payments").insert({
        id: crypto.randomUUID(),
        order_id: orderUuid,
        method: order.paymentMethod || "QRIS Statis",
        status: order.paymentStatus || (isCash ? "Menunggu Pembayaran" : "Menunggu Verifikasi"),
        created_at: createdAt,
        updated_at: createdAt,
      });

      console.log(`  ✅ Berhasil memigrasikan: ${orderNum}`);
      migratedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Gagal memigrasikan ${orderNum}:`, msg);
      errorCount++;
    }
  }

  console.log("\n==================================================================");
  console.log("RINGKASAN MIGRASI:");
  console.log(`- Total Pesanan di File: ${localOrders.length}`);
  console.log(`- Pesanan Dilewati (Duplikat): ${skippedCount}`);
  console.log(`- Pesanan ${isDryRun ? "Dapat Dimigrasikan" : "Berhasil Dimigrasikan"}: ${migratedCount}`);
  if (errorCount > 0) {
    console.log(`- Pesanan Gagal: ${errorCount}`);
  }
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Fatal error during migration:", err);
  process.exit(1);
});
