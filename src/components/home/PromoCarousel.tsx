"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Banner } from "@/types";

interface PromoCarouselProps {
  banners: Banner[];
}

export function PromoCarousel({ banners }: PromoCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  const activeBanners = banners.filter((b) => b.isActive);
  const total = activeBanners.length;

  // Auto-advance slides every 5 seconds if not paused and > 1 banner
  useEffect(() => {
    if (total <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, 5000);

    return () => clearInterval(timer);
  }, [total, isPaused]);

  // If there are no active banners, render an intentional fallback banner photo or null
  if (total === 0) {
    return (
      <section
        aria-label="Banner Beranda"
        className="relative rounded-2xl overflow-hidden border border-[#E5E5E5] bg-neutral-100 select-none aspect-[21/9] w-full"
      >
        <Image
          src="/images/hero-food.webp"
          alt="Banner Nook by Jina"
          fill
          priority
          quality={85}
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 420px"
        />
      </section>
    );
  }

  // Ensure currentIndex stays within bounds if banners change dynamically
  const safeIndex = currentIndex >= total ? 0 : currentIndex;
  const currentBanner = activeBanners[safeIndex];
  const hasDestination = Boolean(
    currentBanner.targetUrl && currentBanner.targetUrl.trim()
  );

  const handlePrev = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % total);
  };

  // Touch swipe support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current !== null && touchEndXRef.current !== null) {
      const distance = touchStartXRef.current - touchEndXRef.current;
      if (distance > 40) {
        handleNext();
      } else if (distance < -40) {
        handlePrev();
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
    setIsPaused(false);
  };

  const imageElement = (
    <div className="relative aspect-[21/9] w-full bg-neutral-100 overflow-hidden">
      <Image
        src={currentBanner.imageUrl}
        alt="Banner Nook by Jina"
        fill
        priority={safeIndex === 0}
        quality={85}
        className="object-cover transition-opacity duration-500"
        sizes="(max-width: 640px) 100vw, 420px"
      />
    </div>
  );

  return (
    <section
      aria-label="Carousel Banner Beranda"
      className="relative group rounded-2xl overflow-hidden border border-[#E5E5E5] bg-white select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slide Item Container - Only wrap in Link if targetUrl is set */}
      {hasDestination ? (
        <Link href={currentBanner.targetUrl!} className="block relative w-full">
          {imageElement}
        </Link>
      ) : (
        imageElement
      )}

      {/* Desktop Previous / Next Navigation Controls */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Banner sebelumnya"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs hidden sm:flex cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Banner berikutnya"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs hidden sm:flex cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Minimal Slide Indicators - visible against both dark & light food photography */}
          <div className="absolute bottom-2.5 left-0 right-0 flex items-center justify-center gap-1.5 z-10 pointer-events-none">
            {activeBanners.map((banner, index) => (
              <span
                key={banner.id}
                className={`transition-all duration-300 ${
                  index === safeIndex
                    ? "w-4 h-1.5 bg-[#F25B09] rounded-full shadow-xs ring-1 ring-black/10"
                    : "w-1.5 h-1.5 bg-white/80 rounded-full shadow-xs ring-1 ring-black/20"
                }`}
                aria-current={index === safeIndex ? "true" : undefined}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
