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
import { OrdersSkeleton } from "@/components/ui/CustomerSkeletons";
import { OrderProgressTracker } from "@/components/orders/OrderProgressTracker";
import { useOrder } from "@/context/OrderContext";
import { formatRupiah, STORE_SETTINGS } from "@/data/dummy-data";
import { getOrderToken } from "@/lib/order-token-vault";
import { isOrderExpired } from "@/lib/order-normalizer";
import { Order } from "@/types";

export default function OrderHistoryPage() {
  const { orders, isHydrated, syncWithServer } = useOrder();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [restrictedOrder, setRestrictedOrder] = useState<Order | null>(null);
  const [liveAdminWhatsapp, setLiveAdminWhatsapp] = useState<string>("");

  React.useEffect(() => {
    let isMounted = true;
    async function loadLiveSettings() {
      try {
        const res = await fetch("/api/store-settings", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.success && data.settings?.adminWhatsapp) {
          setLiveAdminWhatsapp(data.settings.adminWhatsapp);
        }
      } catch {
        // Fallback silently
      }
    }
    loadLiveSettings();
    return () => {
      isMounted = false;
    };
  }, []);

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

  const rawStorePhone = liveAdminWhatsapp || STORE_SETTINGS.adminWhatsapp;
  const cleanPhoneDigits = rawStorePhone.replace(/[^0-9]/g, "");
  const storePhone = cleanPhoneDigits.startsWith("0")
    ? "62" + cleanPhoneDigits.slice(1)
    : cleanPhoneDigits;

  return (
    <div className="min-h-screen pb-24 bg-[#F6F6F7]">
      <Header
        title="Riwayat Pesanan"
        subtitle="Tersimpan di browser perangkat ini"
        showBack={false}
      />

      <main className="max-w-md mx-auto px-4 pt-4 space-y-2.5">
        {!isHydrated ? (
          <div className="animate-landing-fade">
            <OrdersSkeleton showHeader={false} />
          </div>
        ) : orders.length === 0 ? (
          /* Empty State */
          <div className="p-8 text-center bg-white rounded-2xl border border-[#E2DFDA] space-y-4 my-8">
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
              const isCancelled =
                order.orderStatus === "Dibatalkan" ||
                order.paymentStatus === "Dibatalkan" ||
                isOrderExpired(order);

              return (
                <div
                  key={order.id}
                  className="rounded-2xl bg-gradient-to-r from-[#21100C] via-[#35170E] to-[#54220F] border border-white/10 shadow-md shadow-black/25 p-4 space-y-3 text-white transition-all select-none"
                >
                  {/* Card Header: Order ID & Time */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-white block">
                        {order.id}
                      </span>
                      <span className="text-[11px] text-white/60 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-white/50" />
                        {formattedDate}, {formattedTime}
                      </span>
                    </div>

                    <div className="flex items-center">
                      <StatusBadge
                        status={isCancelled ? "Dibatalkan" : order.orderStatus}
                        showDot={false}
                        variant="dark"
                      />
                    </div>
                  </div>

                  {/* Horizontal Order Progress Tracker */}
                  <OrderProgressTracker order={order} variant="dark" />

                  {/* Items summary */}
                  <div className="pt-2 border-t border-white/10 text-xs text-white/70 space-y-0.5">
                    {order.items.slice(0, 2).map((item) => (
                      <div key={item.id} className="flex justify-between">
                        <span className="truncate pr-2 text-white/80">
                          {item.quantity}x {item.productName}
                        </span>
                        <span className="font-medium text-white flex-shrink-0">
                          {formatRupiah(item.itemTotal)}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 2 ? (
                      <span className="text-[11px] text-white/50 italic">
                        +{order.items.length - 2} menu lainnya...
                      </span>
                    ) : null}
                  </div>

                  {/* Total & Action Links */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-white/60 block leading-none">
                        Total Pesanan
                      </span>
                      <span className="text-sm font-extrabold text-white mt-0.5 block">
                        {formatRupiah(order.total)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {order.paymentStatus === "Menunggu Verifikasi" &&
                      (order.paymentMethod === "QRIS Statis" || !order.paymentMethod) ? (
                        <Link
                          href={`/pembayaran/${order.id}`}
                          className="px-2.5 py-1.5 bg-[#F25B09] hover:bg-[#D94D06] text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Bayar</span>
                        </Link>
                      ) : null}

                      {resolvedToken ? (
                        <Link
                          href={`/pesanan/${resolvedToken}`}
                          className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white border border-white/10 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs"
                        >
                          <span>Detail</span>
                          <ChevronRight className="w-3.5 h-3.5 text-white/70" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRestrictedOrder(order)}
                          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/50 border border-white/10 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>Detail</span>
                          <ChevronRight className="w-3.5 h-3.5 text-white/40" />
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


