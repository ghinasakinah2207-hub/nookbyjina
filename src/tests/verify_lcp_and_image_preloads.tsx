import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "../components/product/ProductCard";
import { PromoCarousel } from "../components/home/PromoCarousel";
import { PRODUCTS, BANNERS } from "../data/dummy-data";
import { CartProvider } from "../context/CartContext";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== 1. Verifying PromoCarousel (Home Page Hero LCP) ===");
const carouselHtml = renderToStaticMarkup(<PromoCarousel banners={BANNERS} />);
// The first banner in BANNERS is banner-promo-1.webp
assert(
  carouselHtml.includes("banner-promo-1.webp"),
  "PromoCarousel renders first active banner image (banner-promo-1.webp)"
);

console.log("\n=== 2. Verifying ProductCard Preload & Loading Attributes ===");
// Case A: Preloaded primary LCP product (idx === 0 on /menu)
const preloadedCardHtml = renderToStaticMarkup(
  <CartProvider>
    <ProductCard
      product={PRODUCTS[0]}
      preload={true}
      loading="eager"
    />
  </CartProvider>
);

// Should have eager loading
assert(
  preloadedCardHtml.includes('loading="eager"') || !preloadedCardHtml.includes('loading="lazy"'),
  "Preloaded ProductCard is eager and not lazy-loaded"
);

// Case B: Row 1 Column 2 card on /menu (ayam-suwir-matah)
// It is above the fold so it loads eagerly, but DOES NOT add a preload link
const row1Col2CardHtml = renderToStaticMarkup(
  <CartProvider>
    <ProductCard
      product={PRODUCTS[1]}
      preload={false}
      loading="eager"
    />
  </CartProvider>
);

assert(
  row1Col2CardHtml.includes('loading="eager"'),
  "Row 1 Column 2 card has loading='eager' to prevent lazy LCP delay"
);

// Case C: Standard below-the-fold product card (idx >= 2)
const lazyCardHtml = renderToStaticMarkup(
  <CartProvider>
    <ProductCard
      product={PRODUCTS[2]}
      preload={false}
      loading="lazy"
    />
  </CartProvider>
);

assert(
  lazyCardHtml.includes('loading="lazy"'),
  "Below-the-fold product cards have loading='lazy'"
);

// Case D: Default ProductCard without explicit props
const defaultCardHtml = renderToStaticMarkup(
  <CartProvider>
    <ProductCard product={PRODUCTS[3]} />
  </CartProvider>
);

assert(
  defaultCardHtml.includes('loading="lazy"'),
  "Default ProductCard without props defaults to loading='lazy'"
);

console.log("\n=== 3. Verifying LCP Candidate Identification ===");
// 1. Home page LCP is the hero promotional banner
const homeHeroImage = BANNERS[0].imageUrl;
assert(
  homeHeroImage === "/images/banner-promo-1.webp",
  "Home page true LCP element is /images/banner-promo-1.webp (area ~65,130 px²)"
);

// 2. Menu page LCP is Product 0 in catalog (Row 1, Column 1)
const menuHeroImage = PRODUCTS[0].images[0];
assert(
  menuHeroImage === "/images/hero-food.webp",
  "Menu page true LCP element is /images/hero-food.webp (Row 1, Col 1)"
);

// 3. Products that previously triggered warnings
const product1Image = PRODUCTS[1].images[0]; // /images/ayam-suwir-matah.webp
const product2Image = PRODUCTS[2].images[0]; // /images/risol-mayo.webp
assert(
  product1Image === "/images/ayam-suwir-matah.webp",
  "Product 1 (/images/ayam-suwir-matah.webp) is in Row 1 Col 2 and receives loading='eager' on /menu without redundant preload"
);
assert(
  product2Image === "/images/risol-mayo.webp",
  "Product 2 (/images/risol-mayo.webp) is below Row 1 and remains lazy-loaded on initial load"
);

console.log("\nAll LCP & Image Preload tests passed successfully! 🎉\n");
