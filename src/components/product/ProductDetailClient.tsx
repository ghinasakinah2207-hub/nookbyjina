"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Share2,
  ShoppingCart,
  Check,
  AlertCircle,
  Star,
  Truck,
  Clock,
  Flame,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { STORE_SETTINGS } from "@/data/dummy-data";
import { useCart } from "@/context/CartContext";
import { CartItem, SelectedOption, SelectedAddon, Product } from "@/types";
import { ProductCard } from "@/components/product/ProductCard";
import { getProductBySlugOrId, getRecommendedProducts } from "@/lib/supabase/catalog";
import { QuickAddModal, QuickAddConfirmData, QuickAddIntent } from "@/components/product/QuickAddModal";
import { getProductType, getProductTypeConfig } from "@/lib/product-type";
import { TicketBadge } from "@/components/ui/TicketBadge";

interface ProductDetailClientProps {
  productId: string;
  initialProduct?: Product | null;
  initialRecommended?: Product[];
  initialStoreOpen?: boolean;
  recommendedSlot?: React.ReactNode;
}

function useSafeRouter() {
  try {
    return useRouter();
  } catch {
    return {
      push: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      replace: () => {},
      prefetch: () => {},
    };
  }
}

export default function ProductDetailClient({
  productId,
  initialProduct,
  initialRecommended,
  initialStoreOpen = true,
  recommendedSlot,
}: ProductDetailClientProps) {
  const router = useSafeRouter();

  const [product, setProduct] = useState<Product | null>(initialProduct ?? null);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>(
    initialRecommended ?? []
  );
  const [loading, setLoading] = useState<boolean>(!initialProduct);
  const [error, setError] = useState<string | null>(null);

  const { addToCart, itemCount, setBuyNowItem } = useCart();

  // Photo gallery state & carousel gesture tracking
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isSwipingHorizontalRef = useRef(false);
  const isDirectionLockedRef = useRef(false);

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

  // Quantity state (default 1)
  const [quantity, setQuantity] = useState(1);

  // Item note state
  const [itemNote, setItemNote] = useState("");

  // Store settings
  const [storeOpen, setStoreOpen] = useState<boolean>(Boolean(initialStoreOpen));
  const [adminWhatsapp, setAdminWhatsapp] = useState<string>(STORE_SETTINGS.adminWhatsapp);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  // Bottom-sheet variation modal state
  const [isVariationModalOpen, setIsVariationModalOpen] = useState(false);
  const [modalTargetAction, setModalTargetAction] = useState<QuickAddIntent>("dual");

  // Fetch product, store settings, and recommendations on mount / ID change if not pre-populated
  useEffect(() => {
    let isMounted = true;

    fetch("/api/store-settings")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.settings) {
          if (typeof data.settings.isOpen === "boolean") {
            setStoreOpen(Boolean(data.settings.isOpen));
          }
          if (data.settings.adminWhatsapp) {
            setAdminWhatsapp(data.settings.adminWhatsapp);
          }
        }
      })
      .catch((err) => console.error("Error fetching store settings in product page:", err));

    if (initialProduct && (initialProduct.id === productId || initialProduct.slug === productId)) {
      return;
    }

    async function loadProductData() {
      if (!productId) return;
      try {
        const fetchedProduct = await getProductBySlugOrId(productId);

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

            const recommended = await getRecommendedProducts(
              fetchedProduct.categoryId,
              fetchedProduct.dbId || fetchedProduct.id,
              fetchedProduct.slug,
              4
            );
            if (isMounted) {
              setRecommendedProducts(recommended);
            }
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
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [productId, initialProduct]);

  const handleRetry = async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const fetchedProduct = await getProductBySlugOrId(productId);
      setProduct(fetchedProduct);
      if (fetchedProduct) {
        const initialOpts: Record<string, string> = {};
        fetchedProduct.optionGroups.forEach((group) => {
          if (group.required && group.values.length > 0) {
            initialOpts[group.id] = group.values[0].id;
          }
        });
        setSelectedOptions(initialOpts);

        const recommended = await getRecommendedProducts(
          fetchedProduct.categoryId,
          fetchedProduct.dbId || fetchedProduct.id,
          fetchedProduct.slug,
          4
        );
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

  // Touch gesture handling for hero image swipe with directional locking
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!product || product.images.length <= 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isSwipingHorizontalRef.current = false;
    isDirectionLockedRef.current = false;
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (
      touchStartXRef.current === null ||
      touchStartYRef.current === null ||
      !product ||
      product.images.length <= 1
    ) {
      return;
    }
    const dx = e.touches[0].clientX - touchStartXRef.current;
    const dy = e.touches[0].clientY - touchStartYRef.current;

    if (!isDirectionLockedRef.current) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        isDirectionLockedRef.current = true;
        if (Math.abs(dx) > Math.abs(dy)) {
          isSwipingHorizontalRef.current = true;
          setIsDragging(true);
        } else {
          isSwipingHorizontalRef.current = false;
        }
      }
    }

    if (isSwipingHorizontalRef.current) {
      // Elastic resistance at carousel bounds
      let appliedDx = dx;
      if (
        (currentImageIndex === 0 && dx > 0) ||
        (currentImageIndex === product.images.length - 1 && dx < 0)
      ) {
        appliedDx = dx * 0.3;
      }
      setDragOffset(appliedDx);
    }
  };

  const handleTouchEnd = () => {
    if (isSwipingHorizontalRef.current && product && product.images.length > 1) {
      const threshold = 40;
      if (dragOffset < -threshold && currentImageIndex < product.images.length - 1) {
        setCurrentImageIndex((prev) => prev + 1);
      } else if (dragOffset > threshold && currentImageIndex > 0) {
        setCurrentImageIndex((prev) => prev - 1);
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    isSwipingHorizontalRef.current = false;
    isDirectionLockedRef.current = false;
    setIsDragging(false);
    setDragOffset(0);
  };

  // Desktop mouse dragging support
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!product || product.images.length <= 1) return;
    touchStartXRef.current = e.clientX;
    isSwipingHorizontalRef.current = true;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (touchStartXRef.current === null || !isDragging || !product) return;
    const dx = e.clientX - touchStartXRef.current;
    let appliedDx = dx;
    if (
      (currentImageIndex === 0 && dx > 0) ||
      (currentImageIndex === product.images.length - 1 && dx < 0)
    ) {
      appliedDx = dx * 0.3;
    }
    setDragOffset(appliedDx);
  };

  const handleMouseUp = () => {
    if (isDragging) {
      handleTouchEnd();
    }
  };

  const handlePrevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!product || product.images.length <= 1) return;
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleNextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!product || product.images.length <= 1) return;
    setCurrentImageIndex((prev) =>
      prev < product.images.length - 1 ? prev + 1 : prev
    );
  };

  // Calculate dynamic unit price
  const { unitPrice, resolvedOptions, resolvedAddons } = useMemo(() => {
    if (!product) {
      return {
        unitPrice: 0,
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
      resolvedOptions: resolvedOpts,
      resolvedAddons: resolvedAdds,
    };
  }, [product, selectedOptions, selectedAddonIds]);

  // Original price and discount calculation (if available)
  const originalPrice = product?.originalPrice ?? (product as { compareAtPrice?: number | null })?.compareAtPrice ?? null;
  const discountPercent =
    product?.discountPercent ??
    (originalPrice && originalPrice > unitPrice
      ? Math.round(((originalPrice - unitPrice) / originalPrice) * 100)
      : null);

  // Validate required options
  const validateRequiredOptions = useCallback((): { isValid: boolean; missingGroup?: string } => {
    if (!product) return { isValid: false };
    for (const group of product.optionGroups) {
      if (group.required && !selectedOptions[group.id]) {
        return { isValid: false, missingGroup: group.name };
      }
    }
    return { isValid: true };
  }, [product, selectedOptions]);

  // Share menu action
  const handleShare = async () => {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const shareData = {
      title: product?.name || "Nook by Jina",
      text: `Lihat menu ${product?.name || ""} di Nook by Jina!`,
      url: currentUrl,
    };

    try {
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(currentUrl);
        showToast("Tautan menu berhasil disalin!");
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(currentUrl);
          showToast("Tautan menu berhasil disalin!");
        } catch {
          // Ignore
        }
      }
    }
  };

  // Seller WhatsApp chat link
  const sellerChatUrl = useMemo(() => {
    const cleanPhone = (adminWhatsapp || STORE_SETTINGS.adminWhatsapp).replace(/[^0-9]/g, "");
    const message = `Halo admin Nook by Jina, saya ingin tanya seputar menu "${product?.name || ""}".`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }, [adminWhatsapp, product?.name]);

  // Add to cart handler — always open modal with cart intent
  const handleAddToCart = () => {
    if (!product?.isAvailable || !storeOpen) return;
    setModalTargetAction("cart");
    setIsVariationModalOpen(true);
  };

  // Buy Now handler — always open modal with buynow intent
  const handleDirectBuyNow = () => {
    if (!product?.isAvailable || !storeOpen) return;
    setModalTargetAction("buynow");
    setIsVariationModalOpen(true);
  };

  // Handler for modal confirmation (Add to Cart, Buy Now, or Configure)
  const handleModalConfirm = (data: QuickAddConfirmData) => {
    try {
      // Synchronize local states so page reflects selections
      const optsMap: Record<string, string> = {};
      data.selectedOptions.forEach((o) => {
        const key = o.groupId || o.optionName;
        const val = o.valueId || o.optionValueId;
        if (key && val) {
          optsMap[key] = val;
        }
      });
      setSelectedOptions(optsMap);
      setSelectedAddonIds(new Set(data.selectedAddons.map((a) => a.addonId)));
      setQuantity(data.quantity);
      setItemNote(data.itemNote);

      if (data.intent === "buynow" || data.intent === "buy_now") {
        const primaryImage =
          data.product.images && data.product.images.length > 0
            ? data.product.images[0]
            : "/images/hero-food.webp";

        const buyNowItemData: CartItem = {
          id: `buynow-${data.product.id}-${Date.now()}`,
          productId: data.product.id,
          productName: data.product.name,
          productImage: primaryImage,
          basePrice: data.product.basePrice,
          selectedOptions: data.selectedOptions,
          selectedAddons: data.selectedAddons,
          itemNote: data.itemNote.trim(),
          quantity: Math.max(1, data.quantity),
          unitPrice: data.unitPrice,
          itemTotal: data.totalPrice,
          isAvailable: data.product.isAvailable,
          productType: getProductType(data.product),
        };
        setBuyNowItem(buyNowItemData);
        setIsVariationModalOpen(false);
        router.push("/checkout?buyNow=1");
      } else if (data.intent === "cart" || data.intent === "add_to_cart") {
        addToCart(
          data.product,
          data.selectedOptions,
          data.selectedAddons,
          data.itemNote,
          data.quantity
        );
        setIsVariationModalOpen(false);
        showToast("Menu ditambahkan ke keranjang");
      } else {
        setIsVariationModalOpen(false);
      }
    } catch (err) {
      console.error("Gagal memproses aksi variasi:", err);
      showToast("Terjadi kesalahan, silakan coba lagi.");
    }
  };

  // Variation summary text
  const variationSummaryText = useMemo(() => {
    const parts: string[] = [];
    resolvedOptions.forEach((o) => {
      const val = o.valueName || o.optionValue;
      if (val) parts.push(val);
    });
    resolvedAddons.forEach((a) => {
      parts.push(a.addonName);
    });
    if (parts.length === 0) {
      return product?.optionGroups.some((g) => g.required)
        ? "Pilih variasi rasa & level (wajib)"
        : "Pilih opsi variasi (opsional)";
    }
    return parts.join(" • ");
  }, [resolvedOptions, resolvedAddons, product]);

  // Loading State: Skeleton matching product detail layout
  if (loading) {
    return (
      <div className="min-h-screen bg-white pb-28">
        <main className="max-w-md mx-auto bg-white">
          {/* Skeleton Hero Image (Full-bleed) */}
          <div className="relative aspect-[4/3] w-full bg-neutral-200 overflow-hidden animate-pulse">
            <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-white/70" />
            <div className="absolute top-3 right-3 flex gap-2">
              <div className="w-8 h-8 rounded-full bg-white/70" />
              <div className="w-8 h-8 rounded-full bg-white/70" />
            </div>
          </div>

          <div className="w-full divide-y divide-[#EAEAEA]">
            {/* Skeleton Info */}
            <div className="p-3.5 space-y-2">
              <div className="h-6 bg-neutral-200 rounded w-1/3 animate-pulse" />
              <div className="h-5 bg-neutral-200 rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-neutral-100 rounded w-1/2 animate-pulse mt-1" />
            </div>

            {/* Skeleton Variation Card */}
            <div className="p-3.5 space-y-2">
              <div className="h-4 bg-neutral-200 rounded w-1/4 animate-pulse" />
              <div className="h-3 bg-neutral-100 rounded w-1/2 animate-pulse" />
            </div>

            {/* Skeleton Description */}
            <div className="p-3.5 space-y-2">
              <div className="h-4 bg-neutral-200 rounded w-1/3 animate-pulse" />
              <div className="h-3 bg-neutral-100 rounded w-full animate-pulse" />
              <div className="h-3 bg-neutral-100 rounded w-4/5 animate-pulse" />
            </div>
          </div>
        </main>

        {/* Skeleton Recommendations */}
        <div className="w-full bg-[#F6F6F7] border-t border-[#E5E5E5] py-4">
          <div className="max-w-md mx-auto px-3.5 sm:px-4 space-y-2.5">
            <div className="h-3.5 w-36 bg-neutral-200 rounded animate-pulse" />
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
              <div className="bg-white rounded-2xl p-2 space-y-2">
                <div className="aspect-[4/3] w-full bg-neutral-200 rounded-xl animate-pulse" />
                <div className="h-3 bg-neutral-200 rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-neutral-100 rounded w-1/2 animate-pulse" />
              </div>
              <div className="bg-white rounded-2xl p-2 space-y-2">
                <div className="aspect-[4/3] w-full bg-neutral-200 rounded-xl animate-pulse" />
                <div className="h-3 bg-neutral-200 rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-neutral-100 rounded w-1/2 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
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
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
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

  const images = product.images.length > 0 ? product.images : ["/images/hero-food.webp"];

  return (
    <div className="min-h-screen bg-white pb-28">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#111111] text-white px-4 py-2 rounded-full text-xs font-medium shadow-lg animate-landing-fade flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-[#29AC9A]" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="max-w-md mx-auto bg-white">
        {/* 1. Full-bleed Hero Product Photography Section */}
        <section
          className="relative aspect-[4/3] w-full bg-neutral-100 overflow-hidden select-none group"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Sliding Track containing all product images */}
          <div
            className="flex w-full h-full will-change-transform"
            style={{
              transform: `translate3d(calc(-${currentImageIndex * 100}% + ${dragOffset}px), 0, 0)`,
              transition: isDragging
                ? "none"
                : "transform 400ms cubic-bezier(0.25, 1, 0.5, 1)",
            }}
          >
            {images.map((imgSrc, idx) => {
              const isInitial = idx === 0;
              const isAdjacent = Math.abs(idx - currentImageIndex) <= 1;
              const shouldRender = Math.abs(idx - currentImageIndex) <= 2;

              return (
                <div
                  key={`${imgSrc}-${idx}`}
                  className="relative w-full h-full shrink-0 flex-none bg-neutral-100"
                >
                  {shouldRender ? (
                    <Image
                      src={imgSrc}
                      alt={`${product.name} - foto ${idx + 1}`}
                      fill
                      priority={isInitial}
                      loading={isInitial ? undefined : isAdjacent ? "eager" : "lazy"}
                      quality={85}
                      className={`object-cover select-none pointer-events-none ${
                        !product.isAvailable ? "grayscale opacity-75" : ""
                      }`}
                      sizes="(max-width: 640px) 100vw, 448px"
                      draggable={false}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Top-Left: Back Button */}
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Kembali"
            className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#111111] backdrop-blur-xs flex items-center justify-center transition-colors min-h-[34px] min-w-[34px] shadow-xs cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Top-Right: Share and Shopping Cart Buttons */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            {/* Share Button */}
            <button
              type="button"
              onClick={handleShare}
              aria-label="Bagikan Menu"
              className="w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#111111] backdrop-blur-xs flex items-center justify-center transition-colors min-h-[34px] min-w-[34px] shadow-xs cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>

            {/* Shopping Cart Button with Badge */}
            <Link
              href="/keranjang"
              aria-label="Lihat Keranjang Belanja"
              className="relative w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#111111] backdrop-blur-xs flex items-center justify-center transition-colors min-h-[34px] min-w-[34px] shadow-xs cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#F25B09] text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center border-2 border-white leading-none">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>
          </div>

          {/* Desktop Left/Right Navigation Arrows */}
          {images.length > 1 && (
            <>
              {currentImageIndex > 0 && (
                <button
                  type="button"
                  onClick={handlePrevImage}
                  aria-label="Foto sebelumnya"
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs hidden sm:flex cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {currentImageIndex < images.length - 1 && (
                <button
                  type="button"
                  onClick={handleNextImage}
                  aria-label="Foto berikutnya"
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs hidden sm:flex cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {/* Multiple Photos Indicator Pill */}
          {images.length > 1 && (
            <div className="absolute bottom-3 right-3 z-20 bg-black/60 backdrop-blur-xs text-white text-[10px] font-medium px-2 py-0.5 rounded-full select-none pointer-events-none">
              {currentImageIndex + 1}/{images.length}
            </div>
          )}

          {/* Sold-out Overlay */}
          {!product.isAvailable ? (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 pointer-events-none">
              <span className="text-xs font-bold text-white bg-[#111111] px-3 py-1 rounded-full border border-white/20">
                Stok Menu Habis
              </span>
            </div>
          ) : null}
        </section>

        {/* 2. Full-Width Edge-to-Edge Compact Dark Gradient Price & Product Title Section */}
        <section
          data-testid="product-price-title-panel"
          className="w-full bg-gradient-to-r from-[#21100C] via-[#35170E] to-[#54220F] py-2 sm:py-2.5 px-3.5 sm:px-4 text-white shadow-xs space-y-1"
        >
          {/* Price & Discount Row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-baseline gap-2 flex-wrap">
              {/* Price: Smaller 'Rp' + Prominent Large White Numeric Amount */}
              <div className="flex items-baseline gap-1">
                <span className="text-xs sm:text-sm font-semibold text-white/90">Rp</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none">
                  {new Intl.NumberFormat("id-ID").format(unitPrice)}
                </span>
              </div>

              {/* Strikethrough Original Price & Discount Badge (if available) */}
              {originalPrice && originalPrice > unitPrice ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs line-through text-white/60 font-medium">
                    Rp{new Intl.NumberFormat("id-ID").format(originalPrice)}
                  </span>
                  {discountPercent ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-white text-[#F25B09] shadow-2xs leading-none">
                      {`-${discountPercent}%`}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Status 'Habis' pill when product is unavailable */}
            {!product.isAvailable && (
              <span className="inline-flex items-center text-[10px] font-bold text-[#B42318] bg-white/95 border border-red-100 px-2 py-0.5 rounded-full shrink-0 shadow-2xs">
                Habis
              </span>
            )}
          </div>

          {/* Product Title & Ticket-Style Status Badge */}
          <div>
            <h1 className="text-sm sm:text-base font-semibold text-white leading-tight">
              <TicketBadge
                type={product.productType}
                label={getProductTypeConfig(product.productType).label}
                className="align-middle -translate-y-[1px] mr-1.5"
                size="md"
              />
              {product.name}
            </h1>
          </div>
        </section>

        {/* Full-White Borderless Content Sections */}
        <div className="w-full bg-white divide-y divide-[#EAEAEA]">
          {/* Store Closed Warning Banner */}
          {!storeOpen && (
            <div className="p-3 bg-red-50 text-xs text-[#B42318] flex items-center gap-2.5 animate-landing-fade">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">
                Toko sedang close order. Pemesanan menu belum dapat dilakukan saat ini.
              </span>
            </div>
          )}

          {/* 1. Rating, Estimasi & Kalori - Single Horizontal Row with Hairline Vertical Dividers */}
          <div
            data-testid="product-info-cards"
            className="grid grid-cols-3 py-2.5 px-3.5 sm:px-4 select-none bg-white"
          >
            {/* 1. Rating */}
            <div
              className="flex flex-col items-center justify-center text-center border-r border-[#EAEAEA] pr-2"
              title="Rating: 4.9 (120+ ulasan)"
            >
              <div className="flex items-center justify-center gap-1 text-xs sm:text-[13px] font-bold text-[#111111]">
                <Star className="w-3.5 h-3.5 text-[#F59E0B] fill-[#F59E0B] shrink-0" />
                <span>4.9</span>
              </div>
              <span className="text-[10px] text-[#737373] mt-0.5">Rating</span>
            </div>

            {/* 2. Preparation Estimate */}
            <div
              className="flex flex-col items-center justify-center text-center border-r border-[#EAEAEA] px-2"
              aria-label={`Estimasi persiapan: ${getProductTypeConfig(product.productType).estimate}`}
              title={`Estimasi persiapan: ${getProductTypeConfig(product.productType).estimate}`}
            >
              <div className="flex items-center justify-center gap-1 text-xs sm:text-[13px] font-bold text-[#111111] max-w-full">
                <Clock className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                <span className="truncate">{getProductTypeConfig(product.productType).estimate}</span>
              </div>
              <span className="text-[10px] text-[#737373] mt-0.5">Estimasi</span>
            </div>

            {/* 3. Calories */}
            <div
              className="flex flex-col items-center justify-center text-center pl-2"
              title={
                product.calories !== undefined && product.calories !== null && product.calories > 0
                  ? `${product.calories} kcal`
                  : "Kalori: Belum diisi"
              }
            >
              <div className="flex items-center justify-center gap-1 text-xs sm:text-[13px] font-bold text-[#111111] max-w-full">
                <Flame className="w-3.5 h-3.5 text-[#F25B09] shrink-0" />
                <span className="truncate">
                  {product.calories !== undefined && product.calories !== null && product.calories > 0
                    ? `${product.calories} kcal`
                    : "Belum diisi"}
                </span>
              </div>
              <span className="text-[10px] text-[#737373] mt-0.5">Kalori</span>
            </div>
          </div>

          {/* 2. Compact Free-delivery Information - Borderless, Subtle Light Green */}
          <section className="flex items-center gap-2 py-2 px-3.5 sm:px-4 bg-emerald-50/60 text-xs text-emerald-800">
            <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium text-[11.5px] leading-tight">
              Diskon gratis ongkir untuk pesanan di atas Rp50.000
            </span>
          </section>

          {/* 3. Product Variation Section - Borderless Full-Width */}
          {(product.optionGroups.length > 0 || product.addons.length > 0) && (
            <section>
              <button
                type="button"
                disabled={!product.isAvailable || !storeOpen}
                onClick={() => {
                  setModalTargetAction("dual");
                  setIsVariationModalOpen(true);
                }}
                className="w-full py-3 px-3.5 sm:px-4 hover:bg-neutral-50/80 transition-colors text-left flex items-center justify-between gap-3 group cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed bg-white"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#111111]">Pilih Variasi</span>
                    {product.optionGroups.some((g) => g.required) && (
                      <span className="text-[9.5px] font-semibold text-[#F25B09] bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded">
                        {validateRequiredOptions().isValid ? "Lengkap" : "Wajib"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#737373] truncate">
                    {variationSummaryText}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#737373] group-hover:text-[#111111] transition-colors shrink-0" />
              </button>
            </section>
          )}

          {/* 4. Product Description Section - Clean on Solid White */}
          <section className="py-3 px-3.5 sm:px-4 space-y-1 bg-white">
            <h2 className="text-xs font-bold text-[#111111]">Deskripsi Produk</h2>
            <p className="text-xs text-[#737373] leading-relaxed whitespace-pre-line">
              {product.description ||
                "Menu lezat khas Nook by Jina yang disajikan segar dengan bahan-bahan pilihan berkualitas tinggi."}
            </p>
          </section>

          {/* 5. Special Note for Kitchen - Borderless Card with Thin Textarea Border */}
          <section className="py-3 px-3.5 sm:px-4 space-y-1.5 bg-white">
            <label htmlFor="item-note-input" className="text-xs font-bold text-[#111111] block">
              Catatan Khusus (Opsional)
            </label>
            <textarea
              id="item-note-input"
              name="itemNote"
              rows={2}
              disabled={!product.isAvailable || !storeOpen}
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value.slice(0, 100))}
              placeholder="Contoh: Sambal dipisah, jangan terlalu pedas..."
              className={`w-full text-xs p-2.5 rounded-xl border border-[#E5E5E5] text-[#111111] focus:outline-hidden focus:border-[#F25B09] transition-colors resize-none ${
                !product.isAvailable || !storeOpen
                  ? "bg-neutral-100 opacity-60 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
            <div className="text-right text-[9.5px] text-[#737373]">
              {itemNote.length}/100
            </div>
          </section>
        </div>
      </main>

      {/* 6. Recommended Companion Products - Full-Width Edge-to-Edge #F6F6F7 Background */}
      {(recommendedSlot !== undefined || recommendedProducts.length > 0) && (
        <section
          data-testid="recommended-products-section"
          className="w-full bg-[#F6F6F7] border-t border-[#E5E5E5] py-4 sm:py-5"
        >
          <div className="max-w-md mx-auto px-3.5 sm:px-4 space-y-2.5">
            {recommendedSlot !== undefined ? (
              recommendedSlot
            ) : (
              <>
                <h2 className="text-xs sm:text-sm font-bold text-[#111111]">
                  Menu Rekomendasi Lainnya
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  {recommendedProducts.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* 8. Sticky Bottom Purchase Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E5E5]">
        <div
          className="max-w-md mx-auto px-3.5 py-2.5 flex items-center gap-2.5"
          style={{
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {/* Action 1: Chat to Seller via WhatsApp (Icon Only) */}
          <a
            href={sellerChatUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat Penjual via WhatsApp"
            className="w-11 h-11 rounded-xl border border-[#E5E5E5] hover:border-neutral-300 hover:bg-neutral-50 flex items-center justify-center text-[#111111] transition-colors shrink-0 cursor-pointer"
          >
            <WhatsAppIcon className="w-5 h-5 text-[#111111]" />
          </a>

          {/* Action 2: + Keranjang (50% Balanced Width CTA) */}
          <button
            type="button"
            data-testid="bottom-bar-add-to-cart"
            disabled={!product.isAvailable || !storeOpen}
            onClick={handleAddToCart}
            aria-label="Tambah ke Keranjang"
            className={`flex-1 min-h-[44px] h-11 px-2.5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all border cursor-pointer ${
              !product.isAvailable || !storeOpen
                ? "opacity-50 cursor-not-allowed bg-neutral-100 text-neutral-400 border-neutral-200"
                : "bg-white hover:bg-orange-50/60 active:bg-orange-100 text-[#F25B09] border-[#F25B09] shadow-2xs"
            }`}
          >
            <ShoppingCart className="w-4 h-4 shrink-0 text-[#F25B09]" />
            <span className="truncate">+ Keranjang</span>
          </button>

          {/* Action 3: Beli Sekarang (50% Balanced Width CTA) */}
          <button
            type="button"
            data-testid="bottom-bar-buy-now"
            disabled={!product.isAvailable || !storeOpen}
            onClick={handleDirectBuyNow}
            aria-label="Beli Sekarang"
            className={`flex-1 min-h-[44px] h-11 px-2.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs ${
              product.isAvailable && storeOpen
                ? "bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] text-white"
                : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
            }`}
          >
            <span className="truncate">
              {!storeOpen
                ? "Toko Tutup Order"
                : product.isAvailable
                ? "Beli Sekarang"
                : "Menu Habis"}
            </span>
          </button>
        </div>
      </div>

      {/* 9. Bottom-Sheet Variation Modal (Reused QuickAddModal from Main Page) */}
      <QuickAddModal
        product={product}
        isOpen={isVariationModalOpen}
        intent={modalTargetAction}
        initialOptions={selectedOptions}
        initialAddonIds={selectedAddonIds}
        initialQuantity={quantity}
        initialItemNote={itemNote}
        onClose={() => setIsVariationModalOpen(false)}
        onConfirm={handleModalConfirm}
      />
    </div>
  );
}
