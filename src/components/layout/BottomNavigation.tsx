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

  const getActiveIndex = () => {
    if (isHomeActive) return 0;
    if (isMenuActive) return 1;
    if (isCartActive) return 2;
    if (isOrdersActive) return 3;
    return -1;
  };

  const activeIndex = getActiveIndex();

  return (
    <nav
      aria-label="Navigasi Utama Pelanggan"
      className="fixed left-1/2 -translate-x-1/2 z-40 bg-white/60 backdrop-blur-md border border-neutral-200/80 rounded-full px-2.5 py-1.5 floating-pill-shadow select-none print:hidden"
      style={{
        bottom: "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))",
      }}
    >
      <div className="relative flex items-center w-[264px] h-[50px]">
        {/* Shared sliding active indicator with comfortable breathing room */}
        {activeIndex !== -1 && (
          <div
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-0 w-1/4 rounded-2xl bg-[#F0F0F2] transition-transform duration-350 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none pointer-events-none"
            style={{
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
        )}

        {/* 4 Interactive Tab Links with vertical icon-over-label layout */}
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
              className={`group relative z-10 w-1/4 h-full flex flex-col items-center justify-center px-3.5 py-1 rounded-2xl transition-colors duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                item.isActive
                  ? "text-[#111111]"
                  : "text-[#737373] hover:text-[#111111]"
              }`}
            >
              <div className="relative flex items-center justify-center w-5 h-5 flex-shrink-0">
                <IconComponent
                  className="w-5 h-5 transition-transform duration-200 motion-reduce:transition-none"
                  strokeWidth={item.isActive ? 2.2 : 1.8}
                  aria-hidden="true"
                />
                {item.badgeCount !== undefined && item.badgeCount > 0 ? (
                  <span
                    className="absolute -top-1.5 -right-2.5 bg-[#F25B09] text-white text-[9px] font-bold h-3.5 min-w-[14px] px-1 rounded-full flex items-center justify-center border border-white z-20 pointer-events-none"
                    aria-label={`${item.badgeCount} item di keranjang`}
                  >
                    {item.badgeCount > 99 ? "99+" : item.badgeCount}
                  </span>
                ) : null}
              </div>

              <span
                className={`text-[10px] leading-tight mt-1 whitespace-nowrap transition-colors duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                  item.isActive
                    ? "font-semibold text-[#111111]"
                    : "font-medium text-[#737373] group-hover:text-[#111111]"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
