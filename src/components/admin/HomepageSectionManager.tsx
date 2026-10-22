"use client";

import React, { useState, useMemo, useTransition } from "react";
import Image from "next/image";
import {
  Layers,
  Plus,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  ShoppingBag,
  Search,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { HomepageSection, Product, Category, Banner } from "@/types";
import { formatRupiah } from "@/data/dummy-data";
import {
  saveHomepageSectionAction,
  deleteHomepageSectionAction,
  toggleSectionStatusAction,
  reorderHomepageSectionsAction,
  updateSectionProductsAction,
} from "@/app/admin/beranda/actions";
import { BannerSliderManager } from "./BannerSliderManager";

interface HomepageSectionManagerProps {
  initialSections: HomepageSection[];
  catalogProducts: Product[];
  categories?: Category[];
  initialBanners?: Banner[];
}

export function HomepageSectionManager({
  initialSections,
  catalogProducts,
  categories = [],
  initialBanners = [],
}: HomepageSectionManagerProps) {
  const [sections, setSections] = useState<HomepageSection[]>(initialSections);
  const [isPending, startTransition] = useTransition();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal states
  const [editingSection, setEditingSection] = useState<HomepageSection | null>(
    null
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deletingSection, setDeletingSection] =
    useState<HomepageSection | null>(null);
  const [managingProductsSection, setManagingProductsSection] =
    useState<HomepageSection | null>(null);

  // Form states for Create/Edit Modal
  const [formTitle, setFormTitle] = useState("");
  const [formSubtitle, setFormSubtitle] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formMaxProducts, setFormMaxProducts] = useState<string>("");
  const [formViewAllUrl, setFormViewAllUrl] = useState("/menu");
  const [formError, setFormError] = useState<string | null>(null);

  // Product Assignment states
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>("all");
  const [assignedProductIds, setAssignedProductIds] = useState<string[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Quick lookup map of all catalog products (by id, dbId, slug)
  const productLookup = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of catalogProducts) {
      map.set(p.id, p);
      if (p.dbId) map.set(p.dbId, p);
      if (p.slug) map.set(p.slug, p);
    }
    return map;
  }, [catalogProducts]);

  // Available non-archived catalog products filtered by search & category
  const filteredCatalogProducts = useMemo(() => {
    return catalogProducts.filter((prod) => {
      if (prod.isArchived) return false;

      const matchesCat =
        selectedCategoryFilter === "all" ||
        prod.categoryId === selectedCategoryFilter;

      const q = productSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        prod.name.toLowerCase().includes(q) ||
        prod.description.toLowerCase().includes(q) ||
        prod.categoryName.toLowerCase().includes(q);

      return matchesCat && matchesSearch;
    });
  }, [catalogProducts, selectedCategoryFilter, productSearch]);

  // Statistics
  const totalSections = sections.length;
  const activeSections = sections.filter((s) => s.isActive).length;
  const inactiveSections = totalSections - activeSections;

  // Handlers for Section Reordering
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...sections];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;

    const orderedIds = next.map((s) => s.id);
    setSections(next);

    startTransition(async () => {
      const res = await reorderHomepageSectionsAction(orderedIds);
      if (res.success) {
        showToast("Urutan seksi berhasil diperbarui.");
      }
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= sections.length - 1) return;
    const next = [...sections];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;

    const orderedIds = next.map((s) => s.id);
    setSections(next);

    startTransition(async () => {
      const res = await reorderHomepageSectionsAction(orderedIds);
      if (res.success) {
        showToast("Urutan seksi berhasil diperbarui.");
      }
    });
  };

  // Handler for Toggle Visibility
  const handleToggleStatus = (sectionId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, isActive: nextStatus } : s))
    );

    startTransition(async () => {
      const res = await toggleSectionStatusAction(sectionId, nextStatus);
      if (res.success) {
        showToast(
          nextStatus
            ? "Seksi diaktifkan di beranda pelanggan."
            : "Seksi disembunyikan dari beranda pelanggan."
        );
      }
    });
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingSection(null);
    setFormTitle("");
    setFormSubtitle("");
    setFormIsActive(true);
    setFormMaxProducts("");
    setFormViewAllUrl("/menu");
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (sec: HomepageSection) => {
    setEditingSection(sec);
    setFormTitle(sec.title);
    setFormSubtitle(sec.subtitle || "");
    setFormIsActive(sec.isActive);
    setFormMaxProducts(sec.maxProducts ? String(sec.maxProducts) : "");
    setFormViewAllUrl(sec.viewAllUrl || "/menu");
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  // Submit Create/Edit Section
  const handleSaveSectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const title = formTitle.trim();
    if (!title || title.length < 2) {
      setFormError("Judul seksi wajib diisi (minimal 2 karakter).");
      return;
    }

    const maxProductsNum = formMaxProducts.trim()
      ? Number(formMaxProducts)
      : null;

    if (maxProductsNum !== null && (isNaN(maxProductsNum) || maxProductsNum < 1)) {
      setFormError("Batas jumlah produk harus berupa angka positif.");
      return;
    }

    const payload = {
      id: editingSection ? editingSection.id : undefined,
      title,
      subtitle: formSubtitle.trim() || null,
      isActive: formIsActive,
      maxProducts: maxProductsNum,
      viewAllUrl: formViewAllUrl.trim() || "/menu",
      productIds: editingSection ? editingSection.productIds : [],
    };

    startTransition(async () => {
      const res = await saveHomepageSectionAction(payload);
      if (res.success && res.section) {
        if (editingSection) {
          setSections((prev) =>
            prev.map((s) => (s.id === res.section!.id ? res.section! : s))
          );
          showToast(`Seksi "${res.section.title}" berhasil diperbarui.`);
        } else {
          setSections((prev) => [...prev, res.section!]);
          showToast(`Seksi baru "${res.section.title}" berhasil dibuat.`);
        }
        setIsCreateModalOpen(false);
      } else {
        setFormError(res.error || "Gagal menyimpan seksi.");
      }
    });
  };

  // Delete Section Confirmation
  const confirmDeleteSection = () => {
    if (!deletingSection) return;
    const secId = deletingSection.id;
    const title = deletingSection.title;

    setSections((prev) => prev.filter((s) => s.id !== secId));
    setDeletingSection(null);

    startTransition(async () => {
      const res = await deleteHomepageSectionAction(secId);
      if (res.success) {
        showToast(`Seksi "${title}" berhasil dihapus.`);
      }
    });
  };

  // Open Product Assignment Drawer
  const openProductManager = (sec: HomepageSection) => {
    setManagingProductsSection(sec);
    setAssignedProductIds([...sec.productIds]);
    setProductSearch("");
    setSelectedCategoryFilter("all");
  };

  // Add Product to Section (Prevent duplicates)
  const handleAddProductToSection = (productId: string) => {
    if (assignedProductIds.includes(productId)) return; // Prevent duplicate
    const next = [...assignedProductIds, productId];
    setAssignedProductIds(next);
  };

  // Remove Product from Section
  const handleRemoveProductFromSection = (productId: string) => {
    const next = assignedProductIds.filter((id) => id !== productId);
    setAssignedProductIds(next);
  };

  // Move Product Up in Section
  const handleMoveProductUp = (index: number) => {
    if (index <= 0) return;
    const next = [...assignedProductIds];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setAssignedProductIds(next);
  };

  // Move Product Down in Section
  const handleMoveProductDown = (index: number) => {
    if (index >= assignedProductIds.length - 1) return;
    const next = [...assignedProductIds];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setAssignedProductIds(next);
  };

  // Save Product Assignments
  const handleSaveProductAssignments = () => {
    if (!managingProductsSection) return;
    const secId = managingProductsSection.id;
    const updatedIds = [...assignedProductIds];

    setSections((prev) =>
      prev.map((s) => (s.id === secId ? { ...s, productIds: updatedIds } : s))
    );

    startTransition(async () => {
      const res = await updateSectionProductsAction(secId, updatedIds);
      if (res.success) {
        showToast(
          `Daftar produk untuk "${managingProductsSection.title}" berhasil disimpan (${updatedIds.length} produk).`
        );
      }
    });

    setManagingProductsSection(null);
  };

  return (
    <div className="space-y-3.5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#111111] text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs animate-landing-fade">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =========================================================================
          HOMEPAGE HERO BANNER SLIDER MANAGEMENT SECTION
          ========================================================================= */}
      <BannerSliderManager initialBanners={initialBanners} />

      {/* =========================================================================
          HOMEPAGE PRODUCT SECTIONS MANAGEMENT
          ========================================================================= */}
      <div className="pt-2 border-t border-[#E5E5E5]">
        <div className="flex items-center justify-between pb-1">
          <div>
            <h3 className="text-sm font-bold text-[#111111]">
              Seksi Produk Etalase Beranda
            </h3>
            <p className="text-[11px] text-[#737373]">
              Kelola daftar koleksi menu dan produk yang tampil di bawah banner slider
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Single Compact Statistics Card */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-3 sm:p-3.5 flex items-center justify-between divide-x divide-[#E5E5E5] flex-1">
          <div className="px-2.5 sm:px-4 text-center sm:text-left flex-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] text-[#737373] font-medium block truncate">
              Total Seksi
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-[#111111] mt-0.5 block">
              {totalSections}
            </span>
          </div>

          <div className="px-2.5 sm:px-4 text-center sm:text-left flex-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] text-[#737373] font-medium block truncate">
              Seksi Aktif (Tampil)
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-[#18794E] mt-0.5 block">
              {activeSections}
            </span>
          </div>

          <div className="px-2.5 sm:px-4 text-center sm:text-left flex-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] text-[#737373] font-medium block truncate">
              Seksi Disembunyikan
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-neutral-500 mt-0.5 block">
              {inactiveSections}
            </span>
          </div>
        </div>

        {/* Separate "Tambah Seksi Baru" Button */}
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-3.5 bg-[#111111] hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-none active:scale-[0.99] flex-shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Tambah Seksi Baru</span>
        </button>
      </div>

      {/* =========================================================================
          SECTION CARDS LIST
          ========================================================================= */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-sm font-bold text-[#111111]">
              Susunan Seksi Beranda Toko
            </h2>
            <p className="text-[11px] text-[#737373] mt-0.5">
              Urutan di bawah mencerminkan tampilan beranda pelanggan secara vertikal dari atas ke bawah.
            </p>
          </div>
          {isPending && (
            <span className="text-[11px] text-[#F25B09] font-medium animate-pulse">
              Menyimpan...
            </span>
          )}
        </div>

        {sections.length === 0 ? (
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-10 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-[#737373]">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#111111]">
                Belum Ada Seksi Beranda
              </h3>
              <p className="text-xs text-[#737373] mt-1 max-w-sm mx-auto">
                Buat seksi beranda pertama Anda untuk menampilkan produk unggulan atau kategori pilihan di halaman depan.
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#111111] text-white text-xs font-semibold rounded-xl hover:bg-neutral-800"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Seksi Sekarang</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sections.map((sec, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === sections.length - 1;
              const productCount = sec.productIds.length;

              // Sample resolved products for preview thumbnails
              const sampleProducts = sec.productIds
                .slice(0, 4)
                .map((id) => productLookup.get(id))
                .filter(Boolean) as Product[];

              return (
                <div
                  key={sec.id}
                  className={`bg-white border rounded-2xl p-4 sm:p-5 transition-all ${
                    sec.isActive
                      ? "border-[#E5E5E5] hover:border-neutral-300"
                      : "border-neutral-200 bg-neutral-50/60 opacity-80"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Left: Ordering controls & details */}
                    <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                      {/* Move Up / Move Down buttons */}
                      <div className="flex flex-col items-center justify-center gap-1 bg-neutral-100/80 p-1.5 rounded-xl flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(idx)}
                          disabled={isFirst}
                          title="Pindah ke Atas"
                          className="p-1 rounded-lg hover:bg-white text-[#737373] hover:text-[#111111] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <span className="text-[11px] font-extrabold text-[#111111] px-1">
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(idx)}
                          disabled={isLast}
                          title="Pindah ke Bawah"
                          className="p-1 rounded-lg hover:bg-white text-[#737373] hover:text-[#111111] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Section Info */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-[#111111]">
                            {sec.title}
                          </h3>

                          {sec.isActive ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-[#18794E] border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#18794E]" />
                              Aktif di Beranda
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-[#737373] border border-neutral-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                              Disembunyikan
                            </span>
                          )}

                          {sec.maxProducts ? (
                            <span className="text-[10px] text-[#737373] bg-neutral-100 px-2 py-0.5 rounded-full font-medium">
                              Maks. {sec.maxProducts} produk
                            </span>
                          ) : null}

                          {sec.viewAllUrl ? (
                            <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                              <ExternalLink className="w-2.5 h-2.5" />
                              {sec.viewAllUrl}
                            </span>
                          ) : null}
                        </div>

                        {sec.subtitle ? (
                          <p className="text-xs text-[#737373]">
                            {sec.subtitle}
                          </p>
                        ) : null}

                        {/* Sample Product Thumbnails preview */}
                        <div className="pt-2 flex items-center gap-2 flex-wrap">
                          <div className="flex -space-x-2 overflow-hidden">
                            {sampleProducts.map((p) => (
                              <div
                                key={p.id}
                                className="relative w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-neutral-200 flex-shrink-0"
                              >
                                <Image
                                  src={p.images?.[0] || "/images/hero-food.webp"}
                                  alt={p.name}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                  sizes="32px"
                                />
                              </div>
                            ))}
                          </div>
                          <span className="text-[11px] font-medium text-[#737373]">
                            {productCount} produk terpasang
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100 flex-wrap">
                      {/* Manage Products Button */}
                      <button
                        type="button"
                        onClick={() => openProductManager(sec)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F25B09] text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Kelola Produk ({productCount})</span>
                      </button>

                      {/* Quick Visibility Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(sec.id, sec.isActive)}
                        title={sec.isActive ? "Sembunyikan seksi" : "Tampilkan seksi"}
                        className={`p-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                          sec.isActive
                            ? "bg-white border-[#E5E5E5] text-[#737373] hover:text-[#111111]"
                            : "bg-emerald-50 border-emerald-200 text-[#18794E] hover:bg-emerald-100"
                        }`}
                      >
                        {sec.isActive ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>

                      {/* Edit Meta Button */}
                      <button
                        type="button"
                        onClick={() => openEditModal(sec)}
                        title="Edit judul & pengaturan seksi"
                        className="p-2 rounded-xl bg-neutral-100 text-[#111111] hover:bg-neutral-200 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => setDeletingSection(sec)}
                        title="Hapus seksi"
                        className="p-2 rounded-xl bg-red-50 text-[#B42318] hover:bg-red-100 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL: CREATE / EDIT SECTION
          ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-landing-fade">
          <div className="bg-white rounded-2xl border border-[#E5E5E5] w-full max-w-md p-5 sm:p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-50 text-[#F25B09] flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#111111]">
                  {editingSection ? "Edit Seksi Beranda" : "Tambah Seksi Beranda Baru"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-[#737373] hover:text-[#111111] hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#B42318] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSectionSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#111111] mb-1">
                  Judul Seksi <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Menu Pilihan Pelanggan, Spesial Hari Ini..."
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] transition-colors"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#111111] mb-1">
                  Subjudul (Opsional)
                </label>
                <input
                  type="text"
                  value={formSubtitle}
                  onChange={(e) => setFormSubtitle(e.target.value)}
                  placeholder="Contoh: Olahan homemade gurih & mengenyangkan"
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#111111] mb-1">
                    Batas Produk Tampil
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formMaxProducts}
                    onChange={(e) => setFormMaxProducts(e.target.value)}
                    placeholder="Contoh: 6 (Kosong = Semua)"
                    className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] transition-colors"
                  />
                  <span className="text-[10px] text-[#737373] mt-0.5 block">
                    Kosongkan untuk menampilkan semua
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-[#111111] mb-1">
                    Tautan &quot;Lihat Semua&quot;
                  </label>
                  <input
                    type="text"
                    value={formViewAllUrl}
                    onChange={(e) => setFormViewAllUrl(e.target.value)}
                    placeholder="/menu"
                    className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] transition-colors"
                  />
                  <span className="text-[10px] text-[#737373] mt-0.5 block">
                    Default: /menu
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-neutral-100">
                <div>
                  <span className="font-semibold text-[#111111] block">
                    Visibilitas di Beranda
                  </span>
                  <span className="text-[10px] text-[#737373]">
                    Jika nonaktif, seksi tidak akan muncul di beranda publik.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormIsActive(!formIsActive)}
                  className={`px-3 py-1.5 rounded-full font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    formIsActive
                      ? "bg-emerald-100 text-[#18794E] border border-emerald-300"
                      : "bg-neutral-100 text-[#737373] border border-neutral-300"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      formIsActive ? "bg-[#18794E]" : "bg-neutral-400"
                    }`}
                  />
                  <span>{formIsActive ? "Aktif" : "Nonaktif"}</span>
                </button>
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5E5E5] text-[#737373] hover:text-[#111111] font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {isPending ? "Menyimpan..." : "Simpan Seksi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: DELETE CONFIRMATION
          ========================================================================= */}
      {deletingSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-landing-fade">
          <div className="bg-white rounded-2xl border border-[#E5E5E5] w-full max-w-sm p-5 space-y-4 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-[#B42318] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-[#111111]">
                Hapus Seksi Homepage?
              </h3>
              <p className="text-xs text-[#737373]">
                Apakah Anda yakin ingin menghapus seksi &quot;
                <strong className="text-[#111111]">{deletingSection.title}</strong>
                &quot;? Seluruh susunan produk di seksi ini akan dicabut dari beranda.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDeletingSection(null)}
                className="py-2.5 px-3 rounded-xl border border-[#E5E5E5] text-[#737373] hover:text-[#111111] transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteSection}
                className="py-2.5 px-3 rounded-xl bg-[#B42318] hover:bg-red-700 text-white transition-colors"
              >
                Ya, Hapus Seksi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL / DRAWER: PRODUCT ASSIGNMENT & REORDERING
          ========================================================================= */}
      {managingProductsSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-xs animate-landing-fade">
          <div className="bg-white rounded-2xl border border-[#E5E5E5] w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#E5E5E5] flex items-center justify-between bg-white flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-[#F25B09]">
                    Atur Produk Seksi
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-[#111111]">
                    {managingProductsSection.title}
                  </h3>
                </div>
                <p className="text-[11px] text-[#737373] mt-0.5">
                  Pilih produk dari katalog, atur urutan tampilan, dan simpan perubahan untuk beranda.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setManagingProductsSection(null)}
                className="p-1.5 rounded-xl text-[#737373] hover:text-[#111111] hover:bg-neutral-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Split 2 columns on desktop */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-5 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
              {/* Left Column: Assigned Products (Ordered) */}
              <div className="space-y-3 md:pr-4 flex flex-col">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#111111] uppercase tracking-wider flex items-center gap-1.5">
                    <span>Produk Terpilih</span>
                    <span className="text-xs font-extrabold px-2 py-0.5 bg-[#111111] text-white rounded-full">
                      {assignedProductIds.length}
                    </span>
                  </h4>
                  <span className="text-[11px] text-[#737373]">
                    Gunakan panah untuk urutan
                  </span>
                </div>

                {assignedProductIds.length === 0 ? (
                  <div className="p-8 text-center bg-[#F6F6F7] border border-dashed border-[#E5E5E5] rounded-2xl space-y-2 my-auto">
                    <ShoppingBag className="w-8 h-8 text-[#737373] mx-auto opacity-60" />
                    <p className="text-xs font-semibold text-[#111111]">
                      Belum Ada Produk di Seksi Ini
                    </p>
                    <p className="text-[11px] text-[#737373]">
                      Pilih hidangan dari daftar katalog di sebelah kanan untuk menambahkan produk ke seksi ini.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[420px] pr-1">
                    {assignedProductIds.map((pId, idx) => {
                      const prod = productLookup.get(pId);
                      const isFirst = idx === 0;
                      const isLast = idx === assignedProductIds.length - 1;

                      if (!prod) return null;

                      return (
                        <div
                          key={pId}
                          className="bg-white border border-[#E5E5E5] rounded-xl p-2.5 flex items-center justify-between gap-2.5 hover:border-neutral-300 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Position indicator */}
                            <span className="w-5 text-center text-xs font-extrabold text-[#737373] flex-shrink-0">
                              {idx + 1}
                            </span>

                            {/* Thumbnail */}
                            <div className="w-11 h-11 rounded-lg bg-neutral-100 relative overflow-hidden flex-shrink-0 border border-neutral-200">
                              <Image
                                src={prod.images?.[0] || "/images/hero-food.webp"}
                                alt={prod.name}
                                fill
                                unoptimized
                                className="object-cover"
                                sizes="44px"
                              />
                            </div>

                            {/* Product Info */}
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-[#111111] truncate">
                                {prod.name}
                              </h5>
                              <div className="flex items-center gap-1.5 text-[10px] text-[#737373]">
                                <span className="font-semibold text-[#111111]">
                                  {formatRupiah(prod.basePrice)}
                                </span>
                                <span>•</span>
                                <span>{prod.categoryName || "Kategori"}</span>
                              </div>
                            </div>
                          </div>

                          {/* Controls: Move Up, Move Down, Remove */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveProductUp(idx)}
                              disabled={isFirst}
                              title="Pindah ke Atas"
                              className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#737373] hover:text-[#111111] disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveProductDown(idx)}
                              disabled={isLast}
                              title="Pindah ke Bawah"
                              className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#737373] hover:text-[#111111] disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveProductFromSection(pId)}
                              title="Hapus dari seksi ini"
                              className="p-1.5 rounded-lg bg-red-50 text-[#B42318] hover:bg-red-100 ml-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Catalog Products Selector */}
              <div className="space-y-3 pt-4 md:pt-0 md:pl-4 flex flex-col">
                <div>
                  <h4 className="text-xs font-bold text-[#111111] uppercase tracking-wider mb-2">
                    Katalog Produk Toko
                  </h4>

                  {/* Search Input */}
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute inset-y-0 left-3 my-auto text-[#737373] pointer-events-none" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Cari produk katalog..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#F6F6F7] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] placeholder:text-[#A3A3A3] focus:border-[#111111] transition-colors"
                    />
                  </div>

                  {/* Category Pills Filter */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter("all")}
                      className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                        selectedCategoryFilter === "all"
                          ? "bg-[#111111] text-white"
                          : "bg-neutral-100 text-[#737373] hover:text-[#111111]"
                      }`}
                    >
                      Semua
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategoryFilter(cat.id)}
                        className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                          selectedCategoryFilter === cat.id
                            ? "bg-[#111111] text-white"
                            : "bg-neutral-100 text-[#737373] hover:text-[#111111]"
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Available Products List */}
                <div className="space-y-2 flex-1 overflow-y-auto max-h-[360px] pr-1">
                  {filteredCatalogProducts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#737373] bg-[#F6F6F7] rounded-xl">
                      Tidak ada produk yang cocok dengan pencarian.
                    </div>
                  ) : (
                    filteredCatalogProducts.map((prod) => {
                      // Check if already selected by id or dbId or slug
                      const isSelected =
                        assignedProductIds.includes(prod.id) ||
                        (prod.dbId && assignedProductIds.includes(prod.dbId)) ||
                        (prod.slug && assignedProductIds.includes(prod.slug));

                      const targetId = prod.dbId || prod.id;

                      return (
                        <div
                          key={prod.id}
                          className="bg-white border border-[#E5E5E5] rounded-xl p-2.5 flex items-center justify-between gap-2.5 hover:border-neutral-300 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Thumbnail */}
                            <div className="w-10 h-10 rounded-lg bg-neutral-100 relative overflow-hidden flex-shrink-0 border border-neutral-200">
                              <Image
                                src={prod.images?.[0] || "/images/hero-food.webp"}
                                alt={prod.name}
                                fill
                                unoptimized
                                className="object-cover"
                                sizes="40px"
                              />
                            </div>

                            {/* Details */}
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-[#111111] truncate">
                                {prod.name}
                              </h5>
                              <div className="flex items-center gap-1.5 text-[10px] text-[#737373]">
                                <span className="font-semibold text-[#111111]">
                                  {formatRupiah(prod.basePrice)}
                                </span>
                                <span>•</span>
                                <span>{prod.categoryName || "Umum"}</span>
                                <span>•</span>
                                <span
                                  className={
                                    prod.isAvailable
                                      ? "text-emerald-700 font-medium"
                                      : "text-red-600 font-medium"
                                  }
                                >
                                  {prod.isAvailable ? "Tersedia" : "Habis"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Add button or selected state */}
                          {isSelected ? (
                            <button
                              type="button"
                              disabled
                              className="px-2.5 py-1.5 rounded-lg bg-neutral-100 text-[#737373] text-[11px] font-semibold flex items-center gap-1 cursor-default opacity-80"
                            >
                              <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                              <span>Dipilih</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddProductToSection(targetId)}
                              className="px-3 py-1.5 rounded-lg bg-[#111111] hover:bg-neutral-800 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Tambah</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#E5E5E5] bg-[#FAF9F8] flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] text-[#737373]">
                Total {assignedProductIds.length} produk diurutkan untuk seksi ini
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManagingProductsSection(null)}
                  className="px-4 py-2 rounded-xl border border-[#E5E5E5] text-[#737373] hover:text-[#111111] text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveProductAssignments}
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isPending ? "Menyimpan..." : "Simpan Produk Seksi"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
