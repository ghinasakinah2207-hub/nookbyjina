import React from "react";
import fs from "fs";
import path from "path";
import assert from "assert";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeFooter } from "../components/home/HomeFooter";
import { BRAND } from "../lib/branding";
import { StoreSettings } from "../types";
import { readLocalStoreSettings } from "../lib/supabase/store-settings";

console.log("================================================================================");
console.log("TEST SUITE: Customer Homepage Footer Compact Horizontal Contact Layout");
console.log("================================================================================");

const footerPath = path.resolve(process.cwd(), "src/components/home/HomeFooter.tsx");
const footerSrc = fs.readFileSync(footerPath, "utf-8");

const homeClientPath = path.resolve(process.cwd(), "src/components/home/ShoppingHomeClient.tsx");
const homeClientSrc = fs.readFileSync(homeClientPath, "utf-8");

const CONFIRMED_ADDRESS = "28R9+M8H, Dayah Lb, Kec. Lhoksukon, Kabupaten Aceh Utara, Aceh 24382";
const SHORT_ADDRESS = "Dayah Lb, Lhoksukon, Aceh Utara";
const localSettings = readLocalStoreSettings();

// Section 1: Homepage Footer Presence and Placement
console.log("\n--- Section 1: Homepage Footer Integration & Placement ---");
assert(homeClientSrc.includes("<HomeFooter"), "ShoppingHomeClient includes HomeFooter component");
assert(homeClientSrc.includes("storeSettings={storeSettings}"), "HomeFooter receives dynamic storeSettings");

const footerIdx = homeClientSrc.indexOf("<HomeFooter");
const bottomNavIdx = homeClientSrc.indexOf("<BottomNavigation");
assert(footerIdx !== -1 && bottomNavIdx !== -1, "Both HomeFooter and BottomNavigation exist");
assert(footerIdx < bottomNavIdx, "HomeFooter is placed inside main content before BottomNavigation");
console.log("  [PASS] HomeFooter integration and vertical placement verified");

// Section 2: Contact Information Structure & Horizontal Flexbox Layout
console.log("\n--- Section 2: Contact Information Structure & Horizontal Layout ---");
assert(footerSrc.includes("Hubungi Kami"), "HomeFooter has title 'Hubungi Kami'");
assert(footerSrc.includes("flex-row"), "HomeFooter uses horizontal flex-row layout");
assert(footerSrc.includes("flex-1"), "HomeFooter items use flex-1 for equal width distribution");
assert(footerSrc.includes("min-w-0"), "HomeFooter items use min-w-0 to prevent horizontal overflow");
assert(footerSrc.includes("divide-x"), "HomeFooter uses subtle vertical dividers between items");
assert(footerSrc.includes("WhatsApp"), "HomeFooter displays WhatsApp item");
assert(footerSrc.includes("Email"), "HomeFooter displays Email item");
assert(footerSrc.includes("Alamat"), "HomeFooter displays Alamat item");
assert(footerSrc.includes("break-words"), "Alamat has break-words for natural wrapping");
assert(footerSrc.includes("break-all"), "Email has break-all for long emails");
assert(footerSrc.includes("target=\"_blank\""), "External links open in new tab");
assert(footerSrc.includes("rel=\"noopener noreferrer\""), "External links have secure rel attributes");
assert(footerSrc.includes("All rights reserved"), "Copyright notice present at bottom of footer");
console.log("  [PASS] Horizontal flex-row structure, titles, links, and wrapping rules verified");

// Section 3: SSR Markup with Configured Store Settings
console.log("\n--- Section 3: SSR Markup with Configured Store Settings ---");
const configuredSettings: StoreSettings = {
  ...localSettings,
  storeName: "Nook by Jina",
  adminWhatsapp: "6282273180000",
  supportEmail: "support@nookbyjina.com",
  address: CONFIRMED_ADDRESS,
  mapsUrl: "https://maps.google.com/?q=28R9%2BM8H,+Dayah+Lb,+Kec.+Lhoksukon,+Kabupaten+Aceh+Utara,+Aceh+24382",
};

const markupConfigured = renderToStaticMarkup(
  <HomeFooter storeSettings={configuredSettings} />
);

assert(markupConfigured.includes("Hubungi Kami"), "Renders 'Hubungi Kami'");
assert(markupConfigured.includes("wa.me/6282273180000"), "WhatsApp link contains correct wa.me URL");
assert(markupConfigured.includes("0822-7318-0000"), "WhatsApp displays formatted phone number: 0822-7318-0000");
assert(markupConfigured.includes("mailto:support@nookbyjina.com"), "Email link contains mailto: with configured address");
assert(markupConfigured.includes("support@nookbyjina.com"), "Email text displayed");
assert(markupConfigured.includes(SHORT_ADDRESS), `Shortened address displayed: "${SHORT_ADDRESS}"`);
assert(markupConfigured.includes("maps.google.com"), "Google Maps link present for address");
console.log("  [PASS] Active configured settings render all contact links and compact information properly");

// Section 4: SSR Markup with Empty Email (Graceful Fallback)
console.log("\n--- Section 4: SSR Markup with Empty Email (Graceful Fallback) ---");
const unconfiguredSettings: StoreSettings = {
  ...configuredSettings,
  supportEmail: "",
};

const markupUnconfigured = renderToStaticMarkup(
  <HomeFooter storeSettings={unconfiguredSettings} />
);

assert(!markupUnconfigured.includes("mailto:"), "Does not render invalid mailto: link when email is unset");
assert(markupUnconfigured.includes("Belum Diatur"), "Renders 'Belum Diatur' state when email is unset");
assert(markupUnconfigured.includes("wa.me/"), "WhatsApp remains available even if email is unset");
assert(markupUnconfigured.includes(SHORT_ADDRESS), "Business address remains available even if email is unset");
console.log("  [PASS] Unconfigured email displays graceful 'Belum Diatur' state without invalid links");

// Section 5: Single Source of Truth
console.log("\n--- Section 5: Single Source of Truth Alignment ---");
assert(
  localSettings.address === CONFIRMED_ADDRESS,
  "Local store settings has the exact confirmed business address"
);
assert(
  localSettings.address === BRAND.contact.addressText,
  "Local store settings address matches BRAND.contact.addressText"
);
assert(
  localSettings.mapsUrl === BRAND.contact.mapsUrl,
  "Local store settings mapsUrl matches BRAND.contact.mapsUrl"
);
console.log("  [PASS] Single source of truth across store settings and branding constants verified");

console.log("\n================================================================================");
console.log("ALL HOMEPAGE FOOTER HORIZONTAL LAYOUT ASSERTIONS PASSED!");
console.log("================================================================================");
