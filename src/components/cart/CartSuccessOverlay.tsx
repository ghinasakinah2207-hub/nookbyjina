"use client";

import React, { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { useCart } from "@/context/CartContext";

export function CartSuccessOverlay() {
  const { cartSuccessEvent, dismissCartSuccess } = useCart();

  useEffect(() => {
    if (!cartSuccessEvent) return;
    const timer = setTimeout(dismissCartSuccess, 1200);
    return () => clearTimeout(timer);
  }, [cartSuccessEvent, dismissCartSuccess]);

  if (!cartSuccessEvent) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-200 animate-in fade-in slide-in-from-top-2"
    >
      <div className="bg-[#111111]/95 backdrop-blur-xs text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-[#29AC9A]" />
        <span>Menu ditambahkan ke keranjang</span>
      </div>
    </div>
  );
}
