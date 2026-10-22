import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "../components/product/ProductCard";
import { PRODUCTS } from "../data/dummy-data";
import { CartProvider } from "../context/CartContext";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== 1. Verifying ProductCard Title & Nook Badge Rendering ===");

const sampleProduct = PRODUCTS[0]; // Nasi Bakar Cakalang Asap
const longTitleProduct = {
  ...PRODUCTS[0],
  id: "long-title-test",
  name: "Nasi Bakar Cakalang Asap Super Pedas Daun Pisang Spesial Lhoksukon Jumbo",
};

function renderCard(product = sampleProduct) {
  return renderToStaticMarkup(
    <CartProvider>
      <ProductCard product={product} />
    </CartProvider>
  );
}

const html = renderCard(sampleProduct);

// Verify title has font-normal (font-weight 400)
assert(
  html.includes("font-normal") && !html.includes("font-semibold text-[#111111] line-clamp-2"),
  "Product title uses font-normal (weight 400) instead of font-semibold"
);

// Verify line-clamp-2 and leading-snug are preserved
assert(html.includes("line-clamp-2"), "Product title preserves line-clamp-2");
assert(html.includes("leading-snug"), "Product title preserves leading-snug");

// Verify nook badge exists and contains exact lowercase text 'nook'
assert(
  html.includes(">nook</span>"),
  "Product card renders compact badge with lowercase text 'nook'"
);

// Verify badge styling: brand orange, white text, compact shape
assert(
  html.includes("bg-[#F25B09]") && html.includes("text-white"),
  "Badge uses Nook brand orange accent (#F25B09) and white text"
);

assert(
  html.includes("rounded-[2.5px]") || html.includes("rounded-sm") || html.includes("rounded-[3px]"),
  "Badge uses compact horizontal shape with subtly rounded corners"
);

// Verify badge is inside the h3 element before product name
const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/;
const h3Match = html.match(h3Regex);
assert(Boolean(h3Match), "h3 title element exists in rendered markup");

if (h3Match) {
  const h3Content = h3Match[1];
  assert(
    h3Content.includes(">nook</span>") && h3Content.includes("Nasi Bakar Cakalang Asap"),
    "Badge and product title are enclosed together in the h3 element"
  );
  const badgeIndex = h3Content.indexOf(">nook</span>");
  const nameIndex = h3Content.indexOf("Nasi Bakar Cakalang Asap");
  assert(badgeIndex < nameIndex, "Badge appears before the product title text on line 1");
}

// Verify price typography is bold and visually stronger
assert(
  html.includes("font-bold text-[#111111]"),
  "Product price retains font-bold typography (stronger than regular title)"
);

console.log("\n=== 2. Verifying Long Title Product Card ===");
const longHtml = renderCard(longTitleProduct);
assert(
  longHtml.includes(">nook</span>") &&
    longHtml.includes("Nasi Bakar Cakalang Asap Super Pedas"),
  "Long title product card renders nook badge and title correctly"
);

console.log("\nAll ProductCard Title & Nook Badge tests passed successfully! 🎉\n");
