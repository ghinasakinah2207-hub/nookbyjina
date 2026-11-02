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
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isSwipingHorizontalRef = useRef(false);
  const isDirectionLockedRef = useRef(false);
  const hasDraggedRef = useRef(false);

  const activeBanners = banners.filter((b) => b.isActive);
  const total = activeBanners.length;

  // Auto-advance slides every 5 seconds if not paused, not dragging, and > 1 banner
  useEffect(() => {
    if (total <= 1 || isPaused || isDragging) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, 5000);

    return () => clearInterval(timer);
  }, [total, isPaused, isDragging]);

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

  // Touch swipe support for mobile with directional locking
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isSwipingHorizontalRef.current = false;
    isDirectionLockedRef.current = false;
    hasDraggedRef.current = false;
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const dx = e.touches[0].clientX - touchStartXRef.current;
    const dy = e.touches[0].clientY - touchStartYRef.current;

    if (!isDirectionLockedRef.current) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        isDirectionLockedRef.current = true;
        if (Math.abs(dx) > Math.abs(dy)) {
          isSwipingHorizontalRef.current = true;
          setIsDragging(true);
        } else {
          isSwipingHorizontalRef.current = false;
        }
      }
    }

    if (isSwipingHorizontalRef.current) {
      if (Math.abs(dx) > 8) {
        hasDraggedRef.current = true;
      }
      let appliedDx = dx;
      if (
        (safeIndex === 0 && dx > 0) ||
        (safeIndex === total - 1 && dx < 0)
      ) {
        appliedDx = dx * 0.3;
      }
      setDragOffset(appliedDx);
    }
  };

  const handleTouchEnd = () => {
    if (isSwipingHorizontalRef.current && total > 1) {
      const threshold = 40;
      if (dragOffset < -threshold) {
        handleNext();
      } else if (dragOffset > threshold) {
        handlePrev();
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    isSwipingHorizontalRef.current = false;
    isDirectionLockedRef.current = false;
    setIsDragging(false);
    setDragOffset(0);
    setIsPaused(false);
    setTimeout(() => {
      hasDraggedRef.current = false;
    }, 50);
  };

  // Desktop mouse dragging support
  const handleMouseDown = (e: React.MouseEvent) => {
    if (total <= 1) return;
    setIsPaused(true);
    touchStartXRef.current = e.clientX;
    isSwipingHorizontalRef.current = true;
    setIsDragging(true);
    hasDraggedRef.current = false;
    setDragOffset(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (touchStartXRef.current === null || !isDragging) return;
    const dx = e.clientX - touchStartXRef.current;
    if (Math.abs(dx) > 8) {
      hasDraggedRef.current = true;
    }
    let appliedDx = dx;
    if (
      (safeIndex === 0 && dx > 0) ||
      (safeIndex === total - 1 && dx < 0)
    ) {
      appliedDx = dx * 0.3;
    }
    setDragOffset(appliedDx);
  };

  const handleMouseUp = () => {
    if (isDragging) {
      handleTouchEnd();
    }
  };

  return (
    <section
      aria-label="Carousel Banner Beranda"
      className="relative group rounded-2xl overflow-hidden border border-[#E5E5E5] bg-white select-none aspect-[21/9] w-full"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        setIsPaused(false);
        if (isDragging) handleTouchEnd();
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Horizontal Sliding Track containing all active banners */}
      <div
        className="flex w-full h-full will-change-transform"
        style={{
          transform: `translate3d(calc(-${safeIndex * 100}% + ${dragOffset}px), 0, 0)`,
          transition: isDragging
            ? "none"
            : "transform 500ms cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      >
        {activeBanners.map((banner, index) => {
          const isFirst = index === 0;
          // Preload adjacent slides: active, next, and prev
          const isAdjacent =
            index === safeIndex ||
            index === (safeIndex + 1) % total ||
            index === (safeIndex - 1 + total) % total;

          const slideContent = (
            <div className="relative aspect-[21/9] w-full bg-neutral-100 overflow-hidden">
              <Image
                src={banner.imageUrl}
                alt={`Banner Nook by Jina ${index + 1}`}
                fill
                priority={isFirst}
                loading={isFirst ? undefined : isAdjacent ? "eager" : "lazy"}
                quality={85}
                className="object-cover select-none pointer-events-none"
                sizes="(max-width: 640px) 100vw, 420px"
                draggable={false}
              />
            </div>
          );

          return (
            <div
              key={banner.id}
              className="relative w-full h-full shrink-0 flex-none select-none"
            >
              {banner.targetUrl && banner.targetUrl.trim() ? (
                <Link
                  href={banner.targetUrl}
                  onClick={(e) => {
                    if (hasDraggedRef.current) {
                      e.preventDefault();
                    }
                  }}
                  className="block relative w-full h-full"
                  tabIndex={index === safeIndex ? 0 : -1}
                >
                  {slideContent}
                </Link>
              ) : (
                slideContent
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Previous / Next Navigation Controls */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Banner sebelumnya"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs hidden sm:flex cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Banner berikutnya"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs hidden sm:flex cursor-pointer"
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
