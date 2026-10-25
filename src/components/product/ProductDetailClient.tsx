"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Heart,
  Plus,
  Minus,
  Check,
  AlertCircle,
  Star,
  Clock,
  Truck,
} from "lucide-react";
import { formatRupiah } from "@/data/dummy-data";
import { useCart } from "@/context/CartContext";
import { SelectedOption, SelectedAddon, Product } from "@/types";
import { ProductCard } from "@/components/product/ProductCard";
import { getProductBySlugOrId, getVisibleProducts } from "@/lib/supabase/catalog";
import { parseOptionLabel } from "@/lib/option-utils";

interface ProductDetailClientProps {
  productId: string;
  initialProduct?: Product | null;
  initialRecommended?: Product[];
  initialStoreOpen?: boolean;
}

export default function ProductDetailClient({
  productId,
  initialProduct,
  initialRecommended,
  initialStoreOpen = true,
}: ProductDetailClientProps) {
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(initialProduct ?? null);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>(
    initialRecommended ?? []
  );
  const [loading, setLoading] = useState<boolean>(!initialProduct);
  const [error, setError] = useState<string | null>(null);

  const { addToCart, isFavorite, toggleFavorite } = useCart();

  // Photo gallery state & touch swipe
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Selections state (groupId -> valueId) initialized from initialProduct
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const initialOpts: Record<string, string> = {};
    if (initialProduct) {
      initialProduct.optionGroups.forEach((group) => {
        if (group.required && group.values.length > 0) {
          initialOpts[group.id] = group.values[0].id;
        }
      });
    }
    return initialOpts;
  });

  // Set of selected addonIds
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set());

  // Quantity state
  const [quantity, setQuantity] = useState(1);

  // Item note state
  const [itemNote, setItemNote] = useState("");

  // Validation error state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [storeOpen, setStoreOpen] = useState<boolean>(initialStoreOpen);

  // Fetch product, store settings, and visible products on mount / ID change if not pre-populated
  useEffect(() => {
    let isMounted = true;

    // Check store settings asynchronously
    fetch("/api/store-settings")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.settings) {
          setStoreOpen(Boolean(data.settings.isOpen));
        }
      })
      .catch((err) => console.error("Error fetching store settings in product page:", err));

    // If initialProduct matches current productId, skip refetching
    if (initialProduct && (initialProduct.id === productId || initialProduct.slug === productId)) {
      return;
    }

    async function loadProductData() {
      if (!productId) return;
      try {
        const [fetchedProduct, allVisible] = await Promise.all([
          getProductBySlugOrId(productId),
          getVisibleProducts(),
        ]);

        if (isMounted) {
          setProduct(fetchedProduct);
          if (fetchedProduct) {
            const initialOpts: Record<string, string> = {};
            fetchedProduct.optionGroups.forEach((group) => {
              if (group.required && group.values.length > 0) {
                initialOpts[group.id] = group.values[0].id;
              }
            });
            setSelectedOptions(initialOpts);

            const recommended = allVisible
              .filter(
                (p) =>
                  p.id !== fetchedProduct.id &&
                  p.slug !== fetchedProduct.slug &&
                  (p.categoryId === fetchedProduct.categoryId || p.isHighlight)
              )
              .slice(0, 4);
            setRecommendedProducts(recommended);
          }
          setError(null);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const message =
            err instanceof Error ? err.message : "Terjadi kesalahan saat memuat menu.";
          setError(message);
          setLoading(false);
        }
      }
    }

    loadProductData();

    return () => {
      isMounted = false;
    };
  }, [productId, initialProduct]);

  const handleRetry = async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const [fetchedProduct, allVisible] = await Promise.all([
        getProductBySlugOrId(productId),
        getVisibleProducts(),
      ]);
      setProduct(fetchedProduct);
      if (fetchedProduct) {
        const initialOpts: Record<string, string> = {};
        fetchedProduct.optionGroups.forEach((group) => {
          if (group.required && group.values.length > 0) {
            initialOpts[group.id] = group.values[0].id;
          }
        });
        setSelectedOptions(initialOpts);

        const recommended = allVisible
          .filter(
            (p) =>
              p.id !== fetchedProduct.id &&
              p.slug !== fetchedProduct.slug &&
              (p.categoryId === fetchedProduct.categoryId || p.isHighlight)
          )
          .slice(0, 4);
        setRecommendedProducts(recommended);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Terjadi kesalahan saat memuat menu.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle option selection
  const handleSelectOption = (groupId: string, valueId: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [groupId]: valueId,
    }));
    setValidationError(null);
  };

  // Toggle addon selection
  const handleToggleAddon = (addonId: string) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(addonId)) {
        next.delete(addonId);
      } else {
        next.add(addonId);
      }
      return next;
    });
  };

  // Touch gesture handling for hero image swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || !product || product.images.length <= 1) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 40) {
      // Swipe left -> next image
      setCurrentImageIndex((prev) =>
        prev < product.images.length - 1 ? prev + 1 : 0
      );
    } else if (diff < -40) {
      // Swipe right -> prev image
      setCurrentImageIndex((prev) =>
        prev > 0 ? prev - 1 : product.images.length - 1
      );
    }
    setTouchStartX(null);
  };

  // Calculate dynamic unit price
  const { unitPrice, totalPrice, resolvedOptions, resolvedAddons } = useMemo(() => {
    if (!product) {
      return {
        unitPrice: 0,
        totalPrice: 0,
        resolvedOptions: [],
        resolvedAddons: [],
      };
    }

    let delta = 0;
    const resolvedOpts: SelectedOption[] = [];

    product.optionGroups.forEach((group) => {
      const selectedValId = selectedOptions[group.id];
      if (selectedValId) {
        const val = group.values.find((v) => v.id === selectedValId);
        if (val) {
          delta += val.priceDelta;
          resolvedOpts.push({
            groupId: group.id,
            groupName: group.name,
            valueId: val.id,
            valueName: val.name,
            optionValueId: val.id,
            optionValue: val.name,
            optionName: group.name,
            priceDelta: val.priceDelta,
          });
        }
      }
    });

    const resolvedAdds: SelectedAddon[] = [];
    product.addons.forEach((addon) => {
      if (selectedAddonIds.has(addon.id)) {
        delta += addon.price;
        resolvedAdds.push({
          addonId: addon.id,
          addonName: addon.name,
          price: addon.price,
        });
      }
    });

    const unit = product.basePrice + delta;
    return {
      unitPrice: unit,
      totalPrice: unit * quantity,
      resolvedOptions: resolvedOpts,
      resolvedAddons: resolvedAdds,
    };
  }, [product, selectedOptions, selectedAddonIds, quantity]);

  // Loading State: Skeleton matching product detail layout
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] pb-28">
        <main className="max-w-md mx-auto px-3.5 pt-3 space-y-3">
          {/* Skeleton Hero Image */}
          <div className="relative aspect-[4/3] w-full bg-neutral-200 rounded-2xl overflow-hidden animate-pulse border border-[#E5E5E5]">
            <div className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full bg-white/70" />
            <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/70" />
          </div>

          {/* Skeleton Info */}
          <div className="px-0.5 pt-0.5 space-y-2">
            <div className="h-2.5 bg-neutral-200 rounded w-16 animate-pulse" />
            <div className="flex items-center justify-between gap-2">
              <div className="h-4 bg-neutral-200 rounded w-3/5 animate-pulse" />
              <div className="h-4 bg-neutral-200 rounded w-1/4 animate-pulse" />
            </div>
            <div className="h-3 bg-neutral-100 rounded w-1/2 animate-pulse mt-1" />
            <div className="space-y-1 pt-1">
              <div className="h-2.5 bg-neutral-200 rounded w-full animate-pulse" />
              <div className="h-2.5 bg-neutral-200 rounded w-4/5 animate-pulse" />
            </div>
          </div>

          {/* Skeleton Option Groups */}
          <div className="bg-white border border-[#E5E5E5] rounded-xl p-3 space-y-2.5">
            <div className="h-3 bg-neutral-200 rounded w-24 animate-pulse" />
            <div className="grid grid-cols-2 gap-1.5">
              <div className="h-10 bg-neutral-100 rounded-lg animate-pulse" />
              <div className="h-10 bg-neutral-100 rounded-lg animate-pulse" />
            </div>
          </div>
        </main>

        {/* Skeleton Bottom Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E5E5]">
          <div className="max-w-md mx-auto px-3.5 py-2 flex items-center justify-between gap-2.5">
            <div className="h-8 w-24 bg-neutral-100 rounded-xl animate-pulse" />
            <div className="h-10 flex-1 bg-neutral-200 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-orange-50 flex items-center justify-center text-[#F25B09] mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-base font-bold text-[#111111]">Gagal Memuat Menu</h1>
        <p className="text-xs text-[#737373] mt-2 mb-6">{error}</p>
        <div className="flex gap-2">
          <button
            onClick={handleRetry}
            className="px-5 py-2.5 bg-[#111111] text-white text-xs font-semibold rounded-xl hover:bg-neutral-800 transition-colors"
          >
            Coba Lagi
          </button>
          <Link
            href="/menu"
            className="px-5 py-2.5 bg-white text-[#111111] border border-[#E5E5E5] text-xs font-semibold rounded-xl hover:border-neutral-300 transition-colors"
          >
            Kembali ke Menu
          </Link>
        </div>
      </div>
    );
  }

  // Missing Product State
  if (!product) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-base font-bold text-[#111111]">Produk Tidak Ditemukan</h1>
        <p className="text-xs text-[#737373] mt-2 mb-6">
          Menu yang Anda cari mungkin telah dihapus atau URL tidak valid.
        </p>
        <Link
          href="/menu"
          className="px-5 py-2.5 bg-[#111111] text-white text-xs font-semibold rounded-xl"
        >
          Kembali ke Menu
        </Link>
      </div>
    );
  }

  const favorited = isFavorite(product.id);
  const images = product.images.length > 0 ? product.images : ["/images/hero-food.webp"];

  // Handle Add to Cart
  const handleAddToCart = () => {
    if (!product.isAvailable || !storeOpen) return;

    // Validate all required option groups
    for (const group of product.optionGroups) {
      if (group.required && !selectedOptions[group.id]) {
        setValidationError(`Silakan pilih opsi untuk "${group.name}".`);
        return;
      }
    }

    addToCart(
      product,
      resolvedOptions,
      resolvedAddons,
      itemNote,
      quantity
    );
  };

  return (
    <div className="min-h-screen bg-[#F6F6F7] pb-28">
      <main className="max-w-md mx-auto px-3.5 pt-3 space-y-3">
        {/* Store Closed Warning Banner */}
        {!storeOpen && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-[#B42318] animate-landing-fade">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">
              Toko sedang close order. Pemesanan menu belum dapat dilakukan saat ini.
            </span>
          </div>
        )}

        {/* 1. Combined Cohesive Product Section on Body Background (No contrasting card wrapper) */}
        <section className="space-y-2">
          {/* Hero Image with Top Overlay Controls */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative aspect-[4/3] w-full bg-neutral-100 rounded-2xl overflow-hidden border border-[#E5E5E5] select-none"
          >
            <Image
              src={images[currentImageIndex]}
              alt={product.name}
              fill
              preload
              quality={85}
              className={`object-cover ${!product.isAvailable ? "grayscale opacity-75" : ""}`}
              sizes="(max-width: 640px) 100vw, 420px"
            />

            {/* Top-Left: Back Button Overlay */}
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Kembali"
              className="absolute top-2.5 left-2.5 z-20 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#111111] backdrop-blur-xs flex items-center justify-center transition-colors min-h-[34px] min-w-[34px]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Top-Right: Favorite Button Overlay */}
            <button
              type="button"
              onClick={() => toggleFavorite(product.id)}
              aria-label={
                favorited
                  ? `Hapus ${product.name} dari favorit`
                  : `Tambah ${product.name} ke favorit`
              }
              className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#111111] backdrop-blur-xs flex items-center justify-center transition-colors min-h-[34px] min-w-[34px]"
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  favorited ? "fill-[#F25B09] text-[#F25B09]" : "text-[#111111]"
                }`}
              />
            </button>

            {/* Multiple Photos Indicator Pill */}
            {images.length > 1 && (
              <div className="absolute bottom-2.5 right-2.5 z-20 bg-black/60 backdrop-blur-xs text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                {currentImageIndex + 1}/{images.length}
              </div>
            )}

            {/* Sold-out Overlay */}
            {!product.isAvailable ? (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                <span className="text-xs font-bold text-white bg-[#111111] px-3 py-1 rounded-full border border-white/20">
                  Stok Menu Habis
                </span>
              </div>
            ) : null}
          </div>

          {/* Product Information Directly Flowing Below Image */}
          <div className="px-0.5 pt-0.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#F25B09] uppercase tracking-wider">
                {product.categoryName || "Menu Pilihan"}
              </span>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-[#111111]">
                <Star className="w-3.5 h-3.5 text-[#FFC83D] fill-[#FFC83D]" />
                <span>4.9</span>
                <span className="text-[#737373] font-normal">(120+ ulasan)</span>
              </div>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-lg font-bold text-[#111111] leading-tight">
                {product.name}
              </h1>
              <span className="text-base font-bold text-[#111111] flex-shrink-0">
                {formatRupiah(unitPrice)}
              </span>
            </div>

            {product.description ? (
              <p className="text-xs text-[#737373] leading-relaxed pt-0.5">
                {product.description}
              </p>
            ) : null}

            {/* Quality & Service Trust Badges */}
            <div className="flex items-center gap-3 pt-1 text-[11px] text-[#737373] border-t border-[#E5E5E5] mt-2">
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#111111]" />
                <span>1 day</span>
              </div>
              <div className="flex items-center gap-1 text-[#29AC9A]">
                <Truck className="w-3.5 h-3.5 text-[#29AC9A]" />
                <span>Pickup & Delivery</span>
              </div>
            </div>
          </div>
        </section>

        {/* Validation Error Banner */}
        {validationError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-[#B42318] animate-shake">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* 2. Variant Option Groups */}
        {product.optionGroups.map((group) => {
          return (
            <section
              key={group.id}
              className="bg-white border border-[#E5E5E5] rounded-xl p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold text-[#111111]">
                    {group.name}
                  </h2>
                  <p className="text-[10px] text-[#737373]">
                    {group.required
                      ? "Wajib pilih 1 opsi"
                      : "Opsional (pilih salah satu)"}
                  </p>
                </div>
                {group.required && (
                  <span className="text-[9.5px] font-semibold text-[#F25B09] bg-orange-50 px-1.5 py-0.5 rounded">
                    Wajib
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {group.values.map((val) => {
                  const isSelected = selectedOptions[group.id] === val.id;
                  const { label, desc } = parseOptionLabel(val.name);

                  return (
                    <button
                      key={val.id}
                      type="button"
                      onClick={() => handleSelectOption(group.id, val.id)}
                      className={`min-h-[46px] p-2 rounded-lg text-left transition-colors flex items-center justify-between border ${
                        isSelected
                          ? "bg-neutral-50 border-[#111111] text-[#111111]"
                          : "bg-white border-[#E5E5E5] text-[#111111] hover:border-neutral-300"
                      }`}
                    >
                      <div className="min-w-0 pr-1">
                        <div className="text-[11px] font-medium leading-tight truncate">
                          {label}
                        </div>
                        {desc && (
                          <div className="text-[9.5px] text-[#737373] mt-0.5 leading-snug">
                            {desc}
                          </div>
                        )}
                        {val.priceDelta > 0 && (
                          <div className="text-[10px] text-[#F25B09] font-medium mt-0.5">
                            +{formatRupiah(val.priceDelta)}
                          </div>
                        )}
                      </div>

                      <div
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? "border-[#111111] bg-[#111111]"
                            : "border-neutral-300"
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* 3. Add-ons Section */}
        {product.addons.length > 0 && (
          <section className="bg-white border border-[#E5E5E5] rounded-xl p-3 space-y-2.5">
            <div>
              <h2 className="text-xs font-bold text-[#111111]">
                Ekstra Tambahan
              </h2>
              <p className="text-[10px] text-[#737373]">
                Pilihan ekstra pelengkap hidangan (opsional)
              </p>
            </div>

            <div className="space-y-1.5">
              {product.addons.map((addon) => {
                const isSelected = selectedAddonIds.has(addon.id);

                return (
                  <button
                    key={addon.id}
                    type="button"
                    onClick={() => handleToggleAddon(addon.id)}
                    className={`w-full min-h-[42px] px-3 py-2 rounded-lg text-left transition-colors flex items-center justify-between border ${
                      isSelected
                        ? "bg-neutral-50 border-[#111111] text-[#111111]"
                        : "bg-white border-[#E5E5E5] text-[#111111] hover:border-neutral-300"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-medium">{addon.name}</div>
                      <div className="text-[10.5px] text-[#F25B09] font-medium mt-0.5">
                        +{formatRupiah(addon.price)}
                      </div>
                    </div>

                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? "border-[#111111] bg-[#111111]"
                          : "border-neutral-300"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 4. Special Note for Kitchen */}
        <section className="bg-white border border-[#E5E5E5] rounded-xl p-3 space-y-1.5">
          <label
            htmlFor="item-note"
            className="text-xs font-bold text-[#111111] block"
          >
            Catatan Khusus
          </label>
          <input
            id="item-note"
            type="text"
            value={itemNote}
            onChange={(e) => setItemNote(e.target.value.slice(0, 100))}
            placeholder="Contoh: Sambal dipisah, jangan terlalu pedas..."
            className="w-full text-xs px-3 py-2 rounded-lg border border-[#E5E5E5] bg-[#F6F6F7] text-[#111111] focus:outline-none focus:border-[#111111] transition-colors"
          />
          <div className="text-right text-[9.5px] text-[#737373]">
            {itemNote.length}/100
          </div>
        </section>

        {/* 5. Recommended Companion Products */}
        {recommendedProducts.length > 0 && (
          <section className="space-y-2 pt-2">
            <h2 className="text-xs font-bold text-[#111111] px-0.5">
              Menu Rekomendasi Lainnya
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
              {recommendedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* 6. Sticky Floating Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E5E5]">
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center justify-between gap-2.5">
          {/* Quantity Controls */}
          <div className="flex items-center border border-[#E5E5E5] rounded-xl bg-white px-1.5 py-1">
            <button
              type="button"
              disabled={quantity <= 1 || !product.isAvailable || !storeOpen}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Kurangi jumlah pesanan"
              className="w-7 h-7 flex items-center justify-center text-[#111111] disabled:text-neutral-300 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-7 text-center text-xs font-bold text-[#111111]">
              {quantity}
            </span>
            <button
              type="button"
              disabled={quantity >= 99 || !product.isAvailable || !storeOpen}
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              aria-label="Tambah jumlah pesanan"
              className="w-7 h-7 flex items-center justify-center text-[#111111] disabled:text-neutral-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add to Cart CTA Button */}
          <button
            type="button"
            disabled={!product.isAvailable || !storeOpen}
            onClick={handleAddToCart}
            className={`flex-1 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
              product.isAvailable && storeOpen
                ? "bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] text-white"
                : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
            }`}
          >
            <span>
              {!storeOpen
                ? "Toko Sedang Tutup Order"
                : product.isAvailable
                ? "+ Tambah ke Keranjang"
                : "Menu Habis"}
            </span>
            <span className="font-bold">{formatRupiah(totalPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
