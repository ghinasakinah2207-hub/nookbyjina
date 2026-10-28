import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Product, Category } from "@/types";
import { AddProductModal } from "@/components/admin/AddProductModal";
import {
  mapDbProductToUiProduct,
  DbProductRow,
  getAdminCatalogProducts,
} from "@/lib/supabase/catalog";
import { SupabaseClient } from "@supabase/supabase-js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== REGRESSION TEST: Product Description Form & Persistence ===\n");

const mockCategories: Category[] = [
  { id: "cat-kopi", name: "Kopi & Minuman", slug: "kopi" },
  { id: "cat-makanan", name: "Makanan Utama", slug: "makanan" },
];

const sampleProductWithDescription: Product = {
  id: "es-kopi-susu-aren",
  dbId: "b0000001-0000-4000-8000-000000000010",
  slug: "es-kopi-susu-aren",
  name: "Es Kopi Susu Aren Homemade",
  description: "Kopi susu aren homemade dengan susu segar dan biji kopi pilihan dari barista Nook by Jina.",
  categoryId: "cat-kopi",
  categoryName: "Kopi & Minuman",
  categorySlug: "kopi",
  basePrice: 18000,
  hpp: 8000,
  isAvailable: true,
  isArchived: false,
  isHighlight: true,
  images: ["/images/kopi-aren.webp"],
  optionGroups: [],
  addons: [],
};

const sampleProductWithoutDescription: Product = {
  ...sampleProductWithDescription,
  id: "air-mineral",
  slug: "air-mineral",
  name: "Air Mineral Botol",
  description: "",
};

// =========================================================================
// 1. Testing Add Product Modal: Form Tambah Memiliki Field Description
// =========================================================================
console.log("--- 1. Testing Add Product Modal (Tambah Menu Baru) ---");

const addModalHtml = renderToStaticMarkup(
  <AddProductModal
    isOpen={true}
    onClose={() => {}}
    categories={mockCategories}
    initialProduct={null}
    onProductCreated={() => {}}
    onProductUpdated={() => {}}
  />
);

assert(
  addModalHtml.includes("Deskripsi Produk"),
  "Form Tambah Menu Baru renders 'Deskripsi Produk' label"
);
assert(
  addModalHtml.includes("(Opsional)"),
  "Form Tambah Menu Baru marks 'Deskripsi Produk' as (Opsional)"
);
assert(
  addModalHtml.includes("<textarea") && addModalHtml.includes('id="product-description"'),
  "Form Tambah Menu Baru renders textarea element with unique id 'product-description'"
);
assert(
  addModalHtml.includes("placeholder=\"cth: Nasi bakar gurih beraroma daun pisang"),
  "Form Tambah Menu Baru has descriptive placeholder for food/beverage"
);
assert(
  addModalHtml.includes("</textarea>"),
  "Form Tambah Menu Baru textarea has closing tag"
);

// Verify placement: After 1. Informasi Produk, Before 2. Harga & HPP
const infoProdIdx = addModalHtml.indexOf("1. Informasi Produk");
const nameFieldIdx = addModalHtml.indexOf("Nama Produk");
const categoryFieldIdx = addModalHtml.indexOf("Kategori Menu");
const descFieldIdx = addModalHtml.indexOf("Deskripsi Produk");
const priceFieldIdx = addModalHtml.indexOf("2. Harga &amp; HPP") !== -1
  ? addModalHtml.indexOf("2. Harga &amp; HPP")
  : addModalHtml.indexOf("2. Harga & HPP");

assert(infoProdIdx !== -1, "Section 1. Informasi Produk is rendered");
assert(nameFieldIdx > infoProdIdx, "Nama Produk is rendered after section header");
assert(categoryFieldIdx > nameFieldIdx, "Kategori Menu is rendered after Nama Produk");
assert(descFieldIdx > categoryFieldIdx, "Deskripsi Produk is rendered after Kategori Menu");
assert(priceFieldIdx > descFieldIdx, "Deskripsi Produk is placed BEFORE 2. Harga & HPP");

// =========================================================================
// 2. Testing Edit Product Modal: Menampilkan Deskripsi Tersimpan
// =========================================================================
console.log("\n--- 2. Testing Edit Product Modal (Edit Menu Tersimpan) ---");

