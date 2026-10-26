import React from "react";

export default function ProductDetailLoading() {
  return (
    <div className="min-h-screen bg-[#F6F6F7] pb-28">
      <main className="max-w-md mx-auto px-3.5 pt-3 space-y-3">
        {/* Skeleton Hero Image */}
        <div className="relative aspect-[4/3] w-full bg-neutral-200 rounded-2xl overflow-hidden animate-pulse border border-[#E5E5E5]">
          <div className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full bg-white/70" />
          <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/70" />
        </div>

        {/* Skeleton Info */}
        <div className="px-0.5 pt-0.5 space-y-2">
          <div className="h-2.5 bg-neutral-200 rounded w-16 animate-pulse" />
          <div className="flex items-center justify-between gap-2">
            <div className="h-5 bg-neutral-200 rounded w-3/5 animate-pulse" />
            <div className="h-5 bg-neutral-200 rounded w-1/4 animate-pulse" />
          </div>
          <div className="h-3 bg-neutral-100 rounded w-1/2 animate-pulse mt-1" />
          <div className="space-y-1 pt-1">
            <div className="h-2.5 bg-neutral-200 rounded w-full animate-pulse" />
            <div className="h-2.5 bg-neutral-200 rounded w-4/5 animate-pulse" />
          </div>

          {/* Skeleton Badges */}
          <div className="flex items-center gap-3 pt-1 border-t border-[#E5E5E5] mt-2">
            <div className="h-3.5 w-16 bg-neutral-100 rounded animate-pulse" />
            <div className="h-3.5 w-28 bg-neutral-100 rounded animate-pulse" />
          </div>
        </div>

        {/* Skeleton Option Groups */}
        <div className="bg-white border border-[#E5E5E5] rounded-xl p-3 space-y-2.5">
          <div className="h-3 bg-neutral-200 rounded w-24 animate-pulse" />
          <div className="grid grid-cols-2 gap-1.5">
            <div className="h-10 bg-neutral-100 rounded-lg animate-pulse" />
            <div className="h-10 bg-neutral-100 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Skeleton Recommendations */}
        <div className="space-y-2 pt-2">
          <div className="h-3.5 w-36 bg-neutral-200 rounded animate-pulse px-0.5" />
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden p-2 space-y-2">
              <div className="aspect-[4/3] w-full bg-neutral-200 rounded-xl animate-pulse" />
              <div className="h-3 bg-neutral-200 rounded w-3/4 animate-pulse" />
              <div className="h-3 bg-neutral-100 rounded w-1/2 animate-pulse" />
            </div>
            <div className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden p-2 space-y-2">
              <div className="aspect-[4/3] w-full bg-neutral-200 rounded-xl animate-pulse" />
              <div className="h-3 bg-neutral-200 rounded w-3/4 animate-pulse" />
              <div className="h-3 bg-neutral-100 rounded w-1/2 animate-pulse" />
            </div>
          </div>
        </div>
      </main>

      {/* Skeleton Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E5E5]">
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center justify-between gap-2.5">
          <div className="h-9 w-24 bg-neutral-100 rounded-xl animate-pulse" />
          <div className="h-11 flex-1 bg-neutral-200 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
