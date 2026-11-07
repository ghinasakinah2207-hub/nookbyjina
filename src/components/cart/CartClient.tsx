"use client";

import React, { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  ChevronDown,
  AlertTriangle,
  Check,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { CartSkeleton } from "@/components/ui/CustomerSkeletons";
import { QuickAddModal, QuickAddConfirmData } from "@/components/product/QuickAddModal";
import { useCart } from "@/context/CartContext";
import { formatRupiah, PRODUCTS } from "@/data/dummy-data";
import { Product, CartItem } from "@/types";

interface CartClientProps {
  storeOpen?: boolean;
  initialProducts?: Product[];
}

export default function CartClient({
  storeOpen = true,
  initialProducts = [],
}: CartClientProps) {
  const router = useRouter();
  const {
    cart,
    isHydrated,
    updateQuantity,
    updateCartItemOptions,
    removeFromCart,
    clearCart,
    selectedCartItemIds,
    selectedCartItems,
    selectedSubtotal,
    hasSoldOutSelected,
    toggleCartItemSelection,
    toggleSelectAllCartItems,
  } = useCart();

  // State for clearing cart confirmation dialog
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // State for variation bottom-sheet modal
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [isVariationModalOpen, setIsVariationModalOpen] = useState(false);

  // Derived selection state
  const isAllSelected = useMemo(
    () => cart.length > 0 && cart.every((item) => selectedCartItemIds.has(item.id)),
    [cart, selectedCartItemIds]
  );
  const isPartiallySelected = useMemo(
    () => selectedCartItems.length > 0 && selectedCartItems.length < cart.length,
    [selectedCartItems, cart]
  );
  const noneSelected = selectedCartItems.length === 0;

  const handleProceedToCheckout = () => {
    if (!storeOpen || noneSelected || hasSoldOutSelected) return;
    router.push("/checkout");
  };

  const handleConfirmClear = () => {
    clearCart();
    setShowClearConfirm(false);
  };

  const handleOpenVariationModal = (item: CartItem) => {
    setEditingCartItem(item);
    setIsVariationModalOpen(true);
  };

  const getProductForItem = useCallback(
    (item: CartItem): Product => {
      const found =
        (initialProducts &&
          initialProducts.find(
            (p) =>
              p.id === item.productId ||
              p.slug === item.productId ||
              (p.dbId && p.dbId === item.productId)
          )) ||
        PRODUCTS.find(
          (p) => p.id === item.productId || p.slug === item.productId
        );

      if (found) return found;

      return {
        id: item.productId,
        slug: item.productId,
        name: item.productName,
        description: "",
        categoryId: "",
        categoryName: "",
        basePrice: item.basePrice || item.unitPrice,
        isAvailable: item.isAvailable,
        images: [item.productImage],
        optionGroups: [],
        addons: [],
      };
    },
    [initialProducts]
  );

  const editingProduct = useMemo(() => {
    return editingCartItem ? getProductForItem(editingCartItem) : null;
  }, [editingCartItem, getProductForItem]);

  const initialOptionsForModal = useMemo(() => {
    if (!editingCartItem) return {};
    const product = editingProduct;
    const groups = product?.optionGroups || [];
    const opts: Record<string, string> = {};

    if (Array.isArray(editingCartItem.selectedOptions)) {
      editingCartItem.selectedOptions.forEach((opt) => {
        const grpKey = opt.groupId || opt.optionName;
        const valKey = opt.valueId || opt.optionValueId;
        const matchingGroup = groups.find(
          (g) =>
            g.id === grpKey ||
            g.name === grpKey ||
            (opt.groupName && g.name === opt.groupName)
        );
        if (matchingGroup) {
          const matchingVal = matchingGroup.values.find(
            (v) =>
              v.id === valKey ||
              v.name === valKey ||
              (opt.valueName && v.name === opt.valueName) ||
              (opt.optionValue && v.name === opt.optionValue)
          );
          if (matchingVal) {
            opts[matchingGroup.id] = matchingVal.id;
          } else if (valKey) {
            opts[matchingGroup.id] = valKey;
          }
        } else if (grpKey && valKey) {
          opts[grpKey] = valKey;
        }
      });
    }
    return opts;
  }, [editingCartItem, editingProduct]);

  const initialAddonIdsForModal = useMemo(() => {
    if (!editingCartItem || !editingCartItem.selectedAddons) return new Set<string>();
    const product = editingProduct;
    const addons = product?.addons || [];
    const ids = new Set<string>();

    editingCartItem.selectedAddons.forEach((itemAddon) => {
      const matching = addons.find(
        (a) => a.id === itemAddon.addonId || a.name === itemAddon.addonName
      );
      if (matching) {
        ids.add(matching.id);
      } else if (itemAddon.addonId) {
        ids.add(itemAddon.addonId);
      }
    });

    return ids;
  }, [editingCartItem, editingProduct]);

  const handleConfirmVariation = (data: QuickAddConfirmData) => {
    if (!editingCartItem) return;
    updateCartItemOptions(
      editingCartItem.id,
      data.selectedOptions,
      data.selectedAddons,
      data.quantity,
      data.itemNote
    );
    setIsVariationModalOpen(false);
  };

  const getVariationSummary = (item: CartItem) => {
    const parts: string[] = [];
    if (item.selectedOptions && item.selectedOptions.length > 0) {
      item.selectedOptions.forEach((opt) => {
        const val = opt.valueName || opt.optionValue;
        const grp = opt.groupName || opt.optionName;
        if (val) {
          parts.push(grp ? `${grp}: ${val}` : val);
        }
      });
    }
    if (item.selectedAddons && item.selectedAddons.length > 0) {
      const addonNames = item.selectedAddons.map((a) => a.addonName).join(", ");
      parts.push(`+ ${addonNames}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Pilih Variasi";
  };

  return (
    <div className={`min-h-screen bg-[#F6F6F7] ${isHydrated && cart.length > 0 ? "pb-40" : "pb-24"}`}>
      <Header
        title={isHydrated ? `Keranjang (${cart.length})` : "Keranjang"}
        showBack={false}
        rightAction={
          isHydrated && cart.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 text-xs text-[#737373] hover:text-[#B42318] transition-colors py-1.5 px-2 rounded-lg hover:bg-black/5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua</span>
            </button>
          ) : null
        }
      />

      {/* Confirmation Dialog for Hapus Semua */}
      {showClearConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-xs w-full p-5 space-y-4 border border-[#E5E5E5]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-cart-title"
          >
            <div className="space-y-1.5 text-center">
              <div className="w-10 h-10 rounded-full bg-red-50 text-[#B42318] mx-auto flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 id="clear-cart-title" className="text-sm font-bold text-[#111111]">
                Hapus Semua Menu?
              </h3>
              <p className="text-xs text-[#737373] leading-relaxed">
                Semua menu di dalam keranjang akan dihapus. Aksi ini tidak dapat dibatalkan.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 min-h-[40px] px-3 py-2 border border-[#E5E5E5] rounded-xl text-xs font-semibold text-[#737373] hover:text-[#111111] hover:bg-neutral-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                className="flex-1 min-h-[40px] px-3 py-2 bg-[#B42318] hover:bg-[#911d13] text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Hapus Semua
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="max-w-md mx-auto px-4 pt-4 space-y-2.5">
        {/* Warning if store is closed */}
        {!storeOpen ? (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-landing-fade">
            <AlertTriangle className="w-5 h-5 text-[#B42318] flex-shrink-0 mt-0.5" />
            <div className="text-xs text-[#B42318] space-y-1">
              <p className="font-semibold">
                Toko Sedang Close Order
              </p>
              <p>
                Pemesanan baru sedang ditutup sementara oleh pemilik toko. Checkout dinonaktifkan.
              </p>
            </div>
          </div>
        ) : null}

        {!isHydrated ? (
          <div className="animate-landing-fade">
            <CartSkeleton showHeader={false} />
          </div>
        ) : cart.length === 0 ? (
          /* Empty State */
          <div className="p-8 text-center bg-white rounded-2xl space-y-4 my-8">
            <div className="w-16 h-16 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-[#737373]">
              <ShoppingBag className="w-8 h-8 stroke-[1.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#111111]">
                Keranjangmu masih kosong
              </h2>
              <p className="text-xs text-[#737373] mt-1">
                Yuk jelajahi menu makanan homemade lezat dari Nook by Jina!
              </p>
            </div>
            <Link
              href="/menu"
              className="inline-flex items-center justify-center min-h-[48px] px-6 py-2.5 bg-[#F25B09] hover:bg-[#D94D06] text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Lihat Menu Sekarang
            </Link>
          </div>
        ) : (
          <>
            {/* Warning if there are sold-out items in selection */}
            {hasSoldOutSelected ? (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#B42318] flex-shrink-0 mt-0.5" />
                <div className="text-xs text-[#B42318] space-y-1">
                  <p className="font-semibold">
                    Terdapat menu yang sedang habis di keranjangmu!
                  </p>
                  <p>
                    Silakan hapus menu yang habis terlebih dahulu sebelum melanjutkan ke checkout.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Shopee-Inspired Grouped Cart Card */}
            <div className="bg-white rounded-2xl p-3.5 space-y-3">
              {/* Store Header with Select All — Displayed ONCE above product list */}
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#E5E5E5]">
                {/* Select All Checkbox */}
                <button
                  type="button"
                  onClick={toggleSelectAllCartItems}
                  aria-label={isAllSelected ? "Hapus semua pilihan" : "Pilih semua menu"}
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    isAllSelected
                      ? "bg-[#F25B09] border-[#F25B09] text-white"
                      : isPartiallySelected
                      ? "bg-orange-100 border-[#F25B09] text-[#F25B09]"
                      : "bg-white border-[#D4D4D4] hover:border-neutral-400"
                  }`}
                >
                  {isAllSelected ? (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  ) : isPartiallySelected ? (
                    <Minus className="w-3.5 h-3.5 stroke-[3]" />
                  ) : null}
                </button>

                <span className="px-1.5 py-0.5 rounded bg-[#F25B09] text-white text-[10px] font-bold tracking-wide uppercase">
                  nook
                </span>
                <span className="text-xs font-bold text-[#111111] flex-1">
                  Nook By Jina
                </span>
                <span className="text-[10px] text-[#737373]">
                  {selectedCartItems.length}/{cart.length} dipilih
                </span>
              </div>

              {/* Cart Items List */}
              <div className="space-y-2">
                {cart.map((item, index) => {
                  const variationSummary = getVariationSummary(item);
                  const isSelected = selectedCartItemIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-2.5 py-2.5 ${
                        index > 0 ? "border-t border-[#E5E5E5]" : ""
                      } ${!item.isAvailable ? "opacity-75" : ""}`}
                    >
                      {/* Selection Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleCartItemSelection(item.id)}
                        aria-label={isSelected ? `Batal pilih ${item.productName}` : `Pilih ${item.productName}`}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors cursor-pointer shrink-0 mt-7 ${
                          isSelected
                            ? "bg-[#F25B09] border-[#F25B09] text-white"
                            : "bg-white border-[#D4D4D4] hover:border-neutral-400"
                        }`}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : null}
                      </button>

                      {/* Product Thumbnail */}
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-neutral-100 flex-shrink-0">
                        <Image
                          src={item.productImage}
                          alt={item.productName}
                          fill
                          className={`object-cover ${!item.isAvailable ? "grayscale" : ""}`}
                          sizes="80px"
                        />
                        {!item.isAvailable && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded">
                              Habis
                            </span>
                          </div>
                        )}
                      </div>

                      {/* RIGHT: Product Details */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Title & Delete Action */}
                        <div className="flex items-start justify-between gap-1.5">
                          <h3 className="text-xs sm:text-sm font-semibold text-[#111111] leading-snug line-clamp-2">
                            {item.productName}
                          </h3>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            aria-label={`Hapus ${item.productName}`}
                            className="w-6 h-6 -mr-1 flex items-center justify-center rounded-md text-[#737373] hover:text-[#B42318] hover:bg-neutral-50 flex-shrink-0 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Selected Product Variations Dropdown */}
                        <div>
                          <button
                            type="button"
                            onClick={() => handleOpenVariationModal(item)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#F5F5F6] hover:bg-[#EBEBEF] rounded-md text-[11px] text-[#555555] hover:text-[#111111] transition-colors max-w-full text-left"
                            title="Ubah Variasi"
                          >
                            <span className="truncate max-w-[150px] sm:max-w-[190px]">
                              {variationSummary}
                            </span>
                            <ChevronDown className="w-3 h-3 flex-shrink-0 text-[#737373]" />
                          </button>
                        </div>

                        {/* Product Price & Quantity Row */}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="text-xs sm:text-sm font-bold text-[#F25B09]">
                            {formatRupiah(item.unitPrice)}
                          </div>

                          <div className="flex items-center border border-[#E5E5E5] rounded-xl p-0.5 bg-neutral-50">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              aria-label="Kurangi kuantitas"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#111111] hover:bg-white min-h-[28px] min-w-[28px] transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center text-xs font-semibold text-[#111111]">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              aria-label="Tambah kuantitas"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#111111] hover:bg-white min-h-[28px] min-w-[28px] transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Sticky Bottom Bar for Checkout */}
      {isHydrated && cart.length > 0 ? (
        <div
          className="fixed left-0 right-0 z-30 bg-white border-t border-[#E5E5E5] shadow-[0_-4px_16px_rgba(0,0,0,0.04)]"
          style={{
            bottom: "calc(55px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <span className="text-[11px] text-[#737373] block leading-none">
                Total Pembayaran
              </span>
              <span className="text-base font-bold text-[#111111] leading-tight">
                {noneSelected ? formatRupiah(0) : formatRupiah(selectedSubtotal)}
              </span>
            </div>

            <button
              type="button"
              disabled={noneSelected || hasSoldOutSelected || !storeOpen}
              onClick={handleProceedToCheckout}
              className={`min-h-[48px] px-6 py-3 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center transition-colors ${
                !noneSelected && !hasSoldOutSelected && storeOpen
                  ? "bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] text-white"
                  : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
              }`}
            >
              <span>
                {!storeOpen
                  ? "Toko Close Order"
                  : noneSelected
                  ? "Pilih menu dulu"
                  : selectedCartItems.length > 0
                  ? `Checkout (${selectedCartItems.length})`
                  : "Checkout"}
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Product Variation Bottom-Sheet Modal (Unified QuickAddModal) */}
      <QuickAddModal
        key={editingCartItem ? `${editingCartItem.id}-${editingCartItem.quantity}` : "cart-edit-modal"}
        product={editingProduct}
        isOpen={isVariationModalOpen}
        intent="configure"
        modalKey={editingCartItem?.id}
        initialOptions={initialOptionsForModal}
        initialAddonIds={initialAddonIdsForModal}
        initialQuantity={editingCartItem?.quantity}
        initialItemNote={editingCartItem?.itemNote}
        onClose={() => setIsVariationModalOpen(false)}
        onConfirm={handleConfirmVariation}
      />

      <BottomNavigation />
    </div>
  );
}
