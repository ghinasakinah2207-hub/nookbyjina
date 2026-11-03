import React from "react";
import fs from "fs";
import path from "path";
import assert from "assert";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactDrawer } from "../components/layout/ContactDrawer";
import { BRAND } from "../lib/branding";
import { StoreSettings } from "../types";
import { readLocalStoreSettings } from "../lib/supabase/store-settings";

console.log("================================================================================");
console.log("TEST SUITE: Nook by Jina Public Business Address & Google Maps Configuration");
console.log("================================================================================");

const drawerPath = path.resolve(process.cwd(), "src/components/layout/ContactDrawer.tsx");
const drawerSrc = fs.readFileSync(drawerPath, "utf-8");

const settingsManagerPath = path.resolve(process.cwd(), "src/components/admin/SettingsManager.tsx");
const settingsManagerSrc = fs.readFileSync(settingsManagerPath, "utf-8");

const actionsPath = path.resolve(process.cwd(), "src/app/admin/pengaturan/actions.ts");
const actionsSrc = fs.readFileSync(actionsPath, "utf-8");

const storeSettingsLibPath = path.resolve(process.cwd(), "src/lib/supabase/store-settings.ts");
const storeSettingsLibSrc = fs.readFileSync(storeSettingsLibPath, "utf-8");

const CONFIRMED_ADDRESS = "28R9+M8H, Dayah Lb, Kec. Lhoksukon, Kabupaten Aceh Utara, Aceh 24382";
const CONFIRMED_LOCATION = "Lhoksukon, Aceh Utara";

// Section 1: Customer Contact Drawer Verification
console.log("\n--- Section 1: Customer Contact Drawer Layout & Content ---");
assert(drawerSrc.includes("Lokasi Toko"), "ContactDrawer uses title 'Lokasi Toko' instead of 'Lokasi Dapur'");
assert(!drawerSrc.includes("<p className=\"font-semibold text-neutral-900\">Lokasi Dapur</p>"), "Old 'Lokasi Dapur' heading completely replaced");
assert(drawerSrc.includes("Lihat Lokasi"), "ContactDrawer includes 'Lihat Lokasi' link");
assert(drawerSrc.includes("storeMapsUrl"), "ContactDrawer dynamically links to storeMapsUrl");
assert(drawerSrc.includes("storeAddress"), "ContactDrawer dynamically renders storeAddress");
assert(drawerSrc.includes("target=\"_blank\""), "'Lihat Lokasi' link opens in new tab");
assert(drawerSrc.includes("rel=\"noopener noreferrer\""), "'Lihat Lokasi' link has secure rel attributes");
assert(drawerSrc.includes("break-words"), "Address text allows natural wrapping with break-words");

// Preserved existing sections
assert(drawerSrc.includes("Jam Operasional"), "Jam Operasional preserved");
assert(drawerSrc.includes("Area Pengantaran"), "Area Pengantaran preserved");
assert(drawerSrc.includes("Chat WhatsApp"), "WhatsApp card preserved");
assert(drawerSrc.includes("Instagram"), "Instagram card preserved");
assert(drawerSrc.includes("Email Support"), "Email Support card preserved");
assert(drawerSrc.includes("Bantuan & Informasi"), "FAQ accordion preserved");
console.log("  [PASS] ContactDrawer 'Lokasi Toko', full address wrapping, and 'Lihat Lokasi' link verified");

// Section 2: Admin Store Settings Manager Verification
console.log("\n--- Section 2: Admin Store Settings Manager ---");
assert(settingsManagerSrc.includes("Alamat Lengkap Toko (Publik)"), "SettingsManager includes 'Alamat Lengkap Toko (Publik)' field");
assert(settingsManagerSrc.includes("Link Google Maps Lokasi Toko"), "SettingsManager includes 'Link Google Maps Lokasi Toko' field");
assert(settingsManagerSrc.includes("Label Lokasi Singkat"), "SettingsManager includes 'Label Lokasi Singkat' field");
assert(settingsManagerSrc.includes("formState.address"), "SettingsManager binds formState.address");
assert(settingsManagerSrc.includes("formState.mapsUrl"), "SettingsManager binds formState.mapsUrl");
assert(settingsManagerSrc.includes("formState.location"), "SettingsManager binds formState.location");
assert(settingsManagerSrc.includes("isDirty"), "SettingsManager tracks dirty state for address and mapsUrl");
console.log("  [PASS] Admin SettingsManager address and Google Maps fields verified");

