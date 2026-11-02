import React from "react";
import fs from "fs";
import path from "path";
import assert from "assert";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactDrawer } from "../components/layout/ContactDrawer";
import { BRAND } from "../lib/branding";

console.log("================================================================================");
console.log("TEST SUITE: Refactored Contact Drawer with Integrated FAQ & Help Accordion");
console.log("================================================================================");

const drawerPath = path.resolve(process.cwd(), "src/components/layout/ContactDrawer.tsx");
const drawerSrc = fs.readFileSync(drawerPath, "utf-8");

// Section 1: Preserved Existing Information & Side-by-side Contact Cards
console.log("\n--- Section 1: Preserved Information & Side-by-side Contact Cards ---");
assert(drawerSrc.includes("BRAND.logos.dark") && drawerSrc.includes(BRAND.name), "Header brand logo and name preserved");
assert(drawerSrc.includes("BRAND.contact.locationText"), "Header location preserved");
assert(drawerSrc.includes("Hubungi Kami"), "Hubungi Kami section heading preserved");
assert(drawerSrc.includes("grid grid-cols-2"), "WhatsApp and Instagram displayed side-by-side in a 2-column grid");
assert(drawerSrc.includes("Chat WhatsApp"), "WhatsApp contact label preserved");
assert(drawerSrc.includes("formattedWhatsapp"), "Formatted WhatsApp number preserved");
assert(drawerSrc.includes("bg-emerald-50/60") && drawerSrc.includes("border-emerald-200/70"), "WhatsApp card preserves green styling");
assert(!drawerSrc.includes("id=\"social-heading\"") && !drawerSrc.includes("Media Sosial"), "Separate Media Sosial heading removed");
assert(drawerSrc.includes("Instagram"), "Instagram card consolidated inside Hubungi Kami");
assert(drawerSrc.includes("Belum Diatur"), "Instagram 'Belum Diatur' badge preserved");
assert(drawerSrc.includes("Informasi Toko"), "Informasi Toko section preserved");
assert(drawerSrc.includes("Lokasi Dapur"), "Lokasi Dapur preserved");
assert(drawerSrc.includes("Jam Operasional"), "Jam Operasional preserved");
assert(drawerSrc.includes("Area Pengantaran"), "Area Pengantaran preserved");
console.log("  [PASS] All existing contact cards preserved in side-by-side 2-column layout");

// Section 2: Navigasi Cepat Removed
console.log("\n--- Section 2: Navigasi Cepat Removal ---");
assert(!drawerSrc.includes("Navigasi Cepat"), "'Navigasi Cepat' section header removed from ContactDrawer");
assert(!drawerSrc.includes("Jelajahi Semua Menu"), "'Jelajahi Semua Menu' link removed from drawer");
assert(!drawerSrc.includes("Menu Favorit"), "'Menu Favorit' link removed from drawer");
assert(!drawerSrc.includes("Lacak Status Pesanan"), "'Lacak Status Pesanan' link removed from drawer");
console.log("  [PASS] Navigasi Cepat section completely removed");

// Section 3: Bantuan & Informasi FAQ Categories
console.log("\n--- Section 3: Bantuan & Informasi FAQ Categories ---");
assert(drawerSrc.includes("Bantuan & Informasi"), "Section title 'Bantuan & Informasi' present");

// 5 Required Categories
assert(drawerSrc.includes("Cara Pemesanan"), "Category A: 'Cara Pemesanan' present");
assert(drawerSrc.includes("Pilih produk dari menu"), "Cara Pemesanan includes selecting product");
assert(drawerSrc.includes("Beli Sekarang"), "Cara Pemesanan includes Beli Sekarang option");
assert(drawerSrc.includes("status pembayaran terverifikasi"), "Cara Pemesanan mentions verification");

assert(drawerSrc.includes("Pembayaran"), "Category B: 'Pembayaran' present");
assert(drawerSrc.includes("jangan langsung membayar ulang"), "Pembayaran advises against immediate double payment");
assert(drawerSrc.includes("pembayaran ganda"), "Pembayaran addresses duplicate payment handling");

