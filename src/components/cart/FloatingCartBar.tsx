"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, ChevronRight } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatRupiah } from "@/data/dummy-data";

export function FloatingCartBar() {
  const pathname = usePathname();
  const { itemCount, subtotal, isHydrated } = useCart();

  // Normalize trailing slash
  const normalizedPath =
    pathname && pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;

  // Never render on excluded routes (admin, checkout, payment, success, product detail, or cart itself)
  const isExcludedRoute =
    !pathname ||
    pathname === "/" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/pembayaran") ||
    pathname.startsWith("/sukses") ||
    pathname.startsWith("/produk") ||
    pathname.startsWith("/keranjang");

  // Only render on valid customer storefront routes (e.g. /home, /menu, /favorit, /pesanan)
  const isCustomerRoute = Boolean(
    normalizedPath &&
      !isExcludedRoute &&
      (normalizedPath === "/home" ||
        normalizedPath.startsWith("/home/") ||
        normalizedPath === "/menu" ||
        normalizedPath.startsWith("/menu/") ||
        normalizedPath === "/favorit" ||
        normalizedPath.startsWith("/favorit/") ||
        normalizedPath === "/pesanan" ||
        normalizedPath.startsWith("/pesanan/"))
  );

  const isVisible = Boolean(isCustomerRoute && isHydrated && itemCount > 0);

  return (
    <aside
      aria-hidden={!isVisible}
      aria-label="Keranjang Belanja Mengambang"
      data-testid="floating-cart-bar"
      className={`fixed left-1/2 -translate-x-1/2 z-35 w-[calc(100%-24px)] max-w-md select-none print:hidden transition-all duration-200 ease-out ${
        isVisible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3 pointer-events-none"
      }`}
      style={{
        bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <Link
        href="/keranjang"
        prefetch={true}
        aria-label={`Buka Keranjang: ${itemCount} menu, Total ${formatRupiah(subtotal)}`}
        className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl bg-gradient-to-r from-[#21100C] via-[#35170E] to-[#54220F] text-white shadow-xl shadow-black/35 border border-white/10 active:scale-[0.99] transition-transform cursor-pointer"
      >
        {/* Left: Shopping Cart Icon with Item Count Badge */}
        <div
          key={`${itemCount}-${subtotal}`}
          className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-white/10 border border-white/10 flex-shrink-0 animate-in zoom-in-90 duration-200"
        >
          <ShoppingCart className="w-4.5 h-4.5 text-white" />
          <span
            data-testid="floating-cart-badge"
            className="absolute -top-1.5 -right-1.5 bg-white text-[#F25B09] text-[9.5px] font-black h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center leading-none shadow-xs"
          >
            {itemCount > 99 ? "99+" : itemCount}
          </span>
        </div>

        {/* Middle: Label "Total" & Nominal Total Belanja */}
        <div className="flex flex-col min-w-0 flex-1 px-3">
          <span className="text-[10px] text-white/70 font-medium leading-none">
            Total
          </span>
          <span
            data-testid="floating-cart-total"
            className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-tight mt-0.5"
          >
            {formatRupiah(subtotal)}
          </span>
        </div>

        {/* Right: Prominent Accent CTA "CHECKOUT" with Item Count */}
        <div className="flex items-center gap-1 bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#C2410C] px-3 py-1.5 rounded-xl flex-shrink-0 transition-colors shadow-xs">
          <span className="text-xs font-bold text-white tracking-wide uppercase">
            CHECKOUT ({itemCount})
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-white stroke-[2.5]" />
        </div>
      </Link>
    </aside>
  );
}
