"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, UtensilsCrossed, AlertCircle, RefreshCw } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { ProductCard } from "@/components/product/ProductCard";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { SearchBar } from "@/components/ui/SearchBar";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { BANNERS, CATEGORIES, PRODUCTS } from "@/data/dummy-data";
import { Product, Category, HomepageSectionWithProducts, StoreSettings, Banner } from "@/types";

interface HorizontalScrollSectionProps {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  products: Product[];
}

function HorizontalScrollSection({
  title,
  viewAllHref = "/menu",
  products,
}: HorizontalScrollSectionProps) {
  if (products.length === 0) return null;

  return (
    <section className="space-y-2 pt-1">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-bold text-[#111111] leading-tight">
          {title}
        </h2>

        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="text-xs font-semibold text-[#F25B09] hover:underline flex items-center gap-0.5 flex-shrink-0"
          >
            Semua <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : null}
      </div>

      {/* Horizontally scrollable row starting at exact left content edge */}
      <div className="flex gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory py-1">
        {products.map((product) => (
          <div
            key={product.id}
            className="w-[145px] sm:w-[155px] flex-shrink-0 snap-start"
          >
            <ProductCard
              product={product}
              priority={false}
              preload={false}
            />
          </div>
        ))}
        <div className="w-1 flex-shrink-0" aria-hidden="true" />
      </div>
    </section>
  );
}

interface ShoppingHomeClientProps {
  storeSettings?: StoreSettings;
  initialBanners?: Banner[];
  initialSections?: HomepageSectionWithProducts[];
  initialCategories?: Category[];
  initialProducts?: Product[];
}

