/**
 * Verification Script: Unified Informasi Kontak Toko Settings & Contact Drawer
 */

const BASE_URL = "http://localhost:3000";

async function run() {
  console.log("=== Testing Unified Contact Settings & Drawer ===");

  // 1. Fetch current settings
  const res1 = await fetch(`${BASE_URL}/api/store-settings`);
  const json1 = await res1.json();
  console.log("1. Initial settings response:", json1.success, "WA:", json1.settings.adminWhatsapp, "IG:", json1.settings.instagramUrl);
  if (!json1.success) throw new Error("Failed to fetch initial settings");

  // 2. Test Invalid Instagram URL (Non-instagram domain)
  const badRes1 = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...json1.settings, instagramUrl: "https://facebook.com/nook" }),
  });
  const badJson1 = await badRes1.json();
  console.log("2. Reject facebook domain:", badRes1.status === 400, "Error:", badJson1.error);
  if (badRes1.status !== 400 || !badJson1.error.includes("instagram.com")) {
    throw new Error("Failed to reject invalid domain");
  }

  // 3. Test Invalid Instagram URL (Missing username)
  const badRes2 = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...json1.settings, instagramUrl: "https://www.instagram.com/" }),
  });
  const badJson2 = await badRes2.json();
  console.log("3. Reject missing username:", badRes2.status === 400, "Error:", badJson2.error);
  if (badRes2.status !== 400) {
    throw new Error("Failed to reject missing username");
  }

  // 4. Test Valid Instagram URL saving
  const goodRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...json1.settings, instagramUrl: "https://instagram.com/nookbyjina" }),
  });
  const goodJson = await goodRes.json();
  console.log("4. Save valid Instagram:", goodJson.success, "Saved IG:", goodJson.settings.instagramUrl);
  if (!goodJson.success || goodJson.settings.instagramUrl !== "https://www.instagram.com/nookbyjina/") {
    throw new Error("Failed to save and normalize Instagram URL");
  }

  // 5. Verify persistence via fresh GET
  const verifyRes = await fetch(`${BASE_URL}/api/store-settings`);
  const verifyJson = await verifyRes.json();
  console.log("5. Verified persistence:", verifyJson.settings.instagramUrl === "https://www.instagram.com/nookbyjina/");
  if (verifyJson.settings.instagramUrl !== "https://www.instagram.com/nookbyjina/") {
    throw new Error("Settings did not persist");
  }

  // 6. Test Empty Instagram URL saving (unconfigured state)
  const emptyRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...json1.settings, instagramUrl: "" }),
  });
  const emptyJson = await emptyRes.json();
  console.log("6. Save empty Instagram:", emptyJson.success, "Saved IG:", `"${emptyJson.settings.instagramUrl}"`);
  if (!emptyJson.success || emptyJson.settings.instagramUrl !== "") {
    throw new Error("Failed to save empty Instagram URL");
  }

  // 7. Verify empty persistence
  const verifyEmptyRes = await fetch(`${BASE_URL}/api/store-settings`);
  const verifyEmptyJson = await verifyEmptyRes.json();
  console.log("7. Verified empty persistence:", verifyEmptyJson.settings.instagramUrl === "");
  if (verifyEmptyJson.settings.instagramUrl !== "") {
    throw new Error("Empty Instagram URL did not persist");
  }

  // 8. Verify Admin UI source contains "Informasi Kontak Toko", WA and IG sections
  const settingsManagerCode = (await import("node:fs")).readFileSync(
    "src/components/admin/SettingsManager.tsx",
    "utf8"
  );
  const hasUnifiedTitle = settingsManagerCode.includes("Informasi Kontak Toko");
  const hasWaSection = settingsManagerCode.includes("WhatsApp Toko");
  const hasIgSection = settingsManagerCode.includes("Instagram Toko");
  console.log("8. Admin UI Verification -> Title:", hasUnifiedTitle, "WA Section:", hasWaSection, "IG Section:", hasIgSection);
  if (!hasUnifiedTitle || !hasWaSection || !hasIgSection) {
    throw new Error("Admin UI missing unified card or sections");
  }

  // 9. Verify Customer drawer HTML in /home
  const homeRes = await fetch(`${BASE_URL}/home`);
  const homeHtml = await homeRes.text();
  const hasDrawer = homeHtml.includes("contact-menu-popup");
  const hasWaLink = homeHtml.includes("https://wa.me/6282273180000");
  const noEnvPlaceholder = !homeHtml.includes("NEXT_PUBLIC_INSTAGRAM_URL");
  console.log("9. Home UI Verification -> Drawer:", hasDrawer, "WA Link:", hasWaLink, "No ENV code tag:", noEnvPlaceholder);
  if (!hasDrawer || !hasWaLink || !noEnvPlaceholder) {
    throw new Error("Home UI drawer verification failed");
  }

  console.log("\nALL VERIFICATIONS PASSED SUCCESSFULLY!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
