import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "../components/product/ProductCard";
import { PRODUCTS } from "../data/dummy-data";
import { CartProvider } from "../context/CartContext";
import { Product } from "@/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== 1. Verifying Preparation-Time & Delivery Metadata ===");

const singleCategoryProduct: Product = {
  ...PRODUCTS[0], // Nasi Bakar Cakalang Asap
  categoryName: "Makanan",
};

const multiCategoryProduct: Product = {
  ...PRODUCTS[0],
  categoryName: "Makanan",
  categories: [
    { id: "cat-makanan", name: "Makanan", slug: "makanan" },
    { id: "cat-paket", name: "Paket", slug: "paket" },
  ],
};

const multiCategoryNamesProduct: Product = {
  ...PRODUCTS[1],
  categoryName: "Makanan",
  categoryNames: ["Makanan", "Paket"],
};

const noCategoryProduct: Product = {
  ...PRODUCTS[2],
  categoryName: "",
  categories: [],
  categoryNames: [],
};

const longTitleProduct: Product = {
  ...multiCategoryProduct,
  name: "Nasi Bakar Cakalang Asap Sambal Kecombrang Gurih Pedas Mantap Porsi Jumbo Lhoksukon",
};

function renderCard(product: Product) {
  return renderToStaticMarkup(
    <CartProvider>
      <ProductCard product={product} />
    </CartProvider>
  );
}

const htmlSingle = renderCard(singleCategoryProduct);
const htmlMulti = renderCard(multiCategoryProduct);
const htmlMultiNames = renderCard(multiCategoryNamesProduct);
const htmlNoCat = renderCard(noCategoryProduct);
const htmlLongTitle = renderCard(longTitleProduct);

// --- Metadata Row Checks ---
assert(
  htmlSingle.includes("text-[9px] sm:text-[9.5px]"),
  "Metadata text size is reduced to compact 9-9.5px range"
);

assert(
  htmlSingle.includes("w-[9.5px] h-[9.5px] text-[#737373]"),
  "Clock icon is scaled proportionally to 9.5px with muted #737373 color"
);

assert(
  htmlSingle.includes("w-[9.5px] h-[9.5px] text-[#29AC9A]"),
  "Delivery truck icon is scaled proportionally to 9.5px with teal #29AC9A color"
);

assert(
  htmlSingle.includes("gap-[2px]"),
  "Horizontal gap between icons and labels is reduced to 2px"
);

assert(
  htmlSingle.includes("1 day") && htmlSingle.includes("Free delivery"),
  "Preparation-time ('1 day') and delivery text ('Free delivery') are preserved"
);

assert(
  htmlSingle.includes("text-[#D4D4D4]") && htmlSingle.includes("•"),
  "Bullet separator between preparation-time and delivery is preserved"
);

console.log("\n=== 2. Verifying Compact Category Badges Styling ===");

assert(
  htmlSingle.includes("text-[8px] sm:text-[8.5px]"),
  "Category badge text size is compact in the 8-9px range (8-8.5px)"
);

assert(
  htmlSingle.includes("px-1.5 py-[1.5px]"),
  "Category badge horizontal and vertical padding is reduced proportionally (px-1.5 py-[1.5px])"
);

assert(
  htmlSingle.includes("bg-[#111111]") && htmlSingle.includes("text-white"),
  "Category badge preserves dark background (#111111) and high-contrast white text"
);

assert(
  htmlSingle.includes("rounded-[3.5px]"),
  "Category badge preserves compact rounded corner shape (rounded-[3.5px])"
);

assert(
  htmlSingle.includes("font-medium"),
  "Category badge uses font-medium to avoid excessive boldness"
);

console.log("\n=== 3. Verifying Single and Multiple Category Support ===");

// Single category card
const singleBadgeMatches = htmlSingle.match(/inline-block px-1\.5 py-\[1\.5px\]/g) || [];
assert(
  singleBadgeMatches.length === 1 && htmlSingle.includes(">Makanan</span>"),
  "Single category product renders exactly 1 badge ('Makanan')"
);

// Multi-category card via categories array
const multiBadgeMatches = htmlMulti.match(/inline-block px-1\.5 py-\[1\.5px\]/g) || [];
assert(
  multiBadgeMatches.length === 2 &&
    htmlMulti.includes(">Makanan</span>") &&
    htmlMulti.includes(">Paket</span>"),
  "Multi-category product with categories array renders 2 separate badges ('Makanan' and 'Paket')"
);

// Multi-category card via categoryNames array
const multiNamesBadgeMatches = htmlMultiNames.match(/inline-block px-1\.5 py-\[1\.5px\]/g) || [];
assert(
  multiNamesBadgeMatches.length === 2 &&
    htmlMultiNames.includes(">Makanan</span>") &&
    htmlMultiNames.includes(">Paket</span>"),
  "Multi-category product with categoryNames array renders 2 separate badges ('Makanan' and 'Paket')"
);

// No category card
const noBadgeMatches = htmlNoCat.match(/inline-block px-1\.5 py-\[1\.5px\]/g) || [];
assert(
  noBadgeMatches.length === 0,
  "Product with no category cleanly renders 0 badges (fallback preserved)"
);

// Wrapping container
assert(
  htmlMulti.includes("flex flex-wrap gap-1 items-center"),
  "Category badges are rendered in a wrapping container with gap-1 without overflow"
);

console.log("\n=== 4. Verifying Long Titles & Card Design Preservation ===");

assert(
  htmlLongTitle.includes(">nook</span>") && htmlLongTitle.includes("font-normal"),
  "Product title weight 400 and nook badge are strictly preserved on long titles"
);

assert(
  htmlLongTitle.includes("aspect-[4/3]"),
  "Image aspect ratio aspect-[4/3] is preserved"
);

assert(
  htmlLongTitle.includes("font-bold text-[#111111]") && htmlLongTitle.includes("Rp25.000"),
  "Product price typography and format are strictly preserved"
);

console.log("\n🎉 ALL PRODUCT CARD METADATA & CATEGORY BADGE TESTS PASSED SUCCESSFULLY!\n");
