"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  X,
  UtensilsCrossed,
  Plus,
  Trash2,
  Lock,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Layers,
  Tag,
  UploadCloud,
  Pencil,
  Loader2,
} from "lucide-react";
import { Category, Addon, Product } from "@/types";
import { formatRupiah } from "@/data/dummy-data";
import {
  createProductAction,
  updateProductAction,
  getAdminProductForEditAction,
  uploadProductImageAction,
  CreateProductInput,
  UpdateProductInput,
} from "@/app/admin/menu/actions";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  availableAddons?: Addon[];
  initialProduct?: Product | null;
  onProductCreated?: (newProduct: Product) => void;
  onProductUpdated?: (updatedProduct: Product) => void;
}

interface OptionValueDraft {
  name: string;
  priceDelta: number | string;
}

interface OptionGroupDraft {
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  values: OptionValueDraft[];
}

export function AddProductModal({
  isOpen,
  onClose,
  categories,
  availableAddons = [],
  initialProduct = null,
  onProductCreated,
  onProductUpdated,
}: AddProductModalProps) {
  if (!isOpen) return null;

  return (
    <ProductFormModalContent
      key={initialProduct ? initialProduct.id || initialProduct.slug : "new-product"}
      onClose={onClose}
      categories={categories}
      availableAddons={availableAddons}
      initialProduct={initialProduct}
      onProductCreated={onProductCreated}
      onProductUpdated={onProductUpdated}
    />
  );
}

