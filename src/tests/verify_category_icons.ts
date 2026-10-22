import {
  SUPPORTED_CATEGORY_ICONS,
  CATEGORY_ICON_MAP,
  FALLBACK_CATEGORY_ICON,
  FALLBACK_CATEGORY_ICON_ID,
  getCategoryIcon,
  getDefaultIconForSlug,
  ICON_GROUPS,
} from "../lib/category-icons";
import { generateSlug } from "../lib/slug";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== 1. Verifying Supported Icon Allowlist ===");
assert(
  SUPPORTED_CATEGORY_ICONS.length >= 30,
  `Expected at least 30 supported icons, found ${SUPPORTED_CATEGORY_ICONS.length}`
);

// Verify no duplicate IDs
const idSet = new Set<string>();
for (const item of SUPPORTED_CATEGORY_ICONS) {
  assert(!idSet.has(item.id), `Duplicate icon ID found: ${item.id}`);
  idSet.add(item.id);
  assert(typeof item.label === "string" && item.label.length > 0, `Icon ${item.id} missing label`);
  assert(typeof item.group === "string", `Icon ${item.id} missing group`);
  assert(typeof item.icon === "object" || typeof item.icon === "function", `Icon ${item.id} missing valid Lucide component`);
}

console.log("\n=== 2. Verifying getCategoryIcon & Fallback Logic ===");
// Valid icon lookup
const UtensilsIcon = getCategoryIcon("utensils");
assert(UtensilsIcon === CATEGORY_ICON_MAP["utensils"], "utensils returns valid Lucide component");

const CupSodaIcon = getCategoryIcon("cup-soda");
assert(CupSodaIcon === CATEGORY_ICON_MAP["cup-soda"], "cup-soda returns valid Lucide component");

const CookieIcon = getCategoryIcon("cookie");
assert(CookieIcon === CATEGORY_ICON_MAP["cookie"], "cookie returns valid Lucide component");

// Null, empty, and unknown icon lookups must fall back to FALLBACK_CATEGORY_ICON
const nullFallback = getCategoryIcon(null);
assert(nullFallback === FALLBACK_CATEGORY_ICON, "null falls back to Utensils");

const undefinedFallback = getCategoryIcon(undefined);
assert(undefinedFallback === FALLBACK_CATEGORY_ICON, "undefined falls back to Utensils");

const emptyFallback = getCategoryIcon("");
assert(emptyFallback === FALLBACK_CATEGORY_ICON, "empty string falls back to Utensils");

const unknownFallback = getCategoryIcon("non-existent-random-icon-xyz");
assert(unknownFallback === FALLBACK_CATEGORY_ICON, "unknown icon ID falls back to Utensils");

console.log("\n=== 3. Verifying getDefaultIconForSlug ===");
assert(getDefaultIconForSlug("makanan") === "utensils", "makanan defaults to utensils");
assert(getDefaultIconForSlug("minuman-dingin") === "cup-soda", "minuman defaults to cup-soda");
assert(getDefaultIconForSlug("kopi-susu") === "coffee", "kopi defaults to coffee");
assert(getDefaultIconForSlug("snack-gurih") === "cookie", "snack defaults to cookie");
assert(getDefaultIconForSlug("dessert-box") === "cake-slice", "dessert defaults to cake-slice");
assert(getDefaultIconForSlug("mie-pedas") === "soup", "mie defaults to soup");
assert(getDefaultIconForSlug("bakery-roti") === "croissant", "bakery defaults to croissant");
assert(getDefaultIconForSlug("paket-hemat") === "shopping-bag", "paket defaults to shopping-bag");
assert(getDefaultIconForSlug("something-unknown") === FALLBACK_CATEGORY_ICON_ID, "unknown defaults to fallback");

console.log("\n=== 4. Verifying Slug Generation ===");
assert(generateSlug("Minuman Segar & Hangat!") === "minuman-segar-hangat", "Slug formats accents & symbols correctly");
assert(generateSlug("Rice Bowl (Ayam Suwir)") === "rice-bowl-ayam-suwir", "Slug cleans parentheses correctly");

console.log("\n=== 5. Verifying Category Groups Structure ===");
assert(ICON_GROUPS.length >= 6, `Expected at least 6 icon groups, found ${ICON_GROUPS.length}`);
for (const group of ICON_GROUPS) {
  assert(Boolean(group.key && group.label), `Group ${group.key} must have a key and label`);
}

console.log("\nAll Category Icon unit and integration tests passed successfully! 🎉\n");
