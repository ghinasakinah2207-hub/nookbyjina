"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Moon } from "lucide-react";

interface LandingOrderCtaProps {
  isOpen: boolean;
}

export function LandingOrderCta({ isOpen }: LandingOrderCtaProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const isNavigatingRef = useRef(false);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Prefetch destination route for instant transition
    router.prefetch("/home");
  }, [router]);

  // Full reset function to restore button to active idle state
  const resetToIdle = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    isNavigatingRef.current = false;
    setIsNavigating(false);
  }, []);

  // Reset button state whenever mounted or active on welcome page
  useEffect(() => {
    if (pathname === "/") {
      const frameId = requestAnimationFrame(() => {
        resetToIdle();
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [pathname, resetToIdle]);

  // Handle browser Back / Forward (popstate) and bfcache restoration (pageshow)
  useEffect(() => {
    const handleRestore = () => {
      resetToIdle();
    };

    window.addEventListener("popstate", handleRestore);
    window.addEventListener("pageshow", handleRestore);

    return () => {
      window.removeEventListener("popstate", handleRestore);
      window.removeEventListener("pageshow", handleRestore);
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      isNavigatingRef.current = false;
    };
  }, [resetToIdle]);

  const handleOrderClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    // Synchronous guard against rapid double-clicks / repeated activations
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setIsNavigating(true);

    try {
      sessionStorage.setItem("temu_back_from_home", "true");
    } catch {}

    // Immediate navigation using Next.js router without artificial delay
    router.push("/home");

    // Safety timeout: unlock if navigation is somehow cancelled (e.g. offline or interrupted)
    safetyTimerRef.current = setTimeout(() => {
      resetToIdle();
    }, 2000);
  };

  if (!isOpen) {
    return (
      <Link
        href="/home"
        className="w-full max-w-[240px] sm:max-w-[260px] h-[48px] sm:h-[52px] px-6 bg-neutral-900/90 hover:bg-neutral-900 active:bg-neutral-950 text-white font-semibold text-xs tracking-wider rounded-full flex items-center justify-center gap-2 transition-all duration-150 border border-neutral-700/80 active:scale-[0.97] motion-reduce:transform-none select-none shadow-none cursor-pointer"
      >
        <Moon className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="tracking-wide">SEDANG CLOSE ORDER</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleOrderClick}
      disabled={isNavigating}
      aria-label="ORDER"
      className={`
        group relative w-[210px] sm:w-[230px] h-[55px] sm:h-[60px] px-6 sm:px-7
        bg-[#0d0d0d] hover:bg-[#181818] active:bg-black
        text-white font-bold text-xs sm:text-sm tracking-[0.22em] uppercase
        rounded-full flex items-center justify-between
        border border-white/10 hover:border-white/20
        transition-all duration-150 ease-out select-none cursor-pointer
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F25B09] focus-visible:ring-offset-2 focus-visible:ring-offset-black
        ${isNavigating ? "opacity-90 scale-[0.98] cursor-default pointer-events-none" : "active:scale-[0.97] animate-order-idle"}
      `}
    >
      {/* 1. ORDER Text Label */}
      <span className="font-bold text-xs sm:text-sm tracking-[0.22em] uppercase text-white transition-colors group-hover:text-white pl-1.5 sm:pl-2">
        ORDER
      </span>

      {/* 2. Vibrant Orange Accent Circle with Animated Forward Arrow */}
      <div
        className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full bg-[#F25B09] group-hover:bg-[#ff6817] flex items-center justify-center text-white transition-all duration-150 ease-out group-hover:scale-105 shrink-0"
        aria-hidden="true"
      >
        <svg
          className="w-4 h-4 text-white transition-transform duration-150 ease-out group-hover:translate-x-0.5 animate-order-nudge"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
          />
        </svg>
      </div>

      {/* 3. Subtle Hover Light-Sweep Shimmer across button surface on desktop */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-[-25deg] -translate-x-[150%] opacity-0 animate-order-light-sweep" />
      </div>
    </button>
  );
}