// Section 3: Persistence Layer (Supabase Actions & Store Settings Lib)
console.log("\n--- Section 3: Persistence Layer (Actions & Database Mappings) ---");
assert(actionsSrc.includes("addressVal"), "saveStoreSettingsAction handles addressVal");
assert(actionsSrc.includes("mapsUrlVal"), "saveStoreSettingsAction handles mapsUrlVal");
assert(actionsSrc.includes("address: addressVal"), "saveStoreSettingsAction updates address in database");
assert(actionsSrc.includes("maps_url: mapsUrlVal"), "saveStoreSettingsAction updates maps_url in database");

assert(storeSettingsLibSrc.includes("address, maps_url"), "storeSettingsLib selects address and maps_url");
assert(storeSettingsLibSrc.includes("ssData.address"), "storeSettingsLib maps ssData.address");
assert(storeSettingsLibSrc.includes("ssData.maps_url"), "storeSettingsLib maps ssData.maps_url");

const localSettings = readLocalStoreSettings();
assert(localSettings.address === CONFIRMED_ADDRESS, `Local store settings address matches confirmed address: "${localSettings.address}"`);
assert(localSettings.location === CONFIRMED_LOCATION, `Local store settings location matches confirmed location: "${localSettings.location}"`);
assert(localSettings.mapsUrl && localSettings.mapsUrl.includes("28R9%2BM8H"), `Local store settings mapsUrl is configured properly: "${localSettings.mapsUrl}"`);
console.log("  [PASS] Persistence actions, queries, and local fallback configuration verified");

// Section 4: Branding Constants Consistency
console.log("\n--- Section 4: Branding Constants Consistency ---");
assert(BRAND.contact.addressText === CONFIRMED_ADDRESS, "BRAND.contact.addressText matches confirmed address");
assert(BRAND.contact.locationText === CONFIRMED_LOCATION, "BRAND.contact.locationText matches confirmed location");
assert(BRAND.contact.mapsUrl && BRAND.contact.mapsUrl.includes("28R9%2BM8H"), "BRAND.contact.mapsUrl points to Google Maps location");
console.log("  [PASS] Branding constants match confirmed public address without exposing kitchen");

// Section 5: SSR Rendering Test
console.log("\n--- Section 5: SSR Static Markup Verification ---");
const testSettings: StoreSettings = {
  ...localSettings,
  storeName: "Nook by Jina",
  address: CONFIRMED_ADDRESS,
  location: CONFIRMED_LOCATION,
  mapsUrl: "https://maps.google.com/?q=28R9%2BM8H,+Dayah+Lb,+Kec.+Lhoksukon,+Kabupaten+Aceh+Utara,+Aceh+24382",
  supportEmail: "support@nookbyjina.com",
};

const markup = renderToStaticMarkup(
  <ContactDrawer isOpen={true} onClose={() => {}} initialSettings={testSettings} />
);

assert(markup.includes("Lokasi Toko"), "Rendered HTML contains 'Lokasi Toko'");
assert(markup.includes(CONFIRMED_ADDRESS), "Rendered HTML contains confirmed address text");
assert(markup.includes("Lihat Lokasi"), "Rendered HTML contains 'Lihat Lokasi' link");
assert(markup.includes("maps.google.com"), "Rendered HTML contains Google Maps link");
assert(!markup.includes("Lokasi Dapur"), "Rendered HTML does not contain 'Lokasi Dapur'");
console.log("  [PASS] SSR render verification completed with confirmed address and Maps link");

console.log("\n================================================================================");
console.log("ALL PUBLIC BUSINESS ADDRESS & MAPS VERIFICATION CHECKS PASSED!");
console.log("================================================================================");

