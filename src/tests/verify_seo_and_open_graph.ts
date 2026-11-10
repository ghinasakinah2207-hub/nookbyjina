/**
 * SEO & Open Graph Verification Suite
 * File: src/tests/verify_seo_and_open_graph.ts
 *
 * Verifies all SEO, Open Graph, Sitemap, Robots, and Structured Data invariants.
 */

import fs from "node:fs";
import path from "node:path";

// Load .env.local into process.env before importing modules that need Supabase config
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import sharp from "sharp";
import { getRootJsonLd, CANONICAL_DOMAIN } from "../lib/json-ld";

let passedCount = 0;
let totalCount = 0;

function assertTest(condition: boolean, message: string) {
  totalCount++;
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSeoTests() {
  console.log("================================================================================");
  console.log("STARTING TEST SUITE: SEO, Open Graph & Structured Data Verification");
  console.log("================================================================================\n");

  // ----------------------------------------------------------------------------
  // SECTION 1: Open Graph Image & Social Assets
  // ----------------------------------------------------------------------------
  console.log("--- Section 1: Open Graph & Twitter Social Image Assets ---");

  const ogPublicPath = path.join(process.cwd(), "public/images/og-image.png");
  const ogAppPath = path.join(process.cwd(), "src/app/opengraph-image.png");
  const twitterAppPath = path.join(process.cwd(), "src/app/twitter-image.png");
  const ogAltPath = path.join(process.cwd(), "src/app/opengraph-image.alt.txt");

  assertTest(fs.existsSync(ogPublicPath), "public/images/og-image.png exists");
  assertTest(fs.existsSync(ogAppPath), "src/app/opengraph-image.png exists");
  assertTest(fs.existsSync(twitterAppPath), "src/app/twitter-image.png exists");
  assertTest(fs.existsSync(ogAltPath), "src/app/opengraph-image.alt.txt exists");

  const ogMeta = await sharp(ogPublicPath).metadata();
  assertTest(ogMeta.width === 1200, `OG image width is exactly 1200px (actual: ${ogMeta.width})`);
  assertTest(ogMeta.height === 630, `OG image height is exactly 630px (actual: ${ogMeta.height})`);
  assertTest(ogMeta.format === "png", `OG image format is PNG (actual: ${ogMeta.format})`);

  const altContent = fs.readFileSync(ogAltPath, "utf-8").trim();
  assertTest(altContent.length > 10, "Alt text is descriptive and non-empty");
  assertTest(altContent.includes("Nook by Jina"), "Alt text mentions brand name");

  // ----------------------------------------------------------------------------
  // SECTION 2: Robots.txt Rules & Noindex Directives
  // ----------------------------------------------------------------------------
  console.log("\n--- Section 2: Robots.txt Rules & Noindex Directives ---");

  const { default: robots } = await import("../app/robots");
  const robotsConfig = robots();
  assertTest(Boolean(robotsConfig.sitemap), "Robots config contains sitemap reference");
  assertTest(
    robotsConfig.sitemap === "https://nookbyjina.my.id/sitemap.xml",
    `Sitemap URL is strictly canonical https://nookbyjina.my.id/sitemap.xml (actual: ${robotsConfig.sitemap})`
  );

  const mainRule = Array.isArray(robotsConfig.rules) ? robotsConfig.rules[0] : robotsConfig.rules;
  assertTest(Boolean(mainRule), "Robots contains main crawling rules");
  assertTest(mainRule.allow === "/", "Public root is allowed for crawling");

  const disallowList = Array.isArray(mainRule.disallow) ? mainRule.disallow : [mainRule.disallow];
  console.log("  Disallow paths:", disallowList);
  assertTest(disallowList.includes("/api/"), "Disallows internal api routes (/api/)");

  // Per Google Search Central guidelines:
  // Pages with noindex must NOT be blocked in robots.txt so Googlebot can crawl and read the noindex directive.
  assertTest(!disallowList.includes("/admin/"), "Does NOT block /admin/ in robots.txt so Googlebot can discover noindex");
  assertTest(!disallowList.includes("/checkout"), "Does NOT block /checkout in robots.txt so Googlebot can discover noindex");
  assertTest(!disallowList.includes("/pembayaran/"), "Does NOT block /pembayaran/ in robots.txt so Googlebot can discover noindex");
  assertTest(!disallowList.includes("/pesanan/"), "Does NOT block /pesanan/ in robots.txt so Googlebot can discover noindex");
  assertTest(!disallowList.includes("/keranjang"), "Does NOT block /keranjang in robots.txt so Googlebot can discover noindex");

  // Verify that private routes explicitly declare { index: false, follow: false }
  const privateLayoutsAndPages = [
    { name: "admin/layout.tsx", path: "src/app/admin/layout.tsx" },
    { name: "checkout/page.tsx", path: "src/app/checkout/page.tsx" },
    { name: "pembayaran/layout.tsx", path: "src/app/pembayaran/layout.tsx" },
    { name: "pesanan/layout.tsx", path: "src/app/pesanan/layout.tsx" },
    { name: "sukses/layout.tsx", path: "src/app/sukses/layout.tsx" },
    { name: "keranjang/page.tsx", path: "src/app/keranjang/page.tsx" },
    { name: "favorit/page.tsx", path: "src/app/favorit/page.tsx" },
  ];

  for (const item of privateLayoutsAndPages) {
    const filePath = path.join(process.cwd(), item.path);
    const content = fs.readFileSync(filePath, "utf-8");
    assertTest(
      content.includes("index: false") && content.includes("follow: false"),
      `Private route ${item.name} enforces index: false and follow: false`
    );
  }

  // ----------------------------------------------------------------------------
  // SECTION 3: Sitemap.xml Specification
  // ----------------------------------------------------------------------------
  console.log("\n--- Section 3: Sitemap.xml Routes & Domain Integrity ---");

  const { default: sitemap } = await import("../app/sitemap");
  const sitemapEntries = await sitemap();
  assertTest(Array.isArray(sitemapEntries), "Sitemap returns valid array of entries");
  assertTest(sitemapEntries.length >= 3, `Sitemap has at least 3 core pages (found: ${sitemapEntries.length})`);

  const urls = sitemapEntries.map((e) => e.url);
  console.log("  Sample sitemap URLs:", urls.slice(0, 5));

  assertTest(urls.includes("https://nookbyjina.my.id"), "Sitemap includes root landing URL");
  assertTest(urls.includes("https://nookbyjina.my.id/home"), "Sitemap includes /home catalog URL");
  assertTest(urls.includes("https://nookbyjina.my.id/menu"), "Sitemap includes /menu catalog URL");

  // Ensure no private/admin routes leaked into sitemap
  for (const url of urls) {
    assertTest(url.startsWith("https://nookbyjina.my.id"), `URL strictly starts with canonical domain: ${url}`);
    assertTest(!url.includes("/admin"), `No admin routes in sitemap: ${url}`);
    assertTest(!url.includes("/api"), `No api routes in sitemap: ${url}`);
    assertTest(!url.includes("/checkout"), `No checkout routes in sitemap: ${url}`);
    assertTest(!url.includes("/pembayaran"), `No payment routes in sitemap: ${url}`);
    assertTest(!url.includes("/pesanan"), `No order tracking routes in sitemap: ${url}`);
    assertTest(!url.includes("/keranjang"), `No cart routes in sitemap: ${url}`);
  }

  // ----------------------------------------------------------------------------
  // SECTION 4: Structured Data (JSON-LD)
  // ----------------------------------------------------------------------------
  console.log("\n--- Section 4: Structured Data (JSON-LD) Schema Integrity ---");

  const rootJsonLd = getRootJsonLd();
  assertTest(rootJsonLd["@context"] === "https://schema.org", "Schema.org context present");
  assertTest(Array.isArray(rootJsonLd["@graph"]), "@graph array present");

  const websiteNode = rootJsonLd["@graph"].find((n: Record<string, unknown>) => n["@type"] === "WebSite");
  assertTest(Boolean(websiteNode), "WebSite schema node present");
  assertTest(websiteNode!.url === CANONICAL_DOMAIN, `WebSite URL matches canonical ${CANONICAL_DOMAIN}`);
  assertTest(Boolean(websiteNode!.potentialAction), "WebSite searchAction present");

  const orgNode = rootJsonLd["@graph"].find((n: Record<string, unknown>) =>
    Array.isArray(n["@type"]) ? n["@type"].includes("Restaurant") : n["@type"] === "Restaurant"
  );
  assertTest(Boolean(orgNode), "Restaurant/Organization schema node present");
  assertTest(orgNode!.name === "Nook by Jina", "Business name is Nook by Jina");
  assertTest(orgNode!.telephone === "+6282273180000", "Telephone is verified whatsapp business line");
  assertTest(orgNode!.address?.addressLocality === "Lhoksukon", "Address locality is Lhoksukon");
  assertTest(orgNode!.address?.postalCode === "24382", "Postal code is verified 24382");
  assertTest(Array.isArray(orgNode!.openingHoursSpecification), "Opening hours specification present");

  // ----------------------------------------------------------------------------
  // SECTION 5: Root Layout Metadata Inspection
  // ----------------------------------------------------------------------------
  console.log("\n--- Section 5: Root Layout Metadata ---");

  const layoutPath = path.join(process.cwd(), "src/app/layout.tsx");
  const layoutContent = fs.readFileSync(layoutPath, "utf-8");

  assertTest(layoutContent.includes("https://nookbyjina.my.id"), "layout.tsx uses https://nookbyjina.my.id as metadataBase");
  assertTest(layoutContent.includes("Pesan Makanan Favoritmu"), "layout.tsx contains approved Indonesian title");
  assertTest(layoutContent.includes("sistem pre-order"), "layout.tsx contains approved Indonesian description");
  assertTest(layoutContent.includes("summary_large_image"), "layout.tsx configures Twitter summary_large_image");
  assertTest(layoutContent.includes("application/ld+json"), "layout.tsx injects JSON-LD script tag");

  // Summary
  console.log("\n================================================================================");
  console.log(`RESULTS: ${passedCount} / ${totalCount} ASSERTIONS PASSED (100%)`);
  console.log("================================================================================\n");
}

runSeoTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
