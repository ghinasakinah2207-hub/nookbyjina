export type ProductType = "ready" | "preorder";

export const READY_PRODUCT_TYPE: ProductType = "ready";
export const PREORDER_PRODUCT_TYPE: ProductType = "preorder";

export const READY_ESTIMATE = "15–20 menit";
export const PREORDER_ESTIMATE = "1 day";

export const READY_CHECKOUT_INDICATOR = "READY · Estimasi persiapan 15–20 menit";
export const PREORDER_CHECKOUT_INDICATOR = "PRE-ORDER · Estimasi persiapan 1 day";

/**
 * Normalizes any value to a valid ProductType.
 * Guaranteed backward compatibility: missing, null, undefined, or unrecognized values default to 'preorder'.
 */
export function normalizeProductType(val?: unknown): ProductType {
  if (typeof val === "string") {
    const clean = val.trim().toLowerCase();
    if (clean === "ready") return "ready";
    if (clean === "preorder" || clean === "pre-order" || clean === "pre_order") {
      return "preorder";
    }
  }
  return "preorder";
}

/**
 * Safely extracts the product type from a Product or CartItem entity.
 */
export function getProductType(product?: { productType?: unknown } | null): ProductType {
  return normalizeProductType(product?.productType);
}

export interface ProductTypeConfig {
  type: ProductType;
  label: "READY" | "PRE-ORDER";
  estimate: string;
  checkoutIndicator: string;
  description: string;
  badgeClasses: string;
  solidBadgeClasses: string;
}

export function getProductTypeConfig(typeInput?: unknown): ProductTypeConfig {
  const type = normalizeProductType(typeInput);

  if (type === "ready") {
    return {
      type: "ready",
      label: "READY",
      estimate: READY_ESTIMATE,
      checkoutIndicator: READY_CHECKOUT_INDICATOR,
      description: "Produk siap diproses",
      badgeClasses: "bg-emerald-50 text-[#18794E] border border-emerald-200",
      solidBadgeClasses: "bg-[#18794E] text-white",
    };
  }

  return {
    type: "preorder",
    label: "PRE-ORDER",
    estimate: PREORDER_ESTIMATE,
    checkoutIndicator: PREORDER_CHECKOUT_INDICATOR,
    description: "Pesanan dipersiapkan dalam 1 hari",
    badgeClasses: "bg-orange-50 text-[#F25B09] border border-orange-200",
    solidBadgeClasses: "bg-[#F25B09] text-white",
  };
}

/**
 * Returns the authoritative product type of a cart or list of items.
 * Returns null if the cart has no items.
 */
export function getCartProductType(
  items: Array<{ productType?: unknown }>
): ProductType | null {
  if (!items || items.length === 0) return null;
  return normalizeProductType(items[0]?.productType);
}

/**
 * Determines whether an incoming item can be added to the cart without conflict.
 * Ready and Pre-order cannot be mixed.
 */
export function canAddToCart(
  currentItems: Array<{ productType?: unknown }>,
  incomingItem: { productType?: unknown }
): boolean {
  if (!currentItems || currentItems.length === 0) return true;
  const currentType = getCartProductType(currentItems);
  const incomingType = normalizeProductType(incomingItem?.productType);
  return currentType === incomingType;
}