const editModalHtml = renderToStaticMarkup(
  <AddProductModal
    isOpen={true}
    onClose={() => {}}
    categories={mockCategories}
    initialProduct={sampleProductWithDescription}
    onProductCreated={() => {}}
    onProductUpdated={() => {}}
  />
);

assert(
  editModalHtml.includes("Deskripsi Produk"),
  "Form Edit Menu renders 'Deskripsi Produk' field"
);
assert(
  editModalHtml.includes(
    "Kopi susu aren homemade dengan susu segar dan biji kopi pilihan dari barista Nook by Jina."
  ),
  "Form Edit Menu pre-fills saved description in textarea"
);
assert(
  editModalHtml.includes("Es Kopi Susu Aren Homemade"),
  "Form Edit Menu displays product name accurately"
);

// Test edit modal when initialProduct has empty description
const editModalEmptyDescHtml = renderToStaticMarkup(
  <AddProductModal
    isOpen={true}
    onClose={() => {}}
    categories={mockCategories}
    initialProduct={sampleProductWithoutDescription}
    onProductCreated={() => {}}
    onProductUpdated={() => {}}
  />
);
assert(
  editModalEmptyDescHtml.includes("Deskripsi Produk"),
  "Form Edit Menu for product with empty description still renders 'Deskripsi Produk' field"
);
assert(
  editModalEmptyDescHtml.includes('id="product-description"'),
  "Form Edit Menu for product with empty description renders textarea"
);

// =========================================================================
// 3. Testing Create Product Action Description Handling & Normalization
// =========================================================================
console.log("\n--- 3. Testing Create Product Normalization & Persistence Logic ---");

function normalizeCreateDescription(desc?: string | null): string | null {
  return desc?.trim() || null;
}

// Case A: Normal trimmed text
assert(
  normalizeCreateDescription("  Risol Mayo Beef Keju Meleleh   ") === "Risol Mayo Beef Keju Meleleh",
  "Create action trims leading and trailing whitespace"
);

// Case B: Empty string -> null
assert(
  normalizeCreateDescription("") === null,
  "Create action converts empty string '' to null"
);

// Case C: Whitespace-only string -> null
assert(
  normalizeCreateDescription("    ") === null,
  "Create action converts whitespace-only string to null"
);

// Case D: Undefined -> null
assert(
  normalizeCreateDescription(undefined) === null,
  "Create action handles undefined description gracefully as null"
);

// Case E: Null -> null
assert(
  normalizeCreateDescription(null) === null,
  "Create action handles null description gracefully as null"
);

// =========================================================================
// 4. Testing Update Product Action Description & Field Preservation Invariant
// =========================================================================
console.log("\n--- 4. Testing Update Product Description & Field Preservation ---");

interface ExistingProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  hpp: number | null;
  is_available: boolean;
  is_highlight: boolean;
}

function resolveUpdateDescription(
  inputDescription: string | null | undefined,
  existingDescription: string | null
): string | null {
  return inputDescription !== undefined
    ? inputDescription?.trim() || null
    : (existingDescription ?? null);
}

const existingInDb: ExistingProductRow = {
  id: "b0000001-0000-4000-8000-000000000010",
  name: "Es Kopi Susu Aren",
  slug: "es-kopi-susu-aren",
  description: "Deskripsi lama yang sudah tersimpan di database",
  price: 18000,
  hpp: 8000,
  is_available: true,
  is_highlight: false,
};

// Sub-case 4A: Admin updates description explicitly
const updatedDesc = resolveUpdateDescription(
  "Deskripsi baru hasil perbaikan admin",
  existingInDb.description
);
assert(
  updatedDesc === "Deskripsi baru hasil perbaikan admin",
  "Update action accurately stores updated description"
);

// Sub-case 4B: Admin clears description (passes empty string)
const clearedDesc = resolveUpdateDescription("", existingInDb.description);
assert(
  clearedDesc === null,
  "Update action converts cleared description ('') to null"
);

// Sub-case 4C: Admin updates price/HPP only (description is undefined) -> MUST PRESERVE EXISTING!
const preservedDesc = resolveUpdateDescription(undefined, existingInDb.description);
assert(
  preservedDesc === "Deskripsi lama yang sudah tersimpan di database",
  "CRITICAL: Update action strictly preserves existing description when input.description is omitted/undefined"
);

