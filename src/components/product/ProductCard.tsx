"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Plus, Star, Clock, Truck } from "lucide-react";
import { Product } from "@/types";
import { formatRupiah } from "@/data/dummy-data";
import { useCart } from "@/context/CartContext";

interface ProductCardProps {
  product: Product;
  priority?: boolean;
  preload?: boolean;
  loading?: "eager" | "lazy";
}

export function ProductCard({
  product,
  priority = false,
  preload = false,
  loading,
}: ProductCardProps) {
  const { isFavorite, toggleFavorite, openQuickAdd } = useCart();
  const favorited = isFavorite(product.id);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(product.id);
  };

  const handlePlusClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!product.isAvailable) return;
    openQuickAdd(product);
  };

  // Extract category badges from product's actual category relationships
  const categoryBadges: string[] = useMemo(() => {
    // 1. From product.categories (object array) if populated
    if (product.categories && product.categories.length > 0) {
      const names = product.categories
        .map((c) => (typeof c === "string" ? c : c?.name))
        .filter((name): name is string => Boolean(name && name.trim()));
      if (names.length > 0) return Array.from(new Set(names));
    }

    // 2. From product.categoryNames (string array) if populated
    if (product.categoryNames && product.categoryNames.length > 0) {
      const names = product.categoryNames
        .filter((name): name is string => Boolean(name && name.trim()));
      if (names.length > 0) return Array.from(new Set(names));
    }

    // 3. Fallback to primary categoryName
    if (product.categoryName && product.categoryName.trim()) {
      return [product.categoryName.trim()];
    }

    return [];
  }, [product.categories, product.categoryNames, product.categoryName]);

  const imageSrc = product.images[0] || "/images/hero-food.webp";
  const shouldPrioritize = Boolean(preload || priority);

  return (
    <Link
      href={`/produk/${product.id}`}
      className="group flex flex-col h-full bg-[#FFFFFF] border border-[#E5E5E5] rounded-2xl overflow-hidden hover:border-neutral-300 transition-colors"
    >
      {/* 1. Product Image Container */}
      <div className="relative w-full aspect-[4/3] bg-neutral-100 overflow-hidden flex-shrink-0">
        <Image
          src={imageSrc}
          alt={product.name}
          fill
          priority={shouldPrioritize}
          loading={loading}
          quality={shouldPrioritize ? 85 : 80}
          className={`object-cover transition-transform duration-300 group-hover:scale-105 ${
            !product.isAvailable ? "grayscale opacity-75" : ""
          }`}
          sizes="(max-width: 640px) 160px, 220px"
        />

        {/* 2. Top-Left: Compact Rating Badge */}
        <div className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-0.5 bg-black/75 text-white text-[8.55px] font-semibold px-1.5 py-0.5 rounded-full backdrop-blur-xs">
          <Star className="w-2.5 h-2.5 text-[#FFC83D] fill-[#FFC83D]" />
          <span>4.9</span>
        </div>

        {/* 3. Top-Right: Subtle Translucent Favorite Button */}
        <button
          type="button"
          onClick={handleFavoriteClick}
          aria-label={
            favorited
              ? `Hapus ${product.name} dari favorit`
              : `Tambah ${product.name} ke favorit`
          }
          className="absolute top-1.5 right-1.5 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-black/25 hover:bg-black/40 text-white backdrop-blur-xs transition-colors"
        >
          <Heart
            className={`w-3 h-3 transition-colors ${
              favorited ? "fill-[#F25B09] text-[#F25B09]" : "text-white"
            }`}
          />
        </button>

        {/* Sold-out Overlay */}
        {!product.isAvailable ? (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-[9.5px] font-bold text-white bg-[#111111] px-2 py-0.5 rounded-full border border-white/20">
              Habis
            </span>
          </div>
        ) : null}
      </div>

      {/* Product Information Area (Compact 8-10px padding, minimal vertical gap) */}
      <div className="p-2 sm:p-2.5 flex flex-col justify-between flex-1 gap-1.5">
        <div>
          {/* Top row: Name & Price on the left, circular Orange Plus button on the right */}
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              {/* 4. Product Name - Font weight 400 (normal/regular) with compact nook badge */}
              <h3 className="text-[10.26px] sm:text-[11.97px] font-normal text-[#111111] line-clamp-2 leading-snug">
                <span className="inline-flex items-center justify-center bg-[#F25B09] text-white text-[7.5px] sm:text-[8.5px] font-medium px-1 py-[0.5px] rounded-[2.5px] align-middle -translate-y-[0.5px] mr-1 leading-none select-none">
                  nook
                </span>
                {product.name}
              </h3>

              {/* 5. Product Price directly below the product name (reduced by 5%: 12px -> 11.4px, 13px -> 12.35px) */}
              <p className="mt-0.5 text-[11.4px] sm:text-[12.35px] font-bold text-[#111111]">
                {formatRupiah(product.basePrice)}
              </p>
            </div>

            {/* Circular Orange + Button on the right, aligned beside name/price */}
            {product.isAvailable ? (
              <button
                type="button"
                onClick={handlePlusClick}
                aria-label={`Pilih opsi ${product.name}`}
                className="w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full bg-[#F25B09] hover:bg-[#D94D06] active:scale-95 text-white flex items-center justify-center transition-all flex-shrink-0 mt-0.5 cursor-pointer z-10"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            ) : (
              <span className="text-[8.55px] text-[#737373] font-medium flex-shrink-0 mt-1">
                Habis
              </span>
            )}
          </div>

          {/* 6. Compact Delivery Metadata Row - Inline 1 day and Free delivery (~9-10px) */}
          <div className="flex items-center gap-1.5 text-[9px] sm:text-[9.5px] text-[#737373] mt-1 flex-wrap leading-tight">
            <span className="inline-flex items-center gap-[2px] flex-shrink-0">
              <Clock className="w-[9.5px] h-[9.5px] text-[#737373] flex-shrink-0" />
              <span>1 day</span>
            </span>

            <span className="text-[#D4D4D4] text-[8px] leading-none select-none">•</span>

            <span
              title="Gratis ongkir untuk pesanan min. Rp 50.000 di Lhoksukon"
              className="inline-flex items-center gap-[2px] flex-shrink-0 text-[#29AC9A]"
            >
              <Truck className="w-[9.5px] h-[9.5px] text-[#29AC9A] flex-shrink-0" />
              <span>Free delivery</span>
            </span>
          </div>
        </div>

        {/* 7. Compact Category Chips - support multiple categories with small footprint (~8-8.5px) */}
        {categoryBadges.length > 0 && (
          <div className="pt-0.5 flex flex-wrap gap-1 items-center">
            {categoryBadges.map((badgeName) => (
              <span
                key={badgeName}
                className="inline-block px-1.5 py-[1.5px] text-[8px] sm:text-[8.5px] font-medium bg-[#111111] text-white rounded-[3.5px] tracking-wide leading-tight"
              >
                {badgeName}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
