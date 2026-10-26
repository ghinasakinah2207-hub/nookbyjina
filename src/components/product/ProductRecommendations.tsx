import React from "react";
import { getRecommendedProducts } from "@/lib/supabase/catalog";
import { ProductCard } from "@/components/product/ProductCard";

interface ProductRecommendationsProps {
  categoryId?: string | null;
  productId: string;
  productSlug?: string;
}

export function ProductRecommendationsSkeleton() {
  return (
    <div className="space-y-2 pt-2" aria-hidden="true">
      <div className="h-3.5 w-36 bg-neutral-200 rounded animate-pulse px-0.5" />
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        <div className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden p-2 space-y-2">
          <div className="aspect-[4/3] w-full bg-neutral-200 rounded-xl animate-pulse" />
          <div className="h-3 bg-neutral-200 rounded w-3/4 animate-pulse" />
          <div className="h-3 bg-neutral-100 rounded w-1/2 animate-pulse" />
        </div>
        <div className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden p-2 space-y-2">
          <div className="aspect-[4/3] w-full bg-neutral-200 rounded-xl animate-pulse" />
          <div className="h-3 bg-neutral-200 rounded w-3/4 animate-pulse" />
          <div className="h-3 bg-neutral-100 rounded w-1/2 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export async function ProductRecommendations({
  categoryId,
  productId,
  productSlug,
}: ProductRecommendationsProps) {
  const recommended = await getRecommendedProducts(
    categoryId,
    productId,
    productSlug,
    4
  ).catch(() => []);

  if (!recommended || recommended.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2 pt-2">
      <h2 className="text-xs font-bold text-[#111111] px-0.5">
        Menu Rekomendasi Lainnya
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        {recommended.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
