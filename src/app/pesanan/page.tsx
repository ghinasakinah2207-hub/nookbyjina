"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ReceiptText,
  ChevronRight,
  Clock,
  QrCode,
  RefreshCw,
  MessageCircle,
  X,
  ShieldAlert,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { StatusBadge } from "@/components/ui/Badge";
import { useOrder } from "@/context/OrderContext";
import { formatRupiah, STORE_SETTINGS } from "@/data/dummy-data";
import { getOrderToken } from "@/lib/order-token-vault";
import { Order } from "@/types";

export default function OrderHistoryPage() {
  const { orders, isHydrated, syncWithServer } = useOrder();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [restrictedOrder, setRestrictedOrder] = useState<Order | null>(null);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      await syncWithServer();
    } catch {
      setSyncError("Gagal menghubungi server untuk memperbarui riwayat pesanan.");
    } finally {
      setIsSyncing(false);
    }
  };

  const storePhone = STORE_SETTINGS.adminWhatsapp.replace(/[^0-9]/g, "");

  return (
    <div className="min-h-screen pb-24 bg-[#F6F6F7]">
      <Header
        title="Riwayat Pesanan"
        subtitle="Tersimpan di browser perangkat ini"
        showBack={false}
      />

      <main className="max-w-md mx-auto px-4 pt-4 space-y-2.5">
        {!isHydrated ? (
          <div className="p-8 text-center bg-white rounded-2xl space-y-3 my-8">
            <p className="text-xs text-[#737373]">Memuat riwayat pesanan...</p>
          </div>
        ) : orders.length === 0 ? (
          /* Empty State */
          <div className="p-8 text-center bg-white rounded-2xl space-y-4 my-8">
            <div className="w-16 h-16 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-[#737373]">
              <ReceiptText className="w-8 h-8 stroke-[1.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#111111]">
                Belum ada riwayat pesanan
              </h2>
              <p className="text-xs text-[#737373] mt-1">
                Pesanan yang Anda buat di browser ini akan otomatis tersimpan di sini.
              </p>
            </div>
            <Link
              href="/menu"
              className="inline-flex items-center justify-center min-h-[48px] px-6 py-2.5 bg-[#F25B09] hover:bg-[#D94D06] text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Mulai Pesan Sekarang
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {syncError ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-[#B42318]">
                <span>{syncError}</span>
                <button
                  type="button"
                  onClick={handleManualSync}
                  className="font-semibold underline ml-2 shrink-0"
                >
                  Coba lagi
                </button>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-xs text-[#737373] px-1">
              <span>{orders.length} pesanan tercatat di perangkat ini</span>
              <button
                type="button"
                onClick={handleManualSync}
                aria-label="Segarkan riwayat pesanan"
                className={`p-1 text-[#737373] hover:text-[#111111] flex items-center gap-1 ${
                  isSyncing ? "animate-spin text-[#F25B09]" : ""
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {orders.map((order) => {
              const dateObj = new Date(order.createdAt);
              const formattedDate = dateObj.toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              const formattedTime = dateObj.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              }) + " WIB";

              // Resolve raw authorization token from order object or client token vault
              const resolvedToken = order.token || getOrderToken(order.id) || "";

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl p-4 space-y-3"
                >
                  {/* Card Header: Order ID & Time */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-[#111111] block">
                        {order.id}
                      </span>
                      <span className="text-[11px] text-[#737373] flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formattedDate}, {formattedTime}
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={order.orderStatus} />
                      <StatusBadge status={order.paymentStatus} type="payment" />
                    </div>
                  </div>

                  {/* Items summary */}
                  <div className="pt-2 border-t border-[#E5E5E5]/60 text-xs text-[#737373] space-y-0.5">
                    {order.items.slice(0, 2).map((item) => (
                      <div key={item.id} className="flex justify-between">
                        <span className="truncate pr-2">
                          {item.quantity}x {item.productName}
                        </span>
                        <span className="font-medium text-[#111111] flex-shrink-0">
                          {formatRupiah(item.itemTotal)}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 2 ? (
                      <span className="text-[11px] text-[#737373] italic">
                        +{order.items.length - 2} menu lainnya...
                      </span>
                    ) : null}
                  </div>

                  {/* Total & Action Links */}
                  <div className="pt-2 border-t border-[#E5E5E5] flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-[#737373] block leading-none">
                        Total Pesanan
                      </span>
                      <span className="text-sm font-bold text-[#111111] mt-0.5 block">
                        {formatRupiah(order.total)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {order.paymentStatus === "Menunggu Verifikasi" &&
                      (order.paymentMethod === "QRIS Statis" || !order.paymentMethod) ? (
                        <Link
                          href={`/pembayaran/${order.id}`}
                          className="px-2.5 py-1.5 bg-orange-50 text-[#F25B09] border border-orange-200 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-orange-100"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Bayar</span>
                        </Link>
                      ) : null}

                      {resolvedToken ? (
                        <Link
                          href={`/pesanan/${resolvedToken}`}
                          className="px-3 py-1.5 bg-neutral-50 text-[#111111] border border-[#E5E5E5] rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-neutral-100"
                        >
                          <span>Detail</span>
                          <ChevronRight className="w-3.5 h-3.5 text-[#737373]" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRestrictedOrder(order)}
                          className="px-3 py-1.5 bg-neutral-50 text-[#737373] border border-[#E5E5E5] rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-neutral-100 cursor-pointer"
                        >
                          <span>Detail</span>
                          <ChevronRight className="w-3.5 h-3.5 text-[#A3A3A3]" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Explaining why an order without an access token cannot be opened directly */}
        {restrictedOrder && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <button
                  type="button"
                  onClick={() => setRestrictedOrder(null)}
                  className="p-1 rounded-lg hover:bg-neutral-100 text-[#737373]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-[#111111]">
                  Akses Pesanan Terbatas
                </h3>
                <p className="text-xs text-[#737373] leading-relaxed">
                  Pesanan <span className="font-mono font-bold text-[#111111]">{restrictedOrder.id}</span> tercatat di riwayat, namun token otorisasi rahasia tidak ditemukan di browser ini.
                </p>
                <p className="text-xs text-[#737373] leading-relaxed">
                  Demi perlindungan privasi dan keamanan data pembeli, rincian detail tidak dibuka secara publik tanpa token akses. Anda dapat langsung mengonfirmasi status ke admin toko via WhatsApp.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <a
                  href={`https://wa.me/${storePhone}?text=${encodeURIComponent(
                    `Halo admin Nook by Jina, saya ingin menanyakan status pesanan ${restrictedOrder.id}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] px-4 py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Tanya Status via WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={() => setRestrictedOrder(null)}
                  className="w-full min-h-[40px] px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-[#111111] text-xs font-semibold rounded-xl transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNavigation />
    </div>
  );
}


