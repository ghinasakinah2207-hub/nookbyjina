import fs from "fs";
import path from "path";
import { extractNmidFromQris } from "../lib/qris-nmid";
import { STORE_SETTINGS } from "../data/dummy-data";

/**
 * Test Suite: QRIS Payment Page UI Refinement
 * Validates:
 * 1. Official QRIS logo presence and rendering directly above QR code.
 * 2. Scannable QR code container invariants.
 * 3. Actual WaroengPay NMID display in `NMID: [actual NMID]` format.
 * 4. Merchant identity notice below NMID with exact required text.
 * 5. Interactive "Lihat Detail" dropdown button on same row as payment amount with rotating chevron and aria-expanded.
 * 6. All six detail fields (No. tagihan, No. pesanan, Keterangan, Subtotal, Kode unik, Total).
 * 7. Authoritative total matches WaroengPay amount exactly.
 * 8. Responsive single-row layout on mobile.
 * 9. Download QRIS and Share QRIS retention.
 * 10. Success animation and expiration behavior invariants.
 * 11. EMVCo NMID parser correctness.
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
console.log("TEST SUITE: QRIS Payment Page UI Refinement & WaroengPay Display Invariants");
console.log("================================================================================");

const paymentPagePath = path.join(process.cwd(), "src/app/pembayaran/[order]/page.tsx");
const paymentPageCode = fs.readFileSync(paymentPagePath, "utf-8");

const qrisLogoPath = path.join(process.cwd(), "src/components/ui/QrisLogo.tsx");
const qrisLogoCode = fs.existsSync(qrisLogoPath) ? fs.readFileSync(qrisLogoPath, "utf-8") : "";

// --- TEST 1: QRIS Logo Component and Placement ---
console.log("\n--- TEST 1: QRIS Logo Component and Placement ---");
assert(fs.existsSync(qrisLogoPath), "QrisLogo.tsx component exists in src/components/ui/");
assert(qrisLogoCode.includes("QUICK RESPONSE CODE INDONESIAN STANDARD"), "QrisLogo contains official Indonesian standard subtitle");
assert(qrisLogoCode.includes("#ED1C24"), "QrisLogo contains official red chevron accent");
assert(paymentPageCode.includes("<QrisLogo"), "Payment page embeds <QrisLogo /> component");
// Verify QrisLogo is positioned before QR image in the JSX tree
const logoIndex = paymentPageCode.indexOf("<QrisLogo");
const qrImgIndex = paymentPageCode.indexOf("alt={`QRIS Pesanan ${order.id}`}");
assert(logoIndex !== -1 && qrImgIndex !== -1 && logoIndex < qrImgIndex, "QrisLogo is placed directly above the QR code container");

// --- TEST 2: WaroengPay NMID Extraction and Display ---
console.log("\n--- TEST 2: WaroengPay NMID Extraction and Display ---");
assert(paymentPageCode.includes("NMID: {actualNmid}"), "NMID is rendered in format `NMID: {actualNmid}`");
const nmidIndex = paymentPageCode.indexOf("NMID: {actualNmid}");
assert(qrImgIndex < nmidIndex, "NMID is displayed directly below the QR code image");

// Test EMVCo NMID extractor
const tag26Val = "0013ID.OR.GPN.WWW01189360001100000000000215ID10200388291010303UME";
const sampleLiveQris = `00020101021226${String(tag26Val.length).padStart(2, "0")}${tag26Val}5204581253033605405501375802ID5909WAROENGKU6007JAKARTA61051234062070703A0163041234`;
const extracted = extractNmidFromQris(sampleLiveQris);
assert(extracted === "ID1020038829101", `NMID correctly parsed from live EMVCo QRIS string: ${extracted}`);

// Test sandbox fallback
const sandboxExtracted = extractNmidFromQris("WAROENGPAY-TEST|WRG-123|50000");
assert(sandboxExtracted === null, "Sandbox test QR returns null to trigger verified store settings fallback");
assert(STORE_SETTINGS.qrisNmid === "ID1020038829101", "Verified merchant configuration source has actual NMID ID1020038829101");

// --- TEST 3: Merchant Identity Notice ---
console.log("\n--- TEST 3: Merchant Identity Notice ---");
assert(paymentPageCode.includes("Di aplikasi pembayaran akan tertulis:"), "Merchant notice preamble is present");
assert(paymentPageCode.includes("<strong>WAROENGKU</strong>"), "WAROENGKU is emphasized in bold font");
assert(paymentPageCode.includes("(penampung resmi resi payment Nook by Jina)"), "Clarifying aggregator note is present");
const noticeIndex = paymentPageCode.indexOf("WAROENGKU");
assert(nmidIndex < noticeIndex, "Merchant identity notice is placed directly below the NMID");

// --- TEST 4: 'Lihat Detail' Dropdown Beside Payment Amount ---
console.log("\n--- TEST 4: 'Lihat Detail' Dropdown Beside Payment Amount ---");
assert(paymentPageCode.includes("Lihat Detail"), "Button labeled 'Lihat Detail' exists");
assert(paymentPageCode.includes("aria-expanded={isDetailsOpen}"), "Dropdown button implements accessible aria-expanded attribute");
assert(paymentPageCode.includes("ChevronDown"), "Chevron icon is imported and used");
assert(paymentPageCode.includes("rotate-180"), "Chevron rotates 180 degrees when dropdown is expanded");
assert(
  paymentPageCode.includes("flex items-center justify-between gap-2"),
  "Payment amount and 'Lihat Detail' button are aligned on the same row (flex items-center justify-between)"
);

// --- TEST 5: All Six Order Detail Fields in Dropdown ---
console.log("\n--- TEST 5: All Six Order Detail Fields in Dropdown ---");
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

// --- TEST 6: Preservation of Existing Core Features ---
console.log("\n--- TEST 6: Preservation of Existing Core Features ---");
assert(paymentPageCode.includes("Unduh QRIS"), "Download QRIS button retained");
assert(paymentPageCode.includes("Bagikan"), "Share QRIS button retained");
assert(paymentPageCode.includes("handleDownloadQr"), "handleDownloadQr handler active");
assert(paymentPageCode.includes("handleShareQr"), "handleShareQr handler active");
assert(paymentPageCode.includes("animate-payment-success"), "Payment success checkmark animation retained");
assert(paymentPageCode.includes("wasAlreadyPaidOnMount"), "Refresh replay prevention retained");
assert(paymentPageCode.includes("Batas Waktu Pembayaran Habis"), "Expired state UI retained");
assert(paymentPageCode.includes("isInGracePeriod"), "5-minute grace period indicator retained");

console.log("\n================================================================================");
if (failed === 0) {
  console.log(`🎉 ALL ${passed} QRIS UI REFINEMENT VERIFICATIONS PASSED (0 FAILURES)!`);
} else {
  console.error(`💥 TEST SUITE FAILED WITH ${failed} ERRORS (${passed} passed).`);
  process.exit(1);
}
console.log("================================================================================");