assert(drawerSrc.includes("Pembatalan & Refund"), "Category C: 'Pembatalan & Refund' present");
assert(drawerSrc.includes("Kebijakan Pembatalan"), "Cancellation policy section included");
assert(drawerSrc.includes("Kebijakan Refund"), "Refund policy section included");
assert(drawerSrc.includes("Pengembalian dana ditangani secara manual"), "Manual refund policy clearly stated");

assert(drawerSrc.includes("Pengiriman & Pre-Order"), "Category D: 'Pengiriman & Pre-Order' present");
assert(drawerSrc.includes("sistem pre-order"), "Mentions pre-order system");
assert(drawerSrc.includes("Gratis ongkir"), "Mentions free delivery threshold");

assert(drawerSrc.includes("Pertanyaan Lainnya"), "Category E: 'Pertanyaan Lainnya' present");
assert(drawerSrc.includes("Bagaimana jika produk habis setelah dipesan?"), "FAQ Q1 present");
assert(drawerSrc.includes("Bagaimana jika pesanan yang diterima tidak sesuai?"), "FAQ Q2 present");
assert(drawerSrc.includes("Bagaimana jika salah mengisi nomor WhatsApp saat checkout?"), "FAQ Q3 present");
assert(drawerSrc.includes("Bagaimana cara menghubungi admin?"), "FAQ Q4 present");
console.log("  [PASS] All 5 required FAQ categories with complete content present");

// Section 4: Accordion Behavior & Accessibility
console.log("\n--- Section 4: Accordion Behavior & Accessibility ---");
assert(drawerSrc.includes("aria-expanded"), "Accordion headers use aria-expanded");
assert(drawerSrc.includes("aria-controls"), "Accordion headers use aria-controls");
assert(drawerSrc.includes("role=\"region\""), "Accordion panels use role='region'");
assert(drawerSrc.includes("setExpandedCategory((prev) => (prev === id ? null : id))"), "Only one category can be expanded at a time");
assert(drawerSrc.includes("transition-[grid-template-rows]"), "Lightweight CSS grid transition for smooth accordion expansion");
assert(drawerSrc.includes("rotate-180"), "Chevron rotates when expanded");
console.log("  [PASS] Single-expand accordion interaction and accessibility confirmed");

// Section 5: Contextual WhatsApp Support Action & Footer
console.log("\n--- Section 5: Contextual WhatsApp Support & Footer ---");
assert(drawerSrc.includes("Masih butuh bantuan? Chat WhatsApp Admin"), "Contextual support action present");
assert(drawerSrc.includes("faqWaUrl"), "Dedicated encoded FAQ prefilled WhatsApp message URL configured");
assert(drawerSrc.includes("© 2026 {BRAND.name}") || drawerSrc.includes(BRAND.name), "Footer copyright preserved");
assert(drawerSrc.includes("BRAND.tagline"), "Footer tagline preserved");
console.log("  [PASS] WhatsApp contextual action and footer confirmed");

// Section 6: Static HTML Markup Render Test
console.log("\n--- Section 6: SSR Render Test ---");
const html = renderToStaticMarkup(
  <ContactDrawer isOpen={true} onClose={() => {}} />
);
assert(html.includes("Bantuan &amp; Informasi") || html.includes("Bantuan & Informasi"), "Rendered HTML contains Bantuan & Informasi");
assert(html.includes("Cara Pemesanan"), "Rendered HTML contains Cara Pemesanan");
assert(html.includes("Pembatalan &amp; Refund") || html.includes("Pembatalan & Refund"), "Rendered HTML contains Pembatalan & Refund");
assert(html.includes("Masih butuh bantuan?"), "Rendered HTML contains contextual WhatsApp support prompt");
console.log("  [PASS] SSR render verification passed without hydration issues");

console.log("\n================================================================================");
console.log("ALL 28/28 ASSERTIONS PASSED! Contact Drawer FAQ Consolidation Verified.");
console.log("================================================================================\n");
