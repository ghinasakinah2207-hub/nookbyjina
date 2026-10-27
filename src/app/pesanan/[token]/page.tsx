"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Clock,
  Copy,
  Share2,
  AlertCircle,
  QrCode,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatusBadge } from "@/components/ui/Badge";
import { useOrder } from "@/context/OrderContext";
import { formatRupiah, STORE_SETTINGS } from "@/data/dummy-data";
import { saveOrderToken, getOrderToken } from "@/lib/order-token-vault";
import { isPendingQrisStatus, isPendingCashStatus, isOrderExpired } from "@/lib/order-normalizer";
import { Order } from "@/types";
import { Suspense } from "react";

function OrderDetailContent() {
  const params = useParams();
  const router = useRouter();
  const rawParam = decodeURIComponent((params?.token as string) || "").trim();

  const { orders, getOrderByToken, addOrder } = useOrder();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isOrderIdParam, setIsOrderIdParam] = useState<boolean>(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "failed">("idle");
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Authoritative server fetch for order details
  const fetchOrder = useCallback(
    async (showSpinner = false) => {
      if (!rawParam) {
        setLoading(false);
        setFetchError("Token akses tidak disertakan.");
        return;
      }

      // Check if parameter is actually an order ID (e.g. TJ-261025-006) rather than a token
      if (rawParam.startsWith("TJ-")) {
        const vaultToken = getOrderToken(rawParam);
        if (vaultToken) {
          if (router) {
            router.replace(`/pesanan/${vaultToken}`);
            return;
          }
        }
        setIsOrderIdParam(true);
        setLoading(false);
        return;
      }

      if (showSpinner) setIsRefreshing(true);
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(rawParam)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok && data.success && data.order) {
          const loadedOrder: Order = {
            ...data.order,
            token: rawParam,
          };
          saveOrderToken(loadedOrder.id, rawParam);
          addOrder(loadedOrder);
          setOrder(loadedOrder);
          setFetchError(null);
          setLastRefreshed(new Date());
        } else {
          // Fallback to local order reference only if server reports 404/error but local cache exists
          const local =
            getOrderByToken(rawParam) ||
            orders.find((o) => o.token === rawParam);
          if (local) {
            setOrder(local);
            setFetchError(null);
          } else {
            setFetchError(
              data.error || "Pesanan tidak ditemukan atau tautan akses tidak valid."
            );
          }
        }
      } catch {
        const local =
          getOrderByToken(rawParam) ||
          orders.find((o) => o.token === rawParam);
        if (local) {
          setOrder(local);
          setFetchError(null);
        } else {
          setFetchError("Gagal menghubungi server untuk memuat rincian pesanan.");
        }
      } finally {
        setLoading(false);
        if (showSpinner) setIsRefreshing(false);
      }
    },
    [rawParam, router, getOrderByToken, orders, addOrder]
  );

  // Initial load
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!rawParam) {
        setLoading(false);
        setFetchError("Token akses tidak disertakan.");
        return;
      }

      if (rawParam.startsWith("TJ-")) {
        const vaultToken = getOrderToken(rawParam);
        if (vaultToken) {
          if (router) {
            router.replace(`/pesanan/${vaultToken}`);
            return;
          }
        }
        if (!cancelled) {
          setIsOrderIdParam(true);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(rawParam)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success && data.order) {
          const loadedOrder: Order = {
            ...data.order,
            token: rawParam,
          };
          saveOrderToken(loadedOrder.id, rawParam);
          addOrder(loadedOrder);
          setOrder(loadedOrder);
          setFetchError(null);
          setLastRefreshed(new Date());
        } else {
          const local =
            getOrderByToken(rawParam) ||
            orders.find((o) => o.token === rawParam);
          if (local) {
            setOrder(local);
            setFetchError(null);
          } else {
            setFetchError(
              data.error || "Pesanan tidak ditemukan atau tautan akses tidak valid."
            );
          }
        }
      } catch {
        if (cancelled) return;
        const local =
          getOrderByToken(rawParam) ||
          orders.find((o) => o.token === rawParam);
        if (local) {
          setOrder(local);
          setFetchError(null);
        } else {
          setFetchError("Gagal menghubungi server untuk memuat rincian pesanan.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [rawParam, router, getOrderByToken, orders, addOrder]);

  // Real 15-second polling when tab is active and order is not terminal per PRD Section 14
  useEffect(() => {
    if (!order) return;
    if (order.orderStatus === "Selesai" || order.orderStatus === "Dibatalkan") {
      return; // Stop polling permanently on terminal states
    }

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchOrder(false);
      }
    }, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchOrder(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [order, fetchOrder]);

  const handleManualRefresh = () => {
    fetchOrder(true);
  };

  const handleCopyLink = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setCopyStatus("success");
      setTimeout(() => setCopyStatus("idle"), 2500);
    } catch {
      setCopyStatus("failed");
    }
  };

  const storePhone = STORE_SETTINGS.adminWhatsapp.replace(/[^0-9]/g, "");

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center p-6 text-center">
        <p className="text-xs text-[#737373]">Memuat rincian pesanan dari server...</p>
      </div>
    );
  }

  // Safe explanation for orderId-only parameter without token
  if (isOrderIdParam) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-base font-bold text-[#111111]">
          Tautan Akses Memerlukan Token Otorisasi
        </h1>
        <p className="text-xs text-[#737373] mt-2 mb-2 max-w-sm leading-relaxed">
          Tautan ini menggunakan nomor pesanan <span className="font-mono font-bold text-[#111111]">{rawParam}</span>, bukan token akses rahasia pelanggan.
        </p>
        <p className="text-xs text-[#737373] mb-6 max-w-sm leading-relaxed">
          Demi keamanan dan privasi pelanggan, detail pesanan tidak dibuka secara publik hanya berdasarkan nomor order. Buka halaman Riwayat Pesanan pada perangkat yang Anda gunakan saat memesan, atau hubungi admin toko via WhatsApp.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-xs">
          <a
            href={`https://wa.me/${storePhone}?text=${encodeURIComponent(
              `Halo admin Nook by Jina, saya ingin menanyakan status pesanan ${rawParam}.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full px-4 py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Tanya Admin via WhatsApp</span>
          </a>
          <Link
            href="/pesanan"
            className="w-full px-4 py-2.5 bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl flex items-center justify-center transition-colors"
          >
            Buka Riwayat Pesanan
          </Link>
        </div>
      </div>
    );
  }

  if (!order || fetchError) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-[#B42318] mb-3" />
        <h1 className="text-base font-bold text-[#111111]">
          Detail Pesanan Tidak Ditemukan
        </h1>
        <p className="text-xs text-[#737373] mt-1 mb-6 max-w-xs">
          {fetchError || `Token akses "${rawParam}" tidak valid atau telah kedaluwarsa.`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchOrder(false);
            }}
            className="px-4 py-2.5 bg-[#F25B09] hover:bg-[#D94D06] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Coba Lagi
          </button>
          <Link
            href="/pesanan"
            className="px-4 py-2.5 bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Lihat Riwayat Pesanan
          </Link>
        </div>
      </div>
    );
  }

  const dateObj = new Date(order.createdAt);
  const formattedDate = dateObj.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedTime = dateObj.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }) + " WIB";

  // WhatsApp digital receipt share text
  const receiptItemsText = order.items
    .map(
      (item) =>
        `• ${item.quantity}x ${item.productName} (${formatRupiah(item.itemTotal)})`
    )
    .join("\n");

  const waShareReceiptText = `*STRUK DIGITAL PESANAN — Nook by Jina*
------------------------------
No. Order: ${order.id}
Waktu: ${formattedDate}, ${formattedTime}
Status: ${order.orderStatus} (${order.paymentStatus})

*Rincian Menu:*
${receiptItemsText}

Subtotal: ${formatRupiah(order.subtotal)}
Ongkir (${order.deliveryArea}): ${
    order.shippingFee === 0 ? "Gratis" : formatRupiah(order.shippingFee)
  }
*TOTAL: ${formatRupiah(order.total)}*
Metode: ${order.paymentMethod === "Cash" ? "Cash (Bayar Tunai)" : `QRIS Statis (${order.merchantName || "Nook by Jina"})`}
------------------------------
Pantau status pesanan: ${typeof window !== "undefined" ? window.location.href : ""}
Terima kasih telah memesan di Nook by Jina!`;

  const waShareUrl = `https://wa.me/?text=${encodeURIComponent(
    waShareReceiptText
  )}`;

  return (
    <div className="min-h-screen pb-16 bg-[#F6F6F7]">
      <Header
        title="Detail Pesanan"
        showBack={true}
        backHref="/pesanan"
        showCart={false}
      />

      <main className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {/* Order Header Card */}
        <section className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] text-[#737373] block uppercase tracking-wider">
                Nomor Pesanan
              </span>
              <h1 className="text-xl font-bold font-mono text-[#111111] mt-0.5">
                {order.id}
              </h1>
              <p className="text-xs text-[#737373] flex items-center gap-1 mt-1">
                <Clock className="w-3.5 h-3.5" />
                {formattedDate}, {formattedTime}
              </p>
            </div>

            <button
              type="button"
              onClick={handleManualRefresh}
              aria-label="Segarkan status"
              className={`p-2 rounded-lg text-[#737373] hover:text-[#111111] hover:bg-neutral-100 ${
                isRefreshing ? "animate-spin text-[#F25B09]" : ""
              }`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Status Indicators */}
          <div className="pt-3 border-t border-[#E5E5E5] flex flex-wrap items-center gap-2">
            <StatusBadge status={isOrderExpired(order) ? "Dibatalkan" : order.orderStatus} type="order" />
            <StatusBadge status={isOrderExpired(order) ? "Dibatalkan" : order.paymentStatus} type="payment" />
          </div>

          <div className="text-[10px] text-[#737373] flex items-center justify-between pt-1">
            <span>Pemeriksaan otomatis setiap 15 detik</span>
            <span>
              Update:{" "}
              {lastRefreshed.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </section>

        {/* Payment Banner if pending, lunas, or expired */}
        {order.orderStatus === "Dibatalkan" || order.paymentStatus === "Dibatalkan" || isOrderExpired(order) ? (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-1 text-xs text-[#B42318]">
            <div className="flex items-center gap-1.5 font-semibold text-red-900">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>Pesanan Kedaluwarsa / Dibatalkan</span>
            </div>
            <p className="text-[11px] text-red-800 leading-relaxed">
              Batas waktu pembayaran QRIS (30 menit) telah berakhir atau pesanan telah dibatalkan oleh sistem.
            </p>
          </div>
        ) : isPendingQrisStatus(order.paymentStatus) ? (
          <div className="p-3.5 bg-[#FFF4E5] border border-[#FBD38D] rounded-xl flex items-center justify-between text-xs text-[#8A4B08]">
            <div>
              <p className="font-semibold">Pembayaran Menunggu Verifikasi</p>
              <p className="text-[11px] mt-0.5">
                Admin akan memverifikasi di mutasi DANA Bisnis.
              </p>
            </div>
            <Link
              href={`/pembayaran/${order.id}`}
              className="px-3 py-1.5 bg-[#F25B09] text-white rounded-lg font-semibold text-xs flex items-center gap-1 shrink-0"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QRIS</span>
            </Link>
          </div>
        ) : order.paymentMethod === "Cash" && isPendingCashStatus(order.paymentStatus) ? (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs text-[#8A4B08]">
            <div className="flex items-center gap-1.5 font-semibold text-amber-900">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Menunggu Pembayaran Tunai (Cash)</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              {order.fulfillmentType === "pickup"
                ? `Silakan siapkan uang pas ${formatRupiah(order.total)} dan bayar langsung di kasir saat mengambil pesanan di dapur Nook by Jina.`
                : `Silakan siapkan uang pas ${formatRupiah(order.total)} dan serahkan langsung ke kurir saat pesanan diantar ke lokasi Anda.`}
            </p>
          </div>
        ) : order.paymentStatus === "Lunas" ? (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-[#18794E]">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div>
              <p className="font-semibold">Pembayaran Terverifikasi Lunas</p>
              <p className="text-[11px] text-emerald-700">
                {order.paymentMethod === "Cash"
                  ? "Pembayaran tunai telah diterima dan dikonfirmasi kasir."
                  : "Pembayaran telah terverifikasi melalui DANA Bisnis."}
              </p>
            </div>
          </div>
        ) : null}

        {/* Items Breakdown (Digital Receipt) */}
        <section className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-[#111111] flex items-center justify-between">
            <span>Rincian Hidangan</span>
            <span className="text-xs font-normal text-[#737373]">
              {order.items.length} item
            </span>
          </h2>

          <div className="divide-y divide-[#E5E5E5]/60 text-xs">
            {order.items.map((item) => (
              <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-semibold text-[#111111]">
                    {item.quantity}x {item.productName}
                  </span>
                  <span className="font-bold text-[#111111]">
                    {formatRupiah(item.itemTotal)}
                  </span>
                </div>

                {item.selectedOptions.length > 0 ? (
                  <p className="text-[11px] text-[#737373]">
                    {item.selectedOptions
                      .map((o) => `${o.groupName || o.optionName}: ${o.valueName || o.optionValue}`)
                      .join(" • ")}
                  </p>
                ) : null}

                {item.selectedAddons.length > 0 ? (
                  <p className="text-[11px] text-[#737373]">
                    Ekstra:{" "}
                    {item.selectedAddons.map((a) => a.addonName).join(", ")}
                  </p>
                ) : null}

                {item.itemNote ? (
                  <p className="text-[11px] text-[#737373] italic">
                    Catatan menu: {item.itemNote}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Pricing Summary */}
          <div className="pt-3 border-t border-[#E5E5E5] space-y-1.5 text-xs">
            <div className="flex justify-between text-[#737373]">
              <span>Subtotal Menu</span>
              <span className="font-medium text-[#111111]">
                {formatRupiah(order.subtotal)}
              </span>
            </div>

            <div className="flex justify-between text-[#737373]">
              <span>Biaya Pengantaran ({order.deliveryArea})</span>
              <span className="font-medium text-[#111111]">
                {order.shippingFee === 0 ? "Gratis" : formatRupiah(order.shippingFee)}
              </span>
            </div>

            <div className="pt-2 border-t border-[#E5E5E5] flex justify-between text-sm font-bold text-[#111111]">
              <span>Total Akhir</span>
              <span className="text-[#F25B09] font-extrabold text-base">
                {formatRupiah(order.total)}
              </span>
            </div>
          </div>
        </section>

        {/* Fulfillment & Payment Method Info */}
        <section className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-2 text-xs text-[#737373]">
          <h2 className="text-sm font-bold text-[#111111]">
            Informasi Pemenuhan & Pembayaran
          </h2>
          <div className="space-y-1 pt-1">
            <p>
              • <strong>Tipe Pemenuhan:</strong>{" "}
              {order.fulfillmentType === "pickup"
                ? "Ambil Sendiri di Dapur (Pickup)"
                : `Delivery ke ${order.deliveryArea}`}
            </p>
            <p>
              • <strong>Metode Pembayaran:</strong>{" "}
              {order.paymentMethod === "Cash"
                ? "Cash (Bayar Tunai)"
                : `QRIS Statis Merchant (${order.merchantName || "DANA Bisnis"})`}
            </p>
            {order.orderNote ? (
              <p>
                • <strong>Catatan Pesanan:</strong> {order.orderNote}
              </p>
            ) : null}
          </div>
        </section>

        {/* Share Token Link Box & Security Note */}
        <section className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#111111] flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-[#F25B09]" />
              Bagikan Struk / Tautan Pesanan
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="min-h-[44px] px-3 py-2 bg-neutral-50 hover:bg-neutral-100 border border-[#E5E5E5] text-[#111111] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copyStatus === "success" ? "Tautan Tersalin!" : "Salin Tautan"}</span>
            </button>

            <a
              href={waShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-3 py-2 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Kirim Struk WA</span>
            </a>
          </div>

          {copyStatus === "success" ? (
            <p className="text-[11px] text-[#18794E]">
              Tautan pesanan berhasil disalin.
            </p>
          ) : copyStatus === "failed" ? (
            <p className="text-[11px] text-[#B42318]">
              Tautan belum tersalin. Silakan salin alamat dari bilah peramban secara manual.
            </p>
          ) : null}

          {/* Mandatory Privacy Reminder per PRD Section 14 */}
          <div className="p-3 bg-neutral-50 rounded-xl border border-[#E5E5E5] text-[11px] text-[#737373] leading-relaxed">
            <p>
              <strong>Perhatian Privasi:</strong> Tautan ini dapat dibuka oleh siapa saja yang memilikinya. Nama dan nomor telepon Anda disembunyikan untuk menjaga privasi. Jangan bagikan tautan ini kepada pihak yang tidak berhak.
            </p>
          </div>
        </section>

        {/* Back to Home CTA */}
        <div className="pt-0.5">
          <Link
            href="/home"
            className="w-full min-h-[44px] px-4 py-2.5 bg-white border border-[#E5E5E5] text-[#111111] hover:bg-neutral-50 font-semibold text-xs rounded-xl flex items-center justify-center transition-colors"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center text-xs text-[#737373]">
          Memuat rincian pesanan...
        </div>
      }
    >
      <OrderDetailContent />
    </Suspense>
  );
}

