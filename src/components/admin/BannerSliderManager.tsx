"use client";

import React, { useState, useRef, useTransition } from "react";
import Image from "next/image";
import {
  Sliders,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Eye,
  EyeOff,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  RefreshCw,
  ExternalLink,
  ImageIcon,
  Pencil,
} from "lucide-react";
import { Banner } from "@/types";
import {
  uploadBannerImageAction,
  saveHomeBannerAction,
  deleteHomeBannerAction,
  toggleBannerStatusAction,
  reorderHomeBannersAction,
} from "@/app/admin/beranda/actions";

interface BannerSliderManagerProps {
  initialBanners: Banner[];
  onBannersChange?: (banners: Banner[]) => void;
}

export function BannerSliderManager({
  initialBanners,
  onBannersChange,
}: BannerSliderManagerProps) {
  const [banners, setBanners] = useState<Banner[]>(
    initialBanners.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  );

  const [isPending, startTransition] = useTransition();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Upload modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadTargetUrl, setUploadTargetUrl] = useState("");
  const [uploadIsActive, setUploadIsActive] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Edit slide modal states
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);
  const [editTargetUrl, setEditTargetUrl] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Delete modal state
  const [deletingBanner, setDeletingBanner] = useState<Banner | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const updateBannersState = (newBanners: Banner[]) => {
    setBanners(newBanners);
    onBannersChange?.(newBanners);
  };

  // ---------------------------------------------------------------------------
  // UPLOAD NEW BANNER
  // ---------------------------------------------------------------------------
  const openUploadModal = () => {
    setUploadFile(null);
    setUploadPreview(null);
    setUploadTargetUrl("");
    setUploadIsActive(true);
    setUploadError(null);
    setIsUploadModalOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Validate size (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Ukuran file terlalu besar. Batas maksimal foto adalah 5 MB.");
      return;
    }

    // Validate type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setUploadError("Format file tidak didukung. Harap pilih gambar JPG, PNG, atau WebP.");
      return;
    }

    setUploadFile(file);
    const objectUrl = URL.createObjectURL(file);
    setUploadPreview(objectUrl);
  };

  // ---------------------------------------------------------------------------
  // URL VALIDATION HELPER
  // ---------------------------------------------------------------------------
  const validateDestinationUrl = (
    url: string
  ): { isValid: boolean; error?: string } => {
    const trimmed = url.trim();
    if (!trimmed) {
      return { isValid: true };
    }

    // Internal route
    if (trimmed.startsWith("/")) {
      if (/^\/[a-zA-Z0-9\-_/~%#?&=.]*$/.test(trimmed)) {
        return { isValid: true };
      }
      return {
        isValid: false,
        error:
          "Format rute internal tidak valid. Contoh yang benar: /menu atau /produk/nama-produk",
      };
    }

    // External URL
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return { isValid: true };
        }
      } catch {
        return {
          isValid: false,
          error:
            "Format URL eksternal tidak valid. Contoh yang benar: https://instagram.com/...",
        };
      }
    }

    return {
      isValid: false,
      error:
        "Tautan harus diawali dengan '/' untuk rute internal (contoh: /menu) atau 'https://' untuk tautan eksternal.",
    };
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Pilih file foto banner terlebih dahulu.");
      return;
    }

    const urlValidation = validateDestinationUrl(uploadTargetUrl);
    if (!urlValidation.isValid) {
      setUploadError(urlValidation.error || "Tautan tujuan tidak valid.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const uploadRes = await uploadBannerImageAction(formData);
      if (!uploadRes.success || !uploadRes.url) {
        throw new Error(uploadRes.error || "Gagal mengunggah foto banner.");
      }

      const saveRes = await saveHomeBannerAction({
        imageUrl: uploadRes.url,
        targetUrl: uploadTargetUrl.trim() || undefined,
        isActive: uploadIsActive,
      });

      if (!saveRes.success || !saveRes.banner) {
        throw new Error(saveRes.error || "Gagal menyimpan banner baru.");
      }

      const updated = [...banners, saveRes.banner].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      );
      updateBannersState(updated);
      setIsUploadModalOpen(false);
      showToast("Foto banner baru berhasil ditambahkan!");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Terjadi kesalahan saat mengunggah.";
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // EDIT EXISTING SLIDE
  // ---------------------------------------------------------------------------
  const openEditModal = (banner: Banner) => {
    setEditingBanner(banner);
    setEditFile(null);
    setEditPreview(banner.imageUrl);
    setEditTargetUrl(banner.targetUrl || "");
    setEditIsActive(banner.isActive);
    setEditError(null);
  };

  const closeEditModal = () => {
    if (isSavingEdit) return;
    if (editPreview && editPreview.startsWith("blob:")) {
      URL.revokeObjectURL(editPreview);
    }
    setEditingBanner(null);
    setEditFile(null);
    setEditPreview(null);
    setEditTargetUrl("");
    setEditError(null);
  };

  const handleEditFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setEditError(null);

    if (file.size > 5 * 1024 * 1024) {
      setEditError("Ukuran file terlalu besar. Batas maksimal foto adalah 5 MB.");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setEditError(
        "Format file tidak didukung. Harap pilih gambar JPG, PNG, atau WebP."
      );
      return;
    }

    if (editPreview && editPreview.startsWith("blob:")) {
      URL.revokeObjectURL(editPreview);
    }

    setEditFile(file);
    const objectUrl = URL.createObjectURL(file);
    setEditPreview(objectUrl);
  };

  const handleResetEditImage = () => {
    if (editPreview && editPreview.startsWith("blob:")) {
      URL.revokeObjectURL(editPreview);
    }
    setEditFile(null);
    setEditPreview(editingBanner ? editingBanner.imageUrl : null);
    if (editFileInputRef.current) {
      editFileInputRef.current.value = "";
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBanner) return;

    setEditError(null);

    const urlValidation = validateDestinationUrl(editTargetUrl);
    if (!urlValidation.isValid) {
      setEditError(urlValidation.error || "Tautan tujuan tidak valid.");
      return;
    }

    setIsSavingEdit(true);

    try {
      let resolvedImageUrl = editingBanner.imageUrl;

      // If user uploaded a new image file, upload it first
      if (editFile) {
        const formData = new FormData();
        formData.append("file", editFile);

        const uploadRes = await uploadBannerImageAction(formData);
        if (!uploadRes.success || !uploadRes.url) {
          throw new Error(uploadRes.error || "Gagal mengunggah foto pengganti.");
        }
        resolvedImageUrl = uploadRes.url;
      }

      // Save banner (updating existing record without duplication)
      const saveRes = await saveHomeBannerAction({
        id: editingBanner.id,
        imageUrl: resolvedImageUrl,
        targetUrl: editTargetUrl.trim() || undefined,
        isActive: editIsActive,
      });

      if (!saveRes.success || !saveRes.banner) {
        throw new Error(
          saveRes.error || "Gagal menyimpan perubahan slide banner."
        );
      }

      const updated = banners.map((b) =>
        b.id === editingBanner.id ? saveRes.banner! : b
      );
      updateBannersState(updated);

      if (editPreview && editPreview.startsWith("blob:")) {
        URL.revokeObjectURL(editPreview);
      }
      setEditingBanner(null);
      setEditFile(null);
      setEditPreview(null);
      showToast("Slide banner berhasil diperbarui!");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menyimpan perubahan.";
      setEditError(msg);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Compatibility helper
  const handleTriggerReplace = (bannerId: string) => {
    const banner = banners.find((b) => b.id === bannerId);
    if (banner) {
      openEditModal(banner);
    }
  };
  void handleTriggerReplace;

  // ---------------------------------------------------------------------------
  // TOGGLE ACTIVE STATUS
  // ---------------------------------------------------------------------------
  const handleToggleStatus = (banner: Banner) => {
    const nextStatus = !banner.isActive;
    const updated = banners.map((b) =>
      b.id === banner.id ? { ...b, isActive: nextStatus } : b
    );
    updateBannersState(updated);

    startTransition(async () => {
      const res = await toggleBannerStatusAction(banner.id, nextStatus);
      if (res.success) {
        showToast(
          nextStatus
            ? "Slide banner sekarang AKTIF di beranda pelanggan."
            : "Slide banner DISEMBUYIKAN dari beranda pelanggan."
        );
      } else {
        // Revert on error
        updateBannersState(banners);
        showToast(`Gagal: ${res.error || "Gagal mengubah status slide banner."}`);
      }
    });
  };

  // ---------------------------------------------------------------------------
  // REORDER BANNERS (UP / DOWN)
  // ---------------------------------------------------------------------------
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...banners];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;

    // Update sortOrder numbers
    const reindexed = next.map((b, idx) => ({ ...b, sortOrder: idx + 1 }));
    updateBannersState(reindexed);

    startTransition(async () => {
      await reorderHomeBannersAction(reindexed.map((b) => b.id));
      showToast("Urutan banner diperbarui.");
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= banners.length - 1) return;
    const next = [...banners];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;

    const reindexed = next.map((b, idx) => ({ ...b, sortOrder: idx + 1 }));
    updateBannersState(reindexed);

    startTransition(async () => {
      await reorderHomeBannersAction(reindexed.map((b) => b.id));
      showToast("Urutan banner diperbarui.");
    });
  };

  // ---------------------------------------------------------------------------
  // DELETE BANNER
  // ---------------------------------------------------------------------------
  const confirmDelete = () => {
    if (!deletingBanner) return;
    const bannerId = deletingBanner.id;

    const filtered = banners
      .filter((b) => b.id !== bannerId)
      .map((b, idx) => ({ ...b, sortOrder: idx + 1 }));

    updateBannersState(filtered);
    setDeletingBanner(null);

    startTransition(async () => {
      const res = await deleteHomeBannerAction(bannerId);
      if (res.success) {
        showToast("Slide banner berhasil dihapus.");
      } else {
        updateBannersState(banners);
        showToast(`Gagal: ${res.error || "Gagal menghapus slide banner."}`);
      }
    });
  };

  const activeCount = banners.filter((b) => b.isActive).length;
  const inactiveCount = banners.length - activeCount;

  return (
    <div className="space-y-3">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#111111] text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs animate-landing-fade">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}


      {/* Top Banner Slider Control Header Card */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E5E5]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#F25B09] flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-[#111111]">
                  Banner Slider Hero Beranda
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-[#737373]">
                  {banners.length} Slide
                </span>
              </div>
              <p className="text-[11px] text-[#737373] mt-0.5">
                Atur foto banner geser yang tampil di bagian paling atas beranda toko. Menampilkan foto makanan bersih tanpa teks overlay.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openUploadModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#111111] hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex-shrink-0 active:scale-[0.99]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Tambah Slide Banner</span>
          </button>
        </div>

        {/* Stats Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3">
          <div className="bg-[#FAF9F8] rounded-xl px-3 py-2 border border-[#E5E5E5]">
            <span className="text-[10px] text-[#737373] font-medium block">
              Total Slide
            </span>
            <span className="text-sm font-bold text-[#111111]">
              {banners.length} Gambar
            </span>
          </div>

          <div className="bg-[#FAF9F8] rounded-xl px-3 py-2 border border-[#E5E5E5]">
            <span className="text-[10px] text-[#737373] font-medium block">
              Slide Aktif (Tampil)
            </span>
            <span className="text-sm font-bold text-emerald-600">
              {activeCount} Slide
            </span>
          </div>

          <div className="bg-[#FAF9F8] rounded-xl px-3 py-2 border border-[#E5E5E5] col-span-2 sm:col-span-1">
            <span className="text-[10px] text-[#737373] font-medium block">
              Slide Disembunyikan
            </span>
            <span className="text-sm font-bold text-neutral-500">
              {inactiveCount} Slide
            </span>
          </div>
        </div>
      </div>

      {/* Banners List */}
      {banners.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E5E5E5] rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-[#737373]">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#111111]">Belum Ada Slide Banner</h4>
            <p className="text-[11px] text-[#737373] max-w-sm mx-auto mt-0.5">
              Tambahkan foto promo atau rekomendasi makanan untuk tampil di carousel beranda toko pelanggan.
            </p>
          </div>
          <button
            type="button"
            onClick={openUploadModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#111111] text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Unggah Banner Pertama</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {banners.map((banner, index) => (
            <div
              key={banner.id}
              className={`bg-white border rounded-2xl p-3.5 sm:p-4 transition-colors ${
                banner.isActive
                  ? "border-[#E5E5E5]"
                  : "border-neutral-200 bg-neutral-50/60 opacity-80"
              }`}
            >
              <div className="flex flex-col sm:flex-row gap-3.5 sm:items-center justify-between">
                {/* Left: Thumbnail & Order Badge */}
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Aspect Ratio 21:9 Thumbnail Preview */}
                  <div className="relative w-28 sm:w-36 aspect-[21/9] rounded-xl overflow-hidden border border-[#E5E5E5] bg-neutral-100 flex-shrink-0">
                    <Image
                      src={banner.imageUrl}
                      alt={`Slide #${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 112px, 144px"
                    />
                  </div>

                  {/* Info details */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#111111]">
                        Slide #{index + 1}
                      </span>
                      {banner.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-[#18794E]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-200 text-[#737373]">
                          Disembunyikan
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-[#737373] truncate max-w-xs sm:max-w-md">
                      File: <span className="font-mono text-[10px]">{banner.imageUrl}</span>
                    </p>

                    {banner.targetUrl ? (
                      <p className="text-[10px] text-[#F25B09] flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                        <span>Tautan: {banner.targetUrl}</span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-[#737373] italic">
                        Tanpa tautan (hanya tampilan foto)
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Actions Controls (Reorder, Replace, Toggle, Delete) */}
                <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100 w-full sm:w-auto justify-end">
                  {/* Reorder Up */}
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0 || isPending}
                    title="Geser ke atas"
                    className="p-2 rounded-xl border border-[#E5E5E5] text-[#737373] hover:text-[#111111] hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  {/* Reorder Down */}
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === banners.length - 1 || isPending}
                    title="Geser ke bawah"
                    className="p-2 rounded-xl border border-[#E5E5E5] text-[#737373] hover:text-[#111111] hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Edit Slide Button */}
                  <button
                    type="button"
                    onClick={() => openEditModal(banner)}
                    disabled={isPending}
                    title="Edit slide banner ini"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#111111] hover:bg-neutral-50 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[#737373]" />
                    <span>Edit Slide</span>
                  </button>

                  {/* Toggle Active Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(banner)}
                    disabled={isPending}
                    title={banner.isActive ? "Sembunyikan banner" : "Aktifkan banner"}
                    className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      banner.isActive
                        ? "border-[#E5E5E5] text-[#737373] hover:bg-neutral-50"
                        : "border-emerald-200 bg-emerald-50 text-[#18794E] hover:bg-emerald-100"
                    }`}
                  >
                    {banner.isActive ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Sembunyikan</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Tampilkan</span>
                      </>
                    )}
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => setDeletingBanner(banner)}
                    disabled={isPending}
                    title="Hapus banner"
                    className="p-2 rounded-xl border border-[#E5E5E5] text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =========================================================================
          MODAL: UPLOAD NEW BANNER SLIDE
          ========================================================================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-landing-fade">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-[#E5E5E5] space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#F25B09] flex items-center justify-center">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#111111]">
                    Unggah Slide Banner Baru
                  </h4>
                  <p className="text-[11px] text-[#737373]">
                    Format rasio 21:9 atau lanskap disarankan (JPG, PNG, WebP maks 5 MB)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                disabled={isUploading}
                className="p-1.5 text-[#737373] hover:text-[#111111] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#B42318] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* File Dropzone / Picker */}
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                  Pilih File Foto Banner <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#E5E5E5] hover:border-[#111111] rounded-2xl p-5 text-center cursor-pointer transition-colors bg-[#FAF9F8]"
                >
                  {uploadPreview ? (
                    <div className="space-y-3">
                      <div className="relative aspect-[21/9] w-full rounded-xl overflow-hidden border border-[#E5E5E5] bg-black/5">
                        <Image
                          src={uploadPreview}
                          alt="Preview Banner"
                          fill
                          className="object-cover"
                        />
                      </div>
                      <p className="text-[11px] text-[#737373]">
                        File dipilih: <span className="font-semibold text-[#111111]">{uploadFile?.name}</span> ({( (uploadFile?.size ?? 0) / (1024 * 1024) ).toFixed(2)} MB)
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="text-xs font-bold text-[#F25B09] hover:underline"
                      >
                        Ganti File Foto
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 py-4">
                      <div className="w-10 h-10 rounded-full bg-white shadow-xs border border-[#E5E5E5] flex items-center justify-center mx-auto text-[#737373]">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#111111]">
                          Klik untuk memilih file foto
                        </span>
                        <p className="text-[11px] text-[#737373] mt-0.5">
                          Mendukung JPG, PNG, atau WebP hingga 5 MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Optional Target Destination URL */}
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  Tautan Tujuan Saat Diklik (Opsional)
                </label>
                <input
                  type="text"
                  value={uploadTargetUrl}
                  onChange={(e) => setUploadTargetUrl(e.target.value)}
                  placeholder="Contoh: /menu atau /produk/nasi-bakar-cakalang (kosongkan jika foto saja)"
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] outline-none"
                />
                <span className="text-[10px] text-[#737373] mt-0.5 block">
                  Jika dikosongkan, slide banner tidak dapat diklik dan hanya tampil sebagai foto etalase.
                </span>
              </div>

              {/* Active Toggle */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uploadIsActive}
                    onChange={(e) => setUploadIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-[#F25B09] focus:ring-[#F25B09]"
                  />
                  <span className="text-xs font-medium text-[#111111]">
                    Langsung aktifkan slide banner di beranda
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E5E5]">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={isUploading}
                  className="px-4 py-2.5 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#737373] hover:text-[#111111] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengunggah...</span>
                    </>
                  ) : (
                    <span>Unggah & Simpan Slide</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: EDIT BANNER SLIDE
          ========================================================================= */}
      {editingBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-landing-fade">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-[#E5E5E5] space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#F25B09] flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#111111]">
                    Edit Slide Banner
                  </h4>
                  <p className="text-[11px] text-[#737373]">
                    Perbarui foto, tautan tujuan, dan status tampil slide ini
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSavingEdit}
                className="p-1.5 text-[#737373] hover:text-[#111111] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Message */}
            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#B42318] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Image Preview & Replacement Section */}
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                  Foto Banner
                </label>
                <input
                  type="file"
                  ref={editFileInputRef}
                  onChange={handleEditFileSelect}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />

                <div className="border border-[#E5E5E5] rounded-2xl p-3 sm:p-4 bg-[#FAF9F8] space-y-3">
                  <div className="relative aspect-[21/9] w-full rounded-xl overflow-hidden border border-[#E5E5E5] bg-neutral-100">
                    <Image
                      src={editPreview || editingBanner.imageUrl}
                      alt="Banner Preview"
                      fill
                      className="object-cover"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-[#E5E5E5]/60 text-xs">
                    {editFile ? (
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-emerald-700 block truncate">
                          Foto baru: {editFile.name} ({(editFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                        <span className="text-[10px] text-[#737373] block">
                          Akan menggantikan foto saat Anda menyimpan.
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#737373]">
                        Menggunakan foto yang tersimpan saat ini.
                      </span>
                    )}

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {editFile && (
                        <button
                          type="button"
                          onClick={handleResetEditImage}
                          className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                        >
                          Batal Ganti
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5E5E5] rounded-xl text-xs font-semibold text-[#111111] hover:bg-neutral-50 cursor-pointer transition-colors"
                      >
                        <RefreshCw className="w-3 h-3 text-[#737373]" />
                        <span>{editFile ? "Pilih File Lain" : "Ganti Foto"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Destination Link URL */}
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  Tautan Tujuan Saat Diklik (Opsional)
                </label>
                <input
                  type="text"
                  value={editTargetUrl}
                  onChange={(e) => setEditTargetUrl(e.target.value)}
                  placeholder="Contoh: /menu atau /produk/nasi-bakar-cakalang"
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] outline-none"
                />
                <span className="text-[10px] text-[#737373] mt-0.5 block">
                  Mendukung rute internal (contoh: <code className="text-[#111111]">/menu</code>) atau URL eksternal (<code className="text-[#111111]">https://...</code>). Kosongkan jika hanya ingin menampilkan foto tanpa tautan.
                </span>
              </div>

              {/* Active Toggle */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-[#F25B09] focus:ring-[#F25B09]"
                  />
                  <span className="text-xs font-medium text-[#111111]">
                    Tampilkan slide ini di carousel beranda pelanggan
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E5E5]">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isSavingEdit}
                  className="px-4 py-2.5 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#737373] hover:text-[#111111] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Perubahan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CONFIRM DELETE BANNER SLIDE
          ========================================================================= */}
      {deletingBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-landing-fade">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-[#E5E5E5] space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4.5 h-4.5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#111111]">
                  Hapus Slide Banner Ini?
                </h4>
                <p className="text-xs text-[#737373] leading-relaxed">
                  Slide banner ini akan dihapus dari carousel beranda pelanggan. Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            {/* Thumbnail Preview in confirmation */}
            <div className="relative aspect-[21/9] w-full rounded-xl overflow-hidden border border-[#E5E5E5] bg-neutral-100">
              <Image
                src={deletingBanner.imageUrl}
                alt="Banner to delete"
                fill
                className="object-cover"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingBanner(null)}
                disabled={isPending}
                className="px-4 py-2 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#737373] hover:text-[#111111] transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <span>Ya, Hapus Slide</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
