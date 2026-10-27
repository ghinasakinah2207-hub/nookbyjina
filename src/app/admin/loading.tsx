import React from "react";

export default function AdminContentLoading() {
  return (
    <div className="space-y-6 animate-landing-fade">
      {/* 4 Stat Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-white border border-[#E5E5E5] space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="w-16 h-3 bg-neutral-100 rounded-md animate-pulse" />
              <div className="w-7 h-7 rounded-lg bg-neutral-100 animate-pulse" />
            </div>
            <div className="w-24 h-6 bg-neutral-200 rounded-lg animate-pulse" />
            <div className="w-32 h-2.5 bg-neutral-100 rounded-md animate-pulse" />
          </div>
        ))}
      </div>

      {/* Filter / Search Bar Skeleton */}
      <div className="p-3 rounded-2xl bg-white border border-[#E5E5E5] flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-64 h-9 bg-neutral-100 rounded-xl animate-pulse" />
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="w-24 h-9 bg-neutral-100 rounded-xl animate-pulse" />
          <div className="w-28 h-9 bg-neutral-100 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Content Area / List Skeleton */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="w-36 h-4 bg-neutral-200 rounded-md animate-pulse" />
          <div className="w-20 h-3 bg-neutral-100 rounded-md animate-pulse" />
        </div>

        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl border border-neutral-100 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 animate-pulse flex-shrink-0" />
                <div className="space-y-1.5 min-w-0">
                  <div
                    className="h-3.5 bg-neutral-200 rounded-md animate-pulse"
                    style={{ width: `${100 + (i % 4) * 35}px` }}
                  />
                  <div className="w-24 h-2.5 bg-neutral-100 rounded-md animate-pulse" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-6 bg-neutral-100 rounded-lg animate-pulse" />
                <div className="w-8 h-8 bg-neutral-100 rounded-lg animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
