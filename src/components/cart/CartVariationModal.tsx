"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { X, Plus, Minus, AlertCircle } from "lucide-react";
import { CartItem, Product, SelectedOption, SelectedAddon } from "@/types";
import { formatRupiah } from "@/data/dummy-data";
import { parseOptionLabel } from "@/lib/option-utils";

interface CartVariationModalProps {
  isOpen: boolean;
  cartItem: CartItem | null;
  product: Product | null;
  onClose: () => void;
  onConfirm: (
    itemId: string,
    newOptions: SelectedOption[],
    newAddons: SelectedAddon[],
    newQuantity: number
  ) => void;
}

function CartVariationDialog({
  cartItem,
  product,
  onClose,
  onConfirm,
}: Omit<CartVariationModalProps, "isOpen"> & { cartItem: CartItem }) {
  // Option groups & addons from product definition or empty
  const optionGroups = useMemo(() => product?.optionGroups || [], [product]);
  const availableAddons = useMemo(() => product?.addons || [], [product]);

  // Selections state initialized directly per cartItem instance (no effect needed)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const initialOpts: Record<string, string> = {};
    if (Array.isArray(cartItem.selectedOptions)) {
      cartItem.selectedOptions.forEach((opt) => {
        const grpId = opt.groupId || opt.optionName;
        const valId = opt.valueId || opt.optionValueId;
        if (grpId && valId) {
          const matchingGroup = optionGroups.find(
            (g) => g.id === grpId || g.name === grpId
          );
          if (matchingGroup) {
            const matchingVal = matchingGroup.values.find(
              (v) => v.id === valId || v.name === valId
            );
            initialOpts[matchingGroup.id] = matchingVal ? matchingVal.id : valId;
          } else {
            initialOpts[grpId] = valId;
          }
        }
      });
    }

    optionGroups.forEach((group) => {
      if (group.required && group.values.length > 0 && !initialOpts[group.id]) {
        initialOpts[group.id] = group.values[0].id;
      }
    });

    return initialOpts;
  });

  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(() => {
    const initialAddons = new Set<string>();
    if (Array.isArray(cartItem.selectedAddons)) {
      cartItem.selectedAddons.forEach((addon) => {
        if (addon.addonId) initialAddons.add(addon.addonId);
      });
    }
    return initialAddons;
  });

  const [quantity, setQuantity] = useState(cartItem.quantity || 1);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Calculate dynamic unit price & resolved options
  const { currentUnitPrice, resolvedOptions, resolvedAddons } = useMemo(() => {
    const basePrice = product ? product.basePrice : cartItem.basePrice;
    let optionsDelta = 0;
    const resolvedOpts: SelectedOption[] = [];

    // Calculate options delta
    optionGroups.forEach((group) => {
      const selectedValId = selectedOptions[group.id];
      if (selectedValId) {
        const val = group.values.find((v) => v.id === selectedValId);
        if (val) {
          optionsDelta += val.priceDelta;
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

    // If product has no optionGroups defined, preserve existing cartItem options
    if (optionGroups.length === 0 && Array.isArray(cartItem.selectedOptions)) {
      cartItem.selectedOptions.forEach((opt) => {
        optionsDelta += Number(opt.priceDelta || 0);
        resolvedOpts.push(opt);
      });
    }

    // Calculate addons delta
    let addonsDelta = 0;
    const resolvedAdds: SelectedAddon[] = [];
    availableAddons.forEach((addon) => {
      if (selectedAddonIds.has(addon.id)) {
        addonsDelta += addon.price;
        resolvedAdds.push({
          addonId: addon.id,
          addonName: addon.name,
          price: addon.price,
        });
      }
    });

    // If product has no addons defined, preserve existing cartItem addons
    if (availableAddons.length === 0 && Array.isArray(cartItem.selectedAddons)) {
      cartItem.selectedAddons.forEach((addon) => {
        addonsDelta += Number(addon.price || 0);
        resolvedAdds.push(addon);
      });
    }

    return {
      currentUnitPrice: basePrice + optionsDelta + addonsDelta,
      resolvedOptions: resolvedOpts,
      resolvedAddons: resolvedAdds,
    };
  }, [cartItem, product, optionGroups, availableAddons, selectedOptions, selectedAddonIds]);

  const handleSelectOption = (groupId: string, valueId: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [groupId]: valueId,
    }));
    setValidationError(null);
  };

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

  const handleConfirm = () => {
    for (const group of optionGroups) {
      if (group.required && !selectedOptions[group.id]) {
        setValidationError(`Silakan pilih variasi "${group.name}".`);
        return;
      }
    }

    onConfirm(cartItem.id, resolvedOptions, resolvedAddons, quantity);
    onClose();
  };

  const productImage = cartItem.productImage || product?.images?.[0] || "/images/hero-food.webp";
  const productName = cartItem.productName || product?.name || "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-landing-fade"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="variation-modal-title"
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Product Preview & Price */}
        <div className="p-4 border-b border-[#E5E5E5] flex items-start gap-3 relative">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-neutral-100 flex-shrink-0 border border-neutral-100">
            <Image
              src={productImage}
              alt={productName}
              fill
              className="object-cover"
              sizes="80px"
            />
          </div>

          <div className="flex-1 min-w-0 pr-6 space-y-1">
            <h3
              id="variation-modal-title"
              className="text-sm font-bold text-[#111111] leading-snug line-clamp-2"
            >
              {productName}
            </h3>
            <div className="text-base font-bold text-[#F25B09]">
              {formatRupiah(currentUnitPrice)}
            </div>
            <div className="text-[11px] text-[#737373]">
              Pilih variasi yang kamu inginkan
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#737373] hover:text-[#111111] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body: Variation Groups & Add-ons */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-[#B42318]">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Option Groups */}
          {optionGroups.map((group) => (
            <div key={group.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#111111]">
                  {group.name}
                  {group.required ? (
                    <span className="text-[#F25B09] ml-1 text-xs">*</span>
                  ) : (
                    <span className="text-[10px] text-[#737373] ml-1 font-normal">
                      (Opsional)
                    </span>
                  )}
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                {group.values.map((val) => {
                  const isSelected = selectedOptions[group.id] === val.id;
                  const { label, desc } = parseOptionLabel(val.name);

                  return (
                    <button
                      key={val.id}
                      type="button"
                      onClick={() => handleSelectOption(group.id, val.id)}
                      className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 border ${
                        isSelected
                          ? "border-[#F25B09] bg-[#FFF5F0] text-[#F25B09] font-semibold ring-1 ring-[#F25B09]"
                          : "border-[#E5E5E5] bg-neutral-50 text-[#111111] hover:border-neutral-300"
                      }`}
                    >
                      <span>{label}</span>
                      {desc && (
                        <span
                          className={`text-[10px] ${
                            isSelected ? "text-[#F25B09]/80" : "text-[#737373]"
                          }`}
                        >
                          ({desc})
                        </span>
                      )}
                      {val.priceDelta > 0 && (
                        <span
                          className={`text-[10px] font-medium ${
                            isSelected ? "text-[#F25B09]" : "text-[#737373]"
                          }`}
                        >
                          +{formatRupiah(val.priceDelta)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Addons */}
          {availableAddons.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#E5E5E5]">
              <label className="text-xs font-bold text-[#111111] block">
                Tambahan <span className="text-[10px] text-[#737373] font-normal">(Opsional)</span>
              </label>

              <div className="flex flex-wrap gap-2">
                {availableAddons.map((addon) => {
                  const isSelected = selectedAddonIds.has(addon.id);

                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => handleToggleAddon(addon.id)}
                      className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 border ${
                        isSelected
                          ? "border-[#F25B09] bg-[#FFF5F0] text-[#F25B09] font-semibold ring-1 ring-[#F25B09]"
                          : "border-[#E5E5E5] bg-neutral-50 text-[#111111] hover:border-neutral-300"
                      }`}
                    >
                      <span>{addon.name}</span>
                      {addon.price > 0 && (
                        <span
                          className={`text-[10px] font-medium ${
                            isSelected ? "text-[#F25B09]" : "text-[#737373]"
                          }`}
                        >
                          +{formatRupiah(addon.price)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity Row */}
          <div className="pt-2 border-t border-[#E5E5E5] flex items-center justify-between">
            <span className="text-xs font-bold text-[#111111]">Jumlah</span>

            <div className="flex items-center border border-[#E5E5E5] rounded-xl p-0.5 bg-neutral-50">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Kurangi jumlah"
                className={`w-7 h-7 flex items-center justify-center rounded-lg min-h-[30px] min-w-[30px] transition-colors ${
                  quantity <= 1
                    ? "text-neutral-300 cursor-not-allowed"
                    : "text-[#111111] hover:bg-white"
                }`}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-8 text-center text-xs font-semibold text-[#111111]">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Tambah jumlah"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[#111111] hover:bg-white min-h-[30px] min-w-[30px] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer: Confirm Button */}
        <div className="p-4 border-t border-[#E5E5E5] bg-white">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full min-h-[46px] px-4 py-2.5 bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] text-white text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-xs flex items-center justify-center"
          >
            Konfirmasi
          </button>
        </div>
      </div>
    </div>
  );
}

export function CartVariationModal(props: CartVariationModalProps) {
  if (!props.isOpen || !props.cartItem) return null;

  return (
    <CartVariationDialog
      key={props.cartItem.id}
      cartItem={props.cartItem}
      product={props.product}
      onClose={props.onClose}
      onConfirm={props.onConfirm}
    />
  );
}
