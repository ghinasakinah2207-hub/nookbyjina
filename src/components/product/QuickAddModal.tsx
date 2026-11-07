"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X, Plus, Minus, Check, AlertCircle, Loader2, ShoppingCart } from "lucide-react";
import { Product, SelectedOption, SelectedAddon, CartItem } from "@/types";
import { formatRupiah } from "@/data/dummy-data";
import { parseOptionLabel } from "@/lib/option-utils";
import { useCartSafe } from "@/context/CartContext";
import { getProductType } from "@/lib/product-type";

export type QuickAddIntent =
  | "cart"
  | "buynow"
  | "configure"
  | "dual"
  | "add_to_cart"
  | "buy_now";

export function isCartIntent(intent?: QuickAddIntent): boolean {
  return intent === "cart" || intent === "add_to_cart";
}

export function isBuyNowIntent(intent?: QuickAddIntent): boolean {
  return intent === "buynow" || intent === "buy_now";
}

export function isConfigureIntent(intent?: QuickAddIntent): boolean {
  return intent === "configure";
}

export function isDualIntent(intent?: QuickAddIntent): boolean {
  return (
    intent === "dual" ||
    (!intent &&
      intent !== "configure" &&
      intent !== "cart" &&
      intent !== "buynow" &&
      intent !== "add_to_cart" &&
      intent !== "buy_now")
  );
}

export interface QuickAddConfirmData {
  product: Product;
  selectedOptions: SelectedOption[];
  selectedAddons: SelectedAddon[];
  itemNote: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  intent: QuickAddIntent;
}

interface QuickAddFormProps {
  product: Product;
  isLoadingOptions?: boolean;
  intent?: QuickAddIntent;
  initialOptions?: Record<string, string>;
  initialAddonIds?: Set<string>;
  initialQuantity?: number;
  initialItemNote?: string;
  onClose: (skipHistoryBack?: boolean) => void;
  onConfirm?: (data: QuickAddConfirmData) => void;
}

