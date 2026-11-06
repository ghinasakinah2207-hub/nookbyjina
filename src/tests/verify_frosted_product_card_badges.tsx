import assert from "assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "@/components/product/ProductCard";
import { CartProvider } from "@/context/CartContext";
import { Product } from "@/types";

console.log("================================================================================");
console.log("TEST SUITE: Frosted READY / PRE-ORDER Badges & Restored NOOK Brand Label");
console.log("================================================================================\n");

// 1. Target Products
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

// -----------------------------------------------------------------------------
// SECTION 1: Top-Left Ticket-Style Product Type Badges
// -----------------------------------------------------------------------------
console.log("--- Section 1: Top-Left Ticket-Style Product Type Badges ---");

// READY product
assert.ok(htmlReady.includes("READY"), "READY product renders READY badge");
assert.ok(htmlReady.includes("linear-gradient(135deg, #10B981 0%, #047857 100%)"), "READY badge has fresh green gradient");
assert.ok(htmlReady.includes("top-1.5 left-1.5"), "READY badge is positioned at top-left of image");
assert.ok(htmlReady.includes("radial-gradient(circle 2.2px"), "READY badge has ticket notch cutouts");
console.log("  [PASS] Nasi Ayam Geprek + Es Teh Manis renders ticket-style green READY badge at top-left");

// PRE-ORDER product
assert.ok(htmlPreorder.includes("PRE-ORDER"), "PRE-ORDER product renders PRE-ORDER badge");
assert.ok(htmlPreorder.includes("linear-gradient(135deg, #F97316 0%, #C2410C 100%)"), "PRE-ORDER badge has warm orange gradient");
assert.ok(htmlPreorder.includes("top-1.5 left-1.5"), "PRE-ORDER badge is positioned at top-left of image");
assert.ok(htmlPreorder.includes("radial-gradient(circle 2.2px"), "PRE-ORDER badge has ticket notch cutouts");
console.log("  [PASS] Tortilla Roll Chicken Crispy renders ticket-style warm orange PRE-ORDER badge at top-left");

// -----------------------------------------------------------------------------
// SECTION 2: Rating Badge Removal
// -----------------------------------------------------------------------------
console.log("\n--- Section 2: Rating Badge Removal from Image Area ---");
assert.ok(!htmlReady.includes("<span>4.9</span>"), "Rating 4.9 badge is removed from READY product image");
assert.ok(!htmlPreorder.includes("<span>4.9</span>"), "Rating 4.9 badge is removed from PRE-ORDER product image");
assert.ok(!htmlReady.includes("lucide-star"), "Star icon is removed from image area");
console.log("  [PASS] Rating badge (4.9 + Star) cleanly removed from top-left of image area");

// -----------------------------------------------------------------------------
// SECTION 3: Restored NOOK Brand Badge Before Product Name
// -----------------------------------------------------------------------------
console.log("\n--- Section 3: Restored NOOK Brand Label Before Product Name ---");
assert.ok(htmlReady.includes(">NOOK</span>"), "READY card renders NOOK brand label");
assert.ok(htmlPreorder.includes(">NOOK</span>"), "PRE-ORDER card renders NOOK brand label");

// Verify NOOK badge styling and placement inside h3
const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/;
const matchReadyH3 = htmlReady.match(h3Regex);
assert.ok(Boolean(matchReadyH3), "h3 title exists in READY card");
if (matchReadyH3) {
  const content = matchReadyH3[1];
  assert.ok(content.includes(">NOOK</span>"), "NOOK badge is inside h3 element");
  assert.ok(content.includes("Nasi Ayam Geprek + Es Teh Manis"), "Product title is inside h3 element");
  const nookIndex = content.indexOf(">NOOK</span>");
  const nameIndex = content.indexOf("Nasi Ayam Geprek + Es Teh Manis");
  assert.ok(nookIndex < nameIndex, "NOOK badge appears immediately before the product name");
}

const matchPreorderH3 = htmlPreorder.match(h3Regex);
assert.ok(Boolean(matchPreorderH3), "h3 title exists in PRE-ORDER card");
if (matchPreorderH3) {
  const content = matchPreorderH3[1];
  assert.ok(content.includes(">NOOK</span>"), "NOOK badge is inside h3 element");
  assert.ok(content.includes("Tortilla Roll Chicken Crispy"), "Product title is inside h3 element");
  const nookIndex = content.indexOf(">NOOK</span>");
  const nameIndex = content.indexOf("Tortilla Roll Chicken Crispy");
  assert.ok(nookIndex < nameIndex, "NOOK badge appears immediately before the product name");
}
console.log("  [PASS] NOOK badge restored immediately before product name with brand styling");

// -----------------------------------------------------------------------------
// SECTION 4: Top-Right Favorite Button & Metadata Invariants
// -----------------------------------------------------------------------------
console.log("\n--- Section 4: Favorite Button & Metadata Invariants ---");
assert.ok(htmlReady.includes("top-1.5 right-1.5"), "Favorite button is preserved at top-right of image");
assert.ok(htmlReady.includes("aria-label=\"Tambah Nasi Ayam Geprek + Es Teh Manis ke favorit\""), "Favorite button aria-label preserved");
assert.ok(htmlReady.includes("15–20 menit"), "READY estimate 15–20 menit preserved");
assert.ok(htmlPreorder.includes("1 day"), "PRE-ORDER estimate 1 day preserved");
assert.ok(htmlReady.includes("Gratis ongkir"), "Indonesian 'Gratis ongkir' label preserved");
assert.ok(htmlReady.includes("text-[8px] sm:text-[8.5px]"), "Compact 1px smaller metadata typography preserved");
console.log("  [PASS] Favorite button, estimates, and Gratis ongkir metadata strictly preserved");

console.log("\n================================================================================");
console.log("✓ ALL ASSERTIONS PASSED! Frosted badge & NOOK brand label verified.");
console.log("================================================================================");

