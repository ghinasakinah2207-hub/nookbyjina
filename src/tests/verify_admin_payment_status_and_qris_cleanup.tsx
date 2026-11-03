import assert from "assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "../components/ui/Badge";
import fs from "fs";
import path from "path";

console.log("================================================================================");
console.log("TEST SUITE: Admin Payment Status Presentation & QRIS Verification Cleanup");
console.log("================================================================================\n");

// 1. StatusBadge: Unpaid QRIS Duitku / Cash -> "Menunggu bayar"
console.log("--- TEST 1: Unpaid Order Payment Status Badge -> 'Menunggu bayar' ---");
const unpaidQrisHtml = renderToStaticMarkup(
  <StatusBadge status="Menunggu Pembayaran" type="payment" />
);
assert.strictEqual(
  unpaidQrisHtml.includes("Menunggu bayar"),
  true,
  `Expected badge to contain 'Menunggu bayar', got: ${unpaidQrisHtml}`
);
assert.strictEqual(
  unpaidQrisHtml.includes("Pembayaran: Menunggu Pembayaran"),
  false,
  "Must NOT contain redundant 'Pembayaran: Menunggu Pembayaran'"
);
console.log("✅ Passed: 'Menunggu Pembayaran' correctly displays as 'Menunggu bayar'.\n");

// 2. StatusBadge: Settled Order -> "Lunas"
console.log("--- TEST 2: Paid Order Payment Status Badge -> 'Lunas' ---");
const paidHtml = renderToStaticMarkup(
  <StatusBadge status="Lunas" type="payment" />
);
assert.strictEqual(
  paidHtml.includes("Lunas"),
  true,
  `Expected badge to contain 'Lunas', got: ${paidHtml}`
);
assert.strictEqual(
  paidHtml.includes("Menunggu"),
  false,
  "Must not contain 'Menunggu'"
);
console.log("✅ Passed: 'Lunas' correctly displays as 'Lunas'.\n");

// 3. StatusBadge: Legacy QRIS -> "Menunggu Verifikasi"
console.log("--- TEST 3: Legacy QRIS Order Payment Status Badge -> 'Menunggu Verifikasi' ---");
const legacyHtml = renderToStaticMarkup(
  <StatusBadge status="Menunggu Verifikasi" type="payment" />
);
assert.strictEqual(
  legacyHtml.includes("Menunggu Verifikasi"),
  true,
  `Expected badge to contain 'Menunggu Verifikasi', got: ${legacyHtml}`
);
console.log("✅ Passed: Legacy QRIS retains 'Menunggu Verifikasi'.\n");

// 4. Sidebar NAV_ITEMS: "Verifikasi QRIS" and "DANA" badge removed
console.log("--- TEST 4: Sidebar Navigation: Verifikasi QRIS and DANA Badge Removed ---");
const adminShellContent = fs.readFileSync(
  path.join(process.cwd(), "src/components/admin/AdminShell.tsx"),
  "utf-8"
);

assert.strictEqual(
  adminShellContent.includes("Verifikasi QRIS"),
  false,
  "Sidebar must not contain 'Verifikasi QRIS'"
);
assert.strictEqual(
  adminShellContent.includes("/admin/pembayaran"),
  false,
  "Sidebar must not link to '/admin/pembayaran'"
);
assert.strictEqual(
  adminShellContent.includes('"DANA"'),
  false,
  "Sidebar must not contain 'DANA' badge"
);
console.log("✅ Passed: 'Verifikasi QRIS' and 'DANA' badge completely removed from AdminShell.\n");

// 5. Verification: /admin/pembayaran page and PaymentsManager removed from filesystem
console.log("--- TEST 5: Filesystem: /admin/pembayaran and PaymentsManager removed ---");
const pembayaranPageExists = fs.existsSync(
  path.join(process.cwd(), "src/app/admin/pembayaran/page.tsx")
);
const paymentsManagerExists = fs.existsSync(
  path.join(process.cwd(), "src/components/admin/PaymentsManager.tsx")
);
assert.strictEqual(pembayaranPageExists, false, "page.tsx for /admin/pembayaran must be deleted");
assert.strictEqual(paymentsManagerExists, false, "PaymentsManager.tsx must be deleted");
console.log("✅ Passed: Unused page and component deleted from filesystem.\n");

console.log("================================================================================");
console.log("🎉 ALL ADMIN PAYMENT STATUS & CLEANUP TESTS PASSED SUCCESSFULLY (0 FAILURES)!");
console.log("================================================================================\n");
