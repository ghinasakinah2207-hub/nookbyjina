import React, { Suspense } from "react";
import type { Metadata } from "next";
import { getProductBySlugOrId, getVisibleProducts } from "@/lib/supabase/catalog";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import ProductDetailClient from "@/components/product/ProductDetailClient";

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

  const [product, allVisible, storeSettings] = await Promise.all([
    getProductBySlugOrId(decodedId).catch(() => null),
    getVisibleProducts().catch(() => []),
    getStoreSettings().catch(() => ({
      isOpen: true,
    })),
  ]);

  const recommended = product
    ? allVisible
        .filter(
          (p) =>
            p.id !== product.id &&
            p.slug !== product.slug &&
            (p.categoryId === product.categoryId || p.isHighlight)
        )
        .slice(0, 4)
    : [];

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center text-xs text-[#737373]">
          Memuat menu...
        </div>
      }
    >
      <ProductDetailClient
        productId={decodedId}
        initialProduct={product}
        initialRecommended={recommended}
        initialStoreOpen={Boolean(storeSettings.isOpen)}
      />
    </Suspense>
  );
}
