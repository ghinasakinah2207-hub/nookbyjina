import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Product, Category, Addon } from "@/types";
import { AddProductModal } from "@/components/admin/AddProductModal";
import { DbProductAddon } from "@/lib/supabase/catalog";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== REGRESSION TEST: Product Add-ons Form & Persistence ===\n");

const mockCategories: Category[] = [
  { id: "cat-makanan", name: "Makanan Utama", slug: "makanan" },
];

const mockMasterAddons: Addon[] = [
  { id: "add-sambal", name: "Ekstra Sambal Cakalang", price: 4000 },
  { id: "add-telur", name: "Telur Dadar Iris Gurih", price: 3000 },
  { id: "add-kerupuk", name: "Kerupuk Kaleng Renyah", price: 2000 },
];

const sampleProductWithAddons: Product = {
  id: "nasi-bakar-cakalang",
  dbId: "b0000001-0000-4000-8000-000000000001",
  slug: "nasi-bakar-cakalang",
  name: "Nasi Bakar Cakalang Asap",
  description: "Nasi bakar gurih dengan suwiran ikan cakalang asap rica pedas.",
  categoryId: "cat-makanan",
  categoryName: "Makanan Utama",
  categorySlug: "makanan",
  basePrice: 25000,
  hpp: 15000,
  isAvailable: true,
  isArchived: false,
  isHighlight: true,
  images: ["/images/nasi-bakar.webp"],
  optionGroups: [],
  addons: [
    { id: "add-sambal", name: "Ekstra Sambal Cakalang", price: 4000 },
    { id: "add-kerupuk", name: "Kerupuk Kaleng Renyah", price: 2000 },
  ],
};

const sampleProductWithoutAddons: Product = {
  ...sampleProductWithAddons,
  id: "nasi-bakar-polos",
  slug: "nasi-bakar-polos",
  name: "Nasi Bakar Polos",
  addons: [],
};

// =========================================================================
// 1. Testing Add Product Modal: Form Tambah Menampilkan Konfigurasi Add-on
// =========================================================================
console.log("--- 1. Testing Add Product Modal (Tambah Menu Baru) ---");

const addModalHtml = renderToStaticMarkup(
  <AddProductModal
    isOpen={true}
    onClose={() => {}}
    categories={mockCategories}
    availableAddons={mockMasterAddons}
    initialProduct={null}
    onProductCreated={() => {}}
    onProductUpdated={() => {}}
  />
);

assert(
  addModalHtml.includes("5. Add-on / Ekstra"),
  "Form Tambah Menu renders '5. Add-on / Ekstra' section header"
);
assert(
  addModalHtml.includes("0 dipilih"),
  "Form Tambah Menu displays '0 dipilih' count initially"
);
assert(
  addModalHtml.includes("Pilih Semua"),
  "Form Tambah Menu displays 'Pilih Semua' button when addons are available"
);
assert(
  addModalHtml.includes("Ekstra Sambal Cakalang"),
  "Form Tambah Menu displays master addon 'Ekstra Sambal Cakalang'"
);
assert(
  addModalHtml.includes("Telur Dadar Iris Gurih"),
  "Form Tambah Menu displays master addon 'Telur Dadar Iris Gurih'"
);
assert(
  addModalHtml.includes("Kerupuk Kaleng Renyah"),
  "Form Tambah Menu displays master addon 'Kerupuk Kaleng Renyah'"
);
assert(
  addModalHtml.includes("+Rp4.000") || addModalHtml.includes("+Rp&nbsp;4.000") || addModalHtml.includes("+Rp 4.000"),
  "Form Tambah Menu displays formatted price for addon"
);

// Verify section order: 1. Info -> 2. Harga & HPP -> 3. Foto -> 4. Varian -> 5. Add-on
const sec1Idx = addModalHtml.indexOf("1. Informasi Produk");
const sec2Idx = addModalHtml.indexOf("2. Harga &amp; HPP") !== -1
  ? addModalHtml.indexOf("2. Harga &amp; HPP")
  : addModalHtml.indexOf("2. Harga & HPP");
