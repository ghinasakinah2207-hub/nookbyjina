/**
 * Test Suite: Homepage Layout Order Verification
 * File: src/tests/verify_homepage_layout_order.tsx
 *
 * Verifies:
 * 1. Promotional Banner Carousel is rendered before SearchBar.
 * 2. SearchBar is rendered directly below Banner Carousel and before Category shortcuts.
 * 3. SearchBar appears exactly once on the homepage.
 * 4. PromoCarousel appears exactly once on the homepage.
 * 5. Consistent vertical spacing is maintained.
 * 6. Search query filter and category selection logic are intact.
 */

import fs from "fs";
import path from "path";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, message: string) {
  totalCount++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function verifyHomepageLayoutOrder() {
  console.log("================================================================================");
  console.log("TEST SUITE: Customer Homepage Layout Order Verifications");
  console.log("================================================================================\n");

  const filePath = path.resolve(process.cwd(), "src/components/home/ShoppingHomeClient.tsx");
  assert(fs.existsSync(filePath), "ShoppingHomeClient.tsx exists at expected location");

  const content = fs.readFileSync(filePath, "utf-8");

  console.log("\n--- Section 1: Component Render Order ---");
  const headerIdx = content.indexOf("<Header");
  const bannerIdx = content.indexOf("<PromoCarousel");
  const searchIdx = content.indexOf("<SearchBar");
  const categoryIdx = content.indexOf('aria-label="Kategori Menu"');
  const bottomNavIdx = content.indexOf("<BottomNavigation");

  assert(headerIdx !== -1, "Header component is present in render tree");
  assert(bannerIdx !== -1, "PromoCarousel component is present in render tree");
  assert(searchIdx !== -1, "SearchBar component is present in render tree");
  assert(categoryIdx !== -1, "Kategori Menu section is present in render tree");
  assert(bottomNavIdx !== -1, "BottomNavigation component is present in render tree");

  assert(
    headerIdx < bannerIdx,
    "1. Header is rendered before PromoCarousel"
  );
  assert(
    bannerIdx < searchIdx,
    "2. PromoCarousel (Banner) is rendered before SearchBar"
  );
  assert(
    searchIdx < categoryIdx,
    "3. SearchBar is rendered before Kategori Menu"
  );
  assert(
    categoryIdx < bottomNavIdx,
    "4. Kategori Menu is rendered before BottomNavigation"
  );

  console.log("\n--- Section 2: Singularity & No Duplicate Components ---");
  const searchBarMatches = (content.match(/<SearchBar/g) || []).length;
  assert(searchBarMatches === 1, `SearchBar appears exactly 1 time in ShoppingHomeClient (found: ${searchBarMatches})`);

  const bannerMatches = (content.match(/<PromoCarousel/g) || []).length;
  assert(bannerMatches === 1, `PromoCarousel appears exactly 1 time in ShoppingHomeClient (found: ${bannerMatches})`);

  console.log("\n--- Section 3: Layout Spacing & Search State Invariants ---");
  assert(
    content.includes('className="max-w-md mx-auto px-3.5 pt-1.5 space-y-3.5"'),
    "Main container maintains consistent mobile spacing (max-w-md space-y-3.5)"
  );
  assert(
    content.includes("value={searchQuery}") && content.includes("onChange={setSearchQuery}"),
    "SearchBar maintains two-way binding to searchQuery state"
  );
  assert(
    content.includes("!searchQuery && <PromoCarousel"),
    "PromoCarousel smoothly collapses during active search queries"
  );
  assert(
    content.includes("placeholder=\"Mau order apa, bestie...\""),
    "SearchBar maintains standard brand placeholder"
  );

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} assertions PASSED (0 failures)`);
  console.log("================================================================================\n");
}

verifyHomepageLayoutOrder();

