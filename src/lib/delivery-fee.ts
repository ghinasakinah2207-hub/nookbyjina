export type FulfillmentType = "pickup" | "delivery";

export interface DeliveryCalculationParams {
  fulfillmentType: FulfillmentType;
  deliveryArea: string;
  subtotal: number;
  deliveryConfig: {
    configuredArea: string;
    standardFee: number;
    freeShippingThreshold: number;
  };
}

export interface DeliveryCalculationResult {
  shippingFee: number;
  isFree: boolean;
  isOutsideArea: boolean;
  standardFee: number;
  freeShippingThreshold: number;
  configuredArea: string;
  remainingToFreeShipping: number;
}

/**
 * Single source of truth calculation for delivery fee and threshold.
 * Rules:
 * 1. Pickup is always free (shippingFee = 0).
 * 2. If delivery area matches configuredArea (e.g. Lhoksukon):
 *    - If subtotal >= freeShippingThreshold: shippingFee = 0 (Free delivery).
 *    - Else: shippingFee = standardFee.
 * 3. If delivery area is outside: isOutsideArea = true (cannot checkout without admin confirmation).
 */
export function calculateDeliveryFee({
  fulfillmentType,
  deliveryArea,
  subtotal,
  deliveryConfig,
}: DeliveryCalculationParams): DeliveryCalculationResult {
  const configuredArea = (deliveryConfig?.configuredArea || "Lhoksukon").trim();
  const standardFee = Math.max(0, Number(deliveryConfig?.standardFee ?? 0));
  const freeShippingThreshold = Math.max(
    0,
    Number(deliveryConfig?.freeShippingThreshold ?? 50000)
  );

  if (fulfillmentType === "pickup") {
    return {
      shippingFee: 0,
      isFree: true,
      isOutsideArea: false,
      standardFee,
      freeShippingThreshold,
      configuredArea,
      remainingToFreeShipping: 0,
    };
  }

  // Normalize check for area matching
  const normDelivery = deliveryArea.trim().toLowerCase();
  const normConfigured = configuredArea.toLowerCase();

  const isConfiguredArea =
    normDelivery === normConfigured ||
    (normConfigured.includes("lhoksukon") && normDelivery.includes("lhoksukon"));

  if (!isConfiguredArea) {
    return {
      shippingFee: 0,
      isFree: false,
      isOutsideArea: true,
      standardFee,
      freeShippingThreshold,
      configuredArea,
      remainingToFreeShipping: Math.max(0, freeShippingThreshold - subtotal),
    };
  }

  // Free delivery applies when subtotal is strictly greater than freeShippingThreshold (> threshold)
  // This matches the database RPC and the business rule:
  // "Free delivery applies when the item subtotal is strictly greater than Rp50,000."
  const isFree = subtotal > freeShippingThreshold;
  const shippingFee = isFree ? 0 : standardFee;
  const remainingToFreeShipping = isFree
    ? 0
    : Math.max(0, freeShippingThreshold - subtotal + 1);

  return {
    shippingFee,
    isFree,
    isOutsideArea: false,
    standardFee,
    freeShippingThreshold,
    configuredArea,
    remainingToFreeShipping,
  };
}
