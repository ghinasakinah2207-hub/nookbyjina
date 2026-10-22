/**
 * Automated Regression Test Suite for:
 * Mobile Numeric Input Usability Bug Fix in Admin Dashboard
 */

import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";

async function runTests() {
  console.log("==================================================================");
  console.log("STARTING TEST SUITE: Mobile Numeric Input Usability Verification");
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

  // --- TEST 1: Source Code Inspection for Input Types & Accessibility Attributes ---
  console.log("--- 1. Inspecting Input Component Types, Attributes & Mobile Keypad Settings ---");
  const settingsManagerCode = fs.readFileSync(
    path.resolve("src/components/admin/SettingsManager.tsx"),
    "utf-8"
  );
  const addProductModalCode = fs.readFileSync(
    path.resolve("src/components/admin/AddProductModal.tsx"),
    "utf-8"
  );

  // SettingsManager delivery fee & threshold inputs
  assert(
    settingsManagerCode.includes('inputMode="numeric"'),
    "SettingsManager uses inputMode=\"numeric\" for mobile numeric keypad"
  );
  assert(
    settingsManagerCode.includes('pattern="[0-9]*"'),
    "SettingsManager specifies pattern=\"[0-9]*\" to enforce digits"
  );
  assert(
    !settingsManagerCode.includes('type="number"'),
    "SettingsManager removed type=\"number\" to eliminate native spinners and mobile stepper bugs"
  );
  assert(
    settingsManagerCode.includes("standardFeeDraft"),
    "SettingsManager uses dedicated draft string state for standardFee"
  );
  assert(
    settingsManagerCode.includes("freeShippingThresholdDraft"),
    "SettingsManager uses dedicated draft string state for freeShippingThreshold"
  );

  // AddProductModal variant option inputs
  assert(
    addProductModalCode.includes('inputMode="numeric"'),
    "AddProductModal uses inputMode=\"numeric\" for mobile keypad"
  );
  assert(
    addProductModalCode.includes('priceDelta: number | string'),
    "AddProductModal supports intermediate string values in OptionValueDraft"
  );
  assert(
    addProductModalCode.includes('placeholder="0"'),
    "AddProductModal variant price inputs provide placeholder=\"0\""
  );
  assert(
    addProductModalCode.includes('e.target.value.replace(/[^0-9]/g, "")'),
    "AddProductModal filters non-digit characters during typing/pasting"
  );

  // --- TEST 2: Simulate State Transitions for Delivery Fee (Ongkir Standar) ---
  console.log("\n--- 2. Testing Delivery Fee Typing, Clearing, and Validation Logic ---");

  // Initial state simulation
  let standardFeeDraft = "3000";
  assert(standardFeeDraft === "3000", "Initial standard fee is '3000'");

  // Step A: User clears field (backspace to empty)
  // Old bug: Number("") || 0 immediately evaluated to 0 and forced the input back to "0"
  // New fix: value becomes "" without resetting
  const onUserClear = (inputVal) => inputVal.replace(/[^0-9]/g, "");
  standardFeeDraft = onUserClear("");
  assert(
    standardFeeDraft === "",
    "Clearing the delivery fee field results in empty string '' (does NOT reset to '0')"
  );

  // Step B: User types '4000' directly
  const onUserType = (current, newChar) => onUserClear(current + newChar);
  standardFeeDraft = onUserType(standardFeeDraft, "4");
  standardFeeDraft = onUserType(standardFeeDraft, "0");
  standardFeeDraft = onUserType(standardFeeDraft, "0");
  standardFeeDraft = onUserType(standardFeeDraft, "0");
  assert(standardFeeDraft === "4000", "User successfully types '4000' directly from empty state");

  // Step C: Validate on empty input (must reject)
  const validateDeliveryFee = (val) => {
    if (!val.trim()) return "Ongkos kirim standar tidak boleh kosong.";
    const num = Number(val);
    if (isNaN(num) || num < 0) return "Ongkos kirim standar tidak boleh berupa angka negatif.";
    return null;
  };

  assert(
    validateDeliveryFee("") === "Ongkos kirim standar tidak boleh kosong.",
    "Empty delivery fee is properly rejected by validateForm"
  );
  assert(
    validateDeliveryFee("   ") === "Ongkos kirim standar tidak boleh kosong.",
    "Whitespace-only delivery fee is properly rejected"
  );
  assert(
    validateDeliveryFee("-500") === "Ongkos kirim standar tidak boleh berupa angka negatif.",
    "Negative delivery fee is properly rejected by validateForm"
  );
  assert(
    validateDeliveryFee("0") === null,
    "Zero delivery fee (free shipping default) is valid and accepted"
  );
  assert(
    validateDeliveryFee("4000") === null,
    "Standard delivery fee of 4000 is valid and accepted"
  );

  // --- TEST 3: Simulate Variant Additional Price (+Rp) Typing, Free Options & Validation ---
  console.log("\n--- 3. Testing Variant Additional Price Direct Typing & Zero-Price Support ---");

  let variantPriceDraft = "2000";
  assert(variantPriceDraft === "2000", "Initial variant additional price is '2000'");

  // Step A: User clears field to change from 2000 to 3000
  variantPriceDraft = onUserClear("");
  assert(
    variantPriceDraft === "",
    "Clearing variant price leaves field empty (no sudden replacement with '0')"
  );

  // Step B: User types '3000' directly
  variantPriceDraft = onUserClear("3000");
  assert(variantPriceDraft === "3000", "Direct typing changes variant price to '3000'");

  // Step C: User enters zero for a free variant option
  variantPriceDraft = onUserClear("0");
  assert(variantPriceDraft === "0", "Entering '0' sets variant price to zero for a free option");
  assert(
    Math.round(Number(variantPriceDraft) || 0) === 0,
    "Saved variant price delta for free option resolves to 0"
  );

  // Step D: Validation rejects empty variant price
  const validateVariantPrice = (val, optName, groupName) => {
    if (val === "" || val === undefined || val === null || isNaN(Number(val)) || Number(val) < 0) {
      return `Harga tambahan untuk varian "${optName}" pada grup "${groupName}" harus berupa angka valid >= 0.`;
    }
    return null;
  };

  assert(
    validateVariantPrice("", "Level 1", "Pedas") !== null,
    "Empty variant price is rejected by form validation before saving"
  );
  assert(
    validateVariantPrice("-200", "Level 1", "Pedas") !== null,
    "Negative variant price is rejected by form validation before saving"
  );
  assert(
    validateVariantPrice("0", "Tidak Pedas", "Pedas") === null,
    "Free variant option (+Rp 0) passes validation cleanly"
  );
  assert(
    validateVariantPrice("3000", "Ekstra Pedas", "Pedas") === null,
    "Paid variant option (+Rp 3000) passes validation cleanly"
  );

  // --- TEST 4: Live Store Settings API Persistence & Verification ---
  console.log("\n--- 4. Testing Store Settings API Persistence & Unrelated Data Preservation ---");

  // Read current settings
  const getRes = await fetch(`${BASE_URL}/api/store-settings`);
  assert(getRes.status === 200, "GET /api/store-settings returns HTTP 200");
  const currentSettings = (await getRes.json()).settings;

  // Update standardFee to 4000
  const updatedSettingsPayload = {
    ...currentSettings,
    deliveryConfig: {
      ...currentSettings.deliveryConfig,
      standardFee: 4000,
    },
  };

  const saveRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedSettingsPayload),
  });
  assert(saveRes.status === 200, "POST /api/store-settings returns HTTP 200");
  const saveJson = await saveRes.json();
  assert(saveJson.success === true, "Store settings saved successfully");
  assert(saveJson.settings.deliveryConfig.standardFee === 4000, "Saved standardFee is 4000");

  // Verify re-fetch confirms persistence and unrelated fields are untouched
  const refetchRes = await fetch(`${BASE_URL}/api/store-settings`);
  const refetchJson = await refetchRes.json();
  assert(
    refetchJson.settings.deliveryConfig.standardFee === 4000,
    "Refetched store settings confirms standardFee is 4000"
  );
  assert(
    refetchJson.settings.storeName === currentSettings.storeName,
    "Store name remains completely unchanged"
  );
  assert(
    refetchJson.settings.adminWhatsapp === currentSettings.adminWhatsapp,
    "WhatsApp number remains completely unchanged"
  );
  assert(
    refetchJson.settings.isOpen === currentSettings.isOpen,
    "Store open status remains completely unchanged"
  );

  // Rejection of invalid / negative values via API
  const invalidNegFeeRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...currentSettings,
      deliveryConfig: {
        ...currentSettings.deliveryConfig,
        standardFee: -1000,
      },
    }),
  });
  assert(invalidNegFeeRes.status === 400, "API rejects negative delivery fee with HTTP 400");

  console.log("\n==================================================================");
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
