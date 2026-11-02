"use client";

import React, { useMemo } from "react";
import { CartItem, Product, SelectedOption, SelectedAddon } from "@/types";
import { QuickAddModal, QuickAddConfirmData } from "@/components/product/QuickAddModal";

export interface CartVariationModalProps {
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

/**
 * @deprecated Use QuickAddModal directly with intent="configure".
 * Kept for backwards compatibility with tests and legacy callers.
 */
export function CartVariationModal({
  isOpen,
  cartItem,
  product,
  onClose,
  onConfirm,
}: CartVariationModalProps) {
  const initialOptions = useMemo(() => {
    if (!cartItem?.selectedOptions) return {};
    const opts: Record<string, string> = {};
    const groups = product?.optionGroups || [];
    cartItem.selectedOptions.forEach((o) => {
      const grpKey = o.groupId || o.optionName;
      const valKey = o.valueId || o.optionValueId;
      const matchingGroup = groups.find(
        (g) =>
          g.id === grpKey ||
          g.name === grpKey ||
          (o.groupName && g.name === o.groupName)
      );
      if (matchingGroup) {
        const matchingVal = matchingGroup.values.find(
          (v) =>
            v.id === valKey ||
            v.name === valKey ||
            (o.valueName && v.name === o.valueName) ||
            (o.optionValue && v.name === o.optionValue)
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
    return opts;
  }, [cartItem, product]);

  const initialAddonIds = useMemo(() => {
    if (!cartItem?.selectedAddons) return new Set<string>();
    return new Set(cartItem.selectedAddons.map((a) => a.addonId));
  }, [cartItem]);

  const handleConfirm = (data: QuickAddConfirmData) => {
    if (!cartItem) return;
    onConfirm(cartItem.id, data.selectedOptions, data.selectedAddons, data.quantity);
  };

  return (
    <QuickAddModal
      key={cartItem ? `${cartItem.id}-${cartItem.quantity}` : "cart-variation"}
      product={product}
      isOpen={isOpen}
      intent="configure"
      modalKey={cartItem?.id}
      initialOptions={initialOptions}
      initialAddonIds={initialAddonIds}
      initialQuantity={cartItem?.quantity}
      initialItemNote={cartItem?.itemNote}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
}