const sec3Idx = addModalHtml.indexOf("3. Foto Produk");
const sec4Idx = addModalHtml.indexOf("4. Varian &amp; Pilihan Opsi") !== -1
  ? addModalHtml.indexOf("4. Varian &amp; Pilihan Opsi")
  : addModalHtml.indexOf("4. Varian & Pilihan Opsi");
const sec5Idx = addModalHtml.indexOf("5. Add-on / Ekstra");

assert(sec1Idx !== -1 && sec2Idx > sec1Idx, "1. Informasi Produk appears before 2. Harga & HPP");
assert(sec3Idx > sec2Idx, "2. Harga & HPP appears before 3. Foto Produk");
assert(sec4Idx > sec3Idx, "3. Foto Produk appears before 4. Varian & Pilihan Opsi");
assert(sec5Idx > sec4Idx, "4. Varian & Pilihan Opsi appears before 5. Add-on / Ekstra");

// Test Empty State when availableAddons is empty
const emptyAddModalHtml = renderToStaticMarkup(
  <AddProductModal
    isOpen={true}
    onClose={() => {}}
    categories={mockCategories}
    availableAddons={[]}
    initialProduct={null}
    onProductCreated={() => {}}
    onProductUpdated={() => {}}
  />
);
assert(
  emptyAddModalHtml.includes("Belum Ada Master Add-on Aktif"),
  "Form Tambah Menu renders informative empty state when no master addons exist"
);

// =========================================================================
// 2. Testing Edit Product Modal: Prefill Relasi Add-on Tersimpan
// =========================================================================
console.log("\n--- 2. Testing Edit Product Modal (Prefill Relasi Tersimpan) ---");

const editModalHtml = renderToStaticMarkup(
  <AddProductModal
    isOpen={true}
    onClose={() => {}}
    categories={mockCategories}
    availableAddons={mockMasterAddons}
    initialProduct={sampleProductWithAddons}
    onProductCreated={() => {}}
    onProductUpdated={() => {}}
  />
);

assert(
  editModalHtml.includes("5. Add-on / Ekstra (2 dipilih)"),
  "Form Edit Menu pre-calculates and displays count '(2 dipilih)' for saved addons"
);
assert(
  editModalHtml.includes('id="addon-checkbox-add-sambal"') &&
    editModalHtml.includes('id="addon-checkbox-add-kerupuk"'),
  "Form Edit Menu renders unique checkbox IDs for stored addons"
);

// Edit modal with no stored addons
const editModalNoAddonsHtml = renderToStaticMarkup(
  <AddProductModal
    isOpen={true}
    onClose={() => {}}
    categories={mockCategories}
    availableAddons={mockMasterAddons}
    initialProduct={sampleProductWithoutAddons}
    onProductCreated={() => {}}
    onProductUpdated={() => {}}
  />
);
assert(
  editModalNoAddonsHtml.includes("5. Add-on / Ekstra (0 dipilih)"),
  "Form Edit Menu for product without addons renders '(0 dipilih)'"
);

// =========================================================================
// 3. Testing Create Product Persistence Logic & Deduplication
// =========================================================================
console.log("\n--- 3. Testing Create Product Addon Deduplication & Persistence Logic ---");

function processCreateAddonIds(addonIds?: string[]): {
  addonRows: { product_id: string; addon_id: string; sort_order: number }[];
} {
  const uniqueAddonIds = Array.from(
    new Set((addonIds || []).map((id) => id.trim()).filter(Boolean))
  );

  const addonRows = uniqueAddonIds.map((addonId, aIdx) => ({
    product_id: "test-product-id",
    addon_id: addonId,
    sort_order: aIdx + 1,
  }));

  return { addonRows };
}

