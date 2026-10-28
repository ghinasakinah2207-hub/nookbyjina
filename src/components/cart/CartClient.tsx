"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  Edit2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { useCart } from "@/context/CartContext";
import { formatRupiah } from "@/data/dummy-data";

interface CartClientProps {
  storeOpen?: boolean;
}

export default function CartClient({ storeOpen = true }: CartClientProps) {
  const router = useRouter();
  const {
    cart,
    updateQuantity,
    updateItemNote,
    removeFromCart,
    clearCart,
    subtotal,
    hasSoldOutItem,
    orderNote,
    setOrderNote,
  } = useCart();

  // State for editing note inline
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  // State for clearing cart confirmation dialog
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleStartEditNote = (itemId: string, currentNote: string) => {
    setEditingItemId(itemId);
    setEditingNoteText(currentNote);
  };

  const handleSaveNote = (itemId: string) => {
    updateItemNote(itemId, editingNoteText);
    setEditingItemId(null);
  };

  const handleProceedToCheckout = () => {
    if (!storeOpen || hasSoldOutItem) return;
    router.push("/checkout");
  };

  const handleConfirmClear = () => {
    clearCart();
    setShowClearConfirm(false);
  };

  return (
    <div className="min-h-screen pb-32 bg-[#F6F6F7]">
      <Header
        title={`Keranjang (${cart.length})`}
        showBack={false}
        rightAction={
          cart.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 text-xs text-[#737373] hover:text-[#B42318] transition-colors py-1.5 px-2 rounded-lg hover:bg-black/5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua</span>
            </button>
          ) : null
        }
      />

      {/* Confirmation Dialog for Hapus Semua */}
      {showClearConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-xs w-full p-5 space-y-4 border border-[#E5E5E5]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-cart-title"
          >
            <div className="space-y-1.5 text-center">
              <div className="w-10 h-10 rounded-full bg-red-50 text-[#B42318] mx-auto flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 id="clear-cart-title" className="text-sm font-bold text-[#111111]">
                Hapus Semua Menu?
              </h3>
              <p className="text-xs text-[#737373] leading-relaxed">
                Semua menu di dalam keranjang akan dihapus. Aksi ini tidak dapat dibatalkan.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 min-h-[40px] px-3 py-2 border border-[#E5E5E5] rounded-xl text-xs font-semibold text-[#737373] hover:text-[#111111] hover:bg-neutral-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                className="flex-1 min-h-[40px] px-3 py-2 bg-[#B42318] hover:bg-[#911d13] text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Hapus Semua
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="max-w-md mx-auto px-4 pt-4 space-y-2.5">
        {/* Warning if store is closed */}
        {!storeOpen ? (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-landing-fade">
            <AlertTriangle className="w-5 h-5 text-[#B42318] flex-shrink-0 mt-0.5" />
            <div className="text-xs text-[#B42318] space-y-1">
              <p className="font-semibold">
                Toko Sedang Close Order
              </p>
              <p>
                Pemesanan baru sedang ditutup sementara oleh pemilik toko. Checkout dinonaktifkan.
              </p>
            </div>
          </div>
        ) : null}

        {cart.length === 0 ? (
          /* Empty State */
          <div className="p-8 text-center bg-white border border-[#E5E5E5] rounded-2xl space-y-4 my-8">
            <div className="w-16 h-16 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-[#737373]">
              <ShoppingBag className="w-8 h-8 stroke-[1.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#111111]">
                Keranjangmu masih kosong
              </h2>
              <p className="text-xs text-[#737373] mt-1">
                Yuk jelajahi menu makanan homemade lezat dari Nook by Jina!
              </p>
            </div>
            <Link
              href="/menu"
              className="inline-flex items-center justify-center min-h-[48px] px-6 py-2.5 bg-[#F25B09] hover:bg-[#D94D06] text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Lihat Menu Sekarang
            </Link>
          </div>
        ) : (
          <>

            {/* Warning if there are sold-out items */}
            {hasSoldOutItem ? (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#B42318] flex-shrink-0 mt-0.5" />
                <div className="text-xs text-[#B42318] space-y-1">
                  <p className="font-semibold">
                    Terdapat menu yang sedang habis di keranjangmu!
                  </p>
                  <p>
                    Silakan hapus menu yang habis terlebih dahulu sebelum melanjutkan ke checkout.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Cart Items List */}
            <div className="space-y-2">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white border rounded-2xl p-3.5 space-y-3 transition-colors ${
                    !item.isAvailable
                      ? "border-red-300 bg-red-50/20"
                      : "border-[#E5E5E5]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-neutral-100 flex-shrink-0">
                      <Image
                        src={item.productImage}
                        alt={item.productName}
                        fill
                        className={`object-cover ${!item.isAvailable ? "grayscale opacity-75" : ""}`}
                        sizes="80px"
                      />
                      {!item.isAvailable ? (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded">
                            Habis
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[#111111] leading-snug">
                          {item.productName}
                        </h3>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          aria-label={`Hapus ${item.productName}`}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-[#737373] hover:text-[#B42318]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Selected Options & Addons */}
                      <div className="text-[11px] text-[#737373] mt-1 space-y-0.5">
                        {item.selectedOptions.map((opt) => (
                          <div key={opt.groupId || opt.optionName || opt.valueId}>
                            • {opt.groupName || opt.optionName}: <span className="text-[#111111]">{opt.valueName || opt.optionValue}</span>
                          </div>
                        ))}
                        {item.selectedAddons.length > 0 ? (
                          <div>
                            • Tambahan:{" "}
                            <span className="text-[#111111]">
                              {item.selectedAddons.map((a) => a.addonName).join(", ")}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      {/* Unit Price */}
                      <div className="mt-2 text-xs font-semibold text-[#111111]">
                        {formatRupiah(item.unitPrice)} / porsi
                      </div>
                    </div>
                  </div>

                  {/* Note Row / Edit Note */}
                  <div className="pt-2 border-t border-[#E5E5E5] text-xs">
                    {editingItemId === item.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-[#737373]">
                          <span>Ubah catatan menu (maks 200 huruf):</span>
                          <span>{editingNoteText.length}/200</span>
                        </div>
                        <input
                          type="text"
                          value={editingNoteText}
                          onChange={(e) =>
                            setEditingNoteText(e.target.value.slice(0, 200))
                          }
                          placeholder="Tulis catatan untuk menu ini..."
                          className="w-full h-9 px-2.5 bg-neutral-50 border border-[#E5E5E5] rounded-lg text-xs text-[#111111] focus:outline-hidden focus:border-[#F25B09]"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingItemId(null)}
                            className="px-2.5 py-1 text-xs text-[#737373] hover:text-[#111111]"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveNote(item.id)}
                            className="px-3 py-1 bg-[#111111] text-white text-xs font-medium rounded-md"
                          >
                            Simpan
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[#737373]">
                        <span className="truncate flex-1 text-[11px]">
                          Catatan:{" "}
                          <span className="text-[#111111]">
                            {item.itemNote || "—"}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleStartEditNote(item.id, item.itemNote)
                          }
                          className="text-[#F25B09] hover:underline text-[11px] font-medium flex items-center gap-1 ml-2 flex-shrink-0"
                        >
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Item Total & Quantity Controls */}
                  <div className="pt-2 border-t border-[#E5E5E5] flex items-center justify-between">
                    <span className="text-sm font-bold text-[#111111]">
                      Subtotal: {formatRupiah(item.itemTotal)}
                    </span>

                    <div className="flex items-center border border-[#E5E5E5] rounded-xl p-0.5 bg-neutral-50">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        aria-label="Kurangi kuantitas"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#111111] hover:bg-white min-h-[32px] min-w-[32px]"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center text-xs font-semibold text-[#111111]">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        aria-label="Tambah kuantitas"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#111111] hover:bg-white min-h-[32px] min-w-[32px]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* General Order Note */}
            <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="generalOrderNote"
                  className="text-xs font-semibold text-[#111111]"
                >
                  Catatan untuk Seluruh Pesanan (Opsional)
                </label>
                <span className="text-[11px] text-[#737373]">
                  {orderNote.length}/200
                </span>
              </div>
              <textarea
                id="generalOrderNote"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="Misal: Harap dikirim sendok tambahan..."
                rows={2}
                className="w-full p-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] placeholder:text-[#737373] focus:outline-hidden focus:border-[#F25B09]"
              />
            </div>
          </>
        )}
      </main>

      {/* Sticky Bottom Bar for Checkout */}
      {cart.length > 0 ? (
        <div className="fixed bottom-16 left-0 right-0 z-40 bg-white border-t border-[#E5E5E5]">
          <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <span className="text-[11px] text-[#737373] block leading-none">
                Total Pembayaran
              </span>
              <span className="text-base font-bold text-[#111111] leading-tight">
                {formatRupiah(subtotal)}
              </span>
            </div>

            <button
              type="button"
              disabled={hasSoldOutItem || !storeOpen}
              onClick={handleProceedToCheckout}
              className={`min-h-[48px] px-5 py-3 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors ${
                !hasSoldOutItem && storeOpen
                  ? "bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] text-white"
                  : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
              }`}
            >
              <span>{storeOpen ? "Lanjut ke Checkout" : "Toko Close Order"}</span>
              {storeOpen && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : null}

      <BottomNavigation />
    </div>
  );
}

