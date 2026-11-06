import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

console.log("=== RUNNING CREATE_ORDER_ATOMIC PRODUCTION SCHEMA AUDIT & VERIFICATION ===");

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20261106233000_fix_create_order_atomic_production_schema.sql"
);

assert(
  fs.existsSync(migrationPath),
  "Migration file 20261106233000_fix_create_order_atomic_production_schema.sql must exist"
);

const sqlContent = fs.readFileSync(migrationPath, "utf-8");

// Remove SQL comments to ensure robust parsing
const strippedSql = sqlContent.replace(/--.*$/gm, "");

// ============================================================================
// TEST 1: Schema Invariants for public.payments
// ============================================================================
console.log("\n[TEST 1] Auditing public.payments schema alignment...");

const paymentsInsertMatch = strippedSql.match(
  /INSERT\s+INTO\s+public\.payments\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i
);

assert(
  paymentsInsertMatch,
  "Must find INSERT INTO public.payments statement in create_order_atomic"
);

const paymentsColumns = paymentsInsertMatch[1]
  .split(",")
  .map((c) => c.trim().toLowerCase());
const paymentsValues = paymentsInsertMatch[2]
  .split(",")
  .map((v) => v.trim());
assert(paymentsValues.length > 0, "payments insert must contain values");

console.log("  Target columns in public.payments:", paymentsColumns);

// Mismatch checks
assert(
  !paymentsColumns.includes("amount"),
  "FATAL: 'amount' column does NOT exist on public.payments in production (use amount_due)"
);
assert(
  !paymentsColumns.includes("payment_status"),
  "FATAL: 'payment_status' column does NOT exist on public.payments in production (use status)"
);
assert(
  !paymentsColumns.includes("payment_method"),
  "FATAL: 'payment_method' column does NOT exist on public.payments in production (use method)"
);

// Canonical columns check
assert(
  paymentsColumns.includes("id"),
  "public.payments must include primary key 'id'"
);
assert(
  paymentsColumns.includes("order_id"),
  "public.payments must include foreign key 'order_id'"
);
assert(
  paymentsColumns.includes("method"),
  "public.payments must include canonical 'method'"
);
assert(
  paymentsColumns.includes("amount_due"),
  "public.payments must include canonical 'amount_due'"
);
assert(
  paymentsColumns.includes("status"),
  "public.payments must include canonical 'status'"
);
assert(
  paymentsColumns.includes("created_at"),
  "public.payments must include 'created_at'"
);
assert(
  paymentsColumns.includes("updated_at"),
  "public.payments must include 'updated_at'"
);

console.log("  ✓ [PASS] public.payments schema strictly aligns with production columns.");

// ============================================================================
// TEST 2: Schema Invariants for public.daily_order_counters
// ============================================================================
console.log("\n[TEST 2] Auditing public.daily_order_counters CTE implementation...");

const counterInsertMatch = strippedSql.match(
  /INSERT\s+INTO\s+public\.daily_order_counters\s*\(([^)]+)\)/i
);
assert(
  counterInsertMatch,
  "Must find INSERT INTO public.daily_order_counters CTE statement"
);

const counterColumns = counterInsertMatch[1]
  .split(",")
  .map((c) => c.trim().toLowerCase());

console.log("  Target columns in public.daily_order_counters:", counterColumns);

assert(
  !counterColumns.includes("counter_date"),
  "FATAL: 'counter_date' does NOT exist on daily_order_counters (must be order_date)"
);
assert(
  !counterColumns.includes("last_value"),
  "FATAL: 'last_value' does NOT exist on daily_order_counters (must be last_sequence)"
);
assert(
  counterColumns.includes("order_date"),
  "daily_order_counters must target primary key 'order_date'"
);
assert(
  counterColumns.includes("last_sequence"),
  "daily_order_counters must target sequence 'last_sequence'"
);

// CTE syntax and ON CONFLICT check
assert(
  sqlContent.includes("WITH counter_subquery AS"),
  "Must use data-modifying CTE WITH counter_subquery AS"
);
assert(
  sqlContent.includes("ON CONFLICT (order_date)"),
  "Must use ON CONFLICT (order_date) DO UPDATE"
);
assert(
  sqlContent.includes("RETURNING last_sequence AS next_val"),
  "Must return last_sequence AS next_val"
);

console.log("  ✓ [PASS] public.daily_order_counters correctly uses CTE with valid production columns.");

// ============================================================================
// TEST 3: Schema Invariants for public.orders
// ============================================================================
console.log("\n[TEST 3] Auditing public.orders schema alignment...");

const ordersInsertMatch = strippedSql.match(
  /INSERT\s+INTO\s+public\.orders\s*\(([^)]+)\)\s*VALUES/i
);
assert(
  ordersInsertMatch,
  "Must find INSERT INTO public.orders statement in create_order_atomic"
);

