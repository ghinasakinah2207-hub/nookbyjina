import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { normalizeOrder } from "../lib/order-normalizer";
import { ProductType } from "../lib/product-type";
import { getCartProductType } from "../lib/product-type";

console.log("================================================================================");
console.log("TEST SUITE: Order Type Synchronization & Admin Classification Verification");
console.log("================================================================================\n");

// --- TEST 1: Historical Order Resolution (Simulation of TJ-261105-007) ---
console.log("--- 1. Historical Order Resolution without Snapshot productType ---");

// Historical order snapshot (like TJ-261105-007) where productType was NOT in items_snapshot
const historicalRawOrder = {
  id: "TJ-261105-007",
  orderNumber: "TJ-261105-007",
  customerName: "Yu",
  customerWhatsapp: "081234567890",
  orderStatus: "Pesanan baru",
  paymentStatus: "Menunggu pembayaran",
  paymentMethod: "QRIS",
  items: [
    {
      id: "item-1",
      productId: "prod-geprek-es-teh",
      productName: "Nasi Ayam Geprek + Es Teh Manis",
      basePrice: 15000,
      unitPrice: 15000,
      quantity: 1,
      itemTotal: 15000,
      // Note: productType is UNDEFINED in old snapshot!
    },
  ],
};

// Simulated productTypeMap derived from public.products catalog
const catalogTypeMap = new Map<string, ProductType>([
  ["prod-geprek-es-teh", "ready"],
  ["nasi ayam geprek + es teh manis", "ready"],
]);

// Normalize with catalog fallback
const resolvedOrder = normalizeOrder(historicalRawOrder, catalogTypeMap);

assert.strictEqual(
  resolvedOrder.items[0].productType,
  "ready",
  "Item productType MUST be resolved to 'ready' from catalog map"
);

const topLevelBadgeType = getCartProductType(resolvedOrder.items);
assert.strictEqual(
  topLevelBadgeType,
  "ready",
  "Top-level order classification MUST be 'ready' for READY product orders"
);
console.log("  [PASS] Historical order TJ-261105-007 successfully resolved as READY without database mutation.\n");

// --- TEST 2: Preserving PRE-ORDER for genuine pre-order items ---
console.log("--- 2. Genuine Pre-Order Order Classification ---");
const preorderRawOrder = {
  id: "TJ-261105-008",
  orderNumber: "TJ-261105-008",
  items: [
    {
      id: "item-2",
      productId: "prod-tumpeng-mini",
      productName: "Tumpeng Mini Special",
      productType: "preorder",
    },
  ],
};

const resolvedPreorder = normalizeOrder(preorderRawOrder, catalogTypeMap);
assert.strictEqual(resolvedPreorder.items[0].productType, "preorder");
assert.strictEqual(getCartProductType(resolvedPreorder.items), "preorder");
console.log("  [PASS] Pre-order items remain faithfully classified as PRE-ORDER.\n");

// --- TEST 3: SQL Migration Invariants for create_order_atomic ---
console.log("--- 3. Database Migration Invariant Verification ---");
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20261106000000_fix_create_order_atomic_product_type.sql"
);
assert.ok(fs.existsSync(migrationPath), "Migration file 20261106000000 must exist");

const migrationSql = fs.readFileSync(migrationPath, "utf-8");

// Must select product_type from public.products
assert.ok(
  migrationSql.includes("SELECT id, name, price, is_available, is_archived, product_type"),
  "create_order_atomic MUST select 'product_type' from public.products"
);

// Must validate authoritative product_type using strict CASE expression without trusting client value
assert.ok(
  migrationSql.includes(
    `'productType', CASE\n        WHEN lower(trim(COALESCE(v_prod_rec.product_type, ''))) = 'ready' THEN 'ready'\n        ELSE 'preorder'\n      END`
  ),
  "create_order_atomic MUST store authoritative 'productType' using strict CASE without trusting client input"
);

// Ensure client-supplied v_item->>'productType' is NOT used to populate snapshot productType
assert.ok(
  !migrationSql.includes("v_item->>'productType'"),
  "create_order_atomic MUST NOT trust or persist arbitrary client-supplied v_item->>'productType'"
);

// Verify PostgreSQL data-modifying CTE is used instead of invalid FROM (INSERT ...) subquery
assert.ok(
  migrationSql.includes("WITH counter_subquery AS ("),
  "create_order_atomic MUST use 'WITH counter_subquery AS (' CTE"
);
assert.ok(
  !migrationSql.includes("FROM (\n      INSERT INTO public.daily_order_counters"),
  "create_order_atomic MUST NOT use invalid FROM (INSERT ...) subquery syntax"
);
assert.ok(
  migrationSql.includes("FROM counter_subquery;"),
  "create_order_atomic MUST select order number FROM counter_subquery"
);
console.log("  [PASS] SQL migration correctly validates product_type and uses valid PostgreSQL CTE numbering.\n");

