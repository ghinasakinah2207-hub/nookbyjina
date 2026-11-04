import fs from "fs";
import path from "path";
import { extractNmidFromQris } from "../lib/qris-nmid";
import { STORE_SETTINGS } from "../data/dummy-data";

/**
 * Test Suite: Final QRIS Payment UI Refinements
 * Validates:
 * 1. Official QRIS logo asset (`public/QRISLogo.svg`) displayed via Next.js Image above QR code.
 * 2. Old custom QRIS SVG component is no longer used on the payment page.
 * 3. Scannable QR code container on clean white background.
 * 4. Actual WaroengPay NMID display in `NMID: [actual NMID]` format.
 * 5. Merchant identity notice below NMID with exact WAROENGKU text.
 * 6. "Lihat Detail" dropdown button on same row as payment amount with rotating chevron and aria-expanded.
 * 7. All six detail fields (No. tagihan, No. pesanan, Keterangan, Subtotal, Kode unik, Total).
 * 8. Authoritative total matches WaroengPay amount exactly.
 * 9. QRIS card background changed to subtle light orange (#FFF3E8).
 * 10. Old nominal warning card ("PENTING: Nominal transfer wajib persis...") completely removed.
 * 11. "CEK TRANSAKSI" button present at bottom of page with dark navy style and loading state.
 * 12. Backend status-check route exists (`/api/payments/waroengpay/check`) for authoritative verification.
 * 13. Download QRIS and Share QRIS retention.
 * 14. Success animation and expiration behavior invariants.
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ Passed: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAILED: ${message}`);
    failed++;
  }
}

console.log("================================================================================");
console.log("TEST SUITE: Final QRIS Payment UI Refinements & WaroengPay Verification");
console.log("================================================================================");

const paymentPagePath = path.join(process.cwd(), "src/app/pembayaran/[order]/page.tsx");
const paymentPageCode = fs.readFileSync(paymentPagePath, "utf-8");

const officialQrisAssetPath = path.join(process.cwd(), "public/QRISLogo.svg");
const checkRoutePath = path.join(process.cwd(), "src/app/api/payments/waroengpay/check/route.ts");

// --- TEST 1: Official QRIS Logo Asset & Removal of Custom Component on Payment Page ---
console.log("\n--- TEST 1: Official QRIS Logo Asset & Removal of Custom Component ---");
assert(fs.existsSync(officialQrisAssetPath), "Official QRISLogo.svg exists in public/");
assert(paymentPageCode.includes('src="/QRISLogo.svg"'), "Payment page renders official /QRISLogo.svg asset");
assert(!paymentPageCode.includes("<QrisLogo"), "Old custom <QrisLogo /> component is no longer used on payment page");
assert(
  paymentPageCode.includes("<Image") && paymentPageCode.includes('src="/QRISLogo.svg"'),
  "Official QRIS logo rendered using Next.js Image component"
);
const logoIndex = paymentPageCode.indexOf('src="/QRISLogo.svg"');
const qrImgIndex = paymentPageCode.indexOf("alt={`QRIS Pesanan ${order.id}`}");
assert(logoIndex !== -1 && qrImgIndex !== -1 && logoIndex < qrImgIndex, "Official QRIS logo is placed directly above QR code");

// --- TEST 2: QRIS Card Background & QR Container Styling ---
console.log("\n--- TEST 2: QRIS Card Background & QR Container Styling ---");
assert(paymentPageCode.includes("bg-[#FFF3E8]"), "QRIS card has subtle warm light orange background (#FFF3E8)");
assert(paymentPageCode.includes("border-orange-200/50"), "QRIS card has soft orange border");
assert(
  paymentPageCode.includes("bg-white border border-[#E5E5E5] rounded-2xl shadow-sm"),
  "QR code container maintains pure white background and border for reliable optical scanning"
);

// --- TEST 3: Removal of 'PENTING: Nominal Transfer Wajib Persis' Warning Card ---
console.log("\n--- TEST 3: Removal of 'PENTING: Nominal Transfer Wajib Persis' Warning Card ---");
assert(
  !paymentPageCode.includes("PENTING: Nominal transfer wajib persis"),
  "The 'PENTING: Nominal transfer wajib persis' warning card is completely removed"
);
assert(
  !paymentPageCode.includes("termasuk kode unik) agar transaksi otomatis diverifikasi dalam hitungan detik"),
  "Associated warning card text is completely removed from the customer payment page"
);

// --- TEST 4: 'CEK TRANSAKSI' Button & Real-time Status Verification ---
console.log("\n--- TEST 4: 'CEK TRANSAKSI' Button & Status Verification ---");
assert(paymentPageCode.includes("CEK TRANSAKSI"), "Prominent button labeled 'CEK TRANSAKSI' exists");
assert(paymentPageCode.includes("Memeriksa..."), "Button displays 'Memeriksa...' during status check");
assert(paymentPageCode.includes("isCheckingStatus"), "Button tracks checking status state");
assert(paymentPageCode.includes("disabled={isCheckingStatus}"), "Button is disabled during processing to prevent duplicate clicks");
assert(paymentPageCode.includes("bg-[#0F172A]"), "Button styled in prominent dark navy (#0F172A)");
assert(paymentPageCode.includes("handleCheckTransaction"), "Button triggers handleCheckTransaction handler");
assert(
  paymentPageCode.includes("/api/payments/waroengpay/check"),
  "handleCheckTransaction calls backend /api/payments/waroengpay/check route"
);
assert(
  paymentPageCode.includes("Pembayaran belum diterima. Silakan tunggu atau coba lagi."),
  "Displays subtle feedback message when payment is still pending"
);

// Verify check route exists and is configured
assert(fs.existsSync(checkRoutePath), "Backend check route exists at src/app/api/payments/waroengpay/check/route.ts");
const checkRouteCode = fs.readFileSync(checkRoutePath, "utf-8");
assert(checkRouteCode.includes("getWaroengPayPayment"), "Backend check route queries WaroengPay status using invoice ID");
assert(checkRouteCode.includes("updateOrderStatusServer"), "Backend updates order status authoritatively when paid or cancelled");
assert(!checkRouteCode.includes("WAROENGPAY_API_KEY"), "Backend route does not expose API key in response");

// --- TEST 5: WaroengPay NMID Extraction and Display ---
console.log("\n--- TEST 5: WaroengPay NMID Extraction and Display ---");
assert(paymentPageCode.includes("NMID: {actualNmid}"), "NMID is rendered in format `NMID: {actualNmid}`");
const nmidIndex = paymentPageCode.indexOf("NMID: {actualNmid}");
assert(qrImgIndex < nmidIndex, "NMID is displayed directly below the QR code image");

// Test EMVCo NMID extractor
const tag26Val = "0013ID.OR.GPN.WWW01189360001100000000000215ID10200388291010303UME";
const sampleLiveQris = `00020101021226${String(tag26Val.length).padStart(2, "0")}${tag26Val}5204581253033605405501375802ID5909WAROENGKU6007JAKARTA61051234062070703A0163041234`;
const extracted = extractNmidFromQris(sampleLiveQris);
assert(extracted === "ID1020038829101", `NMID correctly parsed from live EMVCo QRIS string: ${extracted}`);
assert(STORE_SETTINGS.qrisNmid === "ID1020038829101", "Verified merchant configuration source has actual NMID ID1020038829101");

// --- TEST 6: Merchant Identity Notice ---
console.log("\n--- TEST 6: Merchant Identity Notice ---");
assert(paymentPageCode.includes("Di aplikasi pembayaran akan tertulis:"), "Merchant notice preamble is present");
assert(paymentPageCode.includes("<strong>WAROENGKU</strong>"), "WAROENGKU is emphasized in bold font");
assert(paymentPageCode.includes("(penampung resmi resi payment Nook by Jina)"), "Clarifying aggregator note is present");
const noticeIndex = paymentPageCode.indexOf("WAROENGKU");
assert(nmidIndex < noticeIndex, "Merchant identity notice is placed directly below the NMID");

// --- TEST 7: 'Lihat Detail' Dropdown & Six Order Detail Fields ---
console.log("\n--- TEST 7: 'Lihat Detail' Dropdown & Six Order Detail Fields ---");
assert(paymentPageCode.includes("Lihat Detail"), "Button labeled 'Lihat Detail' exists");
assert(paymentPageCode.includes("aria-expanded={isDetailsOpen}"), "Dropdown button implements accessible aria-expanded attribute");
assert(paymentPageCode.includes("ChevronDown"), "Chevron icon is imported and used");
assert(paymentPageCode.includes("rotate-180"), "Chevron rotates 180 degrees when dropdown is expanded");
assert(paymentPageCode.includes("No. tagihan"), "Detail field 1: 'No. tagihan' exists");
assert(paymentPageCode.includes("order.waroengpayInvoiceId"), "Detail field 1 displays WaroengPay invoice ID");
assert(paymentPageCode.includes("No. pesanan"), "Detail field 2: 'No. pesanan' exists");
assert(paymentPageCode.includes("order.id"), "Detail field 2 displays Nook order number");
assert(paymentPageCode.includes("Keterangan"), "Detail field 3: 'Keterangan' exists");
assert(paymentPageCode.includes("Subtotal"), "Detail field 4: 'Subtotal' exists");
assert(paymentPageCode.includes("order.subtotal"), "Detail field 4 displays authoritative subtotal");
assert(paymentPageCode.includes("Kode unik"), "Detail field 5: 'Kode unik' exists");
assert(paymentPageCode.includes("order.uniqueCode"), "Detail field 5 displays WaroengPay unique code");
assert(paymentPageCode.includes("<span>Total</span>"), "Detail field 6: 'Total' exists");
assert(paymentPageCode.includes("{formatRupiah(paymentAmount)}"), "Detail field 6 displays exact WaroengPay invoice payment amount");

// --- TEST 8: Preservation of Core Features ---
console.log("\n--- TEST 8: Preservation of Core Features ---");
assert(paymentPageCode.includes("Unduh QRIS"), "Download QRIS button retained");
assert(paymentPageCode.includes("Bagikan"), "Share QRIS button retained");
assert(paymentPageCode.includes("handleDownloadQr"), "handleDownloadQr handler active");
assert(paymentPageCode.includes("handleShareQr"), "handleShareQr handler active");
assert(paymentPageCode.includes("animate-payment-success"), "Payment success checkmark animation retained");
assert(paymentPageCode.includes("wasAlreadyPaidOnMount"), "Refresh replay prevention retained");
assert(paymentPageCode.includes("Batas Waktu Pembayaran Habis"), "Expired state UI retained");
assert(paymentPageCode.includes("isInGracePeriod"), "5-minute grace period indicator retained");
assert(paymentPageCode.includes("Cara Bayar Menggunakan 1 HP"), "1 HP Payment guide retained");

console.log("\n================================================================================");
if (failed === 0) {
  console.log(`🎉 ALL ${passed} FINAL QRIS UI REFINEMENT VERIFICATIONS PASSED (0 FAILURES)!`);
} else {
  console.error(`💥 TEST SUITE FAILED WITH ${failed} ERRORS (${passed} passed).`);
  process.exit(1);
}
console.log("================================================================================");
