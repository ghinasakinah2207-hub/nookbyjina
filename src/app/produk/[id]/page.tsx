import React, { Suspense } from "react";
import type { Metadata } from "next";
import { getProductBySlugOrId } from "@/lib/supabase/catalog";
import { getStoreSettings } from "@/lib/supabase/store-settings";
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
      title: "Menu Tidak Ditemukan — Nook by Jina",
      description: "Hidangan yang Anda cari tidak ditemukan di Nook by Jina.",
    };
  }

  const primaryImage = product.images[0] || "/images/hero-food.webp";

  return {
    title: `${product.name} — Nook by Jina`,
    description:
      product.description ||
      `Pesan menu ${product.name} lezat dari Nook by Jina. Siap saji untuk pickup dan delivery di Lhoksukon.`,
    openGraph: {
      title: `${product.name} — Nook by Jina`,
      description:
        product.description ||
        `Pesan menu ${product.name} lezat dari Nook by Jina.`,
      images: [
        {
          url: primaryImage,
          width: 800,
          height: 600,
          alt: product.name,
        },
      ],
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

  return (
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
  );
}