function useSafeRouter() {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

function QuickAddForm({
  product,
  isLoadingOptions = false,
  intent = "dual",
  initialOptions,
  initialAddonIds,
  initialQuantity,
  initialItemNote,
  onClose,
  onConfirm,
}: QuickAddFormProps) {
  const router = useSafeRouter();
  const cart = useCartSafe();
  const optionGroups = useMemo(() => product.optionGroups || [], [product.optionGroups]);
  const addons = useMemo(() => product.addons || [], [product.addons]);

  // Selections initialized per product instance
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const initialOpts: Record<string, string> = { ...(initialOptions || {}) };
    optionGroups.forEach((group) => {
      const existingVal = initialOpts[group.id] || initialOpts[group.name];
      if (existingVal) {
        const matchingVal = group.values.find((v) => v.id === existingVal || v.name === existingVal);
        initialOpts[group.id] = matchingVal ? matchingVal.id : existingVal;
      } else if (group.required && group.values.length > 0) {
        initialOpts[group.id] = group.values[0].id;
      }
    });
    return initialOpts;
  });

  // Ensure all required option groups have their first value selected if optionGroups arrives asynchronously
  const [prevOptionGroups, setPrevOptionGroups] = useState(optionGroups);
  if (prevOptionGroups !== optionGroups) {
    setPrevOptionGroups(optionGroups);
    const updated = { ...selectedOptions };
    let changed = false;
    optionGroups.forEach((group) => {
      const existingVal = updated[group.id] || updated[group.name];
      if (existingVal) {
        const matchingVal = group.values.find((v) => v.id === existingVal || v.name === existingVal);
        if (matchingVal && matchingVal.id !== updated[group.id]) {
          updated[group.id] = matchingVal.id;
          changed = true;
        }
      } else if (group.required && group.values.length > 0 && !updated[group.id]) {
        updated[group.id] = group.values[0].id;
        changed = true;
      }
    });
    if (changed) {
      setSelectedOptions(updated);
    }
  }

  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(
    () => new Set(initialAddonIds ? Array.from(initialAddonIds) : [])
  );
  const [quantity, setQuantity] = useState(
    initialQuantity !== undefined && initialQuantity > 0 ? initialQuantity : 1
  );
  const [itemNote, setItemNote] = useState(initialItemNote || "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingIntent, setSubmittingIntent] = useState<QuickAddIntent | null>(null);
  const isSubmittingRef = useRef(false);

  // Option selection handler
  const handleSelectOption = (groupId: string, valueId: string) => {
    if (!product.isAvailable) return;
    setSelectedOptions((prev) => ({
      ...prev,
      [groupId]: valueId,
    }));
    setValidationError(null);
  };

  // Addon toggle handler
  const handleToggleAddon = (addonId: string) => {
    if (!product.isAvailable) return;
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(addonId)) {
        next.delete(addonId);
      } else {
        next.add(addonId);
      }
      return next;
    });
    if (validationError) setValidationError(null);
  };

  // Dynamic price calculation
  const { totalPrice, resolvedOptions, resolvedAddons } = useMemo(() => {
    let delta = 0;
    const resolvedOpts: SelectedOption[] = [];

    optionGroups.forEach((group) => {
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
    addons.forEach((addon) => {
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
      totalPrice: unit * quantity,
      resolvedOptions: resolvedOpts,
      resolvedAddons: resolvedAdds,
    };
  }, [product.basePrice, optionGroups, addons, selectedOptions, selectedAddonIds, quantity]);

  // Confirm and execute action (Add to Cart, Buy Now, or Configure)
  const handleConfirmAction = (actionIntent?: QuickAddIntent) => {
    if (!product.isAvailable || isLoadingOptions || isSubmitting || isSubmittingRef.current) return;

    // 1. Validate all required option groups
    for (const group of optionGroups) {
      if (group.required && !selectedOptions[group.id]) {
        setValidationError(`Silakan pilih opsi untuk "${group.name}".`);
        return;
      }
    }

    const resolvedActionIntent: QuickAddIntent =
      actionIntent ||
      (isCartIntent(intent)
        ? "cart"
        : isBuyNowIntent(intent)
        ? "buynow"
        : isConfigureIntent(intent)
        ? "configure"
        : "cart");

    setValidationError(null);
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmittingIntent(resolvedActionIntent);

    try {
      if (onConfirm) {
        onConfirm({
          product,
          selectedOptions: resolvedOptions,
          selectedAddons: resolvedAddons,
          itemNote,
          quantity,
          unitPrice: totalPrice / quantity,
          totalPrice,
          intent: resolvedActionIntent,
        });
        // When intent is Buy Now, skip history.back() because we are navigating forward
        onClose(isBuyNowIntent(resolvedActionIntent));
      } else {
        if (isBuyNowIntent(resolvedActionIntent)) {
          // Direct Buy Now flow without separate onConfirm handler
          const primaryImage =
            product.images && product.images.length > 0
              ? product.images[0]
              : "/images/hero-food.webp";

          const buyNowItemData: CartItem = {
            id: `buynow-${product.id}-${Date.now()}`,
            productId: product.id,
            productName: product.name,
            productImage: primaryImage,
            basePrice: product.basePrice,
            selectedOptions: resolvedOptions,
            selectedAddons: resolvedAddons,
            itemNote: itemNote.trim(),
            quantity: Math.max(1, quantity),
            unitPrice: totalPrice / quantity,
            itemTotal: totalPrice,
            isAvailable: product.isAvailable,
            productType: getProductType(product),
          };

          if (cart?.setBuyNowItem) {
            cart.setBuyNowItem(buyNowItemData);
          }
          onClose(true);
          if (router?.push) {
            router.push("/checkout?buyNow=1");
          }
        } else {
          // 2. Add to cart (triggers cart animation in CartContext)
          if (cart?.addToCart) {
            cart.addToCart(
              product,
              resolvedOptions,
              resolvedAddons,
              itemNote,
              quantity
            );
          }

          // 3. Initiate smooth modal exit transition
          onClose(false);
        }
      }
    } catch (err) {
      console.error("Gagal menambahkan menu:", err);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setSubmittingIntent(null);
    }
  };

  const imageSrc = product.images?.[0] || "/images/hero-food.webp";

  return (
    <>
      {/* Mobile top pill grab handle */}
      <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mt-2.5 mb-1 sm:hidden flex-shrink-0" />

      {/* Modal Header */}
      <div className="px-4 py-3 border-b border-[#E5E5E5] flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-14 h-14 relative rounded-xl overflow-hidden bg-neutral-100 flex-shrink-0 border border-[#E5E5E5]">
            <Image
              src={imageSrc}
              alt={product.name}
              fill
              unoptimized
              className="object-cover"
              sizes="56px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-medium bg-[#111111] text-white px-1.5 py-0.5 rounded tracking-wide inline-block mb-1">
              {product.categoryName}
            </span>
            <h2
              id="quick-add-title"
              className="text-xs sm:text-sm font-bold text-[#111111] truncate"
            >
              {product.name}
            </h2>
            <p className="text-xs font-semibold text-[#111111] mt-0.5">
              {formatRupiah(product.basePrice)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onClose()}
          aria-label="Tutup modal"
          className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-[#111111] transition-colors flex-shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Modal Content */}
      <div className="overflow-y-auto px-4 py-3 space-y-3.5 flex-1 divide-y divide-neutral-100">
        {isLoadingOptions ? (
          <div className="space-y-4 py-2 animate-pulse" data-testid="quick-add-loading-skeleton">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="h-3.5 bg-neutral-200 rounded w-28" />
                <div className="h-3.5 bg-neutral-200 rounded w-12" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <div className="h-11 bg-neutral-100 border border-neutral-200 rounded-xl" />
                <div className="h-11 bg-neutral-100 border border-neutral-200 rounded-xl" />
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <div className="h-3.5 bg-neutral-200 rounded w-32" />
                <div className="h-3 bg-neutral-200 rounded w-14" />
              </div>
              <div className="h-10 bg-neutral-100 border border-neutral-200 rounded-xl" />
            </div>
          </div>
        ) : (
          <>
            {/* 1. Variant Option Groups */}
            {optionGroups.map((group) => {
              const selectedValId = selectedOptions[group.id];
              const isThreeCol = group.values.length === 3;

              return (
                <div key={group.id} className="pt-2 first:pt-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-[#111111]">
                        {group.name}
                      </h3>
                      <p className="text-[10px] text-[#737373]">
                        {group.required ? "Pilih salah satu" : "Pilihan opsional"}
                      </p>
                    </div>
                    {group.required ? (
                      <span className="text-[9.5px] font-semibold text-[#F25B09] bg-orange-50 px-2 py-0.5 rounded-md">
                        Wajib
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={`grid gap-1.5 ${
                      isThreeCol
                        ? "grid-cols-3"
                        : group.values.length === 2
                        ? "grid-cols-2"
                        : "grid-cols-2 sm:grid-cols-3"
                    }`}
                  >
                    {group.values.map((val) => {
                      const isSelected = selectedValId === val.id;
                      const { label, desc } = parseOptionLabel(val.name);

                      return (
                        <button
                          key={val.id}
                          type="button"
                          onClick={() => handleSelectOption(group.id, val.id)}
                          className={`min-w-0 p-2 rounded-xl border flex flex-col justify-between transition-colors min-h-[46px] text-left cursor-pointer ${
                            isSelected
                              ? "border-[#111111] bg-neutral-900 text-white"
                              : "border-[#E5E5E5] bg-white text-[#111111] hover:border-neutral-300"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full gap-1 min-w-0">
                            <span className="text-[10.5px] font-semibold truncate leading-tight">
                              {label}
                            </span>
                            <div
                              className={`w-3 h-3 rounded-full border flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? "border-white bg-white"
                                  : "border-[#737373]"
                              }`}
                            >
                              {isSelected ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#111111]" />
                              ) : null}
                            </div>
                          </div>

                          {desc ? (
                            <span
                              className={`text-[9px] truncate leading-tight mt-0.5 ${
                                isSelected
                                  ? "text-neutral-300"
                                  : "text-[#737373]"
                              }`}
                            >
                              {desc}
                            </span>
                          ) : null}

                          {val.priceDelta > 0 ? (
                            <span
                              className={`text-[9px] mt-0.5 font-medium ${
                                isSelected
                                  ? "text-neutral-300"
                                  : "text-[#737373]"
                              }`}
                            >
                              +{formatRupiah(val.priceDelta)}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* 2. Add-on Selections */}
            {addons.length > 0 ? (
              <div className="pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#111111]">
                    Tambahan / Ekstra (Add-on)
                  </h3>
                  <span className="text-[10px] text-[#737373]">Opsional</span>
                </div>

                <div className="space-y-1.5">
                  {addons.map((addon) => {
                    const isSelected = selectedAddonIds.has(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        onClick={() => handleToggleAddon(addon.id)}
                        className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? "border-[#F25B09] bg-orange-50/40 text-[#111111]"
                            : "border-[#E5E5E5] bg-white text-[#111111] hover:border-neutral-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              isSelected
                                ? "border-[#F25B09] bg-[#F25B09] text-white"
                                : "border-[#737373]"
                            }`}
                          >
                            {isSelected ? (
                              <Check className="w-3 h-3 stroke-[3]" />
                            ) : null}
                          </div>
                          <span className="text-xs font-medium text-left truncate">
                            {addon.name}
                          </span>
                        </div>

                        <span className="text-xs font-semibold text-[#F25B09] flex-shrink-0">
                          +{formatRupiah(addon.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* Quantity Controls Section */}
        <div className="pt-2 flex items-center justify-between border-t border-[#F5F5F5]">
          <div>
            <span className="text-xs font-bold text-[#111111]">Jumlah</span>
            <p className="text-[10px] text-[#737373]">Atur jumlah pesanan menu ini</p>
          </div>
          <div className="flex items-center border border-[#E5E5E5] rounded-xl p-0.5 bg-neutral-50 flex-shrink-0">
            <button
              type="button"
              disabled={quantity <= 1 || isLoadingOptions}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Kurangi kuantitas"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#111111] disabled:opacity-30 min-h-[32px] min-w-[32px] hover:bg-neutral-100 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-xs font-bold text-[#111111] select-none">
              {quantity}
            </span>
            <button
              type="button"
              disabled={isLoadingOptions}
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Tambah kuantitas"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#111111] disabled:opacity-30 min-h-[32px] min-w-[32px] hover:bg-neutral-100 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3. Seller Note Field */}
        <div className="pt-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="quickAddNote"
              className="text-xs font-semibold text-[#111111]"
            >
              Catatan Menu (Opsional)
            </label>
            <span className="text-[10px] text-[#737373]">
              {itemNote.length}/200
            </span>
          </div>
          <textarea
            id="quickAddNote"
            name="quickAddNote"
            value={itemNote}
            onChange={(e) => setItemNote(e.target.value.slice(0, 200))}
            placeholder="Contoh: Sambal dipisah, daun kemangi diperbanyak..."
            rows={2}
            className="w-full p-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] placeholder:text-[#737373] focus:outline-hidden focus:border-[#F25B09]"
          />
        </div>

        {/* Inline Validation Error */}
        {validationError ? (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-[#B42318] flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        ) : null}
      </div>

      {/* Bottom Action Area */}
      <div
        className="p-3 sm:p-4 border-t border-[#E5E5E5] bg-white flex flex-col flex-shrink-0"
        style={{ paddingBottom: "max(0.75rem, calc(0.75rem + env(safe-area-inset-bottom, 0px)))" }}
      >
        {validationError ? (
          <div className="mb-2.5 p-2 bg-red-50 border border-red-200 rounded-xl text-xs text-[#B42318] flex items-center gap-1.5 animate-in fade-in duration-150">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{validationError}</span>
          </div>
        ) : null}

        {!product.isAvailable ? (
          <button
            type="button"
            disabled
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center bg-neutral-200 text-neutral-400 cursor-not-allowed select-none"
          >
            Menu Habis
          </button>
        ) : isLoadingOptions ? (
          <button
            type="button"
            disabled
            aria-busy="true"
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center bg-neutral-100 text-neutral-400 border border-neutral-200 cursor-not-allowed"
          >
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#F25B09]" />
              <span className="text-neutral-500 font-medium">Memuat Pilihan...</span>
            </div>
          </button>
        ) : isConfigureIntent(intent) ? (
          /* Single Button when editing cart item */
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleConfirmAction("configure")}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] active:scale-[0.98] text-white transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting && submittingIntent === "configure" ? (
              <div className="flex items-center justify-center gap-2 w-full">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Menyimpan...</span>
              </div>
            ) : (
              <>
                <span>Konfirmasi Pilihan</span>
                <span className="font-extrabold">{formatRupiah(totalPrice)}</span>
              </>
            )}
          </button>
        ) : isCartIntent(intent) ? (
          /* Single Button when opened with + Keranjang intent */
          <div className="space-y-2">
            {/* Total Price Row */}
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs text-[#737373] font-medium">Total Harga</span>
              <span className="text-sm sm:text-base font-extrabold text-[#F25B09]">
                {formatRupiah(totalPrice)}
              </span>
            </div>

            {/* Single CTA: + Keranjang */}
            <button
              type="button"
              data-testid="modal-add-to-cart"
              disabled={isLoadingOptions || isSubmitting}
              onClick={() => handleConfirmAction("cart")}
              aria-label="Tambah ke Keranjang"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] active:scale-[0.98] text-white shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && (submittingIntent === "cart" || submittingIntent === "add_to_cart") ? (
                <div className="flex items-center justify-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Menambahkan...</span>
                </div>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4 shrink-0 text-white" />
                  <span>+ Keranjang</span>
                </>
              )}
            </button>
          </div>
        ) : isBuyNowIntent(intent) ? (
          /* Single Button when opened with Beli Sekarang intent */
          <div className="space-y-2">
            {/* Total Price Row */}
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs text-[#737373] font-medium">Total Harga</span>
              <span className="text-sm sm:text-base font-extrabold text-[#F25B09]">
                {formatRupiah(totalPrice)}
              </span>
            </div>

            {/* Single CTA: Beli Sekarang */}
            <button
              type="button"
              data-testid="modal-buy-now"
              disabled={isLoadingOptions || isSubmitting}
              onClick={() => handleConfirmAction("buynow")}
              aria-label="Beli Sekarang"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] active:scale-[0.98] text-white shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && (submittingIntent === "buynow" || submittingIntent === "buy_now") ? (
                <div className="flex items-center justify-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Mengarahkan...</span>
                </div>
              ) : (
                <span>Beli Sekarang</span>
              )}
            </button>
          </div>
        ) : (
          /* Dual Action Buttons for Storefront Product Card & "Pilih Variasi" section */
          <div className="space-y-2">
            {/* Total Price Row */}
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs text-[#737373] font-medium">Total Harga</span>
              <span className="text-sm sm:text-base font-extrabold text-[#F25B09]">
                {formatRupiah(totalPrice)}
              </span>
            </div>

            {/* Side-by-Side Dual Buttons */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              {/* Left: + Keranjang */}
              <button
                type="button"
                data-testid="modal-add-to-cart"
                disabled={isLoadingOptions || isSubmitting}
                onClick={() => handleConfirmAction("cart")}
                aria-label="Tambah ke Keranjang"
                className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all bg-orange-50/80 hover:bg-orange-100/90 active:bg-orange-100 active:scale-[0.98] text-[#F25B09] border border-orange-200/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              >
                {isSubmitting && (submittingIntent === "cart" || submittingIntent === "add_to_cart") ? (
                  <div className="flex items-center justify-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin text-[#F25B09]" />
                    <span>Menambahkan...</span>
                  </div>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 shrink-0" />
                    <span>+ Keranjang</span>
                  </>
                )}
              </button>

              {/* Right: Beli Sekarang */}
              <button
                type="button"
                data-testid="modal-buy-now"
                disabled={isLoadingOptions || isSubmitting}
                onClick={() => handleConfirmAction("buynow")}
                aria-label="Beli Sekarang"
                className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] active:scale-[0.98] text-white shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting && (submittingIntent === "buynow" || submittingIntent === "buy_now") ? (
                  <div className="flex items-center justify-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Mengarahkan...</span>
                  </div>
                ) : (
                  <span>Beli Sekarang</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export interface QuickAddModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  intent?: QuickAddIntent;
  modalKey?: string;
  initialOptions?: Record<string, string>;
  initialAddonIds?: Set<string>;
  initialQuantity?: number;
  initialItemNote?: string;
  onConfirm?: (data: QuickAddConfirmData) => void;
}

type ModalStatus = "closed" | "opening" | "open" | "closing";

export function QuickAddModal({
  product,
  isOpen,
  onClose,
  intent = "dual",
  modalKey,
  initialOptions,
  initialAddonIds,
  initialQuantity,
  initialItemNote,
  onConfirm,
}: QuickAddModalProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [asyncProduct, setAsyncProduct] = useState<Product | null>(null);

  // Animation lifecycle states
  const [status, setStatus] = useState<ModalStatus>("closed");
  const [renderedProduct, setRenderedProduct] = useState<Product | null>(null);
  const [prevProduct, setPrevProduct] = useState<Product | null>(null);

  const statusRef = useRef<ModalStatus>("closed");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const historyPushedRef = useRef(false);
  const skipHistoryBackRef = useRef(false);

  // Check if reduced motion is requested
  const isReducedMotion = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Complete the dismissal, restore body scroll, and notify parent
  const finishClosing = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    skipHistoryBackRef.current = false;
    setStatus("closed");
    setRenderedProduct(null);
    setPrevProduct(null);
    setAsyncProduct(null);
    onClose();
  }, [onClose]);

  // Centralized close function shared across X button, backdrop, Escape key, and Back button
  const requestClose = useCallback(
    (isBackAction: boolean = false, skipHistoryBack: boolean = false) => {
      // Prevent duplicate close requests while closing or closed
      if (statusRef.current === "closing" || statusRef.current === "closed") {
        return;
      }

      const shouldSkipHistoryBack = skipHistoryBack || skipHistoryBackRef.current;

      // Revert history entry only if initiated from UI (not from browser popstate and not when navigating away)
      if (!isBackAction && !shouldSkipHistoryBack && historyPushedRef.current) {
        historyPushedRef.current = false;
        try {
          window.history.back();
        } catch {
          // Ignore
        }
      } else {
        historyPushedRef.current = false;
      }

      // Set closing status immediately on the very first tap
      setStatus("closing");

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }

      if (isReducedMotion()) {
        finishClosing();
        return;
      }

      // Guarded fallback timeout: guarantees unmount at 350ms if transitionend is missed
      closeTimerRef.current = setTimeout(() => {
        finishClosing();
      }, 350);
    },
    [isReducedMotion, finishClosing]
  );

  // Synchronously adjust state during rendering when a new product is opened
  if (isOpen && product && product !== prevProduct) {
    setPrevProduct(product);
    setRenderedProduct(product);
    setAsyncProduct(null);
    setStatus("opening");
  }

  // Handle external close when parent sets isOpen to false
  useEffect(() => {
    if (!isOpen && statusRef.current === "open") {
      requestClose(false, skipHistoryBackRef.current);
    }
  }, [isOpen, requestClose]);

  // Handle transitionend event on the bottom sheet container
  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    // Filter out transition events from child elements
    if (e.target !== sheetRef.current) return;
    if (e.propertyName !== "transform") return;

    if (statusRef.current === "closing") {
      finishClosing();
    }
  };

  // Handle asynchronous entrance transition via RAF and register history state
  useEffect(() => {
    if (status === "opening" && isOpen) {
      // Clear any pending close timers from rapid re-openings
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      // Register a single history entry for mobile/browser Back button interception
      if (!historyPushedRef.current && typeof window !== "undefined") {
        historyPushedRef.current = true;
        try {
          window.history.pushState({ modal: "quick-add" }, "");
        } catch {
          // Ignore
        }
      }

      if (isReducedMotion()) {
        const raf = requestAnimationFrame(() => {
          setStatus("open");
        });
        return () => cancelAnimationFrame(raf);
      }

      // Double RAF ensures the initial off-screen (translateY 100%) frame is painted
      let r2: number;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => {
          setStatus("open");
        });
      });

      return () => {
        cancelAnimationFrame(r1);
        if (r2) cancelAnimationFrame(r2);
      };
    }
  }, [status, isOpen, isReducedMotion]);

  // Listen to browser / mobile Back button (popstate event)
  useEffect(() => {
    if (status === "closed") return;

    const handlePopState = () => {
      // User tapped browser or mobile Back button
      if (statusRef.current === "open" || statusRef.current === "opening") {
        requestClose(true); // true = history already popped by browser
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [status, requestClose]);

  // Handle Escape key
  useEffect(() => {
    if (status !== "open" && status !== "opening") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [status, requestClose]);

  // Lock body scroll while modal is active (opening, open, or closing)
  useEffect(() => {
    if (status === "closed") return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      historyPushedRef.current = false;
    };
  }, []);

  // Use the active product or preserved renderedProduct during closing
  const currentProduct = product || renderedProduct;

  const isMatchingAsync = Boolean(
    asyncProduct &&
      (asyncProduct.id === currentProduct?.id ||
        (asyncProduct.dbId && currentProduct?.dbId && asyncProduct.dbId === currentProduct.dbId) ||
        (asyncProduct.slug && currentProduct?.slug && asyncProduct.slug === currentProduct.slug))
  );

  const activeProduct = isMatchingAsync && asyncProduct ? asyncProduct : currentProduct;

  // Options are loaded if:
  // 1. The active product explicitly has isOptionsLoaded === true (e.g. from getVisibleProducts)
  // 2. The active product has optionGroups or addons populated
  // 3. Or matching asyncProduct is resolved
  const isOptionsLoaded = Boolean(
    activeProduct &&
      (activeProduct.isOptionsLoaded ||
        (activeProduct.optionGroups && activeProduct.optionGroups.length > 0) ||
        (activeProduct.addons && activeProduct.addons.length > 0) ||
        isMatchingAsync)
  );

  // Asynchronous fallback from Supabase catalog if options are not yet loaded
  useEffect(() => {
    if (!currentProduct || status === "closed") return;

    // Skip fetch if options are already loaded on the product
    if (
      currentProduct.isOptionsLoaded ||
      (currentProduct.optionGroups && currentProduct.optionGroups.length > 0) ||
      (currentProduct.addons && currentProduct.addons.length > 0)
    ) {
      return;
    }

    let active = true;
    import("@/lib/supabase/catalog")
      .then(({ getProductBySlugOrId }) =>
        getProductBySlugOrId(currentProduct.dbId || currentProduct.id || currentProduct.slug)
      )
      .then((full) => {
        if (active && full) {
          setAsyncProduct({
            ...currentProduct,
            optionGroups: full.optionGroups || [],
            addons: full.addons || [],
            isOptionsLoaded: true,
          });
        }
      })
      .catch((err) => {
        console.error("Gagal memuat detail opsi produk:", err);
      });

    return () => {
      active = false;
    };
  }, [currentProduct, status]);

  if (status === "closed" || !activeProduct) return null;

  const isOpeningOrOpen = status === "open";
  const isClosing = status === "closing";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          requestClose(false);
        }
      }}
      style={{
        transition: isClosing
          ? "opacity 260ms cubic-bezier(0.4, 0, 1, 1)"
          : "opacity 320ms cubic-bezier(0, 0, 0.2, 1)",
      }}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs will-change-[opacity] ${
        isOpeningOrOpen
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      } motion-reduce:transition-none`}
    >
      <div
        ref={sheetRef}
        onTransitionEnd={handleTransitionEnd}
        style={{
          transform: isOpeningOrOpen ? "translateY(0)" : "translateY(100%)",
          opacity: isOpeningOrOpen ? 1 : 0,
          transition: isClosing
            ? "transform 260ms cubic-bezier(0.4, 0, 1, 1), opacity 260ms cubic-bezier(0.4, 0, 1, 1)"
            : "transform 320ms cubic-bezier(0, 0, 0.2, 1), opacity 320ms cubic-bezier(0, 0, 0.2, 1)",
        }}
        className={`w-full max-h-[88vh] sm:max-h-[85vh] sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl border border-[#E5E5E5] overflow-hidden will-change-[transform,opacity] ${
          isOpeningOrOpen ? "pointer-events-auto" : "pointer-events-none"
        } motion-reduce:transition-none motion-reduce:transform-none`}
      >
        <QuickAddForm
          key={`${activeProduct.dbId || activeProduct.id}-${intent}-${modalKey || ""}`}
          product={activeProduct}
          isLoadingOptions={!isOptionsLoaded}
          intent={intent}
          initialOptions={initialOptions}
          initialAddonIds={initialAddonIds}
          initialQuantity={initialQuantity}
          initialItemNote={initialItemNote}
          onClose={(skipHistoryBack?: boolean) => {
            if (skipHistoryBack) {
              skipHistoryBackRef.current = true;
            }
            requestClose(false, skipHistoryBack);
          }}
          onConfirm={onConfirm}
        />
      </div>
    </div>
  );
}
