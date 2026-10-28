"use client";

import React, { useState, useMemo, useEffect } from "react";
import { UtensilsCrossed, AlertCircle } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { ProductCard } from "@/components/product/ProductCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { getActiveCategories, getVisibleProducts } from "@/lib/supabase/catalog";
import { Category, Product } from "@/types";

interface MenuClientProps {
  storeOpen?: boolean;
  initialCategories?: Category[];
  initialProducts?: Product[];
}

export default function MenuClient({
  storeOpen = true,
  initialCategories,
  initialProducts,
}: MenuClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const hasInitialProducts = Boolean(initialProducts && initialProducts.length > 0);

  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [loading, setLoading] = useState<boolean>(!hasInitialProducts);
  const [error, setError] = useState<string | null>(null);

  // Sync state if server props change without triggering cascading render effect
  const [prevInitialProducts, setPrevInitialProducts] = useState(initialProducts);
  if (initialProducts !== prevInitialProducts) {
    setPrevInitialProducts(initialProducts);
    setProducts(initialProducts ?? []);
  }

  const [prevInitialCategories, setPrevInitialCategories] = useState(initialCategories);
  if (initialCategories !== prevInitialCategories) {
    setPrevInitialCategories(initialCategories);
    setCategories(initialCategories ?? []);
  }

  useEffect(() => {
    // If categories and products were already pre-populated on the server, skip initial client fetch
    if (hasInitialProducts) {
      return;
    }

    let isMounted = true;

    async function initCatalog() {
      try {
        const [fetchedCategories, fetchedProducts] = await Promise.all([
          getActiveCategories(),
          getVisibleProducts(),
        ]);
        if (isMounted) {
          setCategories(fetchedCategories);
          setProducts(fetchedProducts);
          setError(null);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const message =
            err instanceof Error ? err.message : "Terjadi kesalahan saat memuat menu.";
          setError(message);
          setLoading(false);
        }
      }
    }

    initCatalog();

    return () => {
      isMounted = false;
    };
  }, [hasInitialProducts]);

  const handleRetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedCategories, fetchedProducts] = await Promise.all([
        getActiveCategories(),
        getVisibleProducts(),
      ]);
      setCategories(fetchedCategories);
      setProducts(fetchedProducts);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Terjadi kesalahan saat memuat menu.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const menuCategories = useMemo(
    () => [{ id: "all", name: "Semua Menu", slug: "all", icon: "layout-grid" }, ...categories],
    [categories]
  );

  // Filter products by category and active search query
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const productCategorySlug = (product as Product & { categorySlug?: string }).categorySlug;
      const matchesCategory =
        selectedCategory === "all" ||
        product.categoryId === selectedCategory ||
        productCategorySlug === selectedCategory ||
        Boolean(
          product.categories &&
            product.categories.some(
              (c) => c.id === selectedCategory || c.slug === selectedCategory
            )
        );

      const matchesSearch =
        !searchQuery.trim() ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen pb-24 bg-[#F6F6F7]">
      <Header title="Daftar Menu" subtitle="Pilihan hidangan homemade segar" />

      <main className="max-w-md mx-auto px-3.5 pt-2.5 space-y-3.5">
        {/* Store Closed Warning Banner */}
        {!storeOpen && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-[#B42318] animate-landing-fade">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">
              Toko sedang close order: Dapur kami sedang beristirahat. Pemesanan menu baru ditutup sementara.
            </span>
          </div>
        )}

        {/* Search Bar */}
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Mau order apa, bestie..."
        />

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
          {loading ? (
            [1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-24 h-9 rounded-xl bg-neutral-200 animate-pulse border border-transparent"
              />
            ))
          ) : (
            menuCategories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all min-h-[38px] border flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? "bg-[#F25B09] text-white border-[#F25B09] shadow-xs"
                      : "bg-white text-[#111111] border-[#E5E5E5] hover:border-neutral-300 hover:bg-neutral-50/50"
                  }`}
                >
                  <CategoryIcon
                    icon={cat.icon}
                    fallbackSlug={cat.slug}
                    className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                      isActive ? "text-white" : "text-[#F25B09]"
                    }`}
                    strokeWidth={2}
                  />
                  <span>{cat.name}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Search status notification if active query */}
        {!loading && searchQuery ? (
          <div className="flex items-center justify-between text-xs text-[#737373] px-1">
            <span>
              Hasil untuk &quot;<strong className="text-[#111111]">{searchQuery}</strong>&quot; ({filteredProducts.length} menu)
            </span>
            <button
              onClick={() => setSearchQuery("")}
              className="text-[#F25B09] font-medium hover:underline"
            >
              Reset pencarian
            </button>
          </div>
        ) : null}

        {/* Error State */}
        {error ? (
          <div className="p-8 text-center bg-white rounded-2xl space-y-3 my-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-orange-50 flex items-center justify-center text-[#F25B09]">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#111111]">
                Gagal Memuat Menu
              </h3>
              <p className="text-xs text-[#737373] mt-1">{error}</p>
            </div>
            <button
              onClick={handleRetry}
              className="inline-flex items-center justify-center px-4 py-2 bg-[#111111] text-white text-xs font-semibold rounded-xl min-h-[44px] hover:bg-neutral-800 transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex flex-col h-full bg-[#FFFFFF] rounded-2xl overflow-hidden"
              >
                <div className="w-full aspect-[4/3] bg-neutral-200 animate-pulse" />
                <div className="p-2 sm:p-2.5 flex flex-col justify-between flex-1 gap-2">
                  <div className="space-y-1.5">
                    <div className="h-3 bg-neutral-200 rounded w-4/5 animate-pulse" />
                    <div className="h-3.5 bg-neutral-200 rounded w-1/2 animate-pulse" />
                    <div className="h-2.5 bg-neutral-100 rounded w-3/4 animate-pulse mt-2" />
                  </div>
                  <div className="h-4 bg-neutral-200 rounded w-14 animate-pulse mt-1" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 pt-1">
            {filteredProducts.map((product, idx) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={idx === 0}
                preload={idx === 0}
                loading={idx <= 1 ? "eager" : "lazy"}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-white rounded-2xl space-y-3 my-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-[#737373]">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#111111]">
                Menu tidak ditemukan
              </h3>
              <p className="text-xs text-[#737373] mt-1">
                Tidak ada hidangan yang cocok dengan kata kunci &quot;{searchQuery}&quot;.
              </p>
            </div>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              className="inline-flex items-center justify-center px-4 py-2 bg-[#111111] text-white text-xs font-semibold rounded-xl min-h-[44px]"
            >
              Lihat Semua Menu
            </button>
          </div>
        )}
      </main>

      <BottomNavigation />
    </div>
  );
}
