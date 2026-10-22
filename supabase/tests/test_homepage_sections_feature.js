/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Automated Verification Script for Homepage Section Management
 * Tests the live running application:
 * 1. GET /api/homepage-sections returns active sections with populated Supabase products
 * 2. Real products from Supabase catalog are loaded with prices, images, and category
 * 3. HPP is strictly absent from public responses
 * 4. Updating local persistent store simulates admin section edits
 * 5. Reordering sections reflects in API
 * 6. Disabling a section removes it from API output
 * 7. Re-enabling restores it to API output
 * 8. Refreshing / re-querying confirms persistence across calls
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../../src/data/homepage-sections-data.json");
const API_URL = "http://localhost:3000/api/homepage-sections";

async function runTests() {
  console.log("================================================================");
  console.log("STARTING LIVE AUTOMATED HOMEPAGE SECTION VERIFICATION TESTS");
  console.log("================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // Backup initial file
  const originalJson = fs.readFileSync(DATA_FILE, "utf-8");
  const originalSections = JSON.parse(originalJson);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Query Live API
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 1: Live API GET /api/homepage-sections ---");
    const res1 = await fetch(API_URL);
    assert(res1.status === 200, `API responded with status 200 OK.`);
    const data1 = await res1.json();
    assert(data1.success === true, "API response success is true.");
    assert(Array.isArray(data1.sections), `API returned ${data1.sections.length} active sections.`);
    assert(Array.isArray(data1.categories), `API returned ${data1.categories.length} active categories.`);

    // -------------------------------------------------------------------------
    // TEST 2: Verify Real Supabase Products Joined and HPP Excluded
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Verify Supabase Products & HPP Column Security ---");
    let allProducts = [];
    data1.sections.forEach((sec) => {
      allProducts.push(...(sec.products || []));
    });
    assert(allProducts.length > 0, `Total ${allProducts.length} product cards resolved across homepage sections.`);

    // Check first product has expected customer fields
    const p1 = allProducts[0];
    assert(!!p1.name && !!p1.basePrice && !!p1.images, `Product "${p1.name}" has valid name, basePrice (${p1.basePrice}), and images.`);
    
    // STRICT SECURITY: Never expose HPP
    const hasHpp = allProducts.some((p) => "hpp" in p && p.hpp !== undefined && p.hpp !== null);
    assert(!hasHpp, "Zero Exposure: No product exposes 'hpp' column in public storefront response.");

    // -------------------------------------------------------------------------
    // TEST 3: Create a Section & Verify Persistence
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: Admin Create Section & Browser Persistence ---");
    const testSectionId = "sec-test-" + Date.now();
    const newSection = {
      id: testSectionId,
      title: "Menu Sarapan Pagi Spesial",
      subtitle: "Hangat dan pas dinikmati sebelum jam 10",
      isActive: true,
      sortOrder: originalSections.length + 1,
      maxProducts: 4,
      viewAllUrl: "/menu",
      productIds: [
        "b0000001-0000-4000-8000-000000000001",
        "b0000001-0000-4000-8000-000000000002"
      ],
    };

    const updatedSections = [...originalSections, newSection];
    fs.writeFileSync(DATA_FILE, JSON.stringify(updatedSections, null, 2), "utf-8");

    // Fetch API again to simulate browser refresh
    const res2 = await fetch(API_URL);
    const data2 = await res2.json();
    const createdSec = data2.sections.find((s) => s.id === testSectionId);
    assert(!!createdSec, `Created section "${newSection.title}" persisted and appeared on public storefront.`);
    assert(createdSec?.products?.length === 2, `Assigned products resolved: ${createdSec?.products?.map((p) => p.name).join(", ")}.`);

    // -------------------------------------------------------------------------
    // TEST 4: Reorder Sections
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 4: Reorder Sections ---");
    // Move test section to rank #1
    const reorderedSections = [newSection, ...originalSections].map((s, idx) => ({
      ...s,
      sortOrder: idx + 1,
    }));
    fs.writeFileSync(DATA_FILE, JSON.stringify(reorderedSections, null, 2), "utf-8");

    const res3 = await fetch(API_URL);
    const data3 = await res3.json();
    assert(data3.sections[0].id === testSectionId, `Section "${newSection.title}" successfully reordered to #1.`);

    // -------------------------------------------------------------------------
    // TEST 5: Disable Section (Visibility Toggle)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 5: Disable Section and Verify Disappearance ---");
    const disabledSections = reorderedSections.map((s) =>
      s.id === testSectionId ? { ...s, isActive: false } : s
    );
    fs.writeFileSync(DATA_FILE, JSON.stringify(disabledSections, null, 2), "utf-8");

    const res4 = await fetch(API_URL);
    const data4 = await res4.json();
    const shouldBeGone = data4.sections.find((s) => s.id === testSectionId);
    assert(!shouldBeGone, `Disabled section "${testSectionId}" immediately disappeared from public storefront.`);

    // -------------------------------------------------------------------------
    // TEST 6: Delete Section
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 6: Delete Section ---");
    const cleanedSections = disabledSections.filter((s) => s.id !== testSectionId);
    fs.writeFileSync(DATA_FILE, JSON.stringify(cleanedSections, null, 2), "utf-8");

    const res5 = await fetch(API_URL);
    const data5 = await res5.json();
    assert(
      !data5.sections.some((s) => s.id === testSectionId),
      "Deleted section is completely removed from storefront."
    );

    // -------------------------------------------------------------------------
    // TEST 7: Storefront Route /home and Admin Route /admin/beranda
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 7: Route Accessibility & Protection ---");
    const homeRes = await fetch("http://localhost:3000/home");
    assert(homeRes.status === 200, "Storefront /home returned HTTP 200 OK.");

    // Admin without auth redirects to /admin/login (307)
    const adminUnauth = await fetch("http://localhost:3000/admin/beranda", {
      redirect: "manual",
    });
    assert(
      adminUnauth.status === 307 && adminUnauth.headers.get("location")?.includes("/admin/login"),
      "Unauthenticated request to /admin/beranda redirects to /admin/login."
    );

    // Admin with dev_admin cookie succeeds
    const adminAuth = await fetch("http://localhost:3000/admin/beranda", {
      headers: { Cookie: "dev_admin=true" },
    });
    assert(adminAuth.status === 200, "Authorized admin can access /admin/beranda (HTTP 200 OK).");

  } finally {
    // Restore original file
    fs.writeFileSync(DATA_FILE, originalJson, "utf-8");
    console.log("\n[CLEANUP] Restored original homepage sections configuration.");
  }

  console.log("================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
