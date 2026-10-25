"use client";

import React, { useState, useTransition } from "react";
import {
  Store,
  Phone,
  QrCode,
  Truck,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  AlertTriangle,
  X,
  RotateCcw,
  CreditCard,
  Banknote,
  Upload,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import { StoreSettings } from "@/types";
import { formatRupiah } from "@/data/dummy-data";
import { normalizeInstagramUrl } from "@/lib/instagram-url";
import { InstagramIcon } from "@/components/ui/InstagramIcon";
import {
  saveStoreSettingsAction,
  toggleStoreStatusAction,
  uploadQrisImageAction,
} from "@/app/admin/pengaturan/actions";

interface SettingsManagerProps {
  initialSettings: StoreSettings;
}

export function SettingsManager({ initialSettings }: SettingsManagerProps) {
  // Confirmed persisted state from server
  const [confirmedSettings, setConfirmedSettings] =
    useState<StoreSettings>(initialSettings);

  // Form state for editing
  const [formState, setFormState] = useState<StoreSettings>(initialSettings);

  // Delivery fee drafts to support smooth mobile numeric editing without premature resets or spinner controls
  const [standardFeeDraft, setStandardFeeDraft] = useState<string>(
    String(initialSettings.deliveryConfig?.standardFee ?? 0)
  );
  const [freeShippingThresholdDraft, setFreeShippingThresholdDraft] = useState<string>(
    String(initialSettings.deliveryConfig?.freeShippingThreshold ?? 0)
  );

  // Status toggle confirmation modal state
  const [showCloseModal, setShowCloseModal] = useState(false);

  // QRIS Image upload and delete states
  const [isUploadingQris, setIsUploadingQris] = useState(false);
  const [qrisUploadFeedback, setQrisUploadFeedback] = useState<string | null>(null);
  const [showDeleteQrisModal, setShowDeleteQrisModal] = useState(false);
  const qrisFileInputRef = React.useRef<HTMLInputElement>(null);

  // Async transitions and notifications
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = React.useRef(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const isTogglingRef = React.useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check for unsaved changes
  const isDirty =
    formState.storeName !== confirmedSettings.storeName ||
    formState.tagline !== confirmedSettings.tagline ||
    formState.location !== confirmedSettings.location ||
    formState.isOpen !== confirmedSettings.isOpen ||
    formState.operatingHoursText !== confirmedSettings.operatingHoursText ||
    formState.adminWhatsapp !== confirmedSettings.adminWhatsapp ||
    (formState.instagramUrl || "").trim() !== (confirmedSettings.instagramUrl || "").trim() ||
    formState.qrisMerchantName !== confirmedSettings.qrisMerchantName ||
    formState.qrisNmid !== confirmedSettings.qrisNmid ||
    (formState.qrisImageUrl || "").trim() !== (confirmedSettings.qrisImageUrl || "").trim() ||
    formState.paymentMethods?.qris !== confirmedSettings.paymentMethods?.qris ||
    formState.paymentMethods?.cash !== confirmedSettings.paymentMethods?.cash ||
    formState.deliveryConfig.configuredArea !== confirmedSettings.deliveryConfig.configuredArea ||
    standardFeeDraft.trim() !== String(confirmedSettings.deliveryConfig.standardFee) ||
    freeShippingThresholdDraft.trim() !== String(confirmedSettings.deliveryConfig.freeShippingThreshold);

  // Format WhatsApp input validation
  const validateForm = (): string | null => {
    if (!formState.storeName.trim() || formState.storeName.trim().length < 2) {
      return "Nama toko wajib diisi (minimal 2 karakter).";
    }

    const cleanWhatsapp = formState.adminWhatsapp.replace(/[^0-9]/g, "");
    if (!cleanWhatsapp || cleanWhatsapp.length < 9 || cleanWhatsapp.length > 16) {
      return "Nomor WhatsApp tidak valid. Gunakan format angka standar (contoh: 6282273180000).";
    }

    if (!standardFeeDraft.trim()) {
      return "Ongkos kirim standar tidak boleh kosong.";
    }
    const numStandardFee = Number(standardFeeDraft);
    if (isNaN(numStandardFee) || numStandardFee < 0) {
      return "Ongkos kirim standar tidak boleh berupa angka negatif.";
    }

    if (!freeShippingThresholdDraft.trim()) {
      return "Batas gratis ongkir tidak boleh kosong.";
    }
    const numThreshold = Number(freeShippingThresholdDraft);
    if (isNaN(numThreshold) || numThreshold < 0) {
      return "Batas gratis ongkir tidak boleh berupa angka negatif.";
    }

    if (formState.instagramUrl && formState.instagramUrl.trim()) {
      const igCheck = normalizeInstagramUrl(formState.instagramUrl);
      if (!igCheck.isValid) {
        return igCheck.error || "Link Instagram tidak valid.";
      }
    }

    return null;
  };

  // Handle Full Form Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingRef.current || isSaving || isPending) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const validationErr = validateForm();
    if (validationErr) {
      setErrorMessage(validationErr);
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    const igCheck = formState.instagramUrl && formState.instagramUrl.trim()
      ? normalizeInstagramUrl(formState.instagramUrl)
      : null;

    const payload: StoreSettings = {
      ...formState,
      storeName: formState.storeName.trim(),
      adminWhatsapp: formState.adminWhatsapp.replace(/[^0-9]/g, ""),
      instagramUrl: igCheck && igCheck.isValid ? igCheck.normalized : "",
      deliveryConfig: {
        ...formState.deliveryConfig,
        configuredArea: formState.deliveryConfig.configuredArea.trim(),
        standardFee: Math.round(Number(standardFeeDraft)),
        freeShippingThreshold: Math.round(Number(freeShippingThresholdDraft)),
      },
      paymentMethods: {
        qris: Boolean(formState.paymentMethods?.qris),
        cash: Boolean(formState.paymentMethods?.cash),
      },
    };

    startTransition(async () => {
      try {
        const result = await saveStoreSettingsAction(payload);
        if (result.success && result.settings) {
          // Verification: verify that the reloaded persisted settings match the submitted values
          const savedWa = (result.settings.adminWhatsapp || "").replace(/[^0-9]/g, "");
          const submittedWa = payload.adminWhatsapp.replace(/[^0-9]/g, "");
          const savedIg = (result.settings.instagramUrl || "").trim();
          const submittedIg = (payload.instagramUrl || "").trim();

          const waMismatch = submittedWa && savedWa !== submittedWa;
          const igMismatch = submittedIg && savedIg !== submittedIg;

          if (waMismatch || igMismatch) {
            const mismatchFields: string[] = [];
            if (waMismatch) mismatchFields.push(`WhatsApp (tersimpan: "${savedWa || "kosong"}")`);
            if (igMismatch) mismatchFields.push(`Instagram (tersimpan: "${savedIg || "kosong"}")`);

            setErrorMessage(
              `Sebagian pengaturan tidak terverifikasi di server: ${mismatchFields.join(", ")}. Nilai input Anda tetap dipertahankan. Silakan periksa koneksi atau schema database.`
            );
            // Preserve user's entered formState so inputs do NOT disappear
            return;
          }

          setConfirmedSettings(result.settings);
          setFormState(result.settings);
          setStandardFeeDraft(String(result.settings.deliveryConfig.standardFee));
          setFreeShippingThresholdDraft(
            String(result.settings.deliveryConfig.freeShippingThreshold)
          );
          setSuccessMessage("Pengaturan toko berhasil disimpan ke database!");
          setTimeout(() => setSuccessMessage(null), 4000);
        } else {
          setErrorMessage(
            result.error || "Gagal menyimpan pengaturan ke database."
          );
          // Preserve user input on failure (formState is untouched)
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan tidak terduga saat menyimpan.";
        setErrorMessage(msg);
        // Preserve user input on error (formState is untouched)
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    });
  };

  // Reset form to confirmed server state
  const handleReset = () => {
    setFormState(confirmedSettings);
    setStandardFeeDraft(String(confirmedSettings.deliveryConfig.standardFee));
    setFreeShippingThresholdDraft(
      String(confirmedSettings.deliveryConfig.freeShippingThreshold)
    );
    setErrorMessage(null);
    setQrisUploadFeedback(null);
  };

  // QRIS File selection and upload handler
  const handleQrisFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-selecting same file triggers change
    e.target.value = "";

    // 1. Client-side size check (max 5 MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMessage(
        `Ukuran file terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Batas maksimal adalah 5 MB.`
      );
      return;
    }

    // 2. Client-side MIME check
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(file.type)) {
      setErrorMessage(
        "Format file tidak didukung. Harap gunakan format JPG, PNG, atau WebP."
      );
      return;
    }

    setIsUploadingQris(true);
    setErrorMessage(null);
    setQrisUploadFeedback(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (formState.qrisImageUrl) {
        formData.append("previousUrl", formState.qrisImageUrl);
      }

      const result = await uploadQrisImageAction(formData);
      if (result.success && result.url) {
        setFormState((prev) => ({ ...prev, qrisImageUrl: result.url }));
        setQrisUploadFeedback(
          "Foto QRIS berhasil diunggah ke Supabase Storage! Klik 'Simpan Pengaturan' di bawah untuk menerapkan perubahan ke halaman pembayaran pelanggan."
        );
      } else {
        setErrorMessage(result.error || "Gagal mengunggah foto QRIS.");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat mengunggah foto QRIS.";
      setErrorMessage(msg);
    } finally {
      setIsUploadingQris(false);
    }
  };

  // Confirm delete / remove QRIS image
  const handleConfirmDeleteQris = () => {
    setFormState((prev) => ({ ...prev, qrisImageUrl: "" }));
    setShowDeleteQrisModal(false);
    setQrisUploadFeedback(
      "Foto QRIS telah dihapus dari formulir. Klik 'Simpan Pengaturan' di bawah untuk menerapkan perubahan."
    );
  };

  // Immediate toggle handler for Store Open/Close Segmented Control
  const handleSegmentClick = (targetOpen: boolean) => {
    // If target state is already active, ignore
    if (formState.isOpen === targetOpen) return;

    if (!targetOpen) {
      // Want to close: prompt confirmation modal to avoid accidental shutdown
      setShowCloseModal(true);
    } else {
      // Want to open: execute immediately
      executeStatusChange(true);
    }
  };

  const executeStatusChange = async (targetOpen: boolean) => {
    if (isTogglingRef.current || isTogglingStatus) return;
    setShowCloseModal(false);
    isTogglingRef.current = true;
    setIsTogglingStatus(true);
    setErrorMessage(null);

    // Optimistically update UI so toggle responds instantaneously
    const prevFormOpen = formState.isOpen;
    const prevConfirmedOpen = confirmedSettings.isOpen;
    setConfirmedSettings((prev) => ({ ...prev, isOpen: targetOpen }));
    setFormState((prev) => ({ ...prev, isOpen: targetOpen }));

    try {
      const result = await toggleStoreStatusAction(targetOpen);
      if (result.success && result.isOpen !== undefined) {
        setConfirmedSettings((prev) => ({ ...prev, isOpen: result.isOpen! }));
        setFormState((prev) => ({ ...prev, isOpen: result.isOpen! }));
        setSuccessMessage(
          result.isOpen
            ? "Toko sekarang BUKA. Pelanggan dapat berbelanja kembali."
            : "Toko sekarang TUTUP. Halaman toko telah dialihkan ke mode close order."
        );
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        // Rollback on server error
        setConfirmedSettings((prev) => ({ ...prev, isOpen: prevConfirmedOpen }));
        setFormState((prev) => ({ ...prev, isOpen: prevFormOpen }));
        setErrorMessage(
          result.error || "Gagal memperbarui status toko di server."
        );
      }
    } catch (err: unknown) {
      // Rollback on network failure
      setConfirmedSettings((prev) => ({ ...prev, isOpen: prevConfirmedOpen }));
      setFormState((prev) => ({ ...prev, isOpen: prevFormOpen }));
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal menghubungkan ke server saat mengubah status.";
      setErrorMessage(msg);
    } finally {
      isTogglingRef.current = false;
      setIsTogglingStatus(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSave} className="space-y-4">
        {/* Error Notification */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-[#B42318] flex items-start justify-between gap-3 animate-landing-fade">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Gagal Menyimpan</p>
                <p className="text-[11px] mt-0.5 text-red-700">{errorMessage}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Success Notification */}
        {successMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-[#18794E] flex items-center justify-between gap-3 animate-landing-fade">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-400 hover:text-emerald-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Unsaved Changes Banner */}
        {isDirty && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-[#8A4B08]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Ada perubahan pengaturan yang belum disimpan.</span>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8A4B08] hover:text-amber-900 underline underline-offset-2"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Perubahan
            </button>
          </div>
        )}

        {/* =========================================================================
            GROUP 1: STATUS TOKO & JAM OPERASIONAL
            ========================================================================= */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#F25B09] flex items-center justify-center flex-shrink-0">
                <Store className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#111111]">
                  Status Operasional Toko
                </h3>
                <p className="text-[11px] text-[#737373]">
                  Penerimaan pesanan storefront dan jadwal harian
                </p>
              </div>
            </div>

            {/* TASK 2: Segmented Store Open/Closed Control */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div
                className="bg-[#F5F5F5] p-1 rounded-xl flex items-center border border-[#E5E5E5]"
                role="group"
                aria-label="Pilihan Status Toko"
              >
                {/* Button Toko Buka */}
                <button
                  type="button"
                  disabled={isTogglingStatus || isPending}
                  onClick={() => handleSegmentClick(true)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    formState.isOpen
                      ? "bg-white text-[#18794E] shadow-xs border border-emerald-200/60"
                      : "text-[#737373] hover:text-[#111111]"
                  } disabled:opacity-50`}
                >
                  <span
                    className={`w-2 h-2 rounded-full transition-colors ${
                      formState.isOpen ? "bg-[#18794E]" : "bg-neutral-300"
                    }`}
                  />
                  <span>Toko Buka</span>
                </button>

                {/* Button Toko Tutup */}
                <button
                  type="button"
                  disabled={isTogglingStatus || isPending}
                  onClick={() => handleSegmentClick(false)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    !formState.isOpen
                      ? "bg-white text-[#B42318] shadow-xs border border-red-200/60"
                      : "text-[#737373] hover:text-[#111111]"
                  } disabled:opacity-50`}
                >
                  <span
                    className={`w-2 h-2 rounded-full transition-colors ${
                      !formState.isOpen ? "bg-[#B42318]" : "bg-neutral-300"
                    }`}
                  />
                  <span>Toko Tutup</span>
                </button>
              </div>

              {isTogglingStatus && (
                <Loader2 className="w-4 h-4 text-[#737373] animate-spin" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-[#111111] mb-1.5">
                Nama Toko
              </label>
              <input
                type="text"
                required
                value={formState.storeName}
                onChange={(e) =>
                  setFormState({ ...formState, storeName: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                placeholder="Contoh: Nook by Jina"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#111111] mb-1.5">
                Lokasi / Alamat
              </label>
              <input
                type="text"
                value={formState.location}
                onChange={(e) =>
                  setFormState({ ...formState, location: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                placeholder="Contoh: Medan, Sumatera Utara"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-[#111111] mb-1.5">
                Teks Jam Operasional (Ditampilkan ke Pelanggan)
              </label>
              <input
                type="text"
                value={formState.operatingHoursText}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    operatingHoursText: e.target.value,
                  })
                }
                className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                placeholder="Contoh: Buka Setiap Hari (10:00 - 20:00 WIB)"
              />
            </div>
          </div>
        </div>

        {/* =========================================================================
            GROUP 2: INFORMASI KONTAK TOKO (WHATSAPP & INSTAGRAM)
            ========================================================================= */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          {/* Card Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-neutral-100">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#25D366] flex items-center justify-center flex-shrink-0">
              <Phone className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#111111]">
                Informasi Kontak Toko
              </h3>
              <p className="text-[11px] text-[#737373]">
                Kelola nomor WhatsApp admin dan tautan profil Instagram resmi toko
              </p>
            </div>
          </div>

          <div className="text-xs space-y-5">
            {/* 1. WhatsApp Toko Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-50 text-[#25D366] flex items-center justify-center flex-shrink-0">
                  <Phone className="w-3.5 h-3.5" />
                </div>
                <h4 className="text-xs font-bold text-[#111111]">
                  WhatsApp Toko
                </h4>
              </div>

              <div>
                <label className="block font-semibold text-[#111111] mb-1.5">
                  Nomor WhatsApp <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formState.adminWhatsapp}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      adminWhatsapp: e.target.value.replace(/[^0-9]/g, ""),
                    })
                  }
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs font-mono text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                  placeholder="6282273180000"
                />
                <p className="text-[10px] text-[#737373] mt-1.5">
                  Format internasional tanpa tanda +, spasi, atau simbol (contoh: 6282273180000). Digunakan pada tombol bantuan WhatsApp dan tautan pesan otomatis saat pelanggan checkout.
                </p>
              </div>
            </div>

            {/* Subtle Divider */}
            <div className="border-t border-neutral-100" />

            {/* 2. Instagram Toko Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-pink-50 text-[#E1306C] flex items-center justify-center flex-shrink-0">
                  <InstagramIcon className="w-3.5 h-3.5" />
                </div>
                <h4 className="text-xs font-bold text-[#111111]">
                  Instagram Toko
                </h4>
              </div>

              <div>
                <label className="block font-semibold text-[#111111] mb-1.5">
                  Link Instagram
                </label>
                <input
                  type="text"
                  value={formState.instagramUrl || ""}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      instagramUrl: e.target.value,
                    })
                  }
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                  placeholder="https://www.instagram.com/yourhandle/"
                />
                <p className="text-[10px] text-[#737373] mt-1.5">
                  Tautan lengkap profil Instagram toko (contoh: https://www.instagram.com/yourhandle/). Kosongkan jika belum tersedia.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            GROUP 3: METODE PEMBAYARAN
            ========================================================================= */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-3 pb-3 border-b border-neutral-100">
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#F25B09] flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#111111]">
                Metode Pembayaran
              </h3>
              <p className="text-[11px] text-[#737373]">
                Atur metode pembayaran yang aktif dan dapat dipilih oleh pelanggan saat checkout
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* ROW 1: QRIS Statis */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-[#E5E5E5] bg-[#FAF9F8] flex items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white border border-[#E5E5E5] flex items-center justify-center text-[#F25B09] flex-shrink-0 mt-0.5">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-[#111111]">
                      QRIS Statis
                    </span>
                    <span
                      className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                        formState.paymentMethods?.qris
                          ? "bg-emerald-50 text-[#18794E] border border-emerald-200/60"
                          : "bg-neutral-100 text-[#737373]"
                      }`}
                    >
                      {formState.paymentMethods?.qris ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#737373] mt-0.5">
                    Pembayaran melalui QRIS merchant.
                  </p>
                </div>
              </div>

              {/* Segmented Toggle Aktif / Nonaktif */}
              <div
                className="bg-[#EBEAEA] p-0.5 rounded-xl flex items-center border border-[#E0E0E0] flex-shrink-0"
                role="group"
                aria-label="Toggle QRIS Statis"
              >
                <button
                  type="button"
                  onClick={() =>
                    setFormState({
                      ...formState,
                      paymentMethods: {
                        ...formState.paymentMethods,
                        qris: true,
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    formState.paymentMethods?.qris
                      ? "bg-white text-[#18794E] shadow-xs"
                      : "text-[#737373] hover:text-[#111111]"
                  }`}
                >
                  Aktif
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormState({
                      ...formState,
                      paymentMethods: {
                        ...formState.paymentMethods,
                        cash: false,
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    !formState.paymentMethods?.qris
                      ? "bg-white text-[#B42318] shadow-xs"
                      : "text-[#737373] hover:text-[#111111]"
                  }`}
                >
                  Nonaktif
                </button>
              </div>
            </div>

            {/* ROW 2: Cash */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-[#E5E5E5] bg-[#FAF9F8] flex items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white border border-[#E5E5E5] flex items-center justify-center text-emerald-600 flex-shrink-0 mt-0.5">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-[#111111]">
                      Cash
                    </span>
                    <span
                      className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                        formState.paymentMethods?.cash
                          ? "bg-emerald-50 text-[#18794E] border border-emerald-200/60"
                          : "bg-neutral-100 text-[#737373]"
                      }`}
                    >
                      {formState.paymentMethods?.cash ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#737373] mt-0.5">
                    Pembayaran tunai sesuai jenis layanan yang didukung.
                  </p>
                </div>
              </div>

              {/* Segmented Toggle Aktif / Nonaktif */}
              <div
                className="bg-[#EBEAEA] p-0.5 rounded-xl flex items-center border border-[#E0E0E0] flex-shrink-0"
                role="group"
                aria-label="Toggle Cash"
              >
                <button
                  type="button"
                  onClick={() =>
                    setFormState({
                      ...formState,
                      paymentMethods: {
                        ...formState.paymentMethods,
                        cash: true,
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    formState.paymentMethods?.cash
                      ? "bg-white text-[#18794E] shadow-xs"
                      : "text-[#737373] hover:text-[#111111]"
                  }`}
                >
                  Aktif
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormState({
                      ...formState,
                      paymentMethods: {
                        ...formState.paymentMethods,
                        cash: false,
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    !formState.paymentMethods?.cash
                      ? "bg-white text-[#B42318] shadow-xs"
                      : "text-[#737373] hover:text-[#111111]"
                  }`}
                >
                  Nonaktif
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            GROUP 4: PENGATURAN QRIS MERCHANT
            ========================================================================= */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex items-center gap-3 pb-3 border-b border-neutral-100">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#8A4B08] flex items-center justify-center flex-shrink-0">
              <QrCode className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#111111]">
                Informasi QRIS Statis Merchant
              </h3>
              <p className="text-[11px] text-[#737373]">
                Konfigurasi nama merchant, NMID, dan foto QRIS resmi toko untuk halaman pembayaran pelanggan
              </p>
            </div>
          </div>

          {/* Feedback banner for QRIS upload */}
          {qrisUploadFeedback && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-[#18794E] flex items-start justify-between gap-2.5 animate-landing-fade">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="text-[11px] font-medium leading-relaxed">
                  {qrisUploadFeedback}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQrisUploadFeedback(null)}
                className="text-emerald-500 hover:text-emerald-700 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-[#111111] mb-1.5">
                Nama Merchant QRIS
              </label>
              <input
                type="text"
                value={formState.qrisMerchantName}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    qrisMerchantName: e.target.value,
                  })
                }
                className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                placeholder="Nook by Jina"
              />
              <p className="text-[10px] text-[#737373] mt-1">
                Nama yang harus diverifikasi pelanggan saat memindai QR code.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-[#111111] mb-1.5">
                NMID Merchant
              </label>
              <input
                type="text"
                value={formState.qrisNmid}
                onChange={(e) =>
                  setFormState({ ...formState, qrisNmid: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs font-mono text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                placeholder="ID1020021111111"
              />
              <p className="text-[10px] text-[#737373] mt-1">
                Nomor identifikasi merchant nasional resmi.
              </p>
            </div>
          </div>

          {/* Static QRIS Image Upload & Preview Section */}
          <div className="pt-3 border-t border-neutral-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="block font-semibold text-[#111111] text-xs">
                Foto QRIS Statis Toko
              </label>
              <span className="text-[11px] text-[#737373]">
                Maksimal 5 MB • Format: JPG, PNG, WebP
              </span>
            </div>

            <p className="text-[11px] text-[#737373] leading-relaxed">
              Unggah foto kode QRIS statis resmi toko Anda. Pastikan gambar jelas, tidak buram, dan seluruh pola kotak (finder pattern) terlihat utuh tanpa terpotong agar pelanggan dapat memindai dengan akurat.
            </p>

            {/* Hidden native file input */}
            <input
              ref={qrisFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleQrisFileChange}
              disabled={isUploadingQris}
              className="hidden"
            />

            {/* Image Preview or Upload Dropzone */}
            {formState.qrisImageUrl ? (
              <div className="p-4 bg-neutral-50 border border-[#E5E5E5] rounded-2xl flex flex-col sm:flex-row items-center sm:items-start gap-4">
                {/* QR Preview Frame */}
                <div className="relative w-44 h-44 sm:w-48 sm:h-48 bg-white border border-[#E5E5E5] rounded-xl p-2.5 flex items-center justify-center flex-shrink-0 shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formState.qrisImageUrl}
                    alt="Foto QRIS Merchant"
                    className="w-full h-full object-contain"
                  />
                  {isUploadingQris && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-1.5 rounded-xl">
                      <Loader2 className="w-5 h-5 text-[#111111] animate-spin" />
                      <span className="text-[10px] font-semibold text-[#111111]">
                        Mengunggah...
                      </span>
                    </div>
                  )}
                </div>

                {/* QR Details and Actions */}
                <div className="flex-1 space-y-3 text-center sm:text-left">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-[#18794E] rounded-full text-[10px] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>QRIS Terkonfigurasi</span>
                    </div>
                    <p className="text-xs font-bold text-[#111111]">
                      {formState.qrisMerchantName || "Merchant QRIS"}
                    </p>
                    <p className="text-[11px] font-mono text-[#737373]">
                      NMID: {formState.qrisNmid || "-"}
                    </p>
                    <p className="text-[10px] text-[#737373] truncate max-w-xs sm:max-w-md">
                      File: {formState.qrisImageUrl}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => qrisFileInputRef.current?.click()}
                      disabled={isUploadingQris}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-neutral-50 border border-[#E5E5E5] text-[#111111] rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Ganti Foto QRIS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteQrisModal(true)}
                      disabled={isUploadingQris}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 hover:bg-red-100 text-[#B42318] border border-red-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Foto</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-neutral-50 border border-dashed border-[#CCCCCC] rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#E5E5E5] text-[#737373] flex items-center justify-center mx-auto shadow-xs">
                  <ImageIcon className="w-6 h-6 text-[#737373]" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <p className="text-xs font-bold text-[#111111]">
                    Belum Ada Foto QRIS
                  </p>
                  <p className="text-[11px] text-[#737373] leading-relaxed">
                    Unggah kode QRIS toko agar pelanggan dapat melakukan pembayaran non-tunai melalui QRIS.
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => qrisFileInputRef.current?.click()}
                    disabled={isUploadingQris}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#111111] hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {isUploadingQris ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengunggah...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Foto QRIS</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            GROUP 4: DELIVERY & ONGKOS KIRIM
            ========================================================================= */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-3 pb-3 border-b border-neutral-100">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <Truck className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#111111]">
                Area Pengiriman & Ongkos Kirim
              </h3>
              <p className="text-[11px] text-[#737373]">
                Wilayah cakupan kurir internal dan batas gratis ongkir
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-[#111111] mb-1.5">
                Area Layanan Standar
              </label>
              <input
                type="text"
                value={formState.deliveryConfig.configuredArea}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    deliveryConfig: {
                      ...formState.deliveryConfig,
                      configuredArea: e.target.value,
                    },
                  })
                }
                className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                placeholder="Contoh: Radius 5 km"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#111111] mb-1.5">
                Ongkir Standar (Rp)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={standardFeeDraft}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, "");
                  setStandardFeeDraft(cleaned);
                }}
                onBlur={() => {
                  if (standardFeeDraft !== "" && !isNaN(Number(standardFeeDraft))) {
                    setStandardFeeDraft(String(Number(standardFeeDraft)));
                  }
                }}
                className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                placeholder="10000"
              />
              {standardFeeDraft !== "" && !isNaN(Number(standardFeeDraft)) && (
                <span className="text-[10px] text-[#737373] mt-1 block">
                  {formatRupiah(Number(standardFeeDraft))}
                </span>
              )}
            </div>

            <div>
              <label className="block font-semibold text-[#111111] mb-1.5">
                Batas Gratis Ongkir (Rp)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={freeShippingThresholdDraft}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, "");
                  setFreeShippingThresholdDraft(cleaned);
                }}
                onBlur={() => {
                  if (freeShippingThresholdDraft !== "" && !isNaN(Number(freeShippingThresholdDraft))) {
                    setFreeShippingThresholdDraft(String(Number(freeShippingThresholdDraft)));
                  }
                }}
                className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] outline-none transition-colors"
                placeholder="100000"
              />
              {freeShippingThresholdDraft !== "" && !isNaN(Number(freeShippingThresholdDraft)) && (
                <span className="text-[10px] text-[#737373] mt-1 block">
                  {formatRupiah(Number(freeShippingThresholdDraft))}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Bottom Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-[#737373]">
            {isDirty ? (
              <span className="text-amber-700 font-medium">
                Ada perubahan yang belum disimpan ke database
              </span>
            ) : (
              <span>Semua data sesuai dengan database operasional</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl border border-[#E5E5E5] bg-white hover:bg-neutral-50 text-xs font-semibold text-[#737373] transition-colors cursor-pointer disabled:opacity-50"
              >
                Batalkan
              </button>
            )}

            <button
              type="submit"
              disabled={isSaving || isPending || isTogglingStatus}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {isSaving || isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Pengaturan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Confirmation Modal before Closing Store */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-landing-fade">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5E5E5] space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-[#B42318] flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#111111]">
                  Tutup Toko Sementara?
                </h4>
                <p className="text-xs text-[#737373] leading-relaxed">
                  Saat toko ditutup, pelanggan yang membuka storefront akan melihat halaman khusus bahwa toko sedang close order. Pelanggan baru tidak dapat menambah pesanan atau melakukan checkout.
                </p>
                <p className="text-[11px] text-[#737373] pt-1">
                  Pesanan yang sudah masuk sebelumnya dan menu admin tetap dapat diakses seperti biasa.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#111111] hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => executeStatusChange(false)}
                className="px-4 py-2 rounded-xl bg-[#B42318] hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Ya, Tutup Toko
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal before Removing QRIS Image */}
      {showDeleteQrisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-landing-fade">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5E5E5] space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-[#B42318] flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#111111]">
                  Hapus Foto QRIS Merchant?
                </h4>
                <p className="text-xs text-[#737373] leading-relaxed">
                  Apakah Anda yakin ingin menghapus foto kode QRIS yang tersimpan? Jika dihapus, pelanggan di halaman checkout & pembayaran QRIS tidak akan melihat kode QR untuk dipindai sampai Anda mengunggah foto baru.
                </p>
                <p className="text-[11px] text-[#737373] pt-1">
                  Nama merchant dan NMID akan tetap tersimpan.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowDeleteQrisModal(false)}
                className="px-4 py-2 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#111111] hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteQris}
                className="px-4 py-2 rounded-xl bg-[#B42318] hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Ya, Hapus Foto
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
