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
  const normalizedSubtotal = Math.max(0, Math.round(Number(subtotal) || 0));
  const standardFee = Math.max(
    0,
    Math.round(Number(deliveryConfig?.standardFee ?? 0) || 0)
  );
  const freeShippingThreshold = Math.max(
    0,
    Math.round(Number(deliveryConfig?.freeShippingThreshold ?? 50000) || 0)
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
      remainingToFreeShipping: Math.max(0, freeShippingThreshold - normalizedSubtotal),
    };
  }

  // Free delivery applies when subtotal is greater than or equal to freeShippingThreshold (>= threshold).
  // Matches the database RPC `create_order_atomic`:
  // `v_free_thresh > 0 AND v_calculated_subtotal >= v_free_thresh`
  const isFree =
    standardFee === 0 ||
    (freeShippingThreshold > 0 && normalizedSubtotal >= freeShippingThreshold);
  const shippingFee = isFree ? 0 : standardFee;
  const remainingToFreeShipping =
    isFree || freeShippingThreshold <= 0
      ? 0
      : Math.max(0, freeShippingThreshold - normalizedSubtotal);

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
