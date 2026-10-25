"use client";

import React, { useState } from "react";
import { Category } from "@/types";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { CategoryIconPicker } from "@/components/admin/CategoryIconPicker";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/app/admin/menu/category-actions";
import {
  X,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  Loader2,
  FolderTree,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

export interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onCategoriesUpdated: (categories: Category[]) => void;
}

export function CategoryManagerModal({
  isOpen,
  onClose,
  categories,
  onCategoriesUpdated,
}: CategoryManagerModalProps) {
  // Navigation inside modal: 'list' | 'create' | 'edit' | 'quick-icon'
  const [view, setView] = useState<"list" | "create" | "edit" | "quick-icon">("list");
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState<string>("utensils");

  // Loading & error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Open create form
  const handleStartCreate = () => {
    setFormName("");
    setFormIcon("utensils");
    setErrorMessage(null);
    setView("create");
  };

  // Open full edit form
  const handleStartEdit = (cat: Category) => {
    setActiveCategory(cat);
    setFormName(cat.name);
    setFormIcon(cat.icon || "utensils");
    setErrorMessage(null);
    setView("edit");
  };

  // Open quick icon changer
  const handleStartQuickIcon = (cat: Category) => {
    setActiveCategory(cat);
    setFormName(cat.name);
    setFormIcon(cat.icon || "utensils");
    setErrorMessage(null);
    setView("quick-icon");
  };

  // Handle Create submission
  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formName.trim() || formName.trim().length < 2) {
      setErrorMessage("Nama kategori minimal 2 karakter.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await createCategoryAction({
        name: formName.trim(),
        icon: formIcon || "utensils",
      });

      if (!res.success || !res.category) {
        throw new Error(res.error || "Gagal membuat kategori.");
      }

      // Optimistically update categories list
      const updatedList = [...categories, res.category];
      onCategoriesUpdated(updatedList);
      setView("list");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit submission (name + icon)
  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !activeCategory) return;

    if (!formName.trim() || formName.trim().length < 2) {
      setErrorMessage("Nama kategori minimal 2 karakter.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await updateCategoryAction({
        id: activeCategory.id,
        name: formName.trim(),
        icon: formIcon || "utensils",
      });

      if (!res.success) {
        throw new Error(res.error || "Gagal memperbarui kategori.");
      }

      // Update local state
      const updatedList = categories.map((c) =>
        c.id === activeCategory.id
          ? { ...c, name: formName.trim(), icon: formIcon || "utensils" }
          : c
      );
      onCategoriesUpdated(updatedList);
      setView("list");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Quick Icon submission (changes ONLY icon without touching name or other data)
  const handleSubmitQuickIcon = async (iconId: string) => {
    if (isSubmitting || !activeCategory) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setFormIcon(iconId);

    try {
      const res = await updateCategoryAction({
        id: activeCategory.id,
        icon: iconId,
      });

      if (!res.success) {
        throw new Error(res.error || "Gagal memperbarui ikon kategori.");
      }

      // Update local state
      const updatedList = categories.map((c) =>
        c.id === activeCategory.id ? { ...c, icon: iconId } : c
      );
      onCategoriesUpdated(updatedList);
      setView("list");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete category
  const handleDeleteCategory = async (catId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await deleteCategoryAction(catId);
      if (!res.success) {
        throw new Error(res.error || "Gagal menghapus kategori.");
      }

      const updatedList = categories.filter((c) => c.id !== catId);
      onCategoriesUpdated(updatedList);
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-manager-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl w-full max-w-lg border border-[#E5E5E5] flex flex-col max-h-[92vh] overflow-hidden shadow-xl animate-in zoom-in-95 duration-150">
        {/* Modal Top Header */}
        <div className="px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2">
            {view !== "list" && (
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setErrorMessage(null);
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#737373] hover:text-[#111111] hover:bg-neutral-100 transition-colors mr-1 cursor-pointer"
                aria-label="Kembali ke daftar kategori"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F25B09] flex items-center justify-center shrink-0">
              <FolderTree className="w-4 h-4" />
            </div>
            <div>
              <h2 id="category-manager-title" className="text-sm font-bold text-[#111111] leading-tight">
                {view === "list"
                  ? "Kelola Kategori Menu"
                  : view === "create"
                  ? "Tambah Kategori Baru"
                  : view === "edit"
                  ? `Edit Kategori: ${activeCategory?.name || ""}`
                  : `Ganti Ikon: ${activeCategory?.name || ""}`}
              </h2>
              <p className="text-[11px] text-[#737373]">
                {view === "list"
                  ? "Atur nama dan ikon kategori yang tampil di beranda & menu"
                  : view === "quick-icon"
                  ? "Pilih ikon baru untuk kategori ini"
                  : "Pilih ikon outline yang sesuai untuk kategori ini"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-[#737373] hover:text-[#111111] hover:bg-neutral-100 transition-colors cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Notification Banner */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* =================================================================
              VIEW 1: CATEGORY LIST VIEW
              ================================================================= */}
          {view === "list" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs text-[#737373] font-medium">
                  {categories.length} kategori terdaftar
                </span>
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Kategori</span>
                </button>
              </div>

              {/* Categories Cards */}
              <div className="space-y-2">
                {categories.map((cat, index) => {
                  const isConfirmingDelete = deleteConfirmId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      className="p-3 bg-white border border-[#E5E5E5] rounded-xl flex items-center justify-between gap-3 hover:border-neutral-300 transition-colors"
                    >
                      {/* Left: Icon Badge & Details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F25B09] shrink-0">
                          <CategoryIcon icon={cat.icon} fallbackSlug={cat.slug} className="w-4.5 h-4.5" strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#111111] truncate block">
                              {cat.name}
                            </span>
                            <span className="text-[10px] text-[#737373] bg-neutral-100 px-1.5 py-0.2 rounded font-mono">
                              #{index + 1}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#737373] truncate">
                            Ikon: <span className="font-mono text-[#F25B09] font-medium">{cat.icon || "utensils"}</span> • Slug: <span className="font-mono">{cat.slug}</span>
                          </p>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1 bg-red-50 p-1 rounded-xl border border-red-200">
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat.id)}
                              disabled={isSubmitting}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isSubmitting ? "..." : "Ya, Hapus"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1 text-[#737373] hover:text-[#111111] text-[11px] font-medium"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartQuickIcon(cat)}
                              title="Ganti ikon saja"
                              className="px-2 py-1.5 text-xs text-[#F25B09] bg-orange-50 hover:bg-orange-100 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span className="hidden sm:inline">Ganti Ikon</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(cat)}
                              title="Edit nama & ikon"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#737373] hover:text-[#111111] hover:bg-neutral-100 transition-colors cursor-pointer"
                              aria-label={`Edit ${cat.name}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {/* Allow deleting if more than 1 category */}
                            {categories.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmId(cat.id);
                                  setErrorMessage(null);
                                }}
                                title="Hapus kategori"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#737373] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                aria-label={`Hapus ${cat.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =================================================================
              VIEW 2: QUICK ICON CHANGER
              ================================================================= */}
          {view === "quick-icon" && activeCategory && (
            <div className="space-y-4">
              <div className="p-3 bg-neutral-50 rounded-xl border border-[#E5E5E5] flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-[#111111] block">
                    {activeCategory.name}
                  </span>
                  <span className="text-[11px] text-[#737373]">
                    Pilih ikon dari daftar di bawah untuk langsung mengganti ikon kategori ini.
                  </span>
                </div>
              </div>

              <CategoryIconPicker
                selectedIcon={formIcon}
                onSelectIcon={(iconId) => {
                  setFormIcon(iconId);
                  handleSubmitQuickIcon(iconId);
                }}
                categoryNamePreview={activeCategory.name}
              />

              {isSubmitting && (
                <div className="flex items-center justify-center gap-2 text-xs text-[#F25B09] font-medium py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan perubahan ikon...</span>
                </div>
              )}
            </div>
          )}

          {/* =================================================================
              VIEW 3: CREATE OR EDIT FORM
              ================================================================= */}
          {(view === "create" || view === "edit") && (
            <form onSubmit={view === "create" ? handleSubmitCreate : handleSubmitEdit} className="space-y-4">
              {/* Category Name */}
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  Nama Kategori <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Roti & Pastry, Dimsum, Kopi Susu..."
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:outline-hidden focus:border-[#F25B09] transition-colors"
                />
              </div>

              {/* Icon Picker Component */}
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  Pilih Ikon Outline <span className="text-red-500">*</span>
                </label>
                <CategoryIconPicker
                  selectedIcon={formIcon}
                  onSelectIcon={(iconId) => setFormIcon(iconId)}
                  categoryNamePreview={formName || "Kategori"}
                />
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E5E5]">
                <button
                  type="button"
                  onClick={() => {
                    setView("list");
                    setErrorMessage(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-[#E5E5E5] text-[#737373] hover:text-[#111111] text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{view === "create" ? "Simpan Kategori" : "Perbarui Kategori"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
