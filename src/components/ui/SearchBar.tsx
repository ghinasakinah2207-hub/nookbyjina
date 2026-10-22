"use client";

import React from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  onClear,
  placeholder = "Mau order apa, bestie...",
  className = "",
}: SearchBarProps) {
  const handleClear = () => {
    onChange("");
    if (onClear) onClear();
  };

  return (
    <div className={`relative w-full ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Pencarian menu makanan"
        className="w-full h-11 sm:h-12 pl-10 pr-10 bg-white border border-[#E5E5E5] rounded-2xl text-xs sm:text-sm text-[#111111] placeholder:text-[#737373] focus:outline-hidden focus:border-[#F25B09] transition-colors"
      />
      <Search
        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373] pointer-events-none"
        aria-hidden="true"
      />
      {value ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Hapus kata kunci pencarian"
          className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-[#737373] hover:text-[#111111] hover:bg-neutral-100 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}
