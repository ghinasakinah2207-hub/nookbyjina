import React from "react";
import fs from "fs";
import path from "path";
import assert from "assert";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactDrawer } from "../components/layout/ContactDrawer";
import { StoreSettings } from "../types";
import { validateStoreSettings } from "../lib/supabase/store-settings";

console.log("================================================================================");
console.log("TEST SUITE: Contact Drawer 3 Compact Cards & Admin Support Email Configuration");
console.log("================================================================================");

const drawerPath = path.resolve(process.cwd(), "src/components/layout/ContactDrawer.tsx");
const drawerSrc = fs.readFileSync(drawerPath, "utf-8");

const settingsManagerPath = path.resolve(process.cwd(), "src/components/admin/SettingsManager.tsx");
const settingsManagerSrc = fs.readFileSync(settingsManagerPath, "utf-8");

const actionsPath = path.resolve(process.cwd(), "src/app/admin/pengaturan/actions.ts");
const actionsSrc = fs.readFileSync(actionsPath, "utf-8");

const storeSettingsLibPath = path.resolve(process.cwd(), "src/lib/supabase/store-settings.ts");
const storeSettingsLibSrc = fs.readFileSync(storeSettingsLibPath, "utf-8");

// Section 1: Contact Drawer Layout & Sizing
console.log("\n--- Section 1: Contact Drawer 3-Column Layout ---");
assert(drawerSrc.includes("grid-cols-3"), "Must use a 3-column grid for contact cards");
assert(drawerSrc.includes("gap-1.5"), "Must use compact horizontal gap between cards");
assert(drawerSrc.includes("Mail"), "Mail icon must be imported and used");
assert(drawerSrc.includes("Card 1: WhatsApp"), "Card 1 must be WhatsApp");
assert(drawerSrc.includes("Card 2: Instagram"), "Card 2 must be Instagram");
assert(drawerSrc.includes("Card 3: Email Support"), "Card 3 must be Email Support");
console.log("  [PASS] 3-column layout structure with WhatsApp, Instagram, and Email cards verified");

// Section 2: Contact Cards Content & Order
console.log("\n--- Section 2: Contact Cards Content & Micro-Interactions ---");
assert(drawerSrc.includes("Chat WhatsApp"), "WhatsApp card title is 'Chat WhatsApp'");
assert(drawerSrc.includes("Instagram"), "Instagram card title is 'Instagram'");
assert(drawerSrc.includes("Email Support"), "Email card title is 'Email Support'");
assert(drawerSrc.includes("Hubungi kami melalui email"), "Email card description matches requirement");
assert(drawerSrc.includes("mailto:"), "Email card opens mailto: link");
assert(drawerSrc.includes("break-all"), "Email address has break-all for responsive wrapping");
console.log("  [PASS] Contact card titles, descriptions, and link schemas verified");

// Section 3: SSR Rendering with Configured Email vs Empty Email
console.log("\n--- Section 3: SSR Rendering - Configured Email vs Empty State ---");

const baseSettings: StoreSettings = {
  storeName: "Nook by Jina",
  tagline: "Makanan homemade dibuat dengan penuh rasa dan kehangatan.",
  location: "Lhoksukon, Aceh Utara",
  address: "28R9+M8H, Dayah Lb, Kec. Lhoksukon, Kabupaten Aceh Utara, Aceh 24382",
  mapsUrl: "https://maps.google.com/?q=28R9%2BM8H,+Dayah+Lb,+Kec.+Lhoksukon,+Kabupaten+Aceh+Utara,+Aceh+24382",
  isOpen: true,
  operatingHoursText: "Setiap Hari: 09:00 – 17:00 WIB",
  adminWhatsapp: "6282273180000",
  instagramUrl: "https://www.instagram.com/nookbyjina/",
  supportEmail: "support@nookbyjina.com",
  qrisMerchantName: "Nook by Jina",
  qrisNmid: "ID1020038829101",
  qrisImageUrl: "",
  deliveryConfig: {
    configuredArea: "Lhoksukon",
    standardFee: 4000,
    freeShippingThreshold: 50000,
  },
  paymentMethods: {
    qris: true,
    cash: true,
  },
};

// 3A: Render with configured email
const markupWithEmail = renderToStaticMarkup(
  <ContactDrawer isOpen={true} onClose={() => {}} initialSettings={baseSettings} />
);

assert(markupWithEmail.includes("mailto:support@nookbyjina.com"), "Rendered output contains mailto link with configured email");
assert(markupWithEmail.includes("support@nookbyjina.com"), "Rendered output displays support email text");
assert(markupWithEmail.includes("Chat WhatsApp"), "Rendered output displays WhatsApp");
assert(markupWithEmail.includes("Instagram"), "Rendered output displays Instagram");
console.log("  [PASS] Active state renders mailto: link and formatted email address");

// 3B: Render with empty email (unconfigured)
const unconfiguredSettings: StoreSettings = {
  ...baseSettings,
  supportEmail: "",
};

const markupEmptyEmail = renderToStaticMarkup(
  <ContactDrawer isOpen={true} onClose={() => {}} initialSettings={unconfiguredSettings} />
);

assert(!markupEmptyEmail.includes("mailto:"), "No invalid mailto link rendered when email is empty");
assert(markupEmptyEmail.includes("Belum Diatur"), "Shows 'Belum Diatur' state when email is unset");
console.log("  [PASS] Empty email renders 'Belum Diatur' state without invalid mailto link");

// Section 4: Email Validation in Store Settings Lib
console.log("\n--- Section 4: Email Validation in Store Settings ---");
const validSettings = { ...baseSettings, supportEmail: "halo@nookbyjina.com" };
assert.strictEqual(validateStoreSettings(validSettings), null, "Valid email passes validation");

const invalidEmailSettings = { ...baseSettings, supportEmail: "invalid-email-address" };
const validationErr = validateStoreSettings(invalidEmailSettings);
assert(validationErr && validationErr.includes("Format email support tidak valid"), "Invalid email is rejected by validateStoreSettings");

const emptyEmailSettings = { ...baseSettings, supportEmail: "" };
assert.strictEqual(validateStoreSettings(emptyEmailSettings), null, "Empty email is permitted (optional field)");
console.log("  [PASS] Email validation rules passed (valid format accepted, invalid format rejected, empty allowed)");

// Section 5: Admin Settings Manager UI & Persistence Integration
console.log("\n--- Section 5: Admin Settings Manager & Actions Integration ---");
assert(settingsManagerSrc.includes("Email Support"), "Admin SettingsManager includes Email Support label");
assert(settingsManagerSrc.includes("formState.supportEmail"), "SettingsManager binds formState.supportEmail");
assert(settingsManagerSrc.includes("type=\"email\""), "SettingsManager uses email input type");
assert(settingsManagerSrc.includes("support@nookbyjina.com"), "SettingsManager provides placeholder");
assert(settingsManagerSrc.includes("isDirty"), "SettingsManager tracks dirty state for supportEmail");

assert(actionsSrc.includes("support_email"), "Admin actions include support_email in database persistence");
assert(storeSettingsLibSrc.includes("support_email"), "Store settings lib includes support_email in database queries");
console.log("  [PASS] Admin settings manager UI, actions, and store settings library integration verified");

console.log("\n================================================================================");
console.log("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!");
console.log("================================================================================");
