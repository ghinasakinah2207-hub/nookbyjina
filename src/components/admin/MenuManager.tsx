"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import {
  UtensilsCrossed,
  Search,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
  FolderTree,
  LayoutGrid,
} from "lucide-react";
import { Product, Category, Addon } from "@/types";
import { formatRupiah } from "@/data/dummy-data";
import { AddProductModal } from "./AddProductModal";
import { CategoryManagerModal } from "./CategoryManagerModal";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import {
  toggleProductAvailabilityAction,
  archiveProductAction,
} from "@/app/admin/menu/actions";

interface MenuManagerProps {
  initialProducts: Product[];
  initialCategories: Category[];
  availableAddons?: Addon[];
}

export function MenuManager({
  initialProducts,
  initialCategories,
  availableAddons = [],
}: MenuManagerProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Delete / Archive confirmation modal state
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (selectedCategory !== "all") {
      result = result.filter((p) => p.categoryId === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [products, selectedCategory, searchQuery]);

  const toggleAvailability = async (productId: string) => {
    if (togglingId) return;
    const currentProd = products.find((p) => p.id === productId || p.slug === productId);
    if (!currentProd) return;
    const prevVal = currentProd.isAvailable;
    const nextVal = !prevVal;

    setTogglingId(productId);
    // Optimistic UI update
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId || p.slug === productId) {
          return { ...p, isAvailable: nextVal };
        }
        return p;
      })
    );

    try {
      const res = await toggleProductAvailabilityAction(productId, nextVal);
      if (res && !res.success) {
        // Rollback
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id === productId || p.slug === productId) {
              return { ...p, isAvailable: prevVal };
            }
            return p;
          })
        );
        alert(res.error || "Gagal mengubah ketersediaan produk.");
      }
    } catch {
      // Rollback on network error
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id === productId || p.slug === productId) {
            return { ...p, isAvailable: prevVal };
          }
          return p;
        })
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteProduct) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await archiveProductAction(deleteProduct.id || deleteProduct.slug);
      if (!res.success) {
        throw new Error(res.error || "Gagal menghapus/mengarsipkan menu.");
      }

      // Remove from active local catalog state
      setProducts((prev) =>
        prev.filter((p) => p.id !== deleteProduct.id && p.slug !== deleteProduct.slug)
      );

      setDeleteProduct(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus menu.";
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* =========================================================================
          ACTION SECTION (SIMPLE, COMPACT & MINIMAL SPACING)
          ========================================================================= */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-[#737373] font-medium">
          Total {products.length} menu terdaftar • {categories.length} kategori
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCategoryModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E5E5E5] hover:bg-neutral-50 text-[#111111] text-xs font-semibold transition-colors cursor-pointer flex-shrink-0"
          >
            <FolderTree className="w-3.5 h-3.5 text-[#F25B09]" />
            <span>Kelola Kategori</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingProduct(null);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer flex-shrink-0 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Menu</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          SEARCH & CATEGORY FILTER
          ========================================================================= */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari menu berdasarkan nama atau deskripsi..."
            className="w-full pl-9 pr-3.5 py-2 bg-[#F6F6F7] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] placeholder:text-[#A3A3A3] focus:outline-hidden focus:border-[#111111] transition-colors"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === "all"
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 text-[#737373] hover:text-[#111111]"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Semua Menu ({products.length})</span>
          </button>

          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === cat.id
                  ? "bg-[#111111] text-white"
                  : "bg-neutral-100 text-[#737373] hover:text-[#111111]"
              }`}
            >
              <CategoryIcon icon={cat.icon} fallbackSlug={cat.slug} className="w-3.5 h-3.5" />
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* =========================================================================
          PRODUCTS LIST (RESPONSIVE CARDS WITH EDIT & DELETE ACTIONS)
          ========================================================================= */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-[#737373] flex items-center justify-center mx-auto">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#111111]">Menu tidak ditemukan</h3>
            <p className="text-xs text-[#737373] mt-0.5">
              Tidak ada produk yang sesuai dengan pencarian Anda.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
          {filteredProducts.map((product) => {
            const isAvailable = product.isAvailable;
            const primaryImage = product.images?.[0] || "/images/hero-food.webp";

            return (
              <div
                key={product.id}
                className="bg-white border border-[#E5E5E5] rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-neutral-300 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-xl bg-neutral-100 relative overflow-hidden flex-shrink-0 border border-neutral-200/60">
                    <Image
                      src={primaryImage}
                      alt={product.name}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#111111] leading-snug line-clamp-1">
                        {product.name}
                      </span>
                      {product.isHighlight && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-md bg-orange-100 text-[#F25B09]">
                          Favorit
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-[#737373] line-clamp-2 leading-relaxed">
                      {product.description || "Tidak ada deskripsi"}
                    </p>

                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-xs font-extrabold text-[#111111]">
                        {formatRupiah(product.basePrice)}
                      </span>
                      <span className="text-[10px] text-[#737373] bg-neutral-100 px-1.5 py-0.5 rounded">
                        {product.categoryName || "Umum"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Controls: Availability Badge + Tandai Habis + Edit + Hapus */}
                <div className="flex items-center justify-between pt-2.5 border-t border-neutral-100 text-xs gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isAvailable
                          ? "bg-emerald-50 text-[#18794E] border border-emerald-200"
                          : "bg-red-50 text-[#B42318] border border-red-200"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isAvailable ? "bg-[#18794E]" : "bg-[#B42318]"
                        }`}
                      />
                      {isAvailable ? "Tersedia" : "Habis"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                    {/* Availability toggle */}
                    <button
                      type="button"
                      disabled={Boolean(togglingId)}
                      onClick={() => toggleAvailability(product.id)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                        isAvailable
                          ? "border border-neutral-200 text-[#737373] hover:text-[#B42318] hover:border-red-200 hover:bg-red-50"
                          : "bg-[#18794E] text-white hover:bg-emerald-700"
                      }`}
                    >
                      {togglingId === product.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <span>{isAvailable ? "Tandai Habis" : "Tandai Tersedia"}</span>
                      )}
                    </button>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(product);
                        setShowAddModal(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold border border-neutral-200 text-[#111111] hover:bg-neutral-100 hover:border-neutral-300 transition-colors cursor-pointer"
                      title="Edit menu"
                      aria-label={`Edit ${product.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5 text-[#737373]" />
                      <span>Edit</span>
                    </button>

                    {/* Hapus button */}
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteProduct(product);
                        setDeleteError(null);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-semibold border border-neutral-200 text-[#737373] hover:text-[#B42318] hover:border-red-200 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Hapus / Arsipkan menu"
                      aria-label={`Hapus ${product.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Hapus</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Real Functional Add & Edit Product Modal */}
      <AddProductModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingProduct(null);
        }}
        categories={categories}
        availableAddons={availableAddons}
        initialProduct={editingProduct}
        onProductCreated={(newProduct) => {
          setProducts((prev) => [newProduct, ...prev]);
        }}
        onProductUpdated={(updatedProduct) => {
          setProducts((prev) =>
            prev.map((p) =>
              p.id === updatedProduct.id || p.slug === updatedProduct.slug
                ? updatedProduct
                : p
            )
          );
        }}
      />

      {/* Category Manager Modal */}
      <CategoryManagerModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        categories={categories}
        onCategoriesUpdated={(updatedCats) => {
          setCategories(updatedCats);
        }}
      />

      {/* Delete / Archive Confirmation Dialog */}
      {deleteProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto animate-landing-fade">
          <div className="bg-white border border-[#E5E5E5] rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-[#B42318] flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-[#111111]">
                  Hapus Menu dari Katalog?
                </h3>
                <p className="text-xs text-[#737373] leading-relaxed">
                  Apakah Anda yakin ingin menghapus <strong className="text-[#111111]">{deleteProduct.name}</strong>?
                </p>
                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 mt-2 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Perlindungan Data Transaksi</span>
                  </div>
                  <p className="leading-relaxed">
                    Menu ini akan diarsipkan dari katalog aktif sehingga tidak lagi tampil di etalase toko. Riwayat transaksi dan pesanan terdahulu pelanggan tetap tersimpan aman.
                  </p>
                </div>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#B42318]">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  setDeleteProduct(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#737373] hover:text-[#111111] hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-[#B42318] hover:bg-red-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Menu</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