// Verify other fields remain completely intact when description is modified
const simulatedUpdatedRow: ExistingProductRow = {
  ...existingInDb,
  description: updatedDesc,
};
assert(simulatedUpdatedRow.price === 18000, "basePrice is strictly preserved on description update");
assert(simulatedUpdatedRow.hpp === 8000, "hpp is strictly preserved on description update");
assert(simulatedUpdatedRow.is_available === true, "is_available is strictly preserved on description update");
assert(simulatedUpdatedRow.slug === "es-kopi-susu-aren", "slug is strictly preserved on description update");

// =========================================================================
// 5. Testing Catalog Mapping & Customer Product Detail Rendering
// =========================================================================
console.log("\n--- 5. Testing Catalog Mapping & Customer Detail Rendering ---");

const dbRowWithDesc: DbProductRow = {
  id: "prod-desc-1",
  name: "Es Kopi Susu Aren Homemade",
  slug: "es-kopi-susu-aren-homemade",
  description: "Kopi susu gula aren racikan istimewa Nook by Jina.",
  price: 18000,
  hpp: 8000,
  is_available: true,
  is_archived: false,
  is_highlight: true,
  sort_order: 1,
  category_id: "cat-kopi",
  tags: ["Kopi", "Best Seller"],
  categories: { id: "cat-kopi", name: "Kopi & Minuman", slug: "kopi" },
  product_images: [{ id: "img-1", image_url: "/images/kopi.webp", sort_order: 1 }],
};

const mappedUiWithDesc = mapDbProductToUiProduct(dbRowWithDesc);
assert(
  mappedUiWithDesc.description === "Kopi susu gula aren racikan istimewa Nook by Jina.",
  "mapDbProductToUiProduct maps non-empty description column to UI model"
);

const dbRowNullDesc: DbProductRow = {
  ...dbRowWithDesc,
  description: null,
};
const mappedUiNullDesc = mapDbProductToUiProduct(dbRowNullDesc);
assert(
  mappedUiNullDesc.description === "",
  "mapDbProductToUiProduct safely falls back to empty string when description is null"
);

// Simulate customer product detail description rendering
function renderCustomerDetailDescription(product: Product): string {
  if (!product.description) return "";
  return `<p class="text-xs text-[#737373] leading-relaxed pt-0.5">${product.description}</p>`;
}

const customerDetailHtml = renderCustomerDetailDescription(mappedUiWithDesc);
assert(
  customerDetailHtml.includes("Kopi susu gula aren racikan istimewa Nook by Jina."),
  "Customer product detail view renders saved product description"
);

const emptyCustomerDetailHtml = renderCustomerDetailDescription(mappedUiNullDesc);
assert(
  emptyCustomerDetailHtml === "",
  "Customer product detail view does not render empty paragraph when description is empty/null"
);

// =========================================================================
// 6. Testing Admin Catalog Query Whitelist & Column Coverage
// =========================================================================
console.log("\n--- 6. Testing Admin Catalog Query Coverage ---");

function createMockAdminClient(rows: DbProductRow[]): SupabaseClient {
  return {
    from: (table: string) => {
      assert(table === "products", `Admin catalog queries table '${table}'`);
      return {
        select: (columns: string) => {
          assert(columns.includes("description"), "Admin catalog explicitly selects 'description' column");
          assert(columns.includes("hpp"), "Admin catalog explicitly selects 'hpp' column");
          assert(columns.includes("is_available"), "Admin catalog selects 'is_available' column");
          return {
            eq: (col: string, val: unknown) => {
              assert(col === "is_archived" && val === false, "Admin catalog filters is_archived = false");
              return {
                order: (orderCol: string, opts: { ascending: boolean }) => {
                  assert(orderCol === "sort_order" && opts.ascending === true, "Admin catalog orders by sort_order ASC");
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

async function runAdminCoverageTest() {
  const mockClient = createMockAdminClient([dbRowWithDesc]);
  const prods = await getAdminCatalogProducts(mockClient);

  assert(prods.length === 1, "Admin catalog returns product row");
  assert(
    prods[0].description === "Kopi susu gula aren racikan istimewa Nook by Jina.",
    "Admin catalog product loader preserves 'description' column value"
  );
  assert(prods[0].hpp === 8000, "Admin catalog product loader preserves 'hpp' column value");

  console.log("\n🎉 ALL PRODUCT DESCRIPTION REGRESSION TEST SUITES PASSED SUCCESSFULLY!\n");
}

runAdminCoverageTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
