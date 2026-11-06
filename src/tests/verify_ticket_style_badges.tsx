import assert from "assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "@/components/product/ProductCard";
import { TicketBadge } from "@/components/ui/TicketBadge";
import { CartProvider } from "@/context/CartContext";
import { Product } from "@/types";

console.log("================================================================================");
console.log("TEST SUITE: Ticket-Style Product Type Badges (READY / PRE-ORDER)");
console.log("================================================================================\n");

// 1. Mock Target Products
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

const htmlReadyCard = renderCard(readyProduct);
const htmlPreorderCard = renderCard(preorderProduct);

// -----------------------------------------------------------------------------
// SECTION 1: Ticket Silhouette & Mask Cutouts
// -----------------------------------------------------------------------------
console.log("--- Section 1: Ticket Silhouette & Mask Cutouts ---");

// Test TicketBadge component directly
const readyBadgeMarkup = renderToStaticMarkup(<TicketBadge type="ready" />);
const preorderBadgeMarkup = renderToStaticMarkup(<TicketBadge type="preorder" />);

assert.ok(readyBadgeMarkup.includes("data-testid=\"ticket-badge\""), "TicketBadge renders testid");
assert.ok(readyBadgeMarkup.includes("data-product-type=\"ready\""), "TicketBadge renders normalized ready product type");
assert.ok(preorderBadgeMarkup.includes("data-product-type=\"preorder\""), "TicketBadge renders normalized preorder product type");

// Semicircular cutouts via mask-image
assert.ok(
  readyBadgeMarkup.includes("radial-gradient(circle 2.2px at 0% 50%"),
  "Ticket notch on left edge punched via radial-gradient cutout"
);
assert.ok(
  readyBadgeMarkup.includes("radial-gradient(circle 2.2px at 100% 50%"),
  "Ticket notch on right edge punched via radial-gradient cutout"
);
assert.ok(
  readyBadgeMarkup.includes("mask-size:51% 100%"),
  "Mask sizing provides seamless 51% coverage per half"
);
assert.ok(
  readyBadgeMarkup.includes("drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.22))"),
  "Ticket contour drop-shadow is applied"
);
console.log("  [PASS] Ticket notch cutouts (left & right) and drop-shadow verified");

// -----------------------------------------------------------------------------
// SECTION 2: Gradient Colors & Typography
// -----------------------------------------------------------------------------
console.log("\n--- Section 2: Gradient Colors & Typography ---");

// READY: Green gradient + bold white text
assert.ok(
  readyBadgeMarkup.includes("linear-gradient(135deg, #10B981 0%, #047857 100%)"),
  "READY badge has fresh green gradient from #10B981 to #047857"
);
assert.ok(readyBadgeMarkup.includes("text-white"), "READY badge text is white");
assert.ok(readyBadgeMarkup.includes("font-bold"), "READY badge text is bold");
assert.ok(readyBadgeMarkup.includes("READY"), "READY badge displays uppercase 'READY' label");
console.log("  [PASS] READY badge renders fresh green gradient with bold white text");

// PRE-ORDER: Orange gradient + bold white text
assert.ok(
  preorderBadgeMarkup.includes("linear-gradient(135deg, #F97316 0%, #C2410C 100%)"),
  "PRE-ORDER badge has warm orange gradient from #F97316 to #C2410C"
);
assert.ok(preorderBadgeMarkup.includes("text-white"), "PRE-ORDER badge text is white");
assert.ok(preorderBadgeMarkup.includes("font-bold"), "PRE-ORDER badge text is bold");
assert.ok(preorderBadgeMarkup.includes("PRE-ORDER"), "PRE-ORDER badge displays uppercase 'PRE-ORDER' label");
console.log("  [PASS] PRE-ORDER badge renders warm orange gradient with bold white text");

// -----------------------------------------------------------------------------
// SECTION 3: ProductCard Integration & Placement
// -----------------------------------------------------------------------------
console.log("\n--- Section 3: ProductCard Placement & Proportions ---");

// Top-left position over product image
assert.ok(htmlReadyCard.includes("top-1.5 left-1.5"), "Ticket badge placed at top-1.5 left-1.5 over product image");
assert.ok(htmlReadyCard.includes("z-10"), "Ticket badge maintains z-10 layering above image");
assert.ok(htmlPreorderCard.includes("top-1.5 left-1.5"), "PRE-ORDER ticket badge placed at top-1.5 left-1.5 over product image");

// Favorite button preserved at top-right without overlapping
assert.ok(htmlReadyCard.includes("top-1.5 right-1.5"), "Favorite button preserved at top-1.5 right-1.5");
assert.ok(htmlPreorderCard.includes("top-1.5 right-1.5"), "Favorite button preserved at top-1.5 right-1.5 on PRE-ORDER card");

// Card image aspect ratio & styling preserved
assert.ok(htmlReadyCard.includes("aspect-[4/3]"), "Product card 4:3 image aspect ratio preserved");
assert.ok(htmlReadyCard.includes(">NOOK</span>"), "NOOK brand label before title preserved");
assert.ok(htmlReadyCard.includes("15–20 menit"), "READY estimate preserved");
assert.ok(htmlPreorderCard.includes("1 day"), "PRE-ORDER estimate preserved");
console.log("  [PASS] ProductCard placement, aspect ratio, favorite button, and metadata preserved");

// -----------------------------------------------------------------------------
// SECTION 4: Size Variants (Standard sm vs Medium md for Product Detail)
// -----------------------------------------------------------------------------
console.log("\n--- Section 4: Size Variants & Storefront Detail Consistency ---");

const mediumBadgeMarkup = renderToStaticMarkup(<TicketBadge type="ready" size="md" />);
assert.ok(mediumBadgeMarkup.includes("h-[16.5px]"), "Medium size has proportional height");
assert.ok(mediumBadgeMarkup.includes("rounded-[3px]"), "Medium size has slightly rounded corners");
console.log("  [PASS] Size variants (sm and md) verified");

console.log("\n================================================================================");
console.log("✓ ALL ASSERTIONS PASSED! Ticket-style product badges verified.");
console.log("================================================================================\n");

