"use client";

import React, { useState, useEffect, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UtensilsCrossed, ShoppingCart, ReceiptText } from "lucide-react";
import { useCart } from "@/context/CartContext";

export const BottomNavContext = React.createContext<boolean>(false);

export const BOTTOM_NAV_LAYOUT = {
  bottomOffset: 2, // px from viewport bottom
  barHeight: 58, // px total height (increased by 6px from previous 52px)
  innerContentHeight: 48, // px
  outerPadding: 4, // p-1 (4px top, 4px bottom)
  floatingCartGap: 4, // px visual gap between nav and floating cart (3-5px spec)
  floatingCartBottom: 64, // 2px + 58px + 4px = 64px (+ safe-area)
} as const;

export function BottomNavigation({ isRoot }: { isRoot?: boolean } = {}) {
  const isInsideRootNav = useContext(BottomNavContext);
  const pathname = usePathname();
  const { itemCount, isHydrated } = useCart();
  const [mounted, setMounted] = useState(false);
  const [optimisticIndex, setOptimisticIndex] = useState<number | null>(null);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Reset optimistic state during render when route finishes changing (React official pattern)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOptimisticIndex(null);
  }

  // Prevent initial mount transition flicker by enabling transitions on next frame
  useEffect(() => {
    const frameId = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  // If a root persistent BottomNavigation is already active in AppProvider,
  // prevent duplicate instances from rendering in child page trees while preserving JSX presence.
  if (!isRoot && isInsideRootNav) {
    return null;
  }

  // Normalize trailing slashes so e.g. /home/ and /home both match
  const normalizedPath =
    pathname && pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;

  // Explicitly hide on non-customer routes (admin, checkout, payment, success, product detail, welcome page)
  const isExcludedRoute =
    !pathname ||
    pathname === "/" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/pembayaran") ||
    pathname.startsWith("/sukses") ||
    pathname.startsWith("/produk");

  // Whitelist of valid customer navigation destinations: safe initial rendering
  // prevents premature rendering by ensuring route is explicitly valid before rendering nav.
  const isCustomerNavigationRoute = Boolean(
    normalizedPath &&
      !isExcludedRoute &&
      (normalizedPath === "/home" ||
        normalizedPath.startsWith("/home/") ||
        normalizedPath === "/menu" ||
        normalizedPath.startsWith("/menu/") ||
        normalizedPath === "/keranjang" ||
        normalizedPath.startsWith("/keranjang/") ||
        normalizedPath === "/pesanan" ||
        normalizedPath === "/favorit" ||
        normalizedPath.startsWith("/favorit/"))
  );

  if (!isCustomerNavigationRoute) {
    return null;
  }

  const isHomeActive =
    normalizedPath === "/home" || normalizedPath.startsWith("/home/");
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
      icon: ShoppingCart,
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
  const currentIndex = optimisticIndex !== null ? optimisticIndex : activeIndex;

  return (
    <nav
      aria-label="Navigasi Utama Pelanggan"
      className="fixed left-1/2 -translate-x-1/2 z-40 bg-white/80 backdrop-blur-md border border-neutral-200/80 rounded-2xl p-1 floating-pill-shadow select-none print:hidden"
      style={{
        bottom:
          "max(var(--bottom-nav-bottom-offset, 2px), calc(env(safe-area-inset-bottom, 0px) + var(--bottom-nav-bottom-offset, 2px)))",
      }}
    >
      <div className="relative flex items-center w-[256px] h-[48px]">
        {/* Shared sliding active indicator with hardware-accelerated compositor transform */}
        <div
          aria-hidden="true"
          className={`absolute top-0 bottom-0 left-0 w-1/4 rounded-xl bg-gradient-to-r from-[#F25B09] to-[#FF8A45] shadow-xs shadow-orange-950/10 pointer-events-none overflow-hidden motion-reduce:transition-none ${
            mounted
              ? "transition-[transform,opacity] duration-400 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
              : "transition-none"
          } ${currentIndex !== -1 ? "opacity-100" : "opacity-0"}`}
          style={{
            transform: `translate3d(${Math.max(0, currentIndex) * 100}%, 0, 0)`,
            willChange: "transform",
          }}
        >
          {/* Subtle translucent white highlight near the top to create a refined dimensional appearance */}
          <div className="absolute inset-x-0 top-0 h-[38%] bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
        </div>

        {/* 4 Interactive Tab Links with vertical icon-over-label layout */}
        {navItems.map((item, index) => {
          const IconComponent = item.icon;
          const isSelected = currentIndex === index;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onClick={() => setOptimisticIndex(index)}
              aria-label={item.label}
              aria-current={isSelected ? "page" : undefined}
              title={item.label}
              className={`group relative z-10 w-1/4 h-full flex flex-col items-center justify-center py-1 rounded-xl transition-colors duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                isSelected
                  ? "text-white"
                  : "text-[#737373] hover:text-[#111111]"
              }`}
            >
              <div className="relative flex items-center justify-center w-[18px] h-[18px] flex-shrink-0">
                <IconComponent
                  className="w-[18px] h-[18px] transition-transform duration-200 motion-reduce:transition-none"
                  strokeWidth={isSelected ? 2.2 : 1.8}
                  aria-hidden="true"
                />
                {item.badgeCount !== undefined && item.badgeCount > 0 ? (
                  <span
                    className={`absolute -top-1.5 -right-2.5 ${
                      isSelected ? "bg-white text-[#F25B09]" : "bg-[#F25B09] text-white"
                    } text-[9px] font-bold h-3.5 min-w-[14px] px-1 rounded-full flex items-center justify-center z-20 pointer-events-none shadow-xs leading-none`}
                    aria-label={`${item.badgeCount} item di keranjang`}
                  >
                    {item.badgeCount > 99 ? "99+" : item.badgeCount}
                  </span>
                ) : null}
              </div>

              <span
                className={`text-[9px] leading-tight mt-0.5 whitespace-nowrap transition-colors duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                  isSelected
                    ? "font-semibold text-white"
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
