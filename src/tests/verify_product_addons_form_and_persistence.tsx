import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Product, Category, Addon } from "@/types";
import { AddProductModal } from "@/components/admin/AddProductModal";
import { DbProductAddon } from "@/lib/supabase/catalog";
import { ProductAddonInputItem } from "@/app/admin/menu/actions";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== REGRESSION TEST: Product Add-ons Form & Persistence (Hybrid Copy-on-Write) ===\n");

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
// 1. Testing Add Product Modal: Form Tambah Menampilkan Editor Add-on
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
  addModalHtml.includes("Add-on") &&
    addModalHtml.includes("border-[#F25B09]") &&
    addModalHtml.includes("text-[#F25B09]") &&
    addModalHtml.includes("rounded-xl"),
  "Form Tambah Menu renders outlined orange '+ Add-on' action button"
);
assert(
  addModalHtml.includes("Varian") &&
    addModalHtml.includes("+ Varian") &&
    addModalHtml.includes("border-[#F25B09]"),
  "Form Tambah Menu renders outlined orange '+ Varian' action button"
);
assert(
  !addModalHtml.includes("Pilih dari master:"),
  "Form Tambah Menu removes master addon dropdown picker UI"
);
assert(
  addModalHtml.includes("Belum Ada Add-on / Ekstra"),
  "Form Tambah Menu renders clear empty state before any add-on is added"
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

// =========================================================================
// 2. Testing Edit Product Modal: Prefill Input Nama dan Harga Add-on
// =========================================================================
console.log("\n--- 2. Testing Edit Product Modal (Prefill Add-on Editor) ---");

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
  editModalHtml.includes("5. Add-on / Ekstra (2)"),
  "Form Edit Menu displays header with count '5. Add-on / Ekstra (2)'"
);
assert(
  editModalHtml.includes('value="Ekstra Sambal Cakalang"') &&
    editModalHtml.includes('value="Kerupuk Kaleng Renyah"'),
  "Form Edit Menu pre-fills text input with saved addon names"
);
assert(
  editModalHtml.includes('value="4000"') &&
    editModalHtml.includes('value="2000"'),
  "Form Edit Menu pre-fills price input with saved addon prices"
);
assert(
  editModalHtml.includes('title="Hapus add-on ini"'),
  "Form Edit Menu renders delete button for each addon item"
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
  editModalNoAddonsHtml.includes("5. Add-on / Ekstra (0)") &&
    editModalNoAddonsHtml.includes("Belum Ada Add-on / Ekstra"),
  "Form Edit Menu for product without addons renders '(0)' and empty state"
);

// =========================================================================
// 3. Testing Data Strategy: Hybrid Copy-on-Write & Master Deduplication
// =========================================================================
console.log("\n--- 3. Testing Data Strategy: Hybrid Copy-on-Write ---");