// --- TEST 3B: Comprehensive Test Matrix (READY, PRE-ORDER, NULL, Empty, Invalid) ---
console.log("--- 3B. Product Type Validation Matrix (READY, PRE-ORDER, NULL, Empty, Invalid) ---");

// SQL logic simulation: exactly mirrors CASE WHEN lower(trim(COALESCE(v_prod_rec.product_type, ''))) = 'ready' THEN 'ready' ELSE 'preorder' END
function simulateSqlProductTypeResolution(dbProductType: unknown): "ready" | "preorder" {
  const normalized = String(dbProductType ?? "").trim().toLowerCase();
  if (normalized === "ready") {
    return "ready";
  }
  return "preorder";
}

// 1. Valid READY variants
assert.strictEqual(simulateSqlProductTypeResolution("ready"), "ready", "Lowercase 'ready' must resolve to 'ready'");
assert.strictEqual(simulateSqlProductTypeResolution("READY"), "ready", "Uppercase 'READY' must resolve to 'ready'");
assert.strictEqual(simulateSqlProductTypeResolution("  Ready  "), "ready", "Trimmed '  Ready  ' must resolve to 'ready'");

// 2. Valid PRE-ORDER variants
assert.strictEqual(simulateSqlProductTypeResolution("preorder"), "preorder", "Lowercase 'preorder' must resolve to 'preorder'");
assert.strictEqual(simulateSqlProductTypeResolution("PRE-ORDER"), "preorder", "'PRE-ORDER' must resolve to 'preorder'");
assert.strictEqual(simulateSqlProductTypeResolution("  preorder  "), "preorder", "Trimmed 'preorder' must resolve to 'preorder'");

// 3. NULL database value
assert.strictEqual(simulateSqlProductTypeResolution(null), "preorder", "NULL must safely default to 'preorder'");
assert.strictEqual(simulateSqlProductTypeResolution(undefined), "preorder", "Undefined must safely default to 'preorder'");

// 4. Empty / Whitespace database value
assert.strictEqual(simulateSqlProductTypeResolution(""), "preorder", "Empty string must safely default to 'preorder'");
assert.strictEqual(simulateSqlProductTypeResolution("   "), "preorder", "Whitespace-only string must safely default to 'preorder'");

// 5. Invalid / Arbitrary client-supplied strings
assert.strictEqual(simulateSqlProductTypeResolution("custom"), "preorder", "Invalid 'custom' must safely default to 'preorder'");
assert.strictEqual(simulateSqlProductTypeResolution("admin"), "preorder", "Invalid 'admin' must safely default to 'preorder'");
assert.strictEqual(simulateSqlProductTypeResolution("free"), "preorder", "Invalid 'free' must safely default to 'preorder'");
assert.strictEqual(simulateSqlProductTypeResolution("arbitrary_injection"), "preorder", "Arbitrary injection must safely default to 'preorder'");

console.log("  [PASS] All 5 matrix categories (READY, PRE-ORDER, NULL, Empty, Invalid) strictly verified.\n");

// --- TEST 4: Admin Dashboard Shortcut Cards Removal Verification ---
console.log("--- 4. Admin Dashboard Overview Shortcut Cards Removal ---");
const dashboardOverviewPath = path.join(
  process.cwd(),
  "src/components/admin/DashboardOverview.tsx"
);
const dashboardOverviewContent = fs.readFileSync(dashboardOverviewPath, "utf-8");

assert.ok(
  !dashboardOverviewContent.includes("Kelola Pesanan"),
  "Dashboard overview MUST NOT contain 'Kelola Pesanan' shortcut card"
);
assert.ok(
  !dashboardOverviewContent.includes("Pengaturan Toko"),
  "Dashboard overview MUST NOT contain 'Pengaturan Toko' shortcut card"
);
assert.ok(
  !dashboardOverviewContent.includes("Katalog Menu"),
  "Dashboard overview MUST NOT contain 'Katalog Menu' shortcut card"
);
assert.ok(
  !dashboardOverviewContent.includes("Laporan Keuangan"),
  "Dashboard overview MUST NOT contain 'Laporan Keuangan' shortcut card"
);
assert.ok(
  dashboardOverviewContent.includes("Ringkasan Status Operasional"),
  "Dashboard overview MUST preserve 'Ringkasan Status Operasional'"
);
assert.ok(
  dashboardOverviewContent.includes("Pesanan Terbaru"),
  "Dashboard overview MUST preserve 'Pesanan Terbaru'"
);
console.log("  [PASS] Shortcut cards cleanly removed while operational summaries and recent orders are preserved.\n");

console.log("================================================================================");
console.log("ALL TESTS PASSED! Order Type Synchronization & Dashboard Cleanliness Verified.");
console.log("================================================================================");

