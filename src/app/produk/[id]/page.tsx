import React, { Suspense } from "react";
import type { Metadata } from "next";
import { getProductBySlugOrId } from "@/lib/supabase/catalog";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import { getProductJsonLd, CANONICAL_DOMAIN } from "@/lib/json-ld";
import ProductDetailClient from "@/components/product/ProductDetailClient";
import {
  ProductRecommendations,
  ProductRecommendationsSkeleton,
} from "@/components/product/ProductRecommendations";

export const instant = false;

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const product = await getProductBySlugOrId(decodedId).catch(() => null);

  if (!product) {
    return {
      title: "Menu Tidak Ditemukan",
      description: "Hidangan yang Anda cari tidak ditemukan di Nook by Jina.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const primaryImage =
    product.images?.[0] && product.images[0].startsWith("http")
      ? product.images[0]
      : `${CANONICAL_DOMAIN}${product.images?.[0] || "/images/hero-food.webp"}`;

  const canonicalUrl = `${CANONICAL_DOMAIN}/produk/${encodeURIComponent(product.slug || decodedId)}`;

  return {
    title: product.name,
    description:
      product.description ||
      `Pesan menu ${product.name} lezat dari Nook by Jina. Siap saji untuk pickup dan delivery di Lhoksukon.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      title: `${product.name} | Nook by Jina`,
      description:
        product.description ||
        `Pesan menu ${product.name} lezat dari Nook by Jina di Lhoksukon.`,
      images: [
        {
          url: primaryImage,
          width: 800,
          height: 600,
          alt: product.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} | Nook by Jina`,
      description:
        product.description ||
        `Pesan menu ${product.name} lezat dari Nook by Jina di Lhoksukon.`,
      images: [primaryImage],
    },
  };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const [product, storeSettings] = await Promise.all([
    getProductBySlugOrId(decodedId).catch(() => null),
    getStoreSettings().catch(() => ({
      isOpen: true,
    })),
  ]);

  const productJsonLd = product ? getProductJsonLd(product) : null;

  return (
    <>
      {productJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}
      <ProductDetailClient
        key={decodedId}
        productId={decodedId}
        initialProduct={product}
        initialStoreOpen={Boolean(storeSettings.isOpen)}
        recommendedSlot={
          product ? (
            <Suspense fallback={<ProductRecommendationsSkeleton />}>
              <ProductRecommendations
                categoryId={product.categoryId}
                productId={product.dbId || product.id}
                productSlug={product.slug}
              />
            </Suspense>
          ) : null
        }
      />
    </>
  );
}