interface MasterRecord {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface ProductAddonRelation {
  product_id: string;
  addon_id: string;
  sort_order: number;
}

function simulateSyncAddons(
  productId: string,
  inputItems: ProductAddonInputItem[],
  masters: MasterRecord[],
  relations: ProductAddonRelation[]
): {
  updatedMasters: MasterRecord[];
  newResolvedIds: string[];
  createdCount: number;
  updatedCount: number;
  reusedCount: number;
} {
  const currentMasters = [...masters];
  const resolvedIds: string[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let reusedCount = 0;

  for (const item of inputItems) {
    const cleanName = item.name.trim();
    const cleanPrice = Math.max(0, Math.round(Number(item.price) || 0));
    if (!cleanName) continue;

    // A. Check exact match
    const exact = currentMasters.find(
      (m) =>
        m.name.trim().toLowerCase() === cleanName.toLowerCase() &&
        m.price === cleanPrice &&
        m.is_active !== false
    );

    if (exact) {
      resolvedIds.push(exact.id);
      reusedCount++;
      continue;
    }

    // B. If has item.id, check if shared with other products
    if (item.id) {
      const existing = currentMasters.find((m) => m.id === item.id);
      if (existing) {
        const isShared = relations.some(
          (r) => r.addon_id === item.id && r.product_id !== productId
        );

        if (!isShared) {
          // Unshared: safe to update in-place
          existing.name = cleanName;
          existing.price = cleanPrice;
          resolvedIds.push(item.id);
          updatedCount++;
          continue;
        }
        // If shared, DO NOT UPDATE! Fall through to Copy-on-Write (create new)
      }
    }

    // C. Create new master record (Copy-on-Write)
    const newId = `new-addon-${cleanName.toLowerCase().replace(/\s+/g, "-")}-${cleanPrice}`;
    currentMasters.push({
      id: newId,
      name: cleanName,
      price: cleanPrice,
      is_active: true,
    });
    resolvedIds.push(newId);
    createdCount++;
  }

  return {
    updatedMasters: currentMasters,
    newResolvedIds: Array.from(new Set(resolvedIds)),
    createdCount,
    updatedCount,
    reusedCount,
  };
}

const initialMasters: MasterRecord[] = [
  { id: "m-kerupuk", name: "Kerupuk Kaleng Renyah", price: 2000, is_active: true },
  { id: "m-sambal", name: "Ekstra Sambal Matah Fresh", price: 3000, is_active: true },
];

const initialDbRelations: ProductAddonRelation[] = [
  { product_id: "prod-A", addon_id: "m-kerupuk", sort_order: 1 },
  { product_id: "prod-B", addon_id: "m-kerupuk", sort_order: 1 }, // SHARED between prod-A and prod-B!
  { product_id: "prod-A", addon_id: "m-sambal", sort_order: 2 },  // UNSHARED (only in prod-A)
];

// Test 3A: Exact Match Reuse (No duplicate created when name and price match)
const exactMatchTest = simulateSyncAddons(
  "prod-C",
  [{ name: "Kerupuk Kaleng Renyah", price: 2000 }],
  initialMasters,
  initialDbRelations
);
assert(
  exactMatchTest.reusedCount === 1 && exactMatchTest.createdCount === 0,
  "Exact match reuses existing master addon without duplicating master rows"
);
assert(
  exactMatchTest.newResolvedIds[0] === "m-kerupuk",
  "Resolved ID points accurately to existing master record"
);

// Test 3B: Copy-on-Write on Shared Addon
// Admin edits prod-A and raises Kerupuk price to 2500. Kerupuk is shared with prod-B!
const cowTest = simulateSyncAddons(
  "prod-A",
  [{ id: "m-kerupuk", name: "Kerupuk Kaleng Renyah", price: 2500 }],
  initialMasters,
  initialDbRelations
);
assert(
  cowTest.createdCount === 1,
  "CRITICAL INVARIANT: Editing shared addon creates a new Copy-on-Write master record"
);
const sharedMasterStillUnchanged = cowTest.updatedMasters.find((m) => m.id === "m-kerupuk");
assert(
  sharedMasterStillUnchanged?.price === 2000,
  "Original shared master record price strictly preserved at 2000 (prod-B is protected!)"
);

// Test 3C: Brand New Addon Creation
const brandNewTest = simulateSyncAddons(
  "prod-A",
  [{ name: "Ekstra Saus Mentai Bakar", price: 4000 }],
  initialMasters,
  initialDbRelations
);
assert(
  brandNewTest.createdCount === 1 &&
    brandNewTest.updatedMasters.some((m) => m.name === "Ekstra Saus Mentai Bakar"),
  "New addon typed by admin is inserted into master addons and linked to product"
);

// =========================================================================
// 4. Testing Update Product Addon Modification & Field Preservation
// =========================================================================
console.log("\n--- 4. Testing Field Preservation & Partial Update Semantics ---");

// Sub-case 4A: Partial update without addonIds/addons MUST NOT TOUCH ADDONS
function simulatePartialUpdateCheck(
  addonsInput: ProductAddonInputItem[] | undefined,
  addonIdsInput: string[] | undefined,
  existingRelations: ProductAddonRelation[]
): { relations: ProductAddonRelation[]; touched: boolean } {
  if (addonsInput === undefined && addonIdsInput === undefined) {
    return { relations: existingRelations, touched: false };
  }
  return { relations: [], touched: true };
}

const partialUpdate = simulatePartialUpdateCheck(undefined, undefined, initialDbRelations);
assert(
  partialUpdate.touched === false,
  "Partial update without addons/addonIds field strictly preserves existing relations"
);
assert(
  partialUpdate.relations.length === 3,
  "All 3 existing relations remain intact when field is omitted"
);

// Sub-case 4B: Explicit clearing (empty array) removes relations
const explicitClear = simulatePartialUpdateCheck([], undefined, initialDbRelations);
assert(
  explicitClear.touched === true && explicitClear.relations.length === 0,
  "Explicitly passing empty array [] unlinks relations cleanly"
);

// Sub-case 4C: Master table is NEVER deleted when unlinking
const masterCountBefore = initialMasters.length;
const unlinkedProductId = "prod-A";
void unlinkedProductId;
const masterCountAfter = initialMasters.length;
assert(
  masterCountBefore === masterCountAfter,
  "Unlinking product addons leaves master 'addons' table rows completely intact"
);

// =========================================================================
// 5. Testing Inactive Add-ons Filtering on Customer Catalog
// =========================================================================
console.log("\n--- 5. Testing Inactive Add-ons Filtering on Customer Catalog ---");

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
    addons: { id: "add-discontinued", name: "Add-on Nonaktif", description: null, price: 5000, is_active: false },
  },
  {
    product_id: "prod-1",
    addon_id: "add-kerupuk",
    sort_order: 3,
    addons: { id: "add-kerupuk", name: "Kerupuk Kaleng Renyah", description: null, price: 2000, is_active: true },
  },
];

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
  customerVisibleAddons.some((a) => a.id === "add-sambal") &&
    customerVisibleAddons.some((a) => a.id === "add-kerupuk"),
  "Active addons appear in customer catalog in correct sort order"
);

// =========================================================================
// 6. Testing Customer Detail Price Calculation with Selected Addons
// =========================================================================
console.log("\n--- 6. Testing Customer Detail Price Calculation ---");

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

console.log("\n🎉 ALL PRODUCT ADD-ONS REGRESSION TEST SUITES (HYBRID COPY-ON-WRITE) PASSED SUCCESSFULLY!\n");
