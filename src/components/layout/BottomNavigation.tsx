"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UtensilsCrossed, ShoppingBag, ReceiptText } from "lucide-react";
import { useCart } from "@/context/CartContext";

export function BottomNavigation() {
  const pathname = usePathname();
  const { itemCount, isHydrated } = useCart();

  // Hide bottom navigation on welcome page (/), checkout, payment, and success screens
  if (
    pathname === "/" ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/pembayaran") ||
    pathname.startsWith("/sukses")
  ) {
    return null;
  }

  const navItems = [
    {
      label: "Home",
      href: "/home",
      icon: Home,
      isActive: pathname === "/home",
    },
    {
      label: "Menu",
      href: "/menu",
      icon: UtensilsCrossed,
      isActive: pathname.startsWith("/menu") || pathname.startsWith("/produk"),
    },
    {
      label: "Keranjang",
      href: "/keranjang",
      icon: ShoppingBag,
      isActive: pathname.startsWith("/keranjang"),
      badgeCount: isHydrated ? itemCount : 0,
    },
    {
      label: "Pesanan",
      href: "/pesanan",
      icon: ReceiptText,
      isActive: pathname.startsWith("/pesanan"),
    },
  ];

  return (
    <nav
      aria-label="Navigasi Utama Pelanggan"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] border-t border-[#E5E5E5]"
    >
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const IconComponent = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[48px] transition-colors ${
                item.isActive
                  ? "text-[#F25B09] font-medium"
                  : "text-[#737373] hover:text-[#111111]"
              }`}
            >
              <div className="relative flex items-center justify-center w-6 h-6">
                <IconComponent
                  className="w-5 h-5 transition-transform"
                  strokeWidth={item.isActive ? 2.3 : 1.8}
                  aria-hidden="true"
                />
                {item.badgeCount !== undefined && item.badgeCount > 0 ? (
                  <span
                    className="absolute -top-1.5 -right-2 bg-[#F25B09] text-white text-[10px] font-semibold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border border-white"
                    aria-label={`${item.badgeCount} item di keranjang`}
                  >
                    {item.badgeCount > 99 ? "99+" : item.badgeCount}
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] mt-1 leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
