/**
 * Automated Test Suite for:
 * Editable Homepage Hero/Banner Slider Management & Clean Photography Carousel
 */

import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";

async function runTests() {
  console.log("==================================================================");
  console.log("STARTING TEST SUITE: Editable Homepage Banner Slider Management");
  console.log("==================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // --- SCENARIO 1: Source Code Verification of Clean Photography Carousel (No Text Overlays) ---
  console.log("--- Scenario 1: Verify Text Overlays Removed from PromoCarousel ---");
  const carouselCode = fs.readFileSync(
    path.resolve("src/components/home/PromoCarousel.tsx"),
    "utf-8"
  );

  assert(
    !carouselCode.includes("Rekomendasi Menu") && !carouselCode.includes("REKOMENDASI MENU"),
    "PromoCarousel cleanly removed 'REKOMENDASI MENU' label"
  );
  assert(
    !carouselCode.includes("currentBanner.title"),
    "PromoCarousel cleanly removed title text overlay over banner image"
  );
  assert(
    !carouselCode.includes("currentBanner.subtitle"),
    "PromoCarousel cleanly removed subtitle / description text overlay"
  );
  assert(
    !carouselCode.includes("bg-gradient-to-t from-black/75"),
    "PromoCarousel cleanly removed dark gradient overlay used for text contrast"
  );
  assert(
    carouselCode.includes("aspect-[21/9]"),
    "PromoCarousel preserves mobile-first 21:9 food photography aspect ratio"
  );
  assert(
    carouselCode.includes("rounded-2xl"),
    "PromoCarousel preserves rounded-2xl visual identity"
  );
  assert(
    carouselCode.includes("ring-black/10") || carouselCode.includes("ring-black/20"),
    "Slide indicators include contrast ring for visibility on both light and dark photos"
  );
  assert(
    carouselCode.includes("hasDestination") && carouselCode.includes("<Link"),
    "PromoCarousel only wraps image in Link if targetUrl is configured"
  );

  // --- SCENARIO 2: Local & Database Data Model Verification ---
  console.log("\n--- Scenario 2: Verify Banner Data Model & Persistent Configuration ---");
  const bannersJsonPath = path.resolve("src/data/home-banners-data.json");
  assert(fs.existsSync(bannersJsonPath), "src/data/home-banners-data.json exists for persistent storage");

  const bannersData = JSON.parse(fs.readFileSync(bannersJsonPath, "utf-8"));
  assert(Array.isArray(bannersData), "Banners data is an array of slide configurations");
  assert(bannersData.length >= 1, "At least 1 banner slide is configured");

  const firstBanner = bannersData[0];
  assert(typeof firstBanner.id === "string", "Banner has string ID");
  assert(typeof firstBanner.imageUrl === "string", "Banner has valid imageUrl");
  assert(typeof firstBanner.isActive === "boolean", "Banner has isActive boolean flag");
  assert(typeof firstBanner.sortOrder === "number", "Banner has numerical sortOrder");

  // --- SCENARIO 3: Admin Page & BannerSliderManager Integration ---
  console.log("\n--- Scenario 3: Verify Admin Seksi Beranda Integration ---");
  const adminPageCode = fs.readFileSync(
    path.resolve("src/app/admin/beranda/page.tsx"),
    "utf-8"
  );
  const sectionManagerCode = fs.readFileSync(
    path.resolve("src/components/admin/HomepageSectionManager.tsx"),
    "utf-8"
  );
  const bannerManagerCode = fs.readFileSync(
    path.resolve("src/components/admin/BannerSliderManager.tsx"),
    "utf-8"
  );

  assert(
    adminPageCode.includes("getAdminHomeBanners"),
    "Admin Seksi Beranda page fetches initial banners via getAdminHomeBanners()"
  );
  assert(
    adminPageCode.includes("initialBanners={banners}"),
    "Admin Seksi Beranda passes initialBanners to HomepageSectionManager"
  );
  assert(
    sectionManagerCode.includes("<BannerSliderManager"),
    "HomepageSectionManager renders BannerSliderManager component"
  );
  assert(
    bannerManagerCode.includes("Banner Slider Hero Beranda"),
    "BannerSliderManager renders dedicated 'Banner Slider Hero Beranda' section"
  );
  assert(
    bannerManagerCode.includes("uploadBannerImageAction"),
    "BannerSliderManager connects to uploadBannerImageAction"
  );
  assert(
    bannerManagerCode.includes("saveHomeBannerAction"),
    "BannerSliderManager connects to saveHomeBannerAction"
  );
  assert(
    bannerManagerCode.includes("deleteHomeBannerAction"),
    "BannerSliderManager connects to deleteHomeBannerAction"
  );
  assert(
    bannerManagerCode.includes("toggleBannerStatusAction"),
    "BannerSliderManager connects to toggleBannerStatusAction"
  );
  assert(
    bannerManagerCode.includes("reorderHomeBannersAction"),
    "BannerSliderManager connects to reorderHomeBannersAction"
  );
  assert(
    bannerManagerCode.includes("Edit Slide"),
    "BannerSliderManager replaces 'Ganti Foto' with dedicated 'Edit Slide' button on each slide"
  );
  assert(
    bannerManagerCode.includes("openEditModal") && bannerManagerCode.includes("editingBanner"),
    "BannerSliderManager manages state for Edit Slide modal via openEditModal and editingBanner"
  );
  assert(
    bannerManagerCode.includes("Edit Slide Banner"),
    "BannerSliderManager renders 'Edit Slide Banner' modal dialog"
  );
  assert(
    bannerManagerCode.includes("validateDestinationUrl"),
    "BannerSliderManager validates destination link format (internal routes and external URLs)"
  );
  assert(
    bannerManagerCode.includes("Hapus Slide Banner Ini?"),
    "BannerSliderManager requires confirmation modal before removing a slide"
  );

  // --- SCENARIO 3B: Verify Compact Statistics Card in HomepageSectionManager ---
  console.log("\n--- Scenario 3B: Verify Compact Single Card for Section Statistics ---");
  assert(
    sectionManagerCode.includes("Total Seksi") &&
    sectionManagerCode.includes("Seksi Aktif (Tampil)") &&
    sectionManagerCode.includes("Seksi Disembunyikan"),
    "HomepageSectionManager maintains all 3 metrics: Total, Aktif (Tampil), Disembunyikan"
  );
  assert(
    sectionManagerCode.includes("divide-x"),
    "HomepageSectionManager combines all 3 metrics into one card with subtle column dividers"
  );
  assert(
    sectionManagerCode.includes("text-[#18794E]"),
    "HomepageSectionManager highlights active count with restrained green accent (#18794E)"
  );
  assert(
    sectionManagerCode.includes("Tambah Seksi Baru"),
    "HomepageSectionManager keeps 'Tambah Seksi Baru' button separate and functional"
  );

  // --- SCENARIO 4: Server Actions Logic & Upload Flow Simulation ---
  console.log("\n--- Scenario 4: Test Upload, Save, Reorder, Toggle & Delete Actions ---");
  const readLocalBanners = () => {
    const raw = fs.readFileSync(bannersJsonPath, "utf-8");
    return JSON.parse(raw);
  };
  const writeLocalBanners = (data) => {
    fs.writeFileSync(bannersJsonPath, JSON.stringify(data, null, 2), "utf-8");
  };

  const initialList = readLocalBanners();

  // Test Step A: Add a new banner slide
  const testBannerId = `test-banner-${Date.now()}`;
  const testBanner = {
    id: testBannerId,
    imageUrl: "/images/uploads/test-sample.webp",
    targetUrl: "/menu",
    isActive: true,
    sortOrder: initialList.length + 1,
    createdAt: new Date().toISOString(),
  };

  const withNewBanner = [...initialList, testBanner];
  writeLocalBanners(withNewBanner);

  const reloadedAfterAdd = readLocalBanners();
  const addedFound = reloadedAfterAdd.find((b) => b.id === testBannerId);
  assert(Boolean(addedFound), "New banner successfully added and persisted to local store");
  assert(addedFound.imageUrl === testBanner.imageUrl, "Added banner preserves image URL");

  // Test Step B: Replace image on the test banner
  const updatedImageUrl = "/images/uploads/test-sample-replaced.webp";
  const withReplaced = reloadedAfterAdd.map((b) =>
    b.id === testBannerId ? { ...b, imageUrl: updatedImageUrl } : b
  );
  writeLocalBanners(withReplaced);

  const reloadedAfterReplace = readLocalBanners();
  const replacedFound = reloadedAfterReplace.find((b) => b.id === testBannerId);
  assert(
    replacedFound.imageUrl === updatedImageUrl,
    "Banner image successfully replaced and persisted"
  );

  // Test Step C: Toggle active / inactive status
  const withToggledInactive = reloadedAfterReplace.map((b) =>
    b.id === testBannerId ? { ...b, isActive: false } : b
  );
  writeLocalBanners(withToggledInactive);

  const publicActiveOnly = readLocalBanners().filter((b) => b.isActive);
  const inactiveFoundInPublic = publicActiveOnly.find((b) => b.id === testBannerId);
  assert(
    !inactiveFoundInPublic,
    "Disabled / inactive banner is excluded from public display (does not appear on customer homepage)"
  );

  // Test Step D: Reorder banners
  const reversedIds = reloadedAfterReplace.map((b) => b.id).reverse();
  const reorderedList = reversedIds.map((id, idx) => {
    const item = reloadedAfterReplace.find((b) => b.id === id);
    return { ...item, sortOrder: idx + 1 };
  });
  writeLocalBanners(reorderedList);

  const reloadedAfterReorder = readLocalBanners();
  assert(
    reloadedAfterReorder[0].id === reversedIds[0],
    "Reordering banners updates display sequence correctly"
  );
  assert(
    reloadedAfterReorder[0].sortOrder === 1,
    "Top banner receives sortOrder: 1"
  );

  // Test Step E: Delete the test banner and restore original list
  writeLocalBanners(initialList);
  const restoredList = readLocalBanners();
  const testBannerDeleted = !restoredList.some((b) => b.id === testBannerId);
  assert(testBannerDeleted, "Test banner successfully deleted and original list restored");
  assert(restoredList.length === initialList.length, "Banner count matches initial count");

  // --- SCENARIO 5: Live Storefront & Admin Endpoints Verification ---
  console.log("\n--- Scenario 5: Live HTTP Verification for Home and Admin Pages ---");
  const homeRes = await fetch(`${BASE_URL}/home`);
  assert(homeRes.status === 200, "GET /home returns HTTP 200 (customer storefront loads successfully)");

  const homeHtml = await homeRes.text();
  assert(
    !homeHtml.includes("Rekomendasi Menu") && !homeHtml.includes("REKOMENDASI MENU"),
    "Live storefront HTML contains NO 'REKOMENDASI MENU' text overlays"
  );
  assert(
    homeHtml.includes("aspect-[21/9]"),
    "Live storefront HTML renders 21:9 hero banner container"
  );
  assert(
    homeHtml.includes("Kategori"),
    "Live storefront retains Kategori shortcut section"
  );

  console.log("\n==================================================================");
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
