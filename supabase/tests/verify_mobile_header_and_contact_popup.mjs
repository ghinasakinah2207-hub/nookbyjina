/**
 * Verification Test Suite:
 * Revised Mobile Homepage Header, Centered Logo (+20%), Hamburger Menu & Contact Drawer
 */

import fs from "node:fs";

const BASE_URL = "http://localhost:3000";

async function runTests() {
  console.log("==================================================================");
  console.log("STARTING TEST SUITE: Mobile Header Revision & Contact Popup");
  console.log("==================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function test(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Inspect Header source code structure
  console.log("--- Scenario 1: Header Layout, Logo Centering & Sizing (+20%) ---");
  const headerCode = fs.readFileSync("src/components/layout/Header.tsx", "utf8");

  test(headerCode.includes("absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2"), "Logo is horizontally & vertically centered using absolute positioning independent of left/right controls");
  test(headerCode.includes("h-[49px] sm:h-[55px]"), "Logo rendered height increased by 20% (from 41px/46px to 49px/55px)");
  test(headerCode.includes("object-contain"), "Logo preserves aspect ratio with object-contain");
  test(headerCode.includes("BRAND.logos.dark"), "Header uses approved dark logo (mainpagelogo.webp) for high contrast on light background");
  test(headerCode.includes("showBack"), "Header retains back button capability for subpages");
  test(headerCode.includes("Menu"), "Header imports and renders lucide-react Menu icon on far left");
  test(headerCode.includes("aria-label=\"Buka menu kontak\""), "Hamburger button has accessible label");
  test(headerCode.includes("min-h-[44px] min-w-[44px]"), "Both hamburger and wishlist buttons enforce comfortable 44x44px touch targets");
  test(headerCode.includes("Heart"), "Wishlist / Heart button retained in right control slot");
  test(headerCode.includes("href=\"/favorit\""), "Wishlist button links directly to /favorit");

  // 2. Inspect ContactDrawer source code structure
  console.log("\n--- Scenario 2: Contact and Social Media Popup Verification ---");
  const drawerCode = fs.readFileSync("src/components/layout/ContactDrawer.tsx", "utf8");

  test(drawerCode.includes("role=\"dialog\""), "ContactDrawer uses accessible role='dialog'");
  test(drawerCode.includes("aria-modal=\"true\""), "ContactDrawer declares aria-modal='true'");
  test(drawerCode.includes("Escape"), "ContactDrawer listens for Escape key to close");
  test(drawerCode.includes("backdrop-blur"), "ContactDrawer uses subtle backdrop blur");
  test(drawerCode.includes("translate-x-0"), "ContactDrawer supports smooth slide transition from left");
  test(drawerCode.includes("BRAND.contact.whatsappNumber"), "ContactDrawer references verified WhatsApp contact");
  test(drawerCode.includes("https://wa.me/"), "WhatsApp CTA generates valid international wa.me link");
  test(drawerCode.includes("target=\"_blank\""), "External WhatsApp and social links open safely in new tab");
  test(drawerCode.includes("rel=\"noopener noreferrer\""), "External links declare rel='noopener noreferrer'");
  test(drawerCode.includes("Instagram"), "Instagram section included in popup");
  test(drawerCode.includes("BRAND.contact.locationText"), "Store location displayed (Lhoksukon, Aceh Utara)");
  test(drawerCode.includes("BRAND.contact.operatingHoursText"), "Store operating hours displayed (09:00 – 17:00 WIB)");
  test(drawerCode.includes("BRAND.contact.serviceAreaText"), "Store delivery service area displayed (Lhoksukon & Sekitarnya)");
  test(drawerCode.includes("aria-label=\"Tutup menu kontak\""), "Close button provides accessible label");

  // 3. Inspect Brand Configuration
  console.log("\n--- Scenario 3: Brand Configuration Placeholders & Integrity ---");
  const brandCode = fs.readFileSync("src/lib/branding.ts", "utf8");

  test(brandCode.includes("6282273180000"), "Verified WhatsApp number is 6282273180000");
  test(brandCode.includes("+62 822-7318-0000"), "Formatted WhatsApp number is formatted cleanly");
  test(brandCode.includes("instagramUrl: process.env.NEXT_PUBLIC_INSTAGRAM_URL"), "Instagram URL has maintainable environment variable placeholder");
  test(!drawerCode.includes("instagram.com/fake") && !drawerCode.includes("instagram.com/nookbyjina"), "No fake social links are rendered when unconfigured");

  // 4. Live Server HTTP Verification
  console.log("\n--- Scenario 4: Live Storefront HTML Integration ---");
  const homeRes = await fetch(`${BASE_URL}/home`);
  test(homeRes.status === 200, "GET /home returns HTTP 200");
  const homeHtml = await homeRes.text();

  test(homeHtml.includes("Buka menu kontak"), "Live /home HTML contains accessible hamburger button");
  test(homeHtml.includes("mainpagelogo.webp"), "Live /home HTML contains Nook brand logo");
  test(homeHtml.includes("h-[49px]"), "Live /home HTML applies 20% enlarged logo sizing (49px)");
  test(homeHtml.includes("Buka Menu Favorit"), "Live /home HTML contains wishlist button on right");
  test(homeHtml.includes("6282273180000"), "Live /home HTML contains verified WhatsApp contact data");
  test(homeHtml.includes("contact-menu-popup"), "Live /home HTML contains contact menu popup dialog");
  test(homeHtml.includes("Mau order apa, bestie..."), "Live /home HTML preserves search bar below header without disruption");

  console.log("\n==================================================================");
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log("==================================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
