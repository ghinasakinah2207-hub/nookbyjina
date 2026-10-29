import React from "react";

interface SkeletonProps {
  showHeader?: boolean;
}

/**
 * Loading skeleton for Customer Home page (/home)
 * Mirrors the exact layout of ShoppingHomeClient:
 * Header -> PromoCarousel -> SearchBar -> Categories -> Product Grid Sections
 */
export function HomeSkeleton({ showHeader = true }: SkeletonProps) {
  return (
    <div className="min-h-screen bg-[#F6F6F7] pb-24 animate-landing-fade">
      {showHeader && (
        <header className="sticky top-0 z-30 bg-white border-b border-[#E5E5E5] px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="w-32 h-6 bg-neutral-200 rounded-lg animate-pulse motion-reduce:animate-none" />
            <div className="w-20 h-6 bg-neutral-100 rounded-full animate-pulse motion-reduce:animate-none" />
          </div>
        </header>
      )}

      <main className="max-w-md mx-auto px-3.5 pt-1.5 space-y-3.5">
        {/* 1. Promotional Banner Carousel Placeholder */}
        <div className="w-full aspect-[2.35/1] rounded-2xl bg-neutral-200 animate-pulse motion-reduce:animate-none border border-[#E5E5E5]/60 overflow-hidden" />

        {/* 2. SearchBar Placeholder */}
        <div className="w-full h-11 bg-white border border-[#E5E5E5] rounded-2xl px-4 flex items-center gap-2.5">
          <div className="w-4 h-4 rounded-full bg-neutral-200 animate-pulse motion-reduce:animate-none flex-shrink-0" />
          <div className="w-44 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
        </div>

        {/* 3. Category Filter Chips Placeholder */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <div className="w-28 h-3.5 bg-neutral-200 rounded animate-pulse motion-reduce:animate-none" />
            <div className="w-14 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-hidden py-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-24 h-[40px] rounded-xl bg-white border border-[#E5E5E5] flex items-center gap-2 px-3"
              >
                <div className="w-3.5 h-3.5 rounded-full bg-neutral-200 animate-pulse motion-reduce:animate-none flex-shrink-0" />
                <div className="w-10 h-2.5 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>

        {/* 4. Product Section Placeholder */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between px-0.5">
            <div className="w-32 h-4 bg-neutral-200 rounded animate-pulse motion-reduce:animate-none" />
            <div className="w-16 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex flex-col h-full bg-[#FFFFFF] rounded-2xl overflow-hidden"
              >
                <div className="w-full aspect-[4/3] bg-neutral-200 animate-pulse motion-reduce:animate-none" />
                <div className="p-2 sm:p-2.5 space-y-2">
                  <div className="w-4/5 h-3.5 bg-neutral-200 rounded animate-pulse motion-reduce:animate-none" />
                  <div className="w-1/2 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
                  <div className="w-2/3 h-2.5 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none mt-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Loading skeleton for Customer Menu page (/menu)
 * Mirrors the exact layout of MenuClient:
 * Header -> Sticky SearchBar -> Category Filter Chips -> Product Grid
 */
export function MenuSkeleton({ showHeader = true }: SkeletonProps) {
  return (
    <div className="min-h-screen pb-24 bg-[#F6F6F7] animate-landing-fade">
      {showHeader && (
        <header className="sticky top-0 z-30 bg-white border-b border-[#E5E5E5] px-4 py-3.5">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="w-28 h-6 bg-neutral-200 rounded-lg animate-pulse motion-reduce:animate-none" />
            <div className="w-8 h-8 rounded-full bg-neutral-100 animate-pulse motion-reduce:animate-none" />
          </div>
        </header>
      )}

      <main className="max-w-md mx-auto px-4 pt-3 space-y-3">
        {/* SearchBar Placeholder */}
        <div className="w-full h-11 bg-white border border-[#E5E5E5] rounded-2xl px-4 flex items-center gap-2.5">
          <div className="w-4 h-4 rounded-full bg-neutral-200 animate-pulse motion-reduce:animate-none flex-shrink-0" />
          <div className="w-48 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
        </div>

        {/* Category Filter Chips Placeholder */}
        <div className="flex items-center gap-1.5 overflow-x-hidden py-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 w-24 h-9 rounded-xl bg-white border border-[#E5E5E5] animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>

        {/* Product Grid Placeholder */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 pt-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex flex-col h-full bg-[#FFFFFF] rounded-2xl overflow-hidden"
            >
              <div className="w-full aspect-[4/3] bg-neutral-200 animate-pulse motion-reduce:animate-none" />
              <div className="p-2 sm:p-2.5 space-y-2">
                <div className="w-4/5 h-3.5 bg-neutral-200 rounded animate-pulse motion-reduce:animate-none" />
                <div className="w-1/2 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
                <div className="w-2/3 h-2.5 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none mt-1" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * Loading skeleton for Customer Cart page (/keranjang)
 * Mirrors the exact layout of CartClient:
 * Header -> Cart Item Cards -> Order Note -> Sticky Checkout Summary Bar
 */
export function CartSkeleton({ showHeader = true }: SkeletonProps) {
  const content = (
    <div className="space-y-2.5">
      {/* Cart Item Cards Placeholder */}
      {[1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-3.5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-16 h-16 rounded-xl bg-neutral-200 animate-pulse motion-reduce:animate-none flex-shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="w-36 h-4 bg-neutral-200 rounded animate-pulse motion-reduce:animate-none" />
              <div className="w-20 h-3.5 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
              <div className="w-24 h-7 rounded-lg bg-neutral-100 animate-pulse motion-reduce:animate-none mt-1" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  if (!showHeader) {
    return content;
  }

  return (
    <div className="min-h-screen pb-40 bg-[#F6F6F7] animate-landing-fade">
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E5E5] px-4 py-3.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="w-32 h-6 bg-neutral-200 rounded-lg animate-pulse motion-reduce:animate-none" />
          <div className="w-20 h-5 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4">
        {content}
      </main>

      {/* Sticky Bottom Bar Placeholder — Positioned exactly as the real checkout bar */}
      <div
        className="fixed left-0 right-0 z-30 bg-white border-t border-[#E5E5E5] shadow-[0_-4px_16px_rgba(0,0,0,0.04)]"
        style={{
          bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="w-20 h-2.5 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none mb-1.5" />
            <div className="w-28 h-5 bg-neutral-200 rounded-md animate-pulse motion-reduce:animate-none" />
          </div>

          <div className="w-36 h-12 bg-neutral-200 rounded-xl animate-pulse motion-reduce:animate-none flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for Customer Order History page (/pesanan)
 * Mirrors the exact layout of OrderHistoryPage:
 * Header -> Order List Cards (ID, Status Badges, Items Summary, Total, Action Button)
 */
export function OrdersSkeleton({ showHeader = true }: SkeletonProps) {
  const content = (
    <div className="space-y-2.5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-4 space-y-3">
          {/* Header: Order ID & Status */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="w-28 h-4 bg-neutral-200 rounded animate-pulse motion-reduce:animate-none" />
              <div className="w-32 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
            </div>
            <div className="w-20 h-5 rounded-full bg-neutral-100 animate-pulse motion-reduce:animate-none" />
          </div>

          {/* Items summary */}
          <div className="pt-2 border-t border-[#E5E5E5]/60 space-y-1.5">
            <div className="w-3/4 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
            <div className="w-1/2 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
          </div>

          {/* Total & Action */}
          <div className="pt-2 border-t border-[#E5E5E5] flex items-center justify-between">
            <div>
              <div className="w-16 h-2.5 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none mb-1" />
              <div className="w-24 h-4 bg-neutral-200 rounded animate-pulse motion-reduce:animate-none" />
            </div>

            <div className="w-16 h-7 rounded-lg bg-neutral-100 animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );

  if (!showHeader) {
    return content;
  }

  return (
    <div className="min-h-screen pb-24 bg-[#F6F6F7] animate-landing-fade">
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E5E5] px-4 py-3.5">
        <div className="max-w-md mx-auto space-y-1">
          <div className="w-36 h-5 bg-neutral-200 rounded animate-pulse motion-reduce:animate-none" />
          <div className="w-48 h-3 bg-neutral-100 rounded animate-pulse motion-reduce:animate-none" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4">
        {content}
      </main>
    </div>
  );
}
