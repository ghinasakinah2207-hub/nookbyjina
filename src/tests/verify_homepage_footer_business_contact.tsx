import React from "react";
import fs from "fs";
import path from "path";
import assert from "assert";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeFooter } from "../components/home/HomeFooter";
import { BRAND } from "../lib/branding";

console.log("================================================================================");
console.log("TEST SUITE: Customer Homepage Footer Hubungi Kami Section Removal");
console.log("================================================================================");

const footerPath = path.resolve(process.cwd(), "src/components/home/HomeFooter.tsx");
const footerSrc = fs.readFileSync(footerPath, "utf-8");

const homeClientPath = path.resolve(process.cwd(), "src/components/home/ShoppingHomeClient.tsx");
const homeClientSrc = fs.readFileSync(homeClientPath, "utf-8");

// Section 1: Homepage Footer Presence and Placement
console.log("\n--- Section 1: Homepage Footer Integration & Placement ---");
assert(homeClientSrc.includes("<HomeFooter"), "ShoppingHomeClient includes HomeFooter component");

const footerIdx = homeClientSrc.indexOf("<HomeFooter");
const bottomNavIdx = homeClientSrc.indexOf("<BottomNavigation");
assert(footerIdx !== -1 && bottomNavIdx !== -1, "Both HomeFooter and BottomNavigation exist");
assert(footerIdx < bottomNavIdx, "HomeFooter is placed inside main content before BottomNavigation");
console.log("  [PASS] HomeFooter integration and vertical placement verified");

// Section 2: Hubungi Kami Section Removal Verification
console.log("\n--- Section 2: Hubungi Kami Removal & Clean Copyright Layout ---");
assert(!footerSrc.includes("Hubungi Kami"), "HomeFooter no longer contains 'Hubungi Kami' section");
assert(!footerSrc.includes("WhatsApp"), "HomeFooter no longer renders WhatsApp card");
assert(!footerSrc.includes("Email"), "HomeFooter no longer renders Email card");
assert(!footerSrc.includes("Alamat"), "HomeFooter no longer renders Alamat card");
assert(footerSrc.includes("All rights reserved"), "Copyright notice remains present at bottom of footer");
console.log("  [PASS] Hubungi Kami contact section removed while preserving copyright notice");

// Section 3: SSR Markup Render
console.log("\n--- Section 3: SSR Markup Render ---");
const markup = renderToStaticMarkup(<HomeFooter />);
assert(!markup.includes("Hubungi Kami"), "Rendered markup does not contain 'Hubungi Kami'");
assert(markup.includes("All rights reserved"), "Rendered markup contains copyright notice");
assert(markup.includes(BRAND.name), `Rendered markup includes brand name '${BRAND.name}'`);
console.log("  [PASS] Clean minimal footer renders properly");

console.log("\n================================================================================");
console.log("ALL HOMEPAGE FOOTER ASSERTIONS PASSED!");
console.log("================================================================================");
