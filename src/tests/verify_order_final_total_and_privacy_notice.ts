import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { getOrderFinalTotal, normalizeOrder } from "../lib/order-normalizer";

console.log("================================================================================");
console.log("TEST SUITE: Order Detail Final Total & Privacy Notice Removal Verification");
console.log("================================================================================\n");

// --- TEST 1: Subtotal Rp15.000 + Unique Code Rp241 = Rp15.241 ---
console.log("--- 1. Subtotal Rp15.000 + Gratis Ongkir + Kode Unik Rp241 ---");
const order1 = {
  subtotal: 15000,
  shippingFee: 0,
  uniqueCode: 241,
  total: 15000, // Database stored base total
};
const total1 = getOrderFinalTotal(order1);
assert.strictEqual(total1, 15241, "Total Akhir MUST be Rp15.241 when unique code is 241");
console.log(`  [PASS] Subtotal 15.000 + Ongkir 0 + Kode Unik 241 = ${total1}`);

// --- TEST 2: Authoritative rawAmount Stored by Payment Gateway ---
console.log("\n--- 2. Authoritative rawAmount from WaroengPay Invoice ---");
const orderWithRawAmount = {
  subtotal: 15000,
  shippingFee: 0,
  uniqueCode: 241,
  rawAmount: 15241,
  total: 15000,
};
const totalWithRaw = getOrderFinalTotal(orderWithRawAmount);
assert.strictEqual(totalWithRaw, 15241, "Total Akhir MUST use rawAmount (15241)");
console.log(`  [PASS] Stored rawAmount (15.241) used authoritatively`);

// --- TEST 3: No Double-Adding when Stored Total already includes Unique Code ---
console.log("\n--- 3. Prevent Double-Adding when Stored Total already includes Unique Code ---");
const orderAlreadyIncludes = {
  subtotal: 15000,
  shippingFee: 0,
  uniqueCode: 241,
  total: 15241, // Already includes unique code
};
const totalAlreadyIncludes = getOrderFinalTotal(orderAlreadyIncludes);
assert.strictEqual(
  totalAlreadyIncludes,
  15241,
  "Must NOT double-add unique code (15.241 must remain 15.241, not 15.482)"
);
console.log(`  [PASS] Stored total already includes unique code: strictly ${totalAlreadyIncludes}`);

// --- TEST 4: Zero Unique Code / Cash Payments ---
console.log("\n--- 4. Zero Unique Code & Cash Payments ---");
const cashOrder = {
  subtotal: 15000,
  shippingFee: 5000,
  total: 20000,
  paymentMethod: "Cash",
};
assert.strictEqual(getOrderFinalTotal(cashOrder), 20000);

const zeroCodeOrder = {
  subtotal: 15000,
  shippingFee: 0,
  uniqueCode: 0,
  total: 15000,
};
assert.strictEqual(getOrderFinalTotal(zeroCodeOrder), 15000);
console.log("  [PASS] Zero unique code & Cash payments retain exact base total (Rp15.000 & Rp20.000)");

// --- TEST 5: Paid vs Unpaid Orders Consistency ---
console.log("\n--- 5. Paid and Unpaid Orders Consistency ---");
const unpaidOrder = {
  subtotal: 25000,
  shippingFee: 0,
  uniqueCode: 312,
  paymentStatus: "Menunggu Pembayaran",
  total: 25000,
};
const paidOrder = {
  ...unpaidOrder,
  paymentStatus: "Lunas",
  orderStatus: "Diproses",
};
assert.strictEqual(getOrderFinalTotal(unpaidOrder), 25312);
assert.strictEqual(getOrderFinalTotal(paidOrder), 25312);
console.log("  [PASS] Both unpaid and paid orders compute consistent Rp25.312");

// --- TEST 6: Historical Orders with Missing Fields ---
console.log("\n--- 6. Historical Orders Normalization ---");
const legacyOrder = {
  id: "TJ-261025-001",
  subtotal: 30000,
  delivery_fee: 5000,
  total: 35000,
};
const normalizedLegacy = normalizeOrder(legacyOrder);
assert.strictEqual(normalizedLegacy.total, 35000);
assert.strictEqual(normalizedLegacy.shippingFee, 5000);
console.log("  [PASS] Legacy orders without unique code preserve original total (Rp35.000)");

// --- TEST 7: Privacy Notice Removal from Order Detail Page ---
console.log("\n--- 7. Privacy Notice Box Removal Verification ---");
const pagePath = path.join(process.cwd(), "src/app/pesanan/[token]/page.tsx");
const pageSource = fs.readFileSync(pagePath, "utf-8");

assert.ok(
  !pageSource.includes("Perhatian Privasi"),
  "Page MUST NOT contain 'Perhatian Privasi'"
);
assert.ok(
  pageSource.includes("Salin Tautan"),
  "Page MUST retain 'Salin Tautan' button"
);
assert.ok(
  pageSource.includes("Kirim Struk WA"),
  "Page MUST retain 'Kirim Struk WA' button"
);
assert.ok(
  pageSource.includes("formatRupiah(finalTotal)"),
  "Page MUST render finalTotal for Total Akhir"
);
assert.ok(
  pageSource.includes("finalTotal"),
  "WhatsApp share text MUST include finalTotal"
);
console.log("  [PASS] 'Perhatian Privasi' box completely removed while both action buttons are intact.");

console.log("\n================================================================================");
console.log("ALL TESTS PASSED! Final Total & Privacy Notice Removal Verified.");
console.log("================================================================================");