export default function ShoppingHomeClient({
  storeSettings,
  initialBanners,
  initialSections,
  initialCategories,
  initialProducts,
}: ShoppingHomeClientProps) {
  const [clientBanners, setClientBanners] = useState<Banner[] | null>(null);
  const banners =
    clientBanners ??
    (initialBanners && initialBanners.length > 0 ? initialBanners : BANNERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const hasInitialSections = Boolean(initialSections && initialSections.length > 0);

  // Dynamic homepage state initialized with server data to eliminate skeleton flash
  const [sections, setSections] = useState<HomepageSectionWithProducts[]>(
    initialSections ?? []
  );
  const [categories, setCategories] = useState<Category[]>(
    initialCategories && initialCategories.length > 0 ? initialCategories : CATEGORIES
  );
  const [allProducts, setAllProducts] = useState<Product[]>(() => {
    if (initialProducts && initialProducts.length > 0) return initialProducts;
    if (initialSections && initialSections.length > 0) {
      const productMap = new Map<string, Product>();
      initialSections.forEach((sec) => {
        (sec.products || []).forEach((prod) => productMap.set(prod.id, prod));
      });
      if (productMap.size > 0) return Array.from(productMap.values());
    }
    return PRODUCTS;
  });
  const [loading, setLoading] = useState(!hasInitialSections);
  const [error, setError] = useState<string | null>(null);

  const reloadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/homepage-sections");
      if (!res.ok) {
        throw new Error("Gagal mengambil konfigurasi seksi beranda.");
      }
      const data = await res.json();
      if (data.success) {
        setSections(data.sections || []);
        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories);
        }
        if (data.banners && data.banners.length > 0) {
          setClientBanners(data.banners);
        }

        if (data.products && Array.isArray(data.products) && data.products.length > 0) {
          setAllProducts(data.products);
        } else {
          const productMap = new Map<string, Product>();
          (data.sections || []).forEach((sec: HomepageSectionWithProducts) => {
            (sec.products || []).forEach((prod: Product) => {
              productMap.set(prod.id, prod);
            });
          });
          if (productMap.size > 0) {
            setAllProducts(Array.from(productMap.values()));
          }
        }
      } else {
        throw new Error(data.error || "Gagal memuat seksi.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Terjadi kesalahan saat memuat beranda.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If sections were pre-populated on the server, skip initial client fetch
    if (hasInitialSections) {
      return;
    }

    let isMounted = true;
    async function loadData() {
      try {
        const res = await fetch("/api/homepage-sections");
        if (!res.ok) {
          throw new Error("Gagal mengambil konfigurasi seksi beranda.");
        }
        const data = await res.json();
        if (isMounted && data.success) {
          setSections(data.sections || []);
          if (data.categories && data.categories.length > 0) {
            setCategories(data.categories);
          }
          if (data.banners && data.banners.length > 0) {
            setClientBanners(data.banners);
          }

          if (data.products && Array.isArray(data.products) && data.products.length > 0) {
            setAllProducts(data.products);
          } else {
            const productMap = new Map<string, Product>();
            (data.sections || []).forEach((sec: HomepageSectionWithProducts) => {
              (sec.products || []).forEach((prod: Product) => {
                productMap.set(prod.id, prod);
              });
            });
            if (productMap.size > 0) {
              setAllProducts(Array.from(productMap.values()));
            }
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const message =
            err instanceof Error ? err.message : "Terjadi kesalahan saat memuat beranda.";
          setError(message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [hasInitialSections]);

  // Filter products when customer types in search query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return allProducts.filter((p) => {
      const matchName = p.name.toLowerCase().includes(query);
      const matchCat = (p.categoryName || "").toLowerCase().includes(query);
      const matchDesc = (p.description || "").toLowerCase().includes(query);
      return matchName || matchCat || matchDesc;
    });
  }, [searchQuery, allProducts]);

  // Filter products if a category pill is actively filtered
  const categoryFilteredProducts = useMemo(() => {
    if (selectedCategory === "all") return [];
    return allProducts.filter((p) => {
      const catSlug = (p as Product & { categorySlug?: string }).categorySlug;
      return (
        p.categoryId === selectedCategory ||
        catSlug === selectedCategory ||
        Boolean(
          p.categories &&
            p.categories.some(
              (c) => c.id === selectedCategory || c.slug === selectedCategory
            )
        )
      );
    });
  }, [selectedCategory, allProducts]);

  return (
    <div className="min-h-screen pb-24 bg-[#F6F6F7]">
      {/* 1. Header / Brand with Top-Right Favorites Action */}
      <Header storeSettings={storeSettings} />

      <main className="max-w-md mx-auto px-3.5 pt-1.5 space-y-3.5">
        {/* 2. Functional Search Bar directly below header */}
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Mau order apa, bestie..."
        />

        {/* 3. Promotional Banner Carousel (hidden during active search) */}
        {!searchQuery && <PromoCarousel banners={banners} />}

        {/* 4. Category Shortcuts */}
        <section aria-label="Kategori Menu" className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-xs font-bold text-[#111111] uppercase tracking-wider">
              Kategori
            </h2>
            {selectedCategory !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className="text-[11px] font-medium text-[#F25B09] hover:underline"
              >
                Lihat Semua
              </button>
            )}
          </div>

          <div
            className={`gap-1.5 ${
              categories.length <= 3
                ? "grid grid-cols-3"
                : "flex items-center overflow-x-auto no-scrollbar pb-0.5"
            }`}
          >
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    setSelectedCategory(isActive ? "all" : cat.id)
                  }
                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all border flex-shrink-0 cursor-pointer ${
                    categories.length > 3 ? "min-w-[105px]" : "w-full"
                  } ${
                    isActive
                      ? "bg-[#F25B09] text-white border-[#F25B09] shadow-xs"
                      : "bg-white text-[#111111] border-[#E5E5E5] hover:border-neutral-300 hover:bg-neutral-50/50"
                  }`}
                >
                  <CategoryIcon
                    icon={cat.icon}
                    fallbackSlug={cat.slug}
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? "text-white" : "text-[#F25B09]"
                    }`}
                    strokeWidth={2}
                  />
                  <span className="truncate">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. Product Section(s) */}
        {searchQuery.trim() ? (
          /* Active Search Results */
          <section className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-0.5">
              <div>
                <h2 className="text-sm font-bold text-[#111111]">
                  Hasil Pencarian ({searchResults.length})
                </h2>
                <p className="text-[11px] text-[#737373]">
                  Kata kunci: &quot;{searchQuery}&quot;
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-xs font-medium text-[#F25B09] hover:underline"
              >
                Reset
              </button>
            </div>

            {searchResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                {searchResults.map((product, idx) => (
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
              <div className="p-8 text-center bg-white border border-[#E5E5E5] rounded-2xl space-y-3 my-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-[#737373]">
                  <UtensilsCrossed className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#111111]">
                    Menu tidak ditemukan
                  </h3>
                  <p className="text-xs text-[#737373] mt-1">
                    Tidak ada hidangan yang cocok dengan &quot;{searchQuery}&quot;.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="inline-flex items-center justify-center px-4 py-2 bg-[#111111] text-white text-xs font-semibold rounded-xl min-h-[40px]"
                >
                  Reset Pencarian
                </button>
              </div>
            )}
          </section>
        ) : selectedCategory !== "all" ? (
          /* Single Selected Category View */
          <section className="space-y-2 pt-1">
            <HorizontalScrollSection
              title={`Menu ${categories.find((c) => c.id === selectedCategory)?.name || "Pilihan"}`}
              viewAllHref="/menu"
              products={categoryFilteredProducts}
            />
          </section>
        ) : error ? (
          /* Error Fallback State */
          <div className="p-6 text-center bg-white border border-[#E5E5E5] rounded-2xl space-y-3 my-4">
            <div className="w-10 h-10 mx-auto rounded-full bg-orange-50 flex items-center justify-center text-[#F25B09]">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#111111]">
                Gagal Memuat Seksi Beranda
              </h3>
              <p className="text-xs text-[#737373] mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={reloadData}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#111111] text-white text-xs font-semibold rounded-xl"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Muat Ulang</span>
            </button>
          </div>
        ) : loading ? (
          /* Loading Skeleton Rows */
          <div className="space-y-5 pt-1">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <div className="w-32 h-4 bg-neutral-200 rounded animate-pulse" />
                  <div className="w-12 h-3 bg-neutral-200 rounded animate-pulse" />
                </div>
                <div className="flex gap-2 sm:gap-2.5 overflow-x-hidden">
                  {[1, 2, 3].map((cardIdx) => (
                    <div
                      key={cardIdx}
                      className="w-[145px] sm:w-[155px] h-48 bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden flex-shrink-0"
                    >
                      <div className="w-full aspect-[4/3] bg-neutral-200 animate-pulse" />
                      <div className="p-2 space-y-2">
                        <div className="w-3/4 h-3 bg-neutral-200 rounded animate-pulse" />
                        <div className="w-1/2 h-3 bg-neutral-200 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : sections.length > 0 ? (
          /* Configurable Homepage Sections */
          <div className="space-y-4">
            {sections.map((sec) => (
              <HorizontalScrollSection
                key={sec.id}
                title={sec.title}
                viewAllHref={sec.viewAllUrl || "/menu"}
                products={sec.products}
              />
            ))}
          </div>
        ) : (
          /* Empty State if Admin configured 0 sections */
          <div className="p-8 text-center bg-white border border-[#E5E5E5] rounded-2xl space-y-2 my-4">
            <div className="w-10 h-10 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-[#737373]">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#111111]">
              Belum Ada Seksi Menu
            </h3>
            <p className="text-xs text-[#737373]">
              Seksi hidangan beranda sedang disiapkan oleh pemilik toko.
            </p>
            <div className="pt-2">
              <Link
                href="/menu"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#111111] text-white text-xs font-semibold rounded-xl"
              >
                <span>Lihat Seluruh Menu</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* 6. Existing Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}