function ProductFormModalContent({
  onClose,
  categories,
  initialProduct,
  onProductCreated,
  onProductUpdated,
}: Omit<AddProductModalProps, "isOpen">) {
  const isEditMode = Boolean(initialProduct);

  // Form fields initialized directly without cascading renders
  const [name, setName] = useState(initialProduct?.name || "");
  const [categoryId, setCategoryId] = useState(
    initialProduct?.categoryId || categories[0]?.id || ""
  );
  const [description, setDescription] = useState(initialProduct?.description || "");
  const [price, setPrice] = useState<string>(
    initialProduct ? String(initialProduct.basePrice ?? 0) : "25000"
  );
  const [hpp, setHpp] = useState<string>(
    initialProduct?.hpp !== undefined && initialProduct?.hpp !== null
      ? String(initialProduct.hpp)
      : isEditMode
      ? ""
      : "12000"
  );

  // Images state (defaults to existing images or empty for fresh upload)
  const [images, setImages] = useState<string[]>(
    initialProduct?.images && initialProduct.images.length > 0
      ? initialProduct.images
      : []
  );

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  // Option groups state
  const [optionGroups, setOptionGroups] = useState<OptionGroupDraft[]>(
    initialProduct?.optionGroups && initialProduct.optionGroups.length > 0
      ? initialProduct.optionGroups.map((g) => ({
          name: g.name,
          isRequired: g.required,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          values: (g.values || []).map((v) => ({
            name: v.name,
            priceDelta: String(v.priceDelta ?? 0),
          })),
        }))
      : []
  );

  // Feedback and loading states
  const [loading, setLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(Boolean(initialProduct));
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Asynchronously fetch complete details (authoritative HPP via RPC, option groups) in edit mode
  useEffect(() => {
    if (!initialProduct) return;

    let active = true;

    getAdminProductForEditAction(initialProduct.id || initialProduct.slug)
      .then((res) => {
        if (!active || !res.success || !res.product) return;
        const full = res.product;
        setName(full.name);
        if (full.categoryId) setCategoryId(full.categoryId);
        setDescription(full.description || "");
        setPrice(String(full.basePrice));
        if (full.hpp !== undefined && full.hpp !== null) {
          setHpp(String(full.hpp));
        }
        if (full.images && full.images.length > 0) {
          setImages(full.images);
        }
        if (full.optionGroups && full.optionGroups.length > 0) {
          setOptionGroups(
            full.optionGroups.map((g) => ({
              name: g.name,
              isRequired: g.required,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              values: (g.values || []).map((v) => ({
                name: v.name,
                priceDelta: String(v.priceDelta ?? 0),
              })),
            }))
          );
        }
      })
      .catch((e) => {
        console.warn("Could not load extended product details:", e);
      })
      .finally(() => {
        if (active) setIsLoadingDetails(false);
      });

    return () => {
      active = false;
    };
  }, [initialProduct]);

  // Choose primary image handler (moves selected image to index 0)
  const handleMakePrimary = (index: number) => {
    if (index === 0) return;
    setImages((prev) => {
      const selected = prev[index];
      const others = prev.filter((_, i) => i !== index);
      return [selected, ...others];
    });
  };

  // Remove image handler
  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // File upload handler from computer
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUploadError(null);

    // 1. Client-side MIME validation (JPG, PNG, WebP)
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(file.type)) {
      setImageUploadError(
        "Format file tidak didukung. Harap gunakan format JPG, PNG, atau WebP."
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 2. Client-side size validation (max 2 MB)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setImageUploadError(
        `Ukuran file terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Batas maksimal adalah 2 MB.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await uploadProductImageAction(formData);

      if (!res.success || !res.url) {
        throw new Error(res.error || "Gagal mengunggah gambar ke server.");
      }

      // Add to images list
      setImages((prev) => {
        if (prev.includes(res.url!)) return prev;
        return [...prev, res.url!];
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat mengunggah foto.";
      setImageUploadError(msg);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Option group handlers
  const handleAddOptionGroup = () => {
    setOptionGroups((prev) => [
      ...prev,
      {
        name: "Level Pedas",
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        values: [
          { name: "Sedang", priceDelta: "0" },
          { name: "Pedas Mantap", priceDelta: "0" },
        ],
      },
    ]);
  };

  const handleRemoveOptionGroup = (index: number) => {
    setOptionGroups((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddOptionValue = (groupIndex: number) => {
    setOptionGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIndex) return g;
        return {
          ...g,
          values: [...g.values, { name: "Opsi Baru", priceDelta: "0" }],
        };
      })
    );
  };

  const handleRemoveOptionValue = (groupIndex: number, valIndex: number) => {
    setOptionGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIndex) return g;
        return {
          ...g,
          values: g.values.filter((_, vi) => vi !== valIndex),
        };
      })
    );
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setSuccessMessage(null);

    // Client-side validations
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError("Nama produk wajib diisi (minimal 2 karakter).");
      return;
    }

    if (!categoryId) {
      setError("Kategori produk wajib dipilih.");
      return;
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setError("Harga jual produk harus angka valid >= 0.");
      return;
    }

    let numHpp: number | null = null;
    if (hpp.trim() !== "") {
      numHpp = Number(hpp);
      if (isNaN(numHpp) || numHpp < 0) {
        setError("HPP produk harus angka valid >= 0.");
        return;
      }
    }

    if (images.length === 0) {
      setError("Unggah minimal satu foto produk.");
      return;
    }

    // Validate option groups and variant prices
    for (const group of optionGroups) {
      const gName = group.name.trim();
      if (!gName) {
        setError("Nama grup opsi tidak boleh kosong.");
        return;
      }
      if (group.values.length === 0) {
        setError(`Grup opsi "${gName}" harus memiliki minimal satu pilihan varian.`);
        return;
      }
      for (const val of group.values) {
        const vName = val.name.trim();
        if (!vName) {
          setError(`Nama pilihan varian pada grup "${gName}" tidak boleh kosong.`);
          return;
        }
        if (
          val.priceDelta === "" ||
          val.priceDelta === undefined ||
          val.priceDelta === null ||
          isNaN(Number(val.priceDelta)) ||
          Number(val.priceDelta) < 0
        ) {
          setError(
            `Harga tambahan untuk varian "${vName}" pada grup "${gName}" harus berupa angka valid >= 0.`
          );
          return;
        }
      }
    }

    setLoading(true);

    try {
      if (isEditMode && initialProduct) {
        // Edit payload preserves existing availability, highlight, and addons by omitting them
        const payload: UpdateProductInput = {
          id: initialProduct.id || initialProduct.dbId || initialProduct.slug,
          name: trimmedName,
          categoryId,
          description: description.trim(),
          price: numPrice,
          hpp: numHpp,
          images,
          optionGroups: optionGroups.map((g) => ({
            name: g.name.trim(),
            isRequired: g.isRequired,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            values: g.values.map((v) => ({
              name: v.name.trim(),
              priceDelta: Math.round(Number(v.priceDelta) || 0),
            })),
          })),
        };

        const result = await updateProductAction(payload);

        if (!result.success) {
          throw new Error(result.error || "Gagal memperbarui produk di database.");
        }

        setSuccessMessage(`Perubahan produk "${trimmedName}" berhasil disimpan!`);

        const catObj = categories.find((c) => c.id === categoryId);
        const resolvedSlug = result.slug || initialProduct.slug;
        const updatedUiProduct: Product = {
          id: result.productId || initialProduct.id,
          dbId: result.productId || initialProduct.dbId,
          slug: resolvedSlug,
          name: trimmedName,
          description: description.trim(),
          categoryId,
          categoryName: catObj?.name || initialProduct.categoryName || "",
          basePrice: numPrice,
          isAvailable: initialProduct.isAvailable ?? true,
          isArchived: false,
          isHighlight: initialProduct.isHighlight ?? false,
          images,
          hpp: numHpp,
          optionGroups: optionGroups.map((g, idx) => ({
            id: `opt-${idx}`,
            name: g.name.trim(),
            required: g.isRequired,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            values: g.values.map((v, vIdx) => ({
              id: `val-${vIdx}`,
              name: v.name.trim(),
              priceDelta: Math.round(Number(v.priceDelta) || 0),
            })),
          })),
          addons: initialProduct.addons || [],
        };

        onProductUpdated?.(updatedUiProduct);
        onClose();
      } else {
        // Safe explicit defaults for new product creation
        const payload: CreateProductInput = {
          name: trimmedName,
          categoryId,
          description: description.trim(),
          price: numPrice,
          hpp: numHpp,
          isAvailable: true,
          isHighlight: false,
          images,
          optionGroups: optionGroups.map((g) => ({
            name: g.name.trim(),
            isRequired: g.isRequired,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            values: g.values.map((v) => ({
              name: v.name.trim(),
              priceDelta: Math.round(Number(v.priceDelta) || 0),
            })),
          })),
        };

        const result = await createProductAction(payload);

        if (!result.success) {
          throw new Error(result.error || "Gagal menyimpan produk ke database.");
        }

        setSuccessMessage(`Produk "${trimmedName}" berhasil disimpan ke database!`);

        const catObj = categories.find((c) => c.id === categoryId);
        const resolvedSlug = result.slug || "produk";
        const newUiProduct: Product = {
          id: result.productId || resolvedSlug,
          dbId: result.productId,
          slug: resolvedSlug,
          name: trimmedName,
          description: description.trim(),
          categoryId,
          categoryName: catObj?.name || "",
          basePrice: numPrice,
          isAvailable: true,
          isArchived: false,
          isHighlight: false,
          images,
          hpp: numHpp,
          optionGroups: optionGroups.map((g, idx) => ({
            id: `opt-${idx}`,
            name: g.name.trim(),
            required: g.isRequired,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            values: g.values.map((v, vIdx) => ({
              id: `val-${vIdx}`,
              name: v.name.trim(),
              priceDelta: Math.round(Number(v.priceDelta) || 0),
            })),
          })),
          addons: [],
        };

        onProductCreated?.(newUiProduct);
        onClose();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menyimpan produk.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-landing-fade">
      <div className="bg-white border border-[#E5E5E5] rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col my-auto shadow-xl">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F25B09] flex items-center justify-center">
              {isEditMode ? (
                <Pencil className="w-4 h-4" />
              ) : (
                <UtensilsCrossed className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-[#111111]">
                  {isEditMode ? `Edit Menu: ${initialProduct?.name}` : "Tambah Menu Baru"}
                </h2>
                {isLoadingDetails && (
                  <span className="text-[10px] text-[#737373] bg-neutral-100 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Sinkron data...</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#737373]">
                {isEditMode
                  ? "Perbarui rincian produk menu di katalog"
                  : "Lengkapi data untuk menambahkan produk baru ke katalog"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#737373] hover:text-[#111111] hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-[#B42318] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold block">Gagal Menyimpan Produk</span>
                <span className="text-[11px] leading-relaxed block">{error}</span>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[#18794E] flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{successMessage}</span>
            </div>
          )}

          {/* ===================================================================
              BAGIAN 1: INFORMASI PRODUK
              =================================================================== */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 pb-1 border-b border-neutral-100 font-bold text-[#111111]">
              <Tag className="w-3.5 h-3.5 text-[#F25B09]" />
              <span>1. Informasi Produk</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="product-name" className="block font-semibold text-[#111111] mb-1">
                  Nama Produk <span className="text-red-500">*</span>
                </label>
                <input
                  id="product-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="cth: Nasi Bakar Tongkol Pedas"
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111]"
                />
              </div>

              <div>
                <label htmlFor="product-category" className="block font-semibold text-[#111111] mb-1">
                  Kategori Menu <span className="text-red-500">*</span>
                </label>
                <select
                  id="product-category"
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:border-[#111111]"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="product-description" className="block font-semibold text-[#111111] mb-1">
                Deskripsi Produk <span className="text-[11px] text-[#737373] font-normal">(Opsional)</span>
              </label>
              <textarea
                id="product-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="cth: Nasi bakar gurih beraroma daun pisang dengan isian suwiran ikan cakalang asap bumbu pedas khas Manado."
                className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] placeholder:text-[#737373] focus:border-[#111111] outline-none transition-colors resize-y leading-relaxed"
              />
            </div>
          </div>

          {/* ===================================================================
              BAGIAN 2: HARGA & HPP
              =================================================================== */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 pb-1 border-b border-neutral-100 font-bold text-[#111111]">
              <Lock className="w-3.5 h-3.5 text-[#18794E]" />
              <span>2. Harga & HPP</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#111111] mb-1">
                  Harga Jual Pelanggan (Rp) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => {
                    if (price !== "" && !isNaN(Number(price))) {
                      setPrice(String(Number(price)));
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs font-bold text-[#111111] focus:border-[#111111] outline-none"
                />
                <span className="text-[10px] text-[#737373] mt-0.5 block">
                  {formatRupiah(Number(price) || 0)}
                </span>
              </div>

              <div>
                <label className="block font-semibold text-[#111111] mb-1">
                  HPP per Porsi (Rp)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={hpp}
                  onChange={(e) => setHpp(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => {
                    if (hpp !== "" && !isNaN(Number(hpp))) {
                      setHpp(String(Number(hpp)));
                    }
                  }}
                  placeholder="12000"
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs font-mono text-[#111111] focus:border-[#111111] outline-none"
                />
                <span className="text-[10px] text-[#737373] mt-0.5 block">
                  {formatRupiah(Number(hpp) || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* ===================================================================
              BAGIAN 3: FOTO PRODUK
              =================================================================== */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 pb-1 border-b border-neutral-100 font-bold text-[#111111]">
              <ImageIcon className="w-3.5 h-3.5 text-[#F25B09]" />
              <span>3. Foto Produk</span>
            </div>

            {/* File Picker from Computer */}
            <div className="p-3.5 border border-dashed border-neutral-300 rounded-xl bg-neutral-50/50 hover:bg-neutral-50 transition-colors space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="font-bold text-[#111111] block">
                    Unggah Foto dari Komputer
                  </span>
                  <span className="text-[11px] text-[#737373] block">
                    Maksimal 2 MB (Format: JPG, PNG, WebP)
                  </span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="admin-product-file-picker"
                />

                <label
                  htmlFor="admin-product-file-picker"
                  className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    isUploadingImage
                      ? "bg-neutral-200 text-[#737373] cursor-not-allowed"
                      : "bg-[#111111] hover:bg-neutral-800 text-white"
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>
                    {isUploadingImage ? "Mengunggah Foto..." : "Pilih File Gambar"}
                  </span>
                </label>
              </div>

              {imageUploadError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[11px] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{imageUploadError}</span>
                </div>
              )}
            </div>

            {/* Current Selected Images Preview & Reorder */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#111111] block">
                  Foto Terpilih ({images.length})
                </span>
                <span className="text-[10px] text-[#737373]">
                  Foto bertanda &ldquo;UTAMA&rdquo; tampil di etalase toko.
                </span>
              </div>

              {images.length === 0 ? (
                <div className="p-4 border border-dashed border-neutral-300 rounded-xl bg-neutral-50 text-center text-xs text-[#737373]">
                  Belum ada foto yang dipilih. Silakan unggah foto produk dari komputer.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {images.map((imgUrl, idx) => (
                    <div
                      key={idx}
                      className={`relative rounded-xl border overflow-hidden p-1.5 flex flex-col justify-between gap-1.5 transition-colors ${
                        idx === 0
                          ? "border-[#F25B09] bg-orange-50/20 ring-1 ring-[#F25B09]/30"
                          : "border-neutral-200 bg-white"
                      }`}
                    >
                      <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-neutral-100">
                        <Image
                          src={imgUrl}
                          alt={`Foto ${idx + 1}`}
                          fill
                          unoptimized
                          className="object-cover"
                          sizes="120px"
                        />
                        {idx === 0 ? (
                          <span className="absolute top-1.5 left-1.5 bg-[#F25B09] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                            UTAMA
                          </span>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 hover:bg-red-600 text-white transition-colors cursor-pointer"
                          title="Hapus foto ini"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-[#737373] truncate font-mono">
                          {imgUrl.split("/").pop()}
                        </span>
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMakePrimary(idx)}
                            className="text-[10px] text-[#F25B09] hover:underline font-semibold whitespace-nowrap cursor-pointer"
                          >
                            Jadikan Utama
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ===================================================================
              BAGIAN 4: VARIAN & PILIHAN OPSI
              =================================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-100 font-bold text-[#111111]">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#F25B09]" />
                <span>4. Varian & Pilihan Opsi ({optionGroups.length})</span>
              </div>
              <button
                type="button"
                onClick={handleAddOptionGroup}
                className="inline-flex items-center gap-1 text-[11px] text-[#F25B09] hover:underline font-semibold cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Tambah Grup Opsi</span>
              </button>
            </div>

            {optionGroups.length === 0 ? (
              <p className="text-[11px] text-[#737373] italic">
                Menu ini belum memiliki grup opsi. Klik &ldquo;Tambah Grup Opsi&rdquo; jika produk memerlukan pilihan varian seperti level pedas atau porsi.
              </p>
            ) : (
              <div className="space-y-2.5">
                {optionGroups.map((group, gIdx) => (
                  <div
                    key={gIdx}
                    className="p-3.5 rounded-xl border border-neutral-200 bg-[#FAF9F8] space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={group.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOptionGroups((prev) =>
                            prev.map((g, i) => (i === gIdx ? { ...g, name: val } : g))
                          );
                        }}
                        placeholder="Nama grup opsi (cth: Level Pedas)"
                        className="px-2.5 py-1.5 bg-white border border-[#E5E5E5] rounded-lg text-xs font-bold text-[#111111] flex-1"
                      />

                      <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#111111] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={group.isRequired}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setOptionGroups((prev) =>
                              prev.map((g, i) =>
                                i === gIdx ? { ...g, isRequired: checked } : g
                              )
                            );
                          }}
                          className="rounded text-[#F25B09]"
                        />
                        <span>Wajib</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleRemoveOptionGroup(gIdx)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Hapus grup ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Option Values List */}
                    <div className="space-y-2 pl-2 border-l-2 border-neutral-300">
                      <span className="text-[10px] text-[#737373] uppercase font-bold tracking-wider">
                        Pilihan Nilai Varian:
                      </span>
                      {group.values.map((val, vIdx) => (
                        <div key={vIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={val.name}
                            onChange={(e) => {
                              const n = e.target.value;
                              setOptionGroups((prev) =>
                                prev.map((g, i) => {
                                  if (i !== gIdx) return g;
                                  return {
                                    ...g,
                                    values: g.values.map((v, vi) =>
                                      vi === vIdx ? { ...v, name: n } : v
                                    ),
                                  };
                                })
                              );
                            }}
                            placeholder="Nama varian (cth: Level 1)"
                            className="flex-1 px-2 py-1 bg-white border border-[#E5E5E5] rounded-lg text-[11px] text-[#111111]"
                          />
                          <div className="flex items-center gap-1.5 w-28 sm:w-32">
                            <span className="text-[10px] text-[#737373] flex-shrink-0">+Rp</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={val.priceDelta}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/[^0-9]/g, "");
                                setOptionGroups((prev) =>
                                  prev.map((g, i) => {
                                    if (i !== gIdx) return g;
                                    return {
                                      ...g,
                                      values: g.values.map((v, vi) =>
                                        vi === vIdx ? { ...v, priceDelta: cleaned } : v
                                      ),
                                    };
                                  })
                                );
                              }}
                              onBlur={() => {
                                if (val.priceDelta !== "" && !isNaN(Number(val.priceDelta))) {
                                  const normalized = String(Number(val.priceDelta));
                                  if (normalized !== String(val.priceDelta)) {
                                    setOptionGroups((prev) =>
                                      prev.map((g, i) => {
                                        if (i !== gIdx) return g;
                                        return {
                                          ...g,
                                          values: g.values.map((v, vi) =>
                                            vi === vIdx ? { ...v, priceDelta: normalized } : v
                                          ),
                                        };
                                      })
                                    );
                                  }
                                }
                              }}
                              placeholder="0"
                              className="w-full px-2 py-1.5 bg-white border border-[#E5E5E5] rounded-lg text-[11px] text-[#111111] focus:border-[#111111] outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveOptionValue(gIdx, vIdx)}
                            className="p-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleAddOptionValue(gIdx)}
                        className="text-[10px] text-[#F25B09] hover:underline font-semibold cursor-pointer"
                      >
                        + Tambah Opsi
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E5E5E5]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#737373] hover:text-[#111111] transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEditMode ? "Menyimpan Perubahan..." : "Menyimpan ke Supabase..."}</span>
                </>
              ) : (
                <>
                  {isEditMode ? (
                    <Pencil className="w-3.5 h-3.5" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>{isEditMode ? "Simpan Perubahan" : "Simpan Produk"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
