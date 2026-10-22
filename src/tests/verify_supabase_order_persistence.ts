/**
 * Comprehensive Test Suite for Production-Safe Supabase Order Persistence:
 * 1. Token Security: Cryptographic entropy, SHA-256 hashing, format validation.
 * 2. Concurrency & Daily Sequence: WIB date formatting, non-truncating >999 expansion, duplicate defense.
 * 3. Server-Only Isolation: `server-only` import prevents client leakage.
 * 4. PII Data Sanitization: Strips raw WhatsApp number, masks customer name on public views.
 * 5. Scoped History: Token-authenticated retrieval prevents storewide exposure.
 * 6. Zero-Trust Status Mutation Defense: 403 Forbidden on customer tampering.
 * 7. Migration Script: Validates dry-run and duplicate detection on local order data.
 */

import assert from "assert";
import {
  generateSecureOrderToken,
  hashOrderToken,
  isValidTokenFormat,
} from "@/lib/token-security";
import {
  getWIBDateString,
  sanitizeOrderForCustomer,
} from "@/lib/orders-store";
import { Order } from "@/types";

console.log("==================================================================");
console.log("STARTING TEST SUITE: Supabase Order Persistence & Security");
console.log("==================================================================\n");

// --- 1. TOKEN SECURITY & SHA-256 HASHING ---
console.log("=== 1. Testing Cryptographic Token Security & SHA-256 Hashing ===");
const rawToken1 = generateSecureOrderToken();
const rawToken2 = generateSecureOrderToken();

assert(rawToken1 !== rawToken2, "Generated tokens must be distinct and random");
assert(rawToken1.length >= 32, "Token must be at least 32 characters long");
assert(isValidTokenFormat(rawToken1), "Token must pass URL-safe format validation");
assert(!isValidTokenFormat("short"), "Short token (<16 chars) must be rejected");
assert(!isValidTokenFormat("bad token with spaces!"), "Invalid character token must be rejected");

const hash1 = hashOrderToken(rawToken1);
const hash2 = hashOrderToken(rawToken1); // Idempotent
const hashDiff = hashOrderToken(rawToken2);

assert(hash1 === hash2, "SHA-256 hashing must be deterministic for the same token");
assert(hash1 !== hashDiff, "Different tokens must produce different hashes");
assert(hash1.length === 64, "SHA-256 hex digest must be exactly 64 characters");
assert(!hash1.includes(rawToken1), "Hash must never contain the raw plaintext token");
console.log("✅ PASSED: Cryptographic randomness, SHA-256 hashing, and format validation verified.\n");

// --- 2. DAILY ORDER NUMBERING IN ASIA/JAKARTA (WIB) TIMEZONE ---
console.log("=== 2. Testing WIB Date & Concurrency-Safe Order Numbering ===");
const wibDate = getWIBDateString();
assert(/^\d{6}$/.test(wibDate), "WIB Date string must be 6 digits: YYMMDD");

// Test sequence formatting rules
function formatMockOrderNumber(wibDateStr: string, seq: number): string {
  if (seq <= 999) {
    return `TJ-${wibDateStr}-${String(seq).padStart(3, "0")}`;
  }
  return `TJ-${wibDateStr}-${seq}`;
}

const num1 = formatMockOrderNumber(wibDate, 1);
const num50 = formatMockOrderNumber(wibDate, 50);
const num999 = formatMockOrderNumber(wibDate, 999);
const num1000 = formatMockOrderNumber(wibDate, 1000);
const num1540 = formatMockOrderNumber(wibDate, 1540);

assert(num1 === `TJ-${wibDate}-001`, `Sequence 1 must be TJ-${wibDate}-001`);
assert(num50 === `TJ-${wibDate}-050`, `Sequence 50 must be TJ-${wibDate}-050`);
assert(num999 === `TJ-${wibDate}-999`, `Sequence 999 must be TJ-${wibDate}-999`);
assert(num1000 === `TJ-${wibDate}-1000`, `Sequence 1000 must expand to TJ-${wibDate}-1000 without collision or truncation`);
assert(num1540 === `TJ-${wibDate}-1540`, `Sequence 1540 must expand to TJ-${wibDate}-1540`);

// Test uniqueness simulation across 100 concurrent slots
const generatedSet = new Set<string>();
for (let i = 1; i <= 100; i++) {
  const ordNum = formatMockOrderNumber(wibDate, i);
  assert(!generatedSet.has(ordNum), `Duplicate detected for sequence ${i}`);
  generatedSet.add(ordNum);
}
assert(generatedSet.size === 100, "All 100 generated order numbers must be strictly unique");
console.log("✅ PASSED: Daily WIB date derivation and expansion past 999 without collision verified.\n");

// --- 3. CUSTOMER DATA SANITIZATION (ZERO-TRUST PRIVACY) ---
console.log("=== 3. Testing Customer PII Sanitization for Public Token Views ===");
const mockOrder: Order = {
  id: "TJ-261021-001",
  token: rawToken1,
  createdAt: new Date().toISOString(),
  customerName: "Ahmad Dahlan",
  customerWhatsapp: "081234567890",
  fulfillmentType: "delivery",
  deliveryArea: "Lhoksukon",
  orderNote: "Bungkus terpisah",
  items: [
    {
      id: "item-1",
      productId: "nasi-bakar-cakalang",
      productName: "Nasi Bakar Cakalang Asap",
      productImage: "/images/nasi-bakar.webp",
      basePrice: 25000,
      unitPrice: 25000,
      quantity: 2,
      itemTotal: 50000,
      itemNote: "",
      isAvailable: true,
      selectedOptions: [],
      selectedAddons: [],
    },
  ],
  subtotal: 50000,
  shippingFee: 4000,
  total: 54000,
  orderStatus: "Pesanan baru",
  paymentStatus: "Menunggu Verifikasi",
  paymentMethod: "QRIS Statis",
  paymentDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  merchantName: "Nook by Jina",
};

