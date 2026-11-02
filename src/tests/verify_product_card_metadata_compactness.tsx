import assert from "assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "@/components/product/ProductCard";
import { CartProvider } from "@/context/CartContext";
import { Product } from "@/types";

console.log("================================================================================");
console.log("TEST SUITE: Product Card Metadata Compactness & Gratis Ongkir Localization");
console.log("================================================================================\n");

// Product 1: READY Product - Nasi Ayam Geprek + Es Teh Manis
const readyProduct: Product = {
  id: "b47df29a-befe-4489-bf1b-11b577f28865",
  name: "Nasi Ayam Geprek + Es Teh Manis",
  slug: "nasi-ayam-geprek-es-teh-manis",
  description: "Paket komplit nasi ayam geprek sambal bawang pedas dengan es teh manis segar.",
  basePrice: 25000,
  categoryId: "cat-paket",
  categoryName: "Paket",
  isAvailable: true,
  images: ["/images/hero-food.webp"],
  optionGroups: [],
  addons: [],
  productType: "ready",
};

// Product 2: PRE-ORDER Product - Tortilla Roll Chicken Crispy
const preorderProduct: Product = {
  id: "aee48720-0c3b-4e70-9335-09e29fe8603a",
  name: "Tortilla Roll Chicken Crispy",
  slug: "tortilla-roll-chicken-crispy",
  description: "Tortilla isi ayam crispy renyah dengan saus spesial.",
  basePrice: 20000,
  categoryId: "cat-makanan",
  categoryName: "Makanan",
  isAvailable: true,
  images: ["/images/hero-food.webp"],
  optionGroups: [],
  addons: [],
  productType: "preorder",
};

function renderCard(product: Product) {
  return renderToStaticMarkup(
    <CartProvider>
      <ProductCard product={product} />
    </CartProvider>
  );
}

const htmlReady = renderCard(readyProduct);
const htmlPreorder = renderCard(preorderProduct);

// 1. Check READY card metadata
console.log("--- 1. Testing Nasi Ayam Geprek + Es Teh Manis (READY) ---");
assert.ok(htmlReady.includes("15–20 menit"), "READY card must contain '15–20 menit'");
assert.ok(htmlReady.includes("Gratis ongkir"), "READY card must contain 'Gratis ongkir'");
assert.ok(!htmlReady.includes("Free delivery"), "READY card must NOT contain 'Free delivery'");
assert.ok(htmlReady.includes("text-[8px] sm:text-[8.5px]"), "READY card must use 8px / 8.5px font size");
assert.ok(htmlReady.includes("flex-nowrap whitespace-nowrap"), "READY card metadata row must prevent wrapping");
console.log("  [PASS] '15–20 menit · Gratis ongkir' is rendered with 1px font size reduction and nowrap");

// 2. Check PRE-ORDER card metadata
console.log("\n--- 2. Testing Tortilla Roll Chicken Crispy (PRE-ORDER) ---");
assert.ok(htmlPreorder.includes("1 day"), "PRE-ORDER card must contain '1 day'");
assert.ok(htmlPreorder.includes("Gratis ongkir"), "PRE-ORDER card must contain 'Gratis ongkir'");
assert.ok(!htmlPreorder.includes("Free delivery"), "PRE-ORDER card must NOT contain 'Free delivery'");
assert.ok(htmlPreorder.includes("text-[8px] sm:text-[8.5px]"), "PRE-ORDER card must use 8px / 8.5px font size");
assert.ok(htmlPreorder.includes("flex-nowrap whitespace-nowrap"), "PRE-ORDER card metadata row must prevent wrapping");
console.log("  [PASS] '1 day · Gratis ongkir' is rendered with 1px font size reduction and nowrap");

// 3. Check icon dimensions & vertical alignment
console.log("\n--- 3. Testing Icon Dimensions & Colors ---");
assert.ok(htmlReady.includes("w-[8.5px] h-[8.5px] text-[#737373]"), "Clock icon must be scaled to 8.5px with #737373");
assert.ok(htmlReady.includes("w-[8.5px] h-[8.5px] text-[#29AC9A]"), "Truck icon must be scaled to 8.5px with #29AC9A");
assert.ok(htmlReady.includes("gap-[2px]"), "Icon-to-text gap must be preserved at 2px");
assert.ok(htmlReady.includes("•"), "Separator dot must be preserved");
console.log("  [PASS] Icons and separator strictly preserved with proportional 8.5px scaling");

// 4. Check card dimensions and title / price preservation
console.log("\n--- 4. Testing Layout & Design Invariants ---");
assert.ok(htmlReady.includes("line-clamp-2"), "Product title retains line-clamp-2");
assert.ok(htmlReady.includes("aspect-[4/3]"), "Image container retains aspect-[4/3]");
assert.ok(htmlReady.includes("Rp25.000"), "Price is intact");
assert.ok(htmlReady.includes("READY"), "READY badge intact");
assert.ok(htmlPreorder.includes("PRE-ORDER"), "PRE-ORDER badge intact");
console.log("  [PASS] Card layout, badges, price, and images strictly preserved");

console.log("\n================================================================================");
console.log("✓ ALL ASSERTIONS PASSED! Product card metadata is compact and single-line.");
console.log("================================================================================");

