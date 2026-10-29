"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UtensilsCrossed, ShoppingBag, ReceiptText } from "lucide-react";
import { useCart } from "@/context/CartContext";

export function BottomNavigation() {
  const pathname = usePathname();
  const { itemCount, isHydrated } = useCart();

  // Hide bottom navigation on welcome page (/), checkout, payment, success, and admin screens
  if (
    !pathname ||
    pathname === "/" ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/pembayaran") ||
    pathname.startsWith("/sukses") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  // Explicit, intentional route-to-tab matching
  // Normalizes trailing slashes so e.g. /home/ and /home both match
  const normalizedPath =
    pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;

  const isHomeActive =
    normalizedPath === "/home" || normalizedPath === "/";
  const isMenuActive =
    normalizedPath === "/menu" || normalizedPath.startsWith("/menu/");
  const isCartActive =
    normalizedPath === "/keranjang" || normalizedPath.startsWith("/keranjang/");
  const isOrdersActive =
    normalizedPath === "/pesanan" || normalizedPath.startsWith("/pesanan/");

  const navItems = [
    {
      label: "Home",
      href: "/home",
      icon: Home,
      isActive: isHomeActive,
    },
    {
      label: "Menu",
      href: "/menu",
      icon: UtensilsCrossed,
      isActive: isMenuActive,
    },
    {
      label: "Keranjang",
      href: "/keranjang",
      icon: ShoppingBag,
      isActive: isCartActive,
      badgeCount: isHydrated ? itemCount : 0,
    },
    {
      label: "Pesanan",
      href: "/pesanan",
      icon: ReceiptText,
      isActive: isOrdersActive,
    },
  ];

  return (
    <nav
      aria-label="Navigasi Utama Pelanggan"
      className="fixed left-1/2 -translate-x-1/2 z-40 bg-white/70 backdrop-blur-md border border-neutral-200/80 rounded-full p-1.5 floating-pill-shadow flex items-center gap-1 select-none print:hidden"
      style={{
        bottom: "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))",
      }}
    >
      {navItems.map((item) => {
        const IconComponent = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            aria-label={item.label}
            aria-current={item.isActive ? "page" : undefined}
            title={item.label}
            className={`group relative h-10 flex items-center justify-center rounded-full transition-[background-color,color,padding] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-400 ${
              item.isActive
                ? "bg-[#F0F0F2] text-[#111111] px-3.5 font-semibold"
                : "bg-transparent text-[#737373] hover:text-[#111111] hover:bg-neutral-100/60 px-2.5"
            }`}
          >
            <div className="relative flex items-center justify-center w-5 h-5 flex-shrink-0">
              <IconComponent
                className="w-5 h-5 transition-colors duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                strokeWidth={item.isActive ? 2.2 : 1.8}
                aria-hidden="true"
              />
              {item.badgeCount !== undefined && item.badgeCount > 0 ? (
                <span
                  className="absolute -top-1.5 -right-1.5 bg-[#F25B09] text-white text-[10px] font-semibold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border border-white z-10 pointer-events-none"
                  aria-label={`${item.badgeCount} item di keranjang`}
                >
                  {item.badgeCount > 99 ? "99+" : item.badgeCount}
                </span>
              ) : null}
            </div>

            <span
              className={`shrink-0 overflow-hidden whitespace-nowrap text-xs font-semibold transition-[max-width,opacity,margin] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                item.isActive
                  ? "max-w-24 opacity-100 ml-2 text-[#111111]"
                  : "max-w-0 opacity-0 ml-0 pointer-events-none"
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