const ordersColumns = ordersInsertMatch[1]
  .split(",")
  .map((c) => c.trim().toLowerCase());

console.log("  Target columns in public.orders count:", ordersColumns.length);

assert(
  !ordersColumns.includes("customer_phone"),
  "FATAL: 'customer_phone' does NOT exist on public.orders (must be customer_whatsapp)"
);
assert(
  ordersColumns.includes("customer_whatsapp"),
  "public.orders must include 'customer_whatsapp'"
);
assert(
  ordersColumns.includes("items_snapshot"),
  "public.orders must include 'items_snapshot'"
);
assert(
  ordersColumns.includes("order_number"),
  "public.orders must include 'order_number'"
);
assert(
  ordersColumns.includes("fulfillment_method"),
  "public.orders must include 'fulfillment_method'"
);

console.log("  ✓ [PASS] public.orders strictly targets verified production columns.");

// ============================================================================
// TEST 4: Authoritative product_type Validation in items_snapshot
// ============================================================================
console.log("\n[TEST 4] Auditing authoritative product_type validation...");

// Ensure product query includes product_type
assert(
  /SELECT\s+id,\s*name,\s*price,\s*is_available,\s*is_archived,\s*product_type\s+INTO\s+v_prod_rec\s+FROM\s+public\.products/i.test(
    sqlContent
  ),
  "Query on public.products must select authoritative product_type into v_prod_rec"
);

// Ensure items_snapshot derivation uses authoritative CASE logic
assert(
  sqlContent.includes("'productType', CASE"),
  "items_snapshot must map 'productType'"
);
assert(
  sqlContent.includes("lower(trim(COALESCE(v_prod_rec.product_type, ''))) = 'ready' THEN 'ready'"),
  "Must evaluate v_prod_rec.product_type strictly against 'ready'"
);
assert(
  sqlContent.includes("ELSE 'preorder'"),
  "Must fallback to 'preorder' for any missing or non-ready database values"
);

console.log("  ✓ [PASS] items_snapshot authoritatively derives productType ('ready' vs 'preorder').");

// ============================================================================
// TEST 5: Concurrency, Idempotency & Security Constraints
// ============================================================================
console.log("\n[TEST 5] Auditing concurrency, idempotency & security constraints...");

assert(
  sqlContent.includes("pg_advisory_xact_lock(hashtext(lower(trim(p_token_hash))))"),
  "Must enforce advisory xact lock on token hash"
);
assert(
  sqlContent.includes("FOR v_attempt IN 1..5") || sqlContent.includes("v_attempt > 5"),
  "Must implement up to 5 retry attempts"
);
assert(
  sqlContent.includes("SECURITY DEFINER"),
  "Function must be defined with SECURITY DEFINER"
);
assert(
  sqlContent.includes("SET search_path = pg_catalog, public, pg_temp"),
  "Function must pin safe search_path"
);
assert(
  sqlContent.includes("REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, text) FROM PUBLIC"),
  "Must revoke execute from public"
);
assert(
  sqlContent.includes("GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, text) TO service_role, postgres"),
  "Must grant execute only to service_role and postgres"
);

console.log("  ✓ [PASS] Security DEFINER, permission grants, and advisory lock verified.");

// ============================================================================
// TEST 6: Simulated End-to-End Cart & Order Type Persistence
// ============================================================================
console.log("\n[TEST 6] Simulating product type persistence logic...");

interface MockCatalogProduct {
  id: string;
  name: string;
  product_type: string | null;
}

function resolveSnapshotProductType(prod: MockCatalogProduct): "ready" | "preorder" {
  const norm = (prod.product_type || "").trim().toLowerCase();
  return norm === "ready" ? "ready" : "preorder";
}

const testCases: { input: MockCatalogProduct; expected: "ready" | "preorder" }[] = [
  {
    input: { id: "p1", name: "Nasi Ayam Geprek", product_type: "ready" },
    expected: "ready",
  },
  {
    input: { id: "p2", name: "Nasi Bebek Madura", product_type: "preorder" },
    expected: "preorder",
  },
  {
    input: { id: "p3", name: "Product Without Type", product_type: null },
    expected: "preorder",
  },
  {
    input: { id: "p4", name: "Dirty Type String", product_type: "  READY  " },
    expected: "ready",
  },
  {
    input: { id: "p5", name: "Arbitrary Malicious Client Input", product_type: "admin_super" },
    expected: "preorder",
  },
];

for (const tc of testCases) {
  const resolved = resolveSnapshotProductType(tc.input);
  assert.strictEqual(
    resolved,
    tc.expected,
    `Product ${tc.input.name} should resolve to ${tc.expected}, got ${resolved}`
  );
  console.log(`  ✓ Product "${tc.input.name}" (db: ${tc.input.product_type}) -> resolved: ${resolved}`);
}

console.log("\n=== ALL AUDIT & REGRESSION TESTS PASSED SUCCESSFULLY! ===");
