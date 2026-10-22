import React from "react";
import { getCategoryIcon, getDefaultIconForSlug } from "@/lib/category-icons";

export interface CategoryIconProps {
  icon?: string | null;
  fallbackSlug?: string | null;
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}

/**
 * Renders an outline Lucide icon for a category through an explicit safe allowlist.
 * If the configured icon is missing or unrecognized, it falls back to a sensible
 * default based on the category slug or the standard Utensils fallback.
 */
export function CategoryIcon({
  icon,
  fallbackSlug,
  className = "w-4 h-4",
  strokeWidth = 2,
  "aria-hidden": ariaHidden = true,
}: CategoryIconProps) {
  const resolvedIconId = icon || (fallbackSlug ? getDefaultIconForSlug(fallbackSlug) : undefined);
  const IconComponent = getCategoryIcon(resolvedIconId);

  return React.createElement(IconComponent, {
    className,
    strokeWidth,
    "aria-hidden": ariaHidden,
  });
}
