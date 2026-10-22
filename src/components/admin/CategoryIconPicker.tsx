"use client";

import React, { useState, useMemo } from "react";
import {
  SUPPORTED_CATEGORY_ICONS,
  ICON_GROUPS,
  IconGroupKey,
  CategoryIconDefinition,
  FALLBACK_CATEGORY_ICON,
} from "@/lib/category-icons";
import { Search, X, Check } from "lucide-react";

export interface CategoryIconPickerProps {
  selectedIcon: string | null;
  onSelectIcon: (iconId: string) => void;
  categoryNamePreview?: string;
  className?: string;
}

export function CategoryIconPicker({
  selectedIcon,
  onSelectIcon,
  categoryNamePreview = "Kategori",
  className = "",
}: CategoryIconPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<IconGroupKey>("all");

  const effectiveSelectedId = (selectedIcon || "").trim().toLowerCase() || "utensils";

  // Filter icons based on search query and selected category tab
  const filteredIcons = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return SUPPORTED_CATEGORY_ICONS.filter((item) => {
      // 1. Group filter
      if (selectedGroup !== "all" && item.group !== selectedGroup) {
        return false;
      }

      // 2. Search query filter
      if (!q) return true;

      const matchesLabel = item.label.toLowerCase().includes(q);
      const matchesId = item.id.toLowerCase().includes(q);
      const matchesKeywords = item.keywords.some((k) => k.toLowerCase().includes(q));

      return matchesLabel || matchesId || matchesKeywords;
    });
  }, [searchQuery, selectedGroup]);

  // Selected icon definition
  const selectedDef = useMemo(() => {
    return (
      SUPPORTED_CATEGORY_ICONS.find((item) => item.id === effectiveSelectedId) || {
        id: "utensils",
        label: "Makanan Umum (Default)",
        group: "makanan" as const,
        groupLabel: "Makanan",
        keywords: [],
        icon: FALLBACK_CATEGORY_ICON,
      }
    );
  }, [effectiveSelectedId]);

  const SelectedIconComponent = selectedDef.icon;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 1. Live Preview of Selected Icon in Customer Button Context */}
      <div className="p-3 bg-[#F6F6F7] border border-[#E5E5E5] rounded-xl space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[#737373]">
          <span className="font-semibold text-[#111111]">Pratinjau Tombol Kategori</span>
          <span className="text-[10px]">
            Terpilih: <strong className="text-[#F25B09]">{selectedDef.label}</strong> ({selectedDef.id})
          </span>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          {/* Inactive State Preview */}
          <div className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 bg-white text-[#111111] border border-[#E5E5E5]">
            <SelectedIconComponent className="w-4 h-4 text-[#F25B09] shrink-0" strokeWidth={2} />
            <span className="truncate">{categoryNamePreview || "Kategori"}</span>
          </div>

          {/* Active State Preview */}
          <div className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 bg-[#F25B09] text-white border border-[#F25B09] shadow-xs">
            <SelectedIconComponent className="w-4 h-4 text-white shrink-0" strokeWidth={2} />
            <span className="truncate">{categoryNamePreview || "Kategori"}</span>
          </div>
        </div>
      </div>

      {/* 2. Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
          <Search className="w-3.5 h-3.5" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari ikon (cth: kopi, roti, nasi, mie, es, kue, burger)..."
          className="w-full pl-8 pr-8 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] placeholder:text-[#A3A3A3] focus:outline-hidden focus:border-[#F25B09] transition-colors"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#737373] hover:text-[#111111]"
            aria-label="Bersihkan pencarian"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* 3. Category Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[11px]">
        {ICON_GROUPS.map((grp) => {
          const isActive = selectedGroup === grp.key;
          return (
            <button
              key={grp.key}
              type="button"
              onClick={() => setSelectedGroup(grp.key)}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? "bg-[#111111] text-white"
                  : "bg-white text-[#737373] border border-[#E5E5E5] hover:text-[#111111]"
              }`}
            >
              {grp.label}
            </button>
          );
        })}
      </div>

      {/* 4. Icon Grid */}
      <div className="border border-[#E5E5E5] rounded-xl p-2 bg-white max-h-[220px] overflow-y-auto">
        {filteredIcons.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#737373]">
            Tidak ada ikon yang cocok dengan kata kunci &quot;{searchQuery}&quot;.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {filteredIcons.map((item: CategoryIconDefinition) => {
              const isSelected = effectiveSelectedId === item.id;
              const IconComp = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectIcon(item.id)}
                  title={`${item.label} (${item.id})`}
                  className={`relative p-2 rounded-xl text-left border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? "border-[#F25B09] bg-orange-50/60 ring-1 ring-[#F25B09] text-[#111111]"
                      : "border-[#E5E5E5] bg-white hover:border-neutral-300 hover:bg-neutral-50 text-[#737373] hover:text-[#111111]"
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-[#F25B09] text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-[#F25B09] text-white"
                        : "bg-neutral-100 text-[#111111]"
                    }`}
                  >
                    <IconComp className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <span className="text-[10px] font-medium text-center line-clamp-1 w-full px-0.5">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
