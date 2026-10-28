"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Heart, ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { ProductCard } from "@/components/product/ProductCard";
import { PRODUCTS } from "@/data/dummy-data";
import { useCart } from "@/context/CartContext";
import { Product } from "@/types";

interface FavoritClientProps {
  catalogProducts?: Product[];
}

export default function FavoritClient({ catalogProducts = [] }: FavoritClientProps) {
  const { favorites } = useCart();
  const availableCatalog = catalogProducts.length > 0 ? catalogProducts : PRODUCTS;

  // Find all favorited products matching slug, id, or dbId
  const favoriteProducts = useMemo(() => {
    return availableCatalog.filter(
      (product) =>
        favorites.includes(product.id) ||
        (product.dbId && favorites.includes(product.dbId)) ||
        (product.slug && favorites.includes(product.slug))
    );
  }, [favorites, availableCatalog]);

  return (
    <div className="min-h-screen pb-24 bg-[#F6F6F7]">
      {/* Header with back button, no heart button in header on the favorites page itself */}
      <Header
        title="Menu Favorit"
        subtitle="Daftar makanan & minuman yang kamu simpan"
        showBack={true}
        backHref="/home"
        showFavorite={false}
      />

      <main className="max-w-md mx-auto px-3.5 pt-2.5 space-y-3.5">
        {favoriteProducts.length > 0 ? (
          <>
            <div className="flex items-center justify-between px-0.5 text-xs text-[#737373]">
              <span>
                Menampilkan <strong className="text-[#111111]">{favoriteProducts.length}</strong> menu favorit
              </span>
              <Link
                href="/menu"
                className="text-[#F25B09] font-medium hover:underline flex items-center gap-0.5"
              >
                Eksplor menu lain <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Grid of favorited products using shared compact ProductCard */}
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5 pt-1">
              {favoriteProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          /* Helpful Empty State */
          <div className="p-8 text-center bg-white rounded-2xl space-y-3 my-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-[#737373]">
              <Heart className="w-6 h-6 text-[#737373]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#111111]">
                Belum Ada Menu Favorit
              </h2>
              <p className="text-xs text-[#737373] mt-1 max-w-xs mx-auto">
                Tekan ikon hati pada hidangan favoritmu untuk menyimpannya di sini agar lebih cepat dipesan nanti.
              </p>
            </div>
            <Link
              href="/menu"
              className="inline-flex items-center justify-center px-4 py-2.5 bg-[#F25B09] text-white text-xs font-semibold rounded-xl min-h-[44px] hover:bg-[#D94D06] transition-colors"
            >
              Eksplor Menu Sekarang
            </Link>
          </div>
        )}
      </main>

      <BottomNavigation />
    </div>
  );
}