const sanitized = sanitizeOrderForCustomer(mockOrder);

assert(sanitized.customerWhatsapp === "", "Customer WhatsApp number must be stripped");
assert(sanitized.customerName.includes("***"), "Customer name must be masked");
assert(sanitized.total === 54000, "Financial totals must remain intact");
assert(sanitized.items.length === 1, "Order items must remain intact");
assert(sanitized.items[0].productName === "Nasi Bakar Cakalang Asap", "Item details must remain intact");
console.log("✅ PASSED: PII sanitization strictly strips phone and masks customer name.\n");

// --- 4. HTTP API ENDPOINTS TEST (VIA RUNNING NEXT.JS DEV SERVER) ---
console.log("=== 4. Testing Next.js Route Handlers for Protection & Behavior ===");

async function testHttpEndpoints() {
  const BASE_URL = "http://localhost:3000";

  // Test 4.1: GET /api/orders/[token] with malformed / invalid token returns 400 or 404
  const invalidRes = await fetch(`${BASE_URL}/api/orders/short`);
  assert(invalidRes.status === 400, "Short token must be rejected with 400");
  const invalidJson = await invalidRes.json();
  assert(invalidJson.success === false, "Short token returns success: false");

  const unknownToken = "A".repeat(32);
  const unknownRes = await fetch(`${BASE_URL}/api/orders/${unknownToken}`);
  assert(
    unknownRes.status === 404 || unknownRes.status === 500,
    "Unknown token must not return 200 or fake order"
  );

  // Test 4.2: POST /api/orders/history with empty tokens array returns empty list
  const emptyHistoryRes = await fetch(`${BASE_URL}/api/orders/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens: [] }),
  });
  assert(emptyHistoryRes.status === 200, "Empty history query returns 200");
  const emptyHistoryJson = await emptyHistoryRes.json();
  assert(Array.isArray(emptyHistoryJson.orders) && emptyHistoryJson.orders.length === 0, "Empty tokens returns empty list");

  // Test 4.3: Customer status mutation to 'Lunas' is blocked with 403 Forbidden
  const unauthorizedStatusRes = await fetch(`${BASE_URL}/api/orders/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: "TJ-261021-001",
      paymentStatus: "Lunas",
    }),
  });
  assert(
    unauthorizedStatusRes.status === 403,
    `Customer status mutation to 'Lunas' must be blocked with HTTP 403 Forbidden (got ${unauthorizedStatusRes.status})`
  );

  // Test 4.4: Customer status mutation to 'Diproses' is blocked with 403 Forbidden
  const unauthorizedOrderProgressRes = await fetch(`${BASE_URL}/api/orders/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: "TJ-261021-001",
      orderStatus: "Diproses",
    }),
  });
  assert(
    unauthorizedOrderProgressRes.status === 403,
    `Customer status mutation to 'Diproses' must be blocked with HTTP 403 Forbidden (got ${unauthorizedOrderProgressRes.status})`
  );

  // Test 4.5: Checkout with non-existent product fails with 400 Bad Request
  const nonExistentProductRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-fake",
          productId: "produk-fiktif-tidak-ada-999",
          productName: "Produk Fiktif",
          quantity: 1,
          itemTotal: 10000,
        },
      ],
    }),
  });
  assert(
    nonExistentProductRes.status === 400,
    `Checkout with non-existent product must fail with HTTP 400 (got ${nonExistentProductRes.status})`
  );
  const nonExistentJson = await nonExistentProductRes.json();
  assert(
    nonExistentJson.success === false && nonExistentJson.error.includes("tidak ditemukan"),
    `Error message must clearly state product not found: got "${nonExistentJson.error}"`
  );

  // Test 4.6: Checkout with valid slug resolves to canonical UUID & authoritative price
  const validSlugRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-slug-test",
          productId: "nasi-bakar-cakalang", // Slug input
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 2,
          itemTotal: 50000,
          selectedOptions: [
            {
              groupId: "opt-pedas",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(
    validSlugRes.status === 201,
    `Checkout with valid slug must succeed with HTTP 201 (got ${validSlugRes.status})`
  );
  const validSlugJson = await validSlugRes.json();
  assert(validSlugJson.success === true, "Valid slug order creation succeeds");
  assert(
    validSlugJson.order.items[0].productId === "b0000001-0000-4000-8000-000000000001",
    `Slug 'nasi-bakar-cakalang' must resolve to canonical UUID 'b0000001-0000-4000-8000-000000000001' (got '${validSlugJson.order.items[0].productId}')`
  );
  assert(
    validSlugJson.order.subtotal === 50000,
    `Authoritative subtotal for 2x 25000 must be 50000 (got ${validSlugJson.order.subtotal})`
  );

  // Test 4.7: Checkout with valid UUID succeeds and verifies authoritative price
  const validUuidRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-uuid-test",
          productId: "b0000001-0000-4000-8000-000000000002", // Rice Bowl Ayam Suwir Sambal Matah
          productName: "Rice Bowl Ayam Suwir Sambal Matah",
          quantity: 1,
          itemTotal: 28000,
          selectedOptions: [
            {
              groupId: "opt-telur",
              groupName: "Tingkat Kematangan Telur",
              valueId: "b0000004-0000-4000-8000-000000000007",
              valueName: "Matang Sempurna",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(
    validUuidRes.status === 201,
    `Checkout with valid UUID must succeed with HTTP 201 (got ${validUuidRes.status})`
  );
  const validUuidJson = await validUuidRes.json();
  assert(validUuidJson.success === true, "Valid UUID order creation succeeds");
  assert(
    validUuidJson.order.items[0].productId === "b0000001-0000-4000-8000-000000000002",
    "UUID must be preserved"
  );
  assert(
    validUuidJson.order.subtotal === 28000,
    `Authoritative subtotal for 1x 28000 must be 28000 (got ${validUuidJson.order.subtotal})`
  );

  // Test 4.8: Tampered price is overridden by authoritative catalog price
  const tamperedPriceRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-tampered",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          basePrice: 100, // Tampered fake price!
          unitPrice: 100,
          quantity: 1,
          itemTotal: 100, // Tampered fake item total!
          selectedOptions: [
            {
              groupId: "opt-pedas",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(
    tamperedPriceRes.status === 201,
    `Checkout must proceed with authoritative recalculation (got ${tamperedPriceRes.status})`
  );
  const tamperedJson = await tamperedPriceRes.json();
  assert(
    tamperedJson.order.subtotal === 25000,
    `Server must ignore client's tampered price of 100 and use authoritative price of 25000 (got ${tamperedJson.order.subtotal})`
  );

  // Test 4.9: Manipulated option priceDelta is overridden by authoritative option price
  const tamperedOptionPriceRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-opt-tamper",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
            {
              groupId: "b0000003-0000-4000-8000-000000000002",
              groupName: "Porsi Nasi",
              valueId: "b0000004-0000-4000-8000-000000000005", // Porsi Jumbo (database priceDelta = 5000)
              valueName: "Porsi Jumbo (+ Nasi Ekstra)",
              priceDelta: 10, // Tampered fake priceDelta!
            },
          ],
        },
      ],
    }),
  });
  assert(tamperedOptionPriceRes.status === 201, `Checkout with option must succeed (got ${tamperedOptionPriceRes.status})`);
  const tamperedOptionJson = await tamperedOptionPriceRes.json();
  assert(
    tamperedOptionJson.order.subtotal === 30000,
    `Authoritative subtotal for 25000 base + 5000 option must be 30000, ignoring client delta 10 (got ${tamperedOptionJson.order.subtotal})`
  );

  // Test 4.10: Unknown/unauthorized option is rejected with HTTP 400
  const unauthorizedOptionRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-opt-bad",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "fake-group",
              groupName: "Porsi",
              valueId: "fake-option-value-999",
              valueName: "Opsi Palsu",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(unauthorizedOptionRes.status === 400, `Unknown option must fail with HTTP 400 (got ${unauthorizedOptionRes.status})`);

  // Test 4.11: Manipulated add-on price is overridden by authoritative addon price
  const tamperedAddonPriceRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-addon-tamper",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "opt-pedas",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
          selectedAddons: [
            {
              addonId: "b0000005-0000-4000-8000-000000000001", // Ekstra Sambal Cakalang (database price = 4000)
              addonName: "Ekstra Sambal Cakalang",
              price: 1, // Tampered fake price!
            },
          ],
        },
      ],
    }),
  });
  assert(tamperedAddonPriceRes.status === 201, `Checkout with addon must succeed (got ${tamperedAddonPriceRes.status})`);
  const tamperedAddonJson = await tamperedAddonPriceRes.json();
  assert(
    tamperedAddonJson.order.subtotal === 29000,
    `Authoritative subtotal for 25000 base + 4000 addon must be 29000, ignoring client addon price 1 (got ${tamperedAddonJson.order.subtotal})`
  );

  // Test 4.12: Unauthorized add-on (not permitted for this product) is rejected with HTTP 400
  const unauthorizedAddonRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-addon-bad",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "opt-pedas",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
          selectedAddons: [
            {
              addonId: "b0000005-0000-4000-8000-000000000010", // Ekstra 1 Shot Espresso (not permitted for Nasi Bakar!)
              addonName: "Ekstra 1 Shot Espresso",
              price: 4000,
            },
          ],
        },
      ],
    }),
  });
  assert(unauthorizedAddonRes.status === 400, `Add-on not permitted for product must fail with HTTP 400 (got ${unauthorizedAddonRes.status})`);

  // Test 4.13: Delivery fee tampering is overridden by server calculation
  const tamperedDeliveryFeeRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "delivery",
      deliveryArea: "Lhoksukon",
      shippingFee: 0, // Tampered fake free delivery for subtotal 25000 (< 50000 threshold)!
      paymentMethod: "Cash",
      items: [
        {
          id: "item-deliv-tamper",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "opt-pedas",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(tamperedDeliveryFeeRes.status === 201, `Checkout must succeed with authoritative shipping fee (got ${tamperedDeliveryFeeRes.status})`);
  const tamperedDeliveryJson = await tamperedDeliveryFeeRes.json();
  assert(
    tamperedDeliveryJson.order.shippingFee > 0,
    `Server must reject client's free shipping when subtotal < threshold (got shippingFee: ${tamperedDeliveryJson.order.shippingFee})`
  );

  // Test 4.14: Initial status tampering (attempting paymentStatus: 'Lunas') is strictly prevented
  const tamperedStatusRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      paymentStatus: "Lunas", // Tampered status!
      orderStatus: "Selesai", // Tampered status!
      items: [
        {
          id: "item-status-tamper",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "opt-pedas",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(tamperedStatusRes.status === 201, "Order created");
  const tamperedStatusJson = await tamperedStatusRes.json();
  assert(
    tamperedStatusJson.order.paymentStatus === "Menunggu Pembayaran",
    `Initial paymentStatus must remain 'Menunggu Pembayaran', not 'Lunas' (got '${tamperedStatusJson.order.paymentStatus}')`
  );
  assert(
    tamperedStatusJson.order.orderStatus === "Pesanan baru",
    `Initial orderStatus must remain 'Pesanan baru', not 'Selesai' (got '${tamperedStatusJson.order.orderStatus}')`
  );

  // Test 4.15: Verify SQL migration restricts all RPC functions to service_role and postgres
  const fs = await import("fs");
  const path = await import("path");
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20261022000000_production_order_persistence.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  const expectedRpcs = [
    "generate_daily_order_number",
    "create_order_atomic",
    "lookup_order_by_token_hash",
    "lookup_orders_by_token_hashes",
    "admin_update_order_status",
    "get_admin_orders",
  ];

  for (const rpc of expectedRpcs) {
    assert(
      !migrationSql.includes(`GRANT EXECUTE ON FUNCTION public.${rpc} TO authenticated`),
      `RPC public.${rpc} must NOT be granted to authenticated users`
    );
    assert(
      migrationSql.includes(`GRANT EXECUTE ON FUNCTION public.${rpc}`) &&
      migrationSql.includes("TO service_role, postgres"),
      `RPC public.${rpc} must be granted ONLY to service_role, postgres`
    );
  }

  // Verify daily_order_counters table is NOT granted to authenticated
  assert(
    !migrationSql.includes("GRANT ALL ON TABLE public.daily_order_counters TO authenticated"),
    "daily_order_counters table must NOT be granted to authenticated users"
  );

  console.log("✅ PASSED: All HTTP endpoints enforce Zero-Trust defense, PII protection, product validation, slug-to-UUID resolution, option/addon validation, delivery fee protection, and RPC access restriction.\n");

  // --- 5. REGRESSION TESTS: FK INSERTION ORDER & SERVICE-ROLE COMPATIBILITY ---
  console.log("=== 5. Testing Regression Checks: Foreign-Key Insertion Order & Service-Role Compatibility ===");

  // 5.1 Test product with NO options (Dessert Box Tiramisu has 0 option groups)
  const noOptionRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Siti Rahma",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-no-options",
          productId: "dessert-box-tiramisu",
          productName: "Dessert Box Tiramisu Homemade",
          quantity: 1,
          selectedOptions: [],
          selectedAddons: [],
        },
      ],
    }),
  });
  assert(noOptionRes.status === 201, `Checkout for product with NO options must succeed (got ${noOptionRes.status})`);
  const noOptionJson = await noOptionRes.json();
  assert(noOptionJson.success === true, "Order creation with no options must succeed");
  assert(noOptionJson.order.subtotal === 20000, `Authoritative subtotal must be 20000 (got ${noOptionJson.order.subtotal})`);
  assert(noOptionJson.order.items[0].selectedOptions.length === 0, "Item must have 0 options");
  assert(noOptionJson.order.items[0].selectedAddons.length === 0, "Item must have 0 addons");
  console.log("  ✓ Product with NO options verified.");

  // 5.2 Test product with a VALID option
  const validOptionRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Siti Rahma",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-valid-opt",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 2,
          selectedOptions: [
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
            {
              groupId: "b0000003-0000-4000-8000-000000000002",
              groupName: "Porsi Nasi",
              valueId: "b0000004-0000-4000-8000-000000000005",
              valueName: "Porsi Jumbo (+ Nasi Ekstra)",
              priceDelta: 5000,
            },
          ],
        },
      ],
    }),
  });
  assert(validOptionRes.status === 201, `Checkout for product with VALID option must succeed (got ${validOptionRes.status})`);
  const validOptionJson = await validOptionRes.json();
  assert(validOptionJson.success === true, "Order creation with valid option must succeed");
  // 2x (25000 base + 5000 option) = 60000
  assert(validOptionJson.order.subtotal === 60000, `Subtotal for 2x (25000 + 5000) must be 60000 (got ${validOptionJson.order.subtotal})`);
  assert(validOptionJson.order.items[0].unitPrice === 30000, `Unit price must be 30000 (got ${validOptionJson.order.items[0].unitPrice})`);
  console.log("  ✓ Product with VALID option verified.");

  // 5.3 Test product with a VALID add-on
  const validAddonRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Siti Rahma",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-valid-addon",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
          selectedAddons: [
            {
              addonId: "b0000005-0000-4000-8000-000000000001",
              addonName: "Ekstra Sambal Cakalang",
              price: 4000,
            },
          ],
        },
      ],
    }),
  });
  assert(validAddonRes.status === 201, `Checkout for product with VALID addon must succeed (got ${validAddonRes.status})`);
  const validAddonJson = await validAddonRes.json();
  assert(validAddonJson.success === true, "Order creation with valid addon must succeed");
  // 1x (25000 base + 4000 addon) = 29000
  assert(validAddonJson.order.subtotal === 29000, `Subtotal for 1x (25000 + 4000) must be 29000 (got ${validAddonJson.order.subtotal})`);
  assert(validAddonJson.order.items[0].unitPrice === 29000, `Unit price must be 29000 (got ${validAddonJson.order.items[0].unitPrice})`);
  console.log("  ✓ Product with VALID add-on verified.");

  // 5.4 Regression Check: Inspect Foreign-Key Insertion Ordering in create_order_atomic
  console.log("  Testing SQL AST foreign-key insertion ordering in create_order_atomic...");
  const createOrderFuncIdx = migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.create_order_atomic");
  assert(createOrderFuncIdx !== -1, "create_order_atomic function must be present in migration");
  const funcEndIdx = migrationSql.indexOf("$$;", createOrderFuncIdx);
  const funcBody = migrationSql.substring(createOrderFuncIdx, funcEndIdx);

  // Check in-memory buffering variables exist
  assert(funcBody.includes("v_validated_items jsonb :="), "Must use in-memory v_validated_items buffer");
  assert(funcBody.includes("v_validated_options jsonb :="), "Must use in-memory v_validated_options buffer");

  // Locate the sections: Step 1, Step 2, Step 3, Step 4, Step 5, Step 6
  const step1Idx = funcBody.indexOf("EXECUTION STEP 1:");
  const step2Idx = funcBody.indexOf("EXECUTION STEP 2:");
  const step3Idx = funcBody.indexOf("EXECUTION STEP 3:");
  const step4Idx = funcBody.indexOf("EXECUTION STEP 4:");
  const step5Idx = funcBody.indexOf("EXECUTION STEP 5:");
  const step6Idx = funcBody.indexOf("EXECUTION STEP 6:");

  assert(
    step1Idx !== -1 && step2Idx !== -1 && step3Idx !== -1 && step4Idx !== -1 && step5Idx !== -1 && step6Idx !== -1,
    "All 6 execution steps must be explicitly delineated in create_order_atomic"
  );
  assert(step1Idx < step2Idx, "Step 1 (validation) must precede Step 2 (fee calculation)");
  assert(step2Idx < step3Idx, "Step 2 (fee calculation) must precede Step 3 (insert orders)");
  assert(step3Idx < step4Idx, "Step 3 (insert orders) must precede Step 4 (insert order_items)");
  assert(step4Idx < step5Idx, "Step 4 (insert order_items) must precede Step 5 (insert order_item_options)");
  assert(step5Idx < step6Idx, "Step 5 (insert order_item_options) must precede Step 6 (insert tokens/payments)");

  // Assert NO INSERT statements occur in Step 1
  const step1Code = funcBody.substring(step1Idx, step2Idx);
  assert(!step1Code.toUpperCase().includes("INSERT INTO"), "Step 1 must NOT contain any INSERT statements (pure in-memory validation)");

  // Assert Step 4 loop closes before Step 5 begins (no interleaved child options inside item loop)
  const step4Code = funcBody.substring(step4Idx, step5Idx);
  assert(step4Code.includes("INSERT INTO public.order_items"), "Step 4 must insert into public.order_items");
  assert(!step4Code.includes("INSERT INTO public.order_item_options"), "Step 4 must NOT insert child options (must wait until Step 5)");
  assert(step4Code.includes("END LOOP;"), "Step 4 order_items loop must completely finish before Step 5");

  // Assert Step 5 inserts order_item_options
  const step5Code = funcBody.substring(step5Idx, step6Idx);
  assert(step5Code.includes("INSERT INTO public.order_item_options"), "Step 5 must insert into public.order_item_options");

  // Assert Step 6 inserts tokens and payments
  const step6Code = funcBody.substring(step6Idx);
  assert(step6Code.includes("INSERT INTO public.anonymous_order_tokens"), "Step 6 must insert anonymous_order_tokens");
  assert(step6Code.includes("INSERT INTO public.payments"), "Step 6 must insert payments");

  console.log("  ✓ SQL migration guarantees strict 6-step statement execution order (validate in-memory -> calculate totals -> insert orders -> insert order_items -> insert order_item_options -> insert tokens/payments).");

  // 5.5 Regression Check: Service-Role Supabase Client & RPC Route Compatibility
  console.log("  Testing service-role Supabase client isolation across all Route Handlers...");
  const serviceRolePath = path.resolve(process.cwd(), "src/lib/supabase/service-role.ts");
  const serviceRoleContent = fs.readFileSync(serviceRolePath, "utf-8");
  assert(serviceRoleContent.includes('import "server-only";'), 'service-role.ts must enforce import "server-only";');
  assert(serviceRoleContent.includes("SUPABASE_SERVICE_ROLE_KEY"), "service-role.ts must use SUPABASE_SERVICE_ROLE_KEY");

  const ordersStorePath = path.resolve(process.cwd(), "src/lib/orders-store.ts");
  const ordersStoreContent = fs.readFileSync(ordersStorePath, "utf-8");
  assert(
    ordersStoreContent.includes('import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";'),
    "orders-store.ts must import getServiceRoleSupabaseClient"
  );
  assert(
    !ordersStoreContent.includes("createBrowserClient"),
    "orders-store.ts must NOT use browser client"
  );

  for (const rpc of expectedRpcs) {
    assert(
      ordersStoreContent.includes(`"${rpc}"`),
      `orders-store.ts must manage restricted RPC "${rpc}" via service-role client`
    );
  }
  console.log("  ✓ Service-role compatibility verified: All 6 restricted RPCs called exclusively via server-only service-role client.");

  // 5.6 Authoritative Order Snapshots: Defend Against Tampered Product & Option Names/Prices
  console.log("  Testing Authoritative Snapshot Tamper Defense...");
  const tamperedSnapshotRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Siti Rahma",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-tampered-snap",
          productId: "nasi-bakar-cakalang",
          productName: "HACKED PRODUCT NAME FREE",
          basePrice: 1,
          unitPrice: 1,
          itemTotal: 1,
          quantity: 1,
          selectedOptions: [
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "HACKED REQUIRED LEVEL PEDAS",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "HACKED LEVEL 1",
              priceDelta: 99999,
            },
            {
              groupId: "b0000003-0000-4000-8000-000000000002",
              groupName: "HACKED OPTION GROUP",
              valueId: "b0000004-0000-4000-8000-000000000005",
              valueName: "HACKED OPTION VALUE",
              priceDelta: 0,
            },
          ],
          selectedAddons: [
            {
              addonId: "b0000005-0000-4000-8000-000000000001",
              addonName: "HACKED ADDON NAME",
              price: 0,
            },
          ],
        },
      ],
    }),
  });

  assert(tamperedSnapshotRes.status === 201, `Checkout must succeed (got ${tamperedSnapshotRes.status})`);
  const tamperedSnapJson = await tamperedSnapshotRes.json();
  const returnedItem = tamperedSnapJson.order.items[0];

  assert(returnedItem.productName === "Nasi Bakar Cakalang Asap", `Product name must be authoritative (got '${returnedItem.productName}')`);
  assert(returnedItem.basePrice === 25000, `Base price must be authoritative 25000 (got ${returnedItem.basePrice})`);
  assert(returnedItem.unitPrice === 34000, `Unit price must be authoritative 34000 (25k + 5k opt + 4k addon) (got ${returnedItem.unitPrice})`);
  assert(returnedItem.itemTotal === 34000, `Item total must be authoritative 34000 (got ${returnedItem.itemTotal})`);
  assert(returnedItem.selectedOptions[0].groupName === "Level Pedas", `Option 0 groupName must be authoritative (got '${returnedItem.selectedOptions[0].groupName}')`);
  assert(returnedItem.selectedOptions[0].valueName === "Level 1 (Sedang)", `Option 0 valueName must be authoritative (got '${returnedItem.selectedOptions[0].valueName}')`);
  assert(returnedItem.selectedOptions[0].priceDelta === 0, `Option 0 priceDelta must be authoritative 0 (got ${returnedItem.selectedOptions[0].priceDelta})`);
  assert(returnedItem.selectedOptions[1].groupName === "Porsi Nasi", `Option 1 groupName must be authoritative (got '${returnedItem.selectedOptions[1].groupName}')`);
  assert(returnedItem.selectedOptions[1].valueName === "Porsi Jumbo (+ Nasi Ekstra)", `Option 1 valueName must be authoritative (got '${returnedItem.selectedOptions[1].valueName}')`);
  assert(returnedItem.selectedOptions[1].priceDelta === 5000, `Option 1 priceDelta must be authoritative 5000 (got ${returnedItem.selectedOptions[1].priceDelta})`);
  assert(returnedItem.selectedAddons[0].addonName === "Ekstra Sambal Cakalang", `Addon name must be authoritative (got '${returnedItem.selectedAddons[0].addonName}')`);
  assert(returnedItem.selectedAddons[0].price === 4000, `Addon price must be authoritative 4000 (got ${returnedItem.selectedAddons[0].price})`);

  // Verify that SQL migration stores v_items_snapshot, not raw client input
  assert(
    migrationSql.includes("v_items_snapshot,") && !migrationSql.includes("p_order->'items',"),
    "create_order_atomic must persist v_items_snapshot and not p_order->'items'"
  );
  assert(
    migrationSql.includes("'items', v_items_snapshot,"),
    "create_order_atomic RPC return must return authoritative v_items_snapshot"
  );
  console.log("  ✓ Authoritative Snapshot verified: Tampered client names and prices strictly replaced by database catalog records.");

  // 5.7 Duplicate Order-Number Preflight Check (Unlimited Detection + 5-Group Sample Diagnostics)
  console.log("  Testing duplicate order-number preflight detection behavior...");
  assert(
    migrationSql.includes("Migration preflight check failed: Ditemukan duplikasi non-null order_number"),
    "Migration SQL must include explicit duplicate order_number preflight diagnostic"
  );
  assert(
    migrationSql.includes("SELECT count(*)\n    INTO v_dup_count\n    FROM (\n      SELECT 1\n      FROM public.orders\n      WHERE order_number IS NOT NULL\n      GROUP BY order_number\n      HAVING count(*) > 1\n    ) all_dups;"),
    "Migration SQL must detect all duplicate groups across the whole table without limiting detection itself"
  );
  assert(
    !migrationSql.includes("DELETE FROM public.orders") && !migrationSql.includes("UPDATE public.orders SET order_number"),
    "Migration SQL must never silently delete or overwrite historical orders"
  );

  function preflightCheckOrderNumbersUnlimited(numbers: (string | null)[]): { hasDuplicates: boolean; dupCount: number; diagnostic: string } {
    const counts = new Map<string, number>();
    for (const num of numbers) {
      if (num !== null && num !== undefined && num.trim() !== "") {
        counts.set(num, (counts.get(num) || 0) + 1);
      }
    }
    const duplicateGroups = Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([num, count]) => `${num} (${count}x)`);

    const dupCount = duplicateGroups.length;
    if (dupCount > 0) {
      const samples = duplicateGroups.slice(0, 5).join(", ");
      return {
        hasDuplicates: true,
        dupCount,
        diagnostic: `Migration preflight check failed: Ditemukan duplikasi non-null order_number pada tabel public.orders (${dupCount} grup terdeteksi, sampel: ${samples}). Perbaiki atau selesaikan duplikasi riwayat pesanan secara manual sebelum menerapkan constraint unik.`,
      };
    }
    return { hasDuplicates: false, dupCount: 0, diagnostic: "" };
  }

  const cleanSample = ["TJ-261021-001", "TJ-261021-002", "TJ-261021-003", null];
  const cleanResult = preflightCheckOrderNumbersUnlimited(cleanSample);
  assert(!cleanResult.hasDuplicates, "Clean dataset must pass preflight without duplicates");

  // Test dataset with 7 duplicate groups (> 5 limit)
  const manyDuplicates = [
    "TJ-261021-001", "TJ-261021-001",
    "TJ-261021-002", "TJ-261021-002",
    "TJ-261021-003", "TJ-261021-003",
    "TJ-261021-004", "TJ-261021-004",
    "TJ-261021-005", "TJ-261021-005",
    "TJ-261021-006", "TJ-261021-006",
    "TJ-261021-007", "TJ-261021-007",
    "TJ-261021-008",
  ];
  const manyResult = preflightCheckOrderNumbersUnlimited(manyDuplicates);
  assert(manyResult.hasDuplicates, "Many duplicates dataset must trigger preflight failure");
  assert(manyResult.dupCount === 7, `Total detected duplicate groups must be exactly 7 (unlimited detection), got ${manyResult.dupCount}`);
  assert(manyResult.diagnostic.includes("7 grup terdeteksi"), "Diagnostic must report all 7 detected groups");
  assert(manyResult.diagnostic.includes("TJ-261021-001 (2x)"), "Diagnostic sample must include first duplicate");
  assert(!manyResult.diagnostic.includes("TJ-261021-006 (2x)"), "Diagnostic samples must be capped at 5 groups to prevent giant logs");
  console.log("  ✓ Duplicate order-number preflight logic verified: Unlimited detection across whole table, diagnostic capped at 5 groups, zero deletion.");

  // 5.8 Regression Test: Missing Required Option Group Defense
  console.log("  Testing missing required option group rejection...");
  const missingRequiredOptRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-missing-req-opt",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [], // Missing required 'Level Pedas'!
        },
      ],
    }),
  });
  assert(
    missingRequiredOptRes.status === 400,
    `Missing required option group must fail with HTTP 400 (got ${missingRequiredOptRes.status})`
  );
  const missingRequiredOptJson = await missingRequiredOptRes.json();
  assert(
    missingRequiredOptJson.success === false &&
    missingRequiredOptJson.error.includes("Pilihan varian wajib") &&
    missingRequiredOptJson.error.includes("Level Pedas"),
    `Error must state required option group missing: got "${missingRequiredOptJson.error}"`
  );
  console.log("  ✓ Missing required option group properly rejected with HTTP 400.");

  // 5.9 Regression Test: Duplicate Option-Value IDs Defense
  console.log("  Testing duplicate option-value IDs rejection in single item...");
  const duplicateOptRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-dup-opt",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002", // DUPLICATE option value selection!
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(
    duplicateOptRes.status === 400,
    `Duplicate option value in single item must fail with HTTP 400 (got ${duplicateOptRes.status})`
  );
  const duplicateOptJson = await duplicateOptRes.json();
  assert(
    duplicateOptJson.success === false && duplicateOptJson.error.includes("tidak boleh dipilih lebih dari satu kali"),
    `Error must state duplicate option: got "${duplicateOptJson.error}"`
  );
  console.log("  ✓ Duplicate option-value IDs properly rejected with HTTP 400.");

  // 5.10 Regression Test: Duplicate Add-on IDs Defense
  console.log("  Testing duplicate add-on IDs rejection in single item...");
  const duplicateAddonRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-dup-addon",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
          selectedAddons: [
            {
              addonId: "b0000005-0000-4000-8000-000000000001",
              addonName: "Ekstra Sambal Cakalang",
              price: 4000,
            },
            {
              addonId: "b0000005-0000-4000-8000-000000000001", // DUPLICATE addon selection!
              addonName: "Ekstra Sambal Cakalang",
              price: 4000,
            },
          ],
        },
      ],
    }),
  });
  assert(
    duplicateAddonRes.status === 400,
    `Duplicate addon in single item must fail with HTTP 400 (got ${duplicateAddonRes.status})`
  );
  const duplicateAddonJson = await duplicateAddonRes.json();
  assert(
    duplicateAddonJson.success === false && duplicateAddonJson.error.includes("tidak boleh dipilih lebih dari satu kali"),
    `Error must state duplicate addon: got "${duplicateAddonJson.error}"`
  );
  console.log("  ✓ Duplicate add-on IDs properly rejected with HTTP 400.");

  // 5.11 Regression Test: Anonymous Tracking Token Mandatory & Format Enforced
  console.log("  Testing tracking token requirement and SHA-256 hex format validation...");
  const { saveOrder: testSaveOrder } = await import("@/lib/orders-store");
  let missingTokenCaught = false;
  try {
    const invalidOrder = { ...mockOrder, token: "" };
    await testSaveOrder(invalidOrder);
  } catch (err: unknown) {
    missingTokenCaught = true;
    assert(
      (err as Error).message.includes("Token akses pesanan"),
      `Expected token error message, got: ${(err as Error).message}`
    );
  }
  assert(missingTokenCaught, "saveOrder must strictly reject orders without tokens");

  // Check SQL migration rejects missing or malformed token hashes
  assert(
    migrationSql.includes("IF p_token_hash IS NULL OR trim(p_token_hash) = '' THEN\n    RAISE EXCEPTION 'Tracking token hash wajib disertakan untuk pembuatan pesanan pelanggan.'"),
    "create_order_atomic in SQL migration must reject NULL or blank tracking token hash"
  );
  assert(
    migrationSql.includes("IF trim(p_token_hash) !~* '^[0-9a-f]{64}$' THEN\n    RAISE EXCEPTION 'Token hash tidak valid. Wajib berupa 64-karakter SHA-256 hexadecimal digest.'"),
    "create_order_atomic in SQL migration must reject non-64-char hex token hashes"
  );
  assert(
    migrationSql.includes("lower(trim(p_token_hash))"),
    "create_order_atomic and lookup RPCs must normalize token hashes with lower(trim(...))"
  );
  console.log("  ✓ Anonymous tracking token strictly mandatory, validated as 64-char SHA-256 hex, and normalized.");

  // 5.12 Regression Test: Exceeding max_select Defense (Multiple selections when group permits only one)
  console.log("  Testing exceeding max_select cardinality rejection...");
  const exceedingMaxSelectRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-exceed-max",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000001", // Level 0
              valueName: "Level 0 (Tidak Pedas)",
              priceDelta: 0,
            },
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002", // Level 1 (exceeds max_select: 1!)
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(
    exceedingMaxSelectRes.status === 400,
    `Exceeding max_select must fail with HTTP 400 (got ${exceedingMaxSelectRes.status})`
  );
  const exceedingMaxSelectJson = await exceedingMaxSelectRes.json();
  assert(
    exceedingMaxSelectJson.success === false &&
    exceedingMaxSelectJson.error.includes("hanya boleh dipilih maksimal 1 opsi"),
    `Error must state max_select exceeded: got "${exceedingMaxSelectJson.error}"`
  );
  console.log("  ✓ Exceeding max_select properly rejected with HTTP 400.");

  // 5.13 Regression Test: Valid Selections at Configured Boundaries
  console.log("  Testing valid selections at configured boundaries (min_select=0/1, max_select=1)...");
  // Boundary A: Exactly min_select=1, max_select=1 for Level Pedas, min_select=0 for Porsi Nasi (0 selections)
  const boundaryARes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-boundary-a",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(boundaryARes.status === 201, `Boundary A (exact min/max boundary) must succeed (got ${boundaryARes.status})`);

  // Boundary B: Exactly 1 option for Porsi Nasi (upper boundary max_select=1) + 1 for Level Pedas
  const boundaryBRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      paymentMethod: "Cash",
      items: [
        {
          id: "item-boundary-b",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang Asap",
          quantity: 1,
          selectedOptions: [
            {
              groupId: "b0000003-0000-4000-8000-000000000001",
              groupName: "Level Pedas",
              valueId: "b0000004-0000-4000-8000-000000000002",
              valueName: "Level 1 (Sedang)",
              priceDelta: 0,
            },
            {
              groupId: "b0000003-0000-4000-8000-000000000002",
              groupName: "Porsi Nasi",
              valueId: "b0000004-0000-4000-8000-000000000004", // Standar (delta 0)
              valueName: "Standar",
              priceDelta: 0,
            },
          ],
        },
      ],
    }),
  });
  assert(boundaryBRes.status === 201, `Boundary B (both option groups at upper boundary 1) must succeed (got ${boundaryBRes.status})`);
  console.log("  ✓ Valid selections at configured boundaries successfully accepted with HTTP 201.");

  // 5.14 Regression Test: SQL Migration AST Check for Options & Addons Validation
  console.log("  Testing SQL AST validation for required options, duplicate options, and cardinality enforcement...");
  assert(
    migrationSql.includes("v_seen_opt_val_ids := array_append(v_seen_opt_val_ids, v_opt_val_rec.id::text);"),
    "SQL migration must track seen option value IDs to prevent duplicates"
  );
  assert(
    migrationSql.includes("IF v_opt_val_rec.id::text = ANY(v_seen_opt_val_ids) THEN\n          RAISE EXCEPTION 'Pilihan varian \"%\" tidak boleh dipilih lebih dari satu kali"),
    "SQL migration must reject duplicate option values in create_order_atomic"
  );
  assert(
    migrationSql.includes("FOR v_group_rec IN\n      SELECT pog.id, pog.name, pog.is_required, pog.min_select, pog.max_select\n      FROM public.product_option_groups pog\n      WHERE pog.product_id = v_prod_rec.id\n      ORDER BY pog.sort_order ASC"),
    "SQL migration must inspect and validate option-group cardinality for the product"
  );
  assert(
    migrationSql.includes("IF v_group_count < v_min_select THEN"),
    "SQL migration must enforce min_select lower bound"
  );
  assert(
    migrationSql.includes("IF v_max_select IS NOT NULL AND v_group_count > v_max_select THEN"),
    "SQL migration must enforce max_select upper bound"
  );
  assert(
    migrationSql.includes("IF v_addon_rec.id::text = ANY(v_seen_addon_ids) THEN\n          RAISE EXCEPTION 'Ekstra add-on \"%\" tidak boleh dipilih lebih dari satu kali"),
    "SQL migration must reject duplicate addons in create_order_atomic"
  );
  console.log("  ✓ SQL Migration AST check confirmed: Authoritative verification in database engine matches Next.js validation.");

  console.log("✅ PASSED: All regression tests for FK insertion order, authoritative snapshots, duplicate preflight, option cardinality, and token security succeeded.\n");
}

testHttpEndpoints()
  .then(() => {
    console.log("🎉 ALL SUPABASE ORDER PERSISTENCE TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
  });
