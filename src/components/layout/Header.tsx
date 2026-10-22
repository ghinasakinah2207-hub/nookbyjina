"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Heart, Menu } from "lucide-react";
import { BRAND } from "@/lib/branding";
import { StoreSettings } from "@/types";
import { ContactDrawer } from "./ContactDrawer";

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  backHref?: string;
  showFavorite?: boolean;
  showCart?: boolean;
  subtitle?: string;
  rightAction?: React.ReactNode;
  showHamburger?: boolean;
  storeSettings?: StoreSettings;
}

export function Header({
  title,
  showBack = false,
  backHref,
  showFavorite = true,
  showCart,
  subtitle,
  rightAction,
  showHamburger,
  storeSettings,
}: HeaderProps) {
  const router = useRouter();
  const [isContactOpen, setIsContactOpen] = useState(false);

  // If showCart is explicitly false, also treat showFavorite as false if not explicitly set
  const shouldShowFavorite = showFavorite && showCart !== false;

  // Auto-enable hamburger menu on pages without a back button and without title (e.g. main storefront)
  const isHamburgerVisible = showHamburger ?? (!showBack && !title);

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <>
      <header className="relative w-full bg-transparent select-none">
        <div className="relative max-w-md mx-auto px-3.5 h-14 flex items-center justify-between">
          {/* 1. Left Control (Hamburger Menu or Back Button) */}
          <div className="flex items-center min-w-[44px] z-10">
            {showBack ? (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Kembali"
                className="w-11 h-11 -ml-1 flex items-center justify-center rounded-xl text-[#111111] hover:bg-black/5 active:bg-black/10 min-h-[44px] min-w-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]"
              >
                <ChevronLeft className="w-6 h-6" strokeWidth={2} />
              </button>
            ) : isHamburgerVisible ? (
              <button
                type="button"
                onClick={() => setIsContactOpen(true)}
                aria-label="Buka menu kontak"
                aria-expanded={isContactOpen}
                aria-haspopup="dialog"
                aria-controls="contact-menu-popup"
                className="w-11 h-11 -ml-1 flex items-center justify-center rounded-xl text-[#111111] hover:bg-black/5 active:bg-black/10 min-h-[44px] min-w-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]"
              >
                <Menu className="w-5.5 h-5.5 text-[#111111]" strokeWidth={2} />
              </button>
            ) : (
              <div className="w-11" aria-hidden="true" />
            )}
          </div>

          {/* 2. Exactly Centered Independent Logo or Title */}
          {title ? (
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 max-w-[62%] text-center pointer-events-none z-0">
              <h1 className="text-base font-semibold text-[#111111] truncate pointer-events-auto">
                {title}
              </h1>
              {subtitle ? (
                <p className="text-xs text-[#737373] truncate pointer-events-auto">
                  {subtitle}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center z-0">
              <Link
                href="/home"
                aria-label="Beranda Nook by Jina"
                className="flex items-center justify-center p-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]"
              >
                <Image
                  src={BRAND.logos.dark}
                  alt="Nook by Jina"
                  width={49}
                  height={49}
                  priority
                  unoptimized
                  className="h-[49px] sm:h-[55px] w-auto object-contain transition-transform duration-200 active:scale-95"
                />
              </Link>
            </div>
          )}

          {/* 3. Right Control (Wishlist / Favorites or Custom Action) */}
          <div className="flex items-center justify-end min-w-[44px] z-10">
            {rightAction !== undefined ? (
              rightAction
            ) : shouldShowFavorite ? (
              <Link
                href="/favorit"
                aria-label="Buka Menu Favorit"
                className="w-11 h-11 -mr-1 flex items-center justify-center rounded-xl text-[#111111] hover:bg-black/5 active:bg-black/10 min-h-[44px] min-w-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]"
              >
                <Heart className="w-5 h-5 text-[#111111]" strokeWidth={1.8} />
              </Link>
            ) : (
              <div className="w-11" aria-hidden="true" />
            )}
          </div>
        </div>
      </header>

      {/* Contact & Social Media Drawer */}
      <ContactDrawer
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
        initialSettings={storeSettings}
      />
    </>
  );
}

