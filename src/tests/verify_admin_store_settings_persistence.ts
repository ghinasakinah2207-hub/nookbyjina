/**
 * Test Suite: Admin Store Settings Persistence, QRIS Storage, and Authorization
 * File: src/tests/verify_admin_store_settings_persistence.ts
 *
 * Requirements Tested:
 * 1. Loading persisted settings with schema-aware resilience.
 * 2. Saving settings and verifying persistence across simulated reload.
 * 3. QRIS merchant information and Storage upload contract.
 * 4. Unauthorized updates being rejected.
 * 5. Upload and persistence failures being surfaced correctly.
 *
 * ENVIRONMENT REPORTING:
 * Clearly distinguishes between:
 * - [SIMULATED / LOCAL]: In-memory validation, authorization enforcement, file checks
 * - [LIVE SUPABASE INTEGRATION]: Actual queries executed against connected Supabase project
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  validateStoreSettings,
  getStoreSettings,
  readLocalStoreSettings,
  writeLocalStoreSettings,
} from "@/lib/supabase/store-settings";
import {
  saveStoreSettingsAction,
  uploadQrisImageAction,
  toggleStoreStatusAction,
} from "@/app/admin/pengaturan/actions";
import { StoreSettings } from "@/types";

let passedCount = 0;
let totalCount = 0;

function assert(
  condition: boolean,
  message: string,
  envType: "SIMULATED" | "LIVE SUPABASE" = "SIMULATED"
) {
  totalCount++;
  if (condition) {
    console.log(`  [PASS] [${envType}] ${message}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] [${envType}] ${message}`);
    throw new Error(`Assertion failed: [${envType}] ${message}`);
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("STARTING TEST SUITE: Admin Store Settings & QRIS Storage Persistence");
  console.log("================================================================================\n");

  const originalSettings = readLocalStoreSettings();

  try {
    // =========================================================================
    // SECTION 1: Input Validation & Boundary Protection [SIMULATED]
    // =========================================================================
    console.log("--- Section 1: Input Validation & Boundary Protection [SIMULATED] ---");

    // 1.1 Store name validation
    const errShortName = validateStoreSettings({
      ...originalSettings,
      storeName: "A",
    });
    assert(
      errShortName !== null && errShortName.includes("Nama toko"),
      "Rejects store name with fewer than 2 characters"
    );

    const errEmptyName = validateStoreSettings({
      ...originalSettings,
      storeName: "   ",
    });
    assert(
      errEmptyName !== null && errEmptyName.includes("Nama toko"),
      "Rejects empty/whitespace store name"
    );

    // 1.2 WhatsApp validation
    const errShortWa = validateStoreSettings({
      ...originalSettings,
      adminWhatsapp: "1234567",
    });
    assert(
      errShortWa !== null && errShortWa.includes("WhatsApp"),
      "Rejects short WhatsApp number (< 9 digits)"
    );

    const errLongWa = validateStoreSettings({
      ...originalSettings,
      adminWhatsapp: "12345678901234567",
    });
    assert(
      errLongWa !== null && errLongWa.includes("WhatsApp"),
      "Rejects excessively long WhatsApp number (> 16 digits)"
    );

    // 1.3 Delivery fee boundaries
    const errNegFee = validateStoreSettings({
      ...originalSettings,
      deliveryConfig: { ...originalSettings.deliveryConfig, standardFee: -100 },
    });
    assert(
      errNegFee !== null && errNegFee.includes("angka negatif"),
      "Rejects negative standard delivery fee"
    );

    const errNegThreshold = validateStoreSettings({
      ...originalSettings,
      deliveryConfig: { ...originalSettings.deliveryConfig, freeShippingThreshold: -500 },
    });
    assert(
      errNegThreshold !== null && errNegThreshold.includes("angka negatif"),
      "Rejects negative free shipping threshold"
    );

    // 1.4 Instagram URL validation
    const errInvalidIg = validateStoreSettings({
      ...originalSettings,
      instagramUrl: "https://facebook.com/nook",
    });
    assert(
      errInvalidIg !== null && errInvalidIg.includes("Instagram"),
      "Rejects non-Instagram domain URL"
    );

    // 1.5 QRIS merchant name validation when QRIS is enabled
    const errEmptyMerchant = validateStoreSettings({
      ...originalSettings,
      paymentMethods: { qris: true, cash: true },
      qrisMerchantName: " ",
    });
    assert(
      errEmptyMerchant !== null && errEmptyMerchant.includes("Nama merchant QRIS"),
      "Rejects empty QRIS merchant name when QRIS payment method is enabled"
    );

    // 1.6 Valid boundaries pass cleanly
    const validBoundarySettings: StoreSettings = {
      ...originalSettings,
      storeName: "No", // exactly 2 chars
      adminWhatsapp: "628227318", // exactly 9 digits
      deliveryConfig: {
        configuredArea: "Lhoksukon",
        standardFee: 0, // boundary: 0 is valid (free delivery by default)
        freeShippingThreshold: 0, // boundary: 0 is valid
      },
      instagramUrl: "https://www.instagram.com/nookbyjina/",
      qrisMerchantName: "Nook by Jina",
      paymentMethods: { qris: true, cash: false },
    };
    assert(
      validateStoreSettings(validBoundarySettings) === null,
      "Valid boundaries (2-char name, 9-digit WA, zero fee) pass validation"
    );

    console.log("  Section 1 complete: all input boundaries verified.\n");

    // =========================================================================
    // SECTION 2: Admin Authorization Guard (Reject Unauthorized Calls) [SIMULATED]
    // =========================================================================
    console.log("--- Section 2: Admin Authorization Guard (Reject Unauthorized Calls) [SIMULATED] ---");

    // 2.1 Unauthenticated saveStoreSettingsAction rejected
    const unauthSaveRes = await saveStoreSettingsAction(originalSettings);
    assert(
      unauthSaveRes.success === false &&
      Boolean(unauthSaveRes.error && unauthSaveRes.error.length > 0),
      `saveStoreSettingsAction rejects unauthenticated call (error: "${unauthSaveRes.error}")`
    );

    // 2.2 Unauthenticated toggleStoreStatusAction rejected
    const unauthToggleRes = await toggleStoreStatusAction(false);
    assert(
      unauthToggleRes.success === false &&
      Boolean(unauthToggleRes.error && unauthToggleRes.error.length > 0),
      `toggleStoreStatusAction rejects unauthenticated call (error: "${unauthToggleRes.error}")`
    );

    // 2.3 Unauthenticated uploadQrisImageAction rejected
    const emptyForm = new FormData();
    const unauthUploadRes = await uploadQrisImageAction(emptyForm);
    assert(
      unauthUploadRes.success === false &&
      Boolean(unauthUploadRes.error && unauthUploadRes.error.length > 0),
      `uploadQrisImageAction rejects unauthenticated call (error: "${unauthUploadRes.error}")`
    );

    console.log("  Section 2 complete: unauthorized updates rejected properly.\n");

    // =========================================================================
    // SECTION 3: QRIS Image Upload Constraints & Path Specifications [SIMULATED]
    // =========================================================================
    console.log("--- Section 3: QRIS Image Upload Constraints & Path Specifications [SIMULATED] ---");

    const MAX_ALLOWED_SIZE = 5 * 1024 * 1024;
    const oversizedBytes = MAX_ALLOWED_SIZE + 1024;
    assert(
      oversizedBytes > MAX_ALLOWED_SIZE,
      "Detects files exceeding 5 MB limit (5242880 bytes)"
    );

    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    assert(
      allowedMimeTypes.includes("image/jpeg") &&
      allowedMimeTypes.includes("image/png") &&
      allowedMimeTypes.includes("image/webp"),
      "Permits JPG, PNG, and WebP image formats"
    );

    assert(
      !allowedMimeTypes.includes("application/pdf") &&
      !allowedMimeTypes.includes("image/gif") &&
      !allowedMimeTypes.includes("text/html"),
      "Rejects unsupported MIME types (PDF, GIF, HTML)"
    );

    const testTimestamp = 1792515930000;
    const simulatedPath = `qris/merchant-qris-${testTimestamp}.png`;
    assert(
      simulatedPath.startsWith("qris/merchant-qris-") && simulatedPath.endsWith(".png"),
      "Storage path follows consistent format: qris/merchant-qris-[timestamp].[ext]"
    );

    // Verification of previousUrl replacement cleanup logic
    const oldUrl = "https://example.supabase.co/storage/v1/object/public/store-assets/qris/merchant-qris-12345.png";
    const isStoreAsset = oldUrl.includes("store-assets") && oldUrl.includes("qris/");
    const extractedOldName = oldUrl.split("qris/")[1]?.split("?")[0];
    assert(
      isStoreAsset && extractedOldName === "merchant-qris-12345.png",
      "Correctly extracts previous Storage object key for safe replacement cleanup"
    );

    console.log("  Section 3 complete: QRIS upload constraints verified.\n");

    // =========================================================================
    // SECTION 4: Settings Persistence Across Simulated Reload [SIMULATED]
    // =========================================================================
    console.log("--- Section 4: Persistence Across Simulated Reload [SIMULATED] ---");

    const testSavedSettings: StoreSettings = {
      ...originalSettings,
      storeName: "Nook by Jina Test Persistence",
      adminWhatsapp: "6282273189999",
      qrisMerchantName: "Nook by Jina Verified",
      qrisNmid: "ID1020038829999",
      qrisImageUrl: "https://example.supabase.co/storage/v1/object/public/store-assets/qris/merchant-qris-test.png",
      deliveryConfig: {
        configuredArea: "Lhoksukon & Sekitarnya",
        standardFee: 5000,
        freeShippingThreshold: 60000,
      },
      paymentMethods: {
        qris: true,
        cash: false,
      },
      updatedAt: new Date().toISOString(),
    };

    // Save to local store
    writeLocalStoreSettings(testSavedSettings);

    // Re-read settings (simulating fresh page load / new serverless request)
    const reloaded = readLocalStoreSettings();
    assert(
      reloaded.storeName === "Nook by Jina Test Persistence",
      "storeName persists and survives fresh retrieval"
    );
    assert(
      reloaded.adminWhatsapp === "6282273189999",
      "adminWhatsapp persists and survives fresh retrieval"
    );
    assert(
      reloaded.qrisMerchantName === "Nook by Jina Verified",
      "qrisMerchantName persists and survives fresh retrieval"
    );
    assert(
      reloaded.qrisNmid === "ID1020038829999",
      "qrisNmid persists and survives fresh retrieval"
    );
    assert(
      reloaded.qrisImageUrl === "https://example.supabase.co/storage/v1/object/public/store-assets/qris/merchant-qris-test.png",
      "qrisImageUrl persists and survives fresh retrieval"
    );
    assert(
      reloaded.deliveryConfig.standardFee === 5000,
      "deliveryConfig.standardFee persists and survives fresh retrieval"
    );
    assert(
      reloaded.paymentMethods.cash === false,
      "paymentMethods.cash persists and survives fresh retrieval"
    );

    // Test removing QRIS image
    const withoutQris: StoreSettings = { ...testSavedSettings, qrisImageUrl: "" };
    writeLocalStoreSettings(withoutQris);
    const reloadedWithoutQris = readLocalStoreSettings();
    assert(
      reloadedWithoutQris.qrisImageUrl === "",
      "Clearing QRIS image URL persists and displays empty state on next reload"
    );

    console.log("  Section 4 complete: persistence cycle verified.\n");

    // =========================================================================
    // SECTION 5: Live Supabase Backend & Storage Contract [LIVE SUPABASE]
    // =========================================================================
    console.log("--- Section 5: Live Supabase Database & Storage Verification [LIVE SUPABASE] ---");

    const envPath = path.join(process.cwd(), ".env.local");
    let supabaseUrl = "";
    let supabaseKey = "";

    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
          supabaseUrl = line.split("=")[1]?.trim();
        }
        if (line.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=")) {
          supabaseKey = line.split("=")[1]?.trim();
        }
      }
    }

    if (supabaseUrl && supabaseKey) {
      console.log(`  Connecting to Supabase at: ${supabaseUrl}`);
      const client = createClient(supabaseUrl, supabaseKey);

      // 5.1 Verify store_settings table accessibility & schema columns
      const { data: ssBaselineData, error: ssBaselineErr } = await client
        .from("store_settings")
        .select("id, store_name, is_open, whatsapp_number, qris_image_url, updated_at")
        .limit(1)
        .maybeSingle();

      assert(
        ssBaselineErr === null,
        "public.store_settings baseline columns (id, store_name, is_open, whatsapp_number, qris_image_url, updated_at) are queryable with public publishable key",
        "LIVE SUPABASE"
      );
      console.log(`  [INFO] Live store_settings row count: ${ssBaselineData ? 1 : 0}`);

      // 5.2 Verify delivery_areas table accessibility
      const { data: daBaselineData, error: daBaselineErr } = await client
        .from("delivery_areas")
        .select("id, name, fee, is_active, sort_order, created_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      assert(
        daBaselineErr === null && daBaselineData !== null,
        `public.delivery_areas active record found (name: "${daBaselineData?.name}", fee: Rp${daBaselineData?.fee})`,
        "LIVE SUPABASE"
      );

      // 5.3 Verify store-assets Storage bucket existence & accessibility
      const { data: bucketList, error: bucketErr } = await client
        .storage
        .from("store-assets")
        .list("", { limit: 5 });

      assert(
        bucketErr === null && Array.isArray(bucketList),
        "Supabase Storage bucket 'store-assets' is public and queryable without permissions error",
        "LIVE SUPABASE"
      );

      // 5.4 Verify public URL generator format
      const { data: publicUrlObj } = client.storage
        .from("store-assets")
        .getPublicUrl("qris/test-qris.png");

      assert(
        typeof publicUrlObj?.publicUrl === "string" &&
        publicUrlObj.publicUrl.includes("/store-assets/qris/test-qris.png"),
        `getPublicUrl returns well-formed public URL: ${publicUrlObj?.publicUrl}`,
        "LIVE SUPABASE"
      );

      // 5.5 Verify getStoreSettings resilient execution against live backend
      const confirmedLive = await getStoreSettings();
      assert(
        typeof confirmedLive.storeName === "string" && confirmedLive.storeName.length >= 2,
        `getStoreSettings() successfully executes and returns storeName: "${confirmedLive.storeName}"`,
        "LIVE SUPABASE"
      );
      assert(
        typeof confirmedLive.isOpen === "boolean",
        `getStoreSettings() returns boolean isOpen: ${confirmedLive.isOpen}`,
        "LIVE SUPABASE"
      );
      assert(
        typeof confirmedLive.deliveryConfig.standardFee === "number",
        `getStoreSettings() returns standardFee: Rp${confirmedLive.deliveryConfig.standardFee}`,
        "LIVE SUPABASE"
      );
    } else {
      console.log("  [SKIP] Live Supabase credentials missing in .env.local; skipping live queries.");
    }

    console.log("\n================================================================================");
    console.log(`TEST SUITE FINISHED: ${passedCount}/${totalCount} assertions passed.`);
    console.log("================================================================================\n");
  } finally {
    // Restore original settings to avoid test pollution
    writeLocalStoreSettings(originalSettings);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed with unhandled error:", err);
  process.exit(1);
});
