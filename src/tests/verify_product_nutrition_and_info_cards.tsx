import assert from "assert";
import React from "react";
import fs from "fs";
import path from "path";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { CartProvider } from "@/context/CartContext";
import ProductDetailClient from "@/components/product/ProductDetailClient";
import { PRODUCTS } from "@/data/dummy-data";
import { Product } from "@/types";
import { CreateProductInput, UpdateProductInput } from "@/app/admin/menu/actions";

console.log("================================================================================");
console.log("TEST SUITE: Product Nutrition & Info Cards (Rating, Estimasi, Kalori)");
console.log("================================================================================\n");

// -----------------------------------------------------------------------------
// SECTION 1: ProductDetailClient UI Cards Rendering
// -----------------------------------------------------------------------------
console.log("--- Section 1: ProductDetailClient Three Compact Info Cards ---");

const mockRouter = {
  push: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  replace: () => {},
  prefetch: () => {},
};

const productWithCalories: Product = {
  ...PRODUCTS[0],
  id: "test-prod-cal-1",
  name: "Nasi Bakar Cakalang Asap",
  productType: "ready",
  calories: 450,
};

const productWithoutCalories: Product = {
  ...PRODUCTS[1],
  id: "test-prod-cal-2",
  name: "Tortilla Roll Crispy",
  productType: "preorder",
  calories: null,
};

function renderDetail(product: Product) {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={mockRouter as unknown as AppRouterInstance}>
      <CartProvider>
        <ProductDetailClient
          productId={product.id}
          initialProduct={product}
          initialRecommended={[]}
          initialStoreOpen={true}
        />
      </CartProvider>
    </AppRouterContext.Provider>
  );
}

const htmlWithCal = renderDetail(productWithCalories);
const htmlWithoutCal = renderDetail(productWithoutCalories);

// 1. Grid container
assert.ok(
  htmlWithCal.includes("grid grid-cols-3") && htmlWithCal.includes("data-testid=\"product-info-cards\""),
  "Product detail renders 3 equal-width columns in a horizontal grid"
);

// 2. Rating Card
assert.ok(htmlWithCal.includes("4.9"), "Rating value 4.9 is rendered");
assert.ok(htmlWithCal.includes("Rating"), "Rating card label is 'Rating'");
assert.ok(htmlWithCal.includes("lucide-star"), "Star icon is rendered in Rating card");
console.log("  [PASS] Card 1 (Rating): Star icon, 4.9 value, and 'Rating' label verified");

// 3. Estimasi Card
assert.ok(
  htmlWithCal.includes("15–20 menit"),
  "READY product displays '15–20 menit' preparation estimate"
);
assert.ok(
  htmlWithoutCal.includes("1 day"),
  "PRE-ORDER product displays '1 day' preparation estimate"
);
assert.ok(htmlWithCal.includes("Estimasi"), "Estimate card label is 'Estimasi'");
assert.ok(htmlWithCal.includes("lucide-clock"), "Clock icon is rendered in Estimasi card");
console.log("  [PASS] Card 2 (Estimasi): Clock icon, dynamic estimate, and 'Estimasi' label verified");

// 4. Calories Card
assert.ok(htmlWithCal.includes("450 kcal"), "Calories value '450 kcal' is rendered");
assert.ok(htmlWithCal.includes("Kalori"), "Calories card label is 'Kalori'");
assert.ok(htmlWithCal.includes("lucide-flame"), "Flame icon is rendered in Kalori card");

// Fallback for product without calories
assert.ok(
  htmlWithoutCal.includes("Belum diisi"),
  "Product without calories renders graceful fallback 'Belum diisi'"
);
assert.ok(
  !htmlWithoutCal.includes("null kcal") && !htmlWithoutCal.includes("undefined kcal"),
  "Product without calories does NOT display null/undefined/fake value"
);
console.log("  [PASS] Card 3 (Kalori): Flame icon, '450 kcal' value, and 'Belum diisi' fallback verified");

// -----------------------------------------------------------------------------
// SECTION 2: Admin Add & Edit Product Modal Form
// -----------------------------------------------------------------------------
console.log("\n--- Section 2: Admin Product Modal Form & Calories Field ---");

