import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

console.log("================================================================================");
console.log("TEST SUITE: Payment UX Refinements (Empty Cart Flash, Copy Removal, Success UI)");
console.log("================================================================================");

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    process.stdout.write(`--- ${name} --- \n`);
    fn();
    console.log(`✅ Passed: ${name}\n`);
    passed++;
  } catch (err) {
    console.error(`❌ Failed: ${name}`);
    console.error(err);
    console.log();
    failed++;
  }
}

const paymentPagePath = path.resolve(__dirname, "../app/pembayaran/[order]/page.tsx");
const checkoutClientPath = path.resolve(__dirname, "../components/checkout/CheckoutClient.tsx");
const globalsCssPath = path.resolve(__dirname, "../app/globals.css");

const paymentSource = fs.readFileSync(paymentPagePath, "utf-8");
const checkoutSource = fs.readFileSync(checkoutClientPath, "utf-8");
const cssSource = fs.readFileSync(globalsCssPath, "utf-8");

// -----------------------------------------------------------------------------
// Test 1: "Salin Nominal" button is removed
// -----------------------------------------------------------------------------
runTest("TEST 1: 'Salin Nominal' Button and Copy Functionality Removed", () => {
  assert.strictEqual(
    paymentSource.includes("Salin Nominal"),
    false,
    "Payment page must NOT contain 'Salin Nominal'"
  );
  assert.strictEqual(
    paymentSource.includes("handleCopyAmount"),
    false,
    "Payment page must NOT define or call 'handleCopyAmount'"
  );
  assert.strictEqual(
    paymentSource.includes("copiedAmount"),
    false,
    "Payment page must NOT declare 'copiedAmount' state"
  );
});

// -----------------------------------------------------------------------------
// Test 2: "Nook by Jina" heading above QRIS is removed
// -----------------------------------------------------------------------------
runTest("TEST 2: 'Nook by Jina' / Merchant Title Above QR Removed", () => {
  assert.strictEqual(
    paymentSource.includes("storeSettings?.qrisMerchantName || order.merchantName"),
    false,
    "QR card must NOT display merchantName above the QR image"
  );
  assert.strictEqual(
    paymentSource.includes('alt={`QRIS Pesanan ${order.id}`}'),
    true,
    "QR image must maintain clear accessibility alt attribute"
  );
});

// -----------------------------------------------------------------------------
// Test 3: Download QRIS and Share QRIS buttons preserved
// -----------------------------------------------------------------------------
runTest("TEST 3: Download and Share QRIS Buttons Maintained", () => {
  assert.strictEqual(
    paymentSource.includes("handleDownloadQr"),
    true,
    "Download QRIS function must be preserved"
  );
  assert.strictEqual(
    paymentSource.includes("Unduh QRIS"),
    true,
    "Download QRIS label must be present"
  );
  assert.strictEqual(
    paymentSource.includes("handleShareQr"),
    true,
    "Share QRIS function must be preserved"
  );
  assert.strictEqual(
    paymentSource.includes("Bagikan"),
    true,
    "Share QRIS label must be present"
  );
});

// -----------------------------------------------------------------------------
// Test 4: Payment Success Screen Layout and Copy
// -----------------------------------------------------------------------------
runTest("TEST 4: Payment Success Text and Button Structure", () => {
  assert.strictEqual(
    paymentSource.includes("Pembayaran Berhasil!"),
    true,
    "Success header must be 'Pembayaran Berhasil!'"
  );
  assert.strictEqual(
    paymentSource.includes("Pembayaran kamu sudah terverifikasi."),
    true,
    "Supporting text must be 'Pembayaran kamu sudah terverifikasi.'"
  );
  assert.strictEqual(
    paymentSource.includes("Lihat Detail Pesanan"),
    true,
    "Action button must say 'Lihat Detail Pesanan'"
  );
  assert.strictEqual(
    paymentSource.includes("animate-payment-success"),
    true,
    "Success checkmark must use scale-in animation class"
  );
});

// -----------------------------------------------------------------------------
// Test 5: Animation Not Replayed on Refresh (wasAlreadyPaidOnMount)
// -----------------------------------------------------------------------------
runTest("TEST 5: Animation Refresh Replay Prevention", () => {
  assert.strictEqual(
    paymentSource.includes("wasAlreadyPaidOnMount"),
    true,
    "wasAlreadyPaidOnMount ref must track initial payment status"
  );
  assert.strictEqual(
    paymentSource.includes("isFreshlyPaid"),
    true,
    "isFreshlyPaid state must trigger dynamic scale-in only on fresh transition"
  );
});

// -----------------------------------------------------------------------------
// Test 6: CSS Animation and prefers-reduced-motion
// -----------------------------------------------------------------------------
runTest("TEST 6: CSS Animation and Prefers-Reduced-Motion Support", () => {
  assert.strictEqual(
    cssSource.includes("@keyframes paymentSuccessScale"),
    true,
    "globals.css must define paymentSuccessScale keyframes"
  );
  assert.strictEqual(
    cssSource.includes(".animate-payment-success"),
    true,
    "globals.css must define .animate-payment-success class"
  );
  assert.strictEqual(
    cssSource.includes("prefers-reduced-motion"),
    true,
    "globals.css must respect prefers-reduced-motion"
  );
});

// -----------------------------------------------------------------------------
// Test 7: Empty Cart Flash Prevention in CheckoutClient
// -----------------------------------------------------------------------------
runTest("TEST 7: Empty Cart Flash Prevention in CheckoutClient", () => {
  assert.strictEqual(
    checkoutSource.includes("isNavigatingToPayment"),
    true,
    "CheckoutClient must track isNavigatingToPayment transition state"
  );
  assert.strictEqual(
    checkoutSource.includes("router.replace(targetUrl)"),
    true,
    "CheckoutClient must use router.replace to avoid exposing empty checkout route"
  );
  assert.strictEqual(
    checkoutSource.includes("Menyiapkan Halaman Pembayaran..."),
    true,
    "CheckoutClient must render seamless transition screen while navigating"
  );
});

console.log("================================================================================");
if (failed === 0) {
  console.log(`🎉 ALL ${passed} PAYMENT UX REFINEMENT TESTS PASSED (0 FAILURES)!`);
} else {
  console.error(`💥 ${failed} TESTS FAILED out of ${passed + failed}`);
  process.exit(1);
}
console.log("================================================================================");
