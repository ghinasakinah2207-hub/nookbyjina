/**
 * Valid Structured Data (JSON-LD) Generator
 * Conforms strictly to schema.org specifications and Google Search Central requirements.
 * Exclusively uses verified project information; never invents placeholder data.
 */

import { BRAND } from "@/lib/branding";
import type { Product } from "@/types";

export const CANONICAL_DOMAIN = "https://nookbyjina.my.id";

/**
 * Root structured data combining WebSite, Organization, and LocalBusiness/Restaurant.
 * Emitted once in root layout to establish site identity without duplication.
 */
export function getRootJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${CANONICAL_DOMAIN}/#website`,
        url: CANONICAL_DOMAIN,
        name: BRAND.name,
        description:
          "Nook by Jina menyediakan pilihan makanan dan minuman dengan sistem pre-order. Lihat menu dan pesan dengan mudah secara online.",
        inLanguage: "id-ID",
        publisher: {
          "@id": `${CANONICAL_DOMAIN}/#organization`,
        },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${CANONICAL_DOMAIN}/menu?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": ["Organization", "Restaurant"],
        "@id": `${CANONICAL_DOMAIN}/#organization`,
        name: BRAND.name,
        alternateName: BRAND.uppercaseName,
        url: CANONICAL_DOMAIN,
        logo: {
          "@type": "ImageObject",
          "@id": `${CANONICAL_DOMAIN}/#logo`,
          url: `${CANONICAL_DOMAIN}/images/mainpagelogo.webp`,
          caption: BRAND.name,
        },
        image: `${CANONICAL_DOMAIN}/images/og-image.png`,
        description:
          "Nook by Jina menyediakan pilihan makanan dan minuman dengan sistem pre-order. Lihat menu dan pesan dengan mudah secara online.",
        telephone: "+6282273180000",
        priceRange: "$$",
        servesCuisine: ["Indonesian", "Homemade", "Dessert", "Snack", "Beverage"],
        currenciesAccepted: "IDR",
        paymentAccepted: "Cash, QRIS",
        address: {
          "@type": "PostalAddress",
          streetAddress: "28R9+M8H, Dayah Lb, Kec. Lhoksukon",
          addressLocality: "Lhoksukon",
          addressRegion: "Aceh Utara",
          postalCode: "24382",
          addressCountry: "ID",
        },
        openingHoursSpecification: [
          {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ],
            opens: "09:00",
            closes: "17:00",
          },
        ],
        hasMenu: `${CANONICAL_DOMAIN}/menu`,
      },
    ],
  };
}

/**
 * Dynamic Product JSON-LD for individual product detail pages.
 */
export function getProductJsonLd(product: Product) {
  const productUrl = `${CANONICAL_DOMAIN}/produk/${encodeURIComponent(product.slug || product.id)}`;
  const primaryImage =
    product.images?.[0] && product.images[0].startsWith("http")
      ? product.images[0]
      : `${CANONICAL_DOMAIN}${product.images?.[0] || "/images/hero-food.webp"}`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}/#product`,
    name: product.name,
    description:
      product.description ||
      `Pesan menu ${product.name} lezat dari Nook by Jina di Lhoksukon.`,
    image: primaryImage,
    url: productUrl,
    brand: {
      "@type": "Brand",
      name: BRAND.name,
    },
    offers: {
      "@type": "Offer",
      price: product.basePrice,
      priceCurrency: "IDR",
      availability:
        product.isAvailable && !product.isArchived
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: productUrl,
      seller: {
        "@id": `${CANONICAL_DOMAIN}/#organization`,
      },
    },
  };
}