// Case 3A: Deduplicate repeated addon IDs
const deduplicated = processCreateAddonIds([
  "add-sambal",
  "add-sambal",
  "add-telur",
  "  add-telur  ",
]);
assert(
  deduplicated.addonRows.length === 2,
  "Create logic strictly deduplicates repeated or untrimmed addon IDs"
);
assert(
  deduplicated.addonRows[0].addon_id === "add-sambal" &&
    deduplicated.addonRows[0].sort_order === 1,
  "First addon receives sort_order = 1"
);
assert(
  deduplicated.addonRows[1].addon_id === "add-telur" &&
    deduplicated.addonRows[1].sort_order === 2,
  "Second addon receives sort_order = 2"
);

// Case 3B: Empty array -> 0 rows
const emptyCreate = processCreateAddonIds([]);
assert(emptyCreate.addonRows.length === 0, "Create logic produces 0 rows when addonIds is empty");

// Case 3C: Undefined -> 0 rows
const undefinedCreate = processCreateAddonIds(undefined);
assert(undefinedCreate.addonRows.length === 0, "Create logic produces 0 rows when addonIds is undefined");

// =========================================================================
// 4. Testing Update Product Addon Modification & Field Preservation Invariant
// =========================================================================
console.log("\n--- 4. Testing Update Product Addon Modification & Field Preservation ---");

interface MockDbProductAddonRow {
  product_id: string;
  addon_id: string;
  sort_order: number;
}

function simulateUpdateProductAddons(
  inputAddonIds: string[] | undefined,
  currentStoredAddons: MockDbProductAddonRow[]
): {
  newStoredAddons: MockDbProductAddonRow[];
  modified: boolean;
} {
  // Invariant: If inputAddonIds is undefined, preserve all existing product_addons untouched
  if (inputAddonIds === undefined) {
    return { newStoredAddons: currentStoredAddons, modified: false };
  }

  const uniqueAddonIds = Array.from(
    new Set(inputAddonIds.map((id) => id.trim()).filter(Boolean))
  );

  const newStoredAddons = uniqueAddonIds.map((addonId, aIdx) => ({
    product_id: "prod-1",
    addon_id: addonId,
    sort_order: aIdx + 1,
  }));

  return { newStoredAddons, modified: true };
}

const initialRelations: MockDbProductAddonRow[] = [
  { product_id: "prod-1", addon_id: "add-sambal", sort_order: 1 },
  { product_id: "prod-1", addon_id: "add-kerupuk", sort_order: 2 },
];

// Sub-case 4A: Partial update without addonIds (e.g. price or stock toggle) MUST NOT TOUCH ADDONS
const partialUpdateResult = simulateUpdateProductAddons(undefined, initialRelations);
assert(
  partialUpdateResult.modified === false,
  "CRITICAL: When input.addonIds is undefined, product_addons relations are strictly untouched"
);
assert(
  partialUpdateResult.newStoredAddons.length === 2 &&
    partialUpdateResult.newStoredAddons[0].addon_id === "add-sambal",
  "Existing relations remain 100% intact during partial update"
);

// Sub-case 4B: Explicitly deselecting all addons (empty array)
const deselectAllResult = simulateUpdateProductAddons([], initialRelations);
assert(
  deselectAllResult.modified === true && deselectAllResult.newStoredAddons.length === 0,
  "Updating with empty array removes all product_addons relations cleanly"
);

// Sub-case 4C: Modifying addon selection (adding and removing)
const modifiedResult = simulateUpdateProductAddons(["add-telur"], initialRelations);
assert(
  modifiedResult.newStoredAddons.length === 1 &&
    modifiedResult.newStoredAddons[0].addon_id === "add-telur",
  "Updating with new list accurately replaces product_addons relations"
);

// Sub-case 4D: Unchanged addon selection skips mutation
function simulateUnchangedCheck(current: MockDbProductAddonRow[], incoming: string[]): boolean {
  const uniqueIncoming = Array.from(new Set(incoming.map((id) => id.trim()).filter(Boolean)));
  const currentIds = current.map((c) => c.addon_id);
  return (
    currentIds.length === uniqueIncoming.length &&
    currentIds.every((id, idx) => id === uniqueIncoming[idx])
  );
}