const addProductModalPath = path.resolve(
  process.cwd(),
  "src/components/admin/AddProductModal.tsx"
);
const modalSrc = fs.readFileSync(addProductModalPath, "utf-8");

assert.ok(modalSrc.includes("id=\"product-calories\""), "Modal has input with id 'product-calories'");
assert.ok(modalSrc.includes("type=\"number\""), "Kalori input has type 'number'");
assert.ok(modalSrc.includes("placeholder=\"Contoh: 450\""), "Kalori input has placeholder 'Contoh: 450'");
assert.ok(modalSrc.includes("Estimasi energi per porsi produk."), "Kalori helper text is present");
assert.ok(modalSrc.includes("kcal"), "Kalori unit 'kcal' is displayed");
assert.ok(modalSrc.includes("min=\"0\""), "Kalori input enforces minimum 0");
assert.ok(modalSrc.includes("calories: numCalories"), "Modal submits validated calories to server actions");
console.log("  [PASS] Admin Add/Edit modal form specifications for 'Kalori' field verified");

// -----------------------------------------------------------------------------
// SECTION 3: Server Actions & Type Definitions
// -----------------------------------------------------------------------------
console.log("\n--- Section 3: Server Actions & Types ---");

const actionsPath = path.resolve(process.cwd(), "src/app/admin/menu/actions.ts");
const actionsSrc = fs.readFileSync(actionsPath, "utf-8");

assert.ok(actionsSrc.includes("calories?: number | null;"), "Input interfaces include calories");
assert.ok(actionsSrc.includes("calories: caloriesNum"), "createProductAction inserts calories into database");
assert.ok(actionsSrc.includes("calories: finalCalories"), "updateProductAction updates calories in database");
assert.ok(actionsSrc.includes("directQuery = client.from(\"products\").select(\"id, slug, hpp, calories\")"), "getAdminProductForEditAction selects calories");

// Test input types compilation
const testCreatePayload: CreateProductInput = {
  name: "Nasi Uduk Spesial",
  categoryId: "cat-makanan",
  price: 25000,
  calories: 450,
  images: ["/images/hero-food.webp"],
};
assert.strictEqual(testCreatePayload.calories, 450, "CreateProductInput accepts calories integer");

const testUpdatePayload: UpdateProductInput = {
  id: "test-uuid",
  name: "Nasi Uduk Spesial",
  categoryId: "cat-makanan",
  price: 25000,
  calories: 500,
  images: ["/images/hero-food.webp"],
};
assert.strictEqual(testUpdatePayload.calories, 500, "UpdateProductInput accepts updated calories integer (500)");

const testOptionalPayload: CreateProductInput = {
  name: "Es Jeruk Murni",
  categoryId: "cat-minuman",
  price: 8000,
  images: ["/images/hero-food.webp"],
};
assert.strictEqual(testOptionalPayload.calories, undefined, "CreateProductInput works without calories (optional)");
console.log("  [PASS] Create, edit, and optional payloads verified");

// -----------------------------------------------------------------------------
// SECTION 4: Database Migration File Integrity
// -----------------------------------------------------------------------------
console.log("\n--- Section 4: Database Migration File Integrity ---");

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20261106010000_add_calories_to_products.sql"
);
assert.ok(fs.existsSync(migrationPath), "Migration file 20261106010000_add_calories_to_products.sql exists");

const migrationSql = fs.readFileSync(migrationPath, "utf-8");
assert.ok(
  migrationSql.includes("ADD COLUMN IF NOT EXISTS calories integer DEFAULT NULL"),
  "Migration adds nullable integer column calories"
);
assert.ok(
  migrationSql.includes("CHECK (calories IS NULL OR calories >= 0)"),
  "Migration enforces non-negative integer check constraint"
);
assert.ok(
  migrationSql.includes("GRANT SELECT (calories) ON TABLE public.products TO anon, authenticated;"),
  "Migration grants SELECT to anon and authenticated storefront roles"
);
assert.ok(
  migrationSql.includes("GRANT ALL (calories) ON TABLE public.products TO service_role;"),
  "Migration grants ALL to service_role"
);
console.log("  [PASS] Database migration syntax and security grants verified");

console.log("\n================================================================================");
console.log("✓ ALL ASSERTIONS PASSED! Product Nutrition & Info Cards Fully Verified.");
console.log("================================================================================\n");
