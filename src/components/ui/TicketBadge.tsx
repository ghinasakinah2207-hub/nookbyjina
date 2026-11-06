import React, { CSSProperties } from "react";
import { ProductType, normalizeProductType } from "@/lib/product-type";

export interface TicketBadgeProps {
  type?: ProductType | string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Reusable Ticket-Style Product Type Badge (READY / PRE-ORDER).
 *
 * Features:
 * - Ticket-like silhouette with subtle concave semicircular cutouts on left and right edges.
 * - Slightly rounded outer corners (rounded-[3px] sm:rounded-[3.5px]).
 * - Compact horizontal proportions tailored for mobile & desktop product cards.
 * - Fresh green gradient for READY (lighter green to deeper green).
 * - Warm orange gradient for PRE-ORDER (lighter orange to deeper orange).
 * - Bold white readable uppercase text.
 * - Clean CSS mask technique for true cutouts allowing the product image beneath to show through.
 * - Subtle drop-shadow that contours to the ticket shape.
 */
export function TicketBadge({
  type,
  label,
  className = "",
  size = "sm",
}: TicketBadgeProps) {
  const normalizedType = normalizeProductType(type);
  const isReady = normalizedType === "ready";
  const displayLabel = label ?? (isReady ? "READY" : "PRE-ORDER");

  const isMedium = size === "md";

  // CSS mask punches out smooth concave semicircular notches on the left and right edges.
  // Scaled down by ~15-20% for a sleeker, more refined ticket profile.
  const ticketMaskStyle: CSSProperties = {
    WebkitMaskImage: isMedium
      ? "radial-gradient(circle 2.6px at 0% 50%, transparent 0, transparent 2.6px, black 2.8px), radial-gradient(circle 2.6px at 100% 50%, transparent 0, transparent 2.6px, black 2.8px)"
      : "radial-gradient(circle 2.2px at 0% 50%, transparent 0, transparent 2.2px, black 2.4px), radial-gradient(circle 2.2px at 100% 50%, transparent 0, transparent 2.2px, black 2.4px)",
    WebkitMaskSize: "51% 100%",
    WebkitMaskPosition: "0 0, 100% 0",
    WebkitMaskRepeat: "no-repeat",
    maskImage: isMedium
      ? "radial-gradient(circle 2.6px at 0% 50%, transparent 0, transparent 2.6px, black 2.8px), radial-gradient(circle 2.6px at 100% 50%, transparent 0, transparent 2.6px, black 2.8px)"
      : "radial-gradient(circle 2.2px at 0% 50%, transparent 0, transparent 2.2px, black 2.4px), radial-gradient(circle 2.2px at 100% 50%, transparent 0, transparent 2.2px, black 2.4px)",
    maskSize: "51% 100%",
    maskPosition: "0 0, 100% 0",
    maskRepeat: "no-repeat",
  };

  const gradientStyle: CSSProperties = {
    backgroundImage: isReady
      ? "linear-gradient(135deg, #10B981 0%, #047857 100%)"
      : "linear-gradient(135deg, #F97316 0%, #C2410C 100%)",
  };

  return (
    <div
      className={`inline-flex items-center justify-center select-none ${className}`}
      style={{ filter: "drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.22))" }}
      role="status"
      aria-label={displayLabel}
      data-testid="ticket-badge"
      data-product-type={normalizedType}
    >
      <span
        className={`inline-flex items-center justify-center font-bold tracking-wider text-white uppercase leading-none ${
          isMedium
            ? "h-[16.5px] sm:h-[17.5px] px-2 sm:px-2.5 text-[7.5px] sm:text-[8px] rounded-[3px] sm:rounded-[3.5px]"
            : "h-[15px] sm:h-[16px] px-1.5 sm:px-[7px] text-[7px] sm:text-[7.5px] rounded-[2.5px] sm:rounded-[3px]"
        }`}
        style={{
          ...ticketMaskStyle,
          ...gradientStyle,
        }}
      >
        {displayLabel}
      </span>
    </div>
  );
}