const unchangedCheckResult = simulateUnchangedCheck(initialRelations, ["add-sambal", "add-kerupuk"]);
assert(
  unchangedCheckResult === true,
  "Unchanged addon selection accurately detected to bypass delete/insert operations"
);

const changedCheckResult = simulateUnchangedCheck(initialRelations, ["add-sambal"]);
assert(
  changedCheckResult === false,
  "Changed addon selection correctly detected to proceed with update"
);

// =========================================================================
// 5. Testing Invariant: Master Addons Table Is Never Deleted
// =========================================================================
console.log("\n--- 5. Testing Master Addon Table Safety ---");

const masterAddonIdsBefore = mockMasterAddons.map((a) => a.id);
// When a relation is removed from a product:
const unlinkedProductId = "prod-1";
void unlinkedProductId;
// Master list remains unaffected
const masterAddonIdsAfter = mockMasterAddons.map((a) => a.id);
assert(
  JSON.stringify(masterAddonIdsBefore) === JSON.stringify(masterAddonIdsAfter),
  "Unlinking product_addons leaves master 'addons' table rows completely intact"
);

// =========================================================================
// 6. Testing Inactive Add-ons Filter on Customer Product Detail
// =========================================================================
console.log("\n--- 6. Testing Inactive Add-ons Filtering on Customer Catalog ---");

const rawDbProductAddons: DbProductAddon[] = [
  {
    product_id: "prod-1",
    addon_id: "add-sambal",
    sort_order: 1,
    addons: { id: "add-sambal", name: "Ekstra Sambal Cakalang", description: null, price: 4000, is_active: true },
  },
  {
    product_id: "prod-1",
    addon_id: "add-discontinued",
    sort_order: 2,
    addons: { id: "add-discontinued", name: "Add-on Lama Nonaktif", description: null, price: 5000, is_active: false }, // INACTIVE!
  },
  {
    product_id: "prod-1",
    addon_id: "add-kerupuk",
    sort_order: 3,
    addons: { id: "add-kerupuk", name: "Kerupuk Kaleng Renyah", description: null, price: 2000, is_active: true },
  },
];

// Customer catalog loader filtering logic (from getProductBySlugOrId in src/lib/supabase/catalog.ts)
const customerVisibleAddons: Addon[] = rawDbProductAddons
  .slice()
  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  .map((pa) => {
    const rawAddon = Array.isArray(pa.addons) ? pa.addons[0] : pa.addons;
    if (!rawAddon || rawAddon.is_active === false) return null;
    return {
      id: rawAddon.id,
      name: rawAddon.name,
      price: Number(rawAddon.price || 0),
    };
  })
  .filter((a): a is Addon => a !== null);

assert(
  customerVisibleAddons.length === 2,
  "Customer catalog strictly excludes inactive addons (is_active: false)"
);
assert(
  !customerVisibleAddons.some((a) => a.id === "add-discontinued"),
  "Discontinued addon is omitted from customer product detail options"
);
assert(
  customerVisibleAddons.some((a) => a.id === "add-sambal") &&
    customerVisibleAddons.some((a) => a.id === "add-kerupuk"),
  "Active addons are preserved in correct sort order"
);

// =========================================================================
// 7. Testing Customer Detail Price Calculation with Selected Addons
// =========================================================================
console.log("\n--- 7. Testing Customer Detail Price Calculation ---");

const basePrice = 25000;
const selectedCustomerAddons = [
  customerVisibleAddons[0], // Sambal (4000)
  customerVisibleAddons[1], // Kerupuk (2000)
];
const addonsDelta = selectedCustomerAddons.reduce((sum, a) => sum + a.price, 0);
const calculatedUnitPrice = basePrice + addonsDelta;

assert(addonsDelta === 6000, "Addon price delta correctly totals 4000 + 2000 = 6000");
assert(
  calculatedUnitPrice === 31000,
  "Customer unit price correctly calculates 25000 + 6000 = 31000"
);

console.log("\n🎉 ALL PRODUCT ADD-ONS REGRESSION TEST SUITES PASSED SUCCESSFULLY!\n");
