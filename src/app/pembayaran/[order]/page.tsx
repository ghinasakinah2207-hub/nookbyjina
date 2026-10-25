"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Clock,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  Copy,
  ChevronRight,
  Info,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatusBadge } from "@/components/ui/Badge";
import { useOrder } from "@/context/OrderContext";
import { formatRupiah, STORE_SETTINGS } from "@/data/dummy-data";
import { StoreSettings } from "@/types";
import { getOrderToken } from "@/lib/order-token-vault";

function PaymentContent() {
  const params = useParams();
  const router = useRouter();
  const orderId = decodeURIComponent((params?.order as string) || "");

  const { orders, getOrderById, updateOrderStatus, isHydrated, addOrder } = useOrder();

  // Store settings loaded live from backend/API
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Authoritative server-time offset (serverTime - localTime) in ms
  const serverOffsetRef = React.useRef<number>(0);

  // Fallback recovery: fetch remote order if not found in local context
  useEffect(() => {
    if (!isHydrated || !orderId) return;
    const existsLocally = getOrderById(orderId) || orders.find((o) => o.token === orderId);
    if (existsLocally) return;

    const lookupToken = orderId.length >= 16 ? orderId : getOrderToken(orderId);
    if (!lookupToken) return;

    fetch(`/api/orders/${encodeURIComponent(lookupToken)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.order) {
          addOrder({ ...data.order, token: lookupToken });
        }
      })
      .catch(() => {});
  }, [isHydrated, orderId, getOrderById, orders, addOrder]);

  // Fetch live store settings from authoritative backend
  useEffect(() => {
    let isMounted = true;
    async function loadStoreSettings() {
      try {
        const res = await fetch("/api/store-settings", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.settings) {
            setStoreSettings(data.settings);
          }
        }
      } catch {
        // Fall back gracefully to STORE_SETTINGS if network is unavailable
      } finally {
        if (isMounted) {
          setIsLoadingSettings(false);
        }
      }
    }
    loadStoreSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync server authoritative time
  useEffect(() => {
    let isMounted = true;
    async function syncServerTime() {
      try {
        const start = Date.now();
        const res = await fetch("/api/server-time", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const latency = Math.max(0, Math.round((Date.now() - start) / 2));
          if (isMounted && typeof data.timestamp === "number") {
            serverOffsetRef.current = data.timestamp + latency - Date.now();
          }
        }
      } catch {
        // Fallback to local clock
      }
    }
    syncServerTime();
    return () => {
      isMounted = false;
    };
  }, []);

  // Look up order safely by order ID or token
  const order = useMemo(() => {
    if (!isHydrated) return undefined;
    return getOrderById(orderId) || orders.find((o) => o.token === orderId);
  }, [orderId, orders, getOrderById, isHydrated]);

  // Resolve token for links and navigation
  const resolvedToken = order?.token || (order?.id ? getOrderToken(order.id) : "") || "";

  // If order uses Cash method, redirect to order detail page immediately
  useEffect(() => {
    if (order && order.paymentMethod === "Cash") {
      router.replace(resolvedToken ? `/pesanan/${resolvedToken}` : "/pesanan");
    }
  }, [order, resolvedToken, router]);

  // 30-minute QRIS countdown anchored to persisted order paymentDeadline
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(() => {
    if (!order?.paymentDeadline) return 30 * 60;
    const deadline = new Date(order.paymentDeadline).getTime();
    return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  });

  // Independent copy feedback states
  const [copiedOrderId, setCopiedOrderId] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  // Sync countdown timer with server time and handle expiry
  useEffect(() => {
    if (!order || order.paymentMethod === "Cash" || !order.paymentDeadline) return;

    // Verified paid orders ("Lunas") and cancelled orders never expire
    if (order.paymentStatus === "Lunas" || order.paymentStatus === "Dibatalkan" || order.orderStatus === "Dibatalkan") return;

    const deadline = new Date(order.paymentDeadline).getTime();
    const updateCountdown = () => {
      const now = Date.now() + serverOffsetRef.current;
      const diff = Math.max(0, Math.floor((deadline - now) / 1000));
      setTimeLeftSeconds(diff);

      // Auto cancel unpaid order if timer expired and still pending payment or verification
      const isUnpaidPending =
        order.paymentStatus === "Menunggu Verifikasi" || order.paymentStatus === "Menunggu Pembayaran";
      if (diff <= 0 && isUnpaidPending) {
        updateOrderStatus(order.id, "Dibatalkan", "Dibatalkan", order.token);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [order, updateOrderStatus]);

  // Show loading skeleton while waiting for client hydration and settings
  if (!isHydrated || isLoadingSettings) {
    return (
      <div className="min-h-screen pb-16 bg-[#F6F6F7]">
        <Header
          title="Pembayaran QRIS"
          showBack={true}
          backHref="/home"
          showCart={false}
        />
        <main className="max-w-md mx-auto px-3 sm:px-4 pt-4 space-y-2.5">
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 space-y-3 animate-pulse">
            <div className="h-4 bg-neutral-200 rounded w-1/3" />
            <div className="h-8 bg-neutral-200 rounded w-1/2" />
          </div>
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-4 text-center animate-pulse flex flex-col items-center justify-center">
            <div className="w-full aspect-square bg-neutral-200 rounded-xl" />
            <div className="h-4 bg-neutral-200 rounded w-3/4" />
          </div>
        </main>
      </div>
    );
  }

  // If order not found after hydration
  if (!order) {
    return (
      <div className="min-h-screen pb-16 bg-[#F6F6F7]">
        <Header
          title="Pembayaran QRIS"
          showBack={true}
          backHref="/home"
          showCart={false}
        />
        <main className="max-w-md mx-auto px-3 sm:px-4 pt-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-white border border-[#E5E5E5] text-[#737373] flex items-center justify-center mx-auto shadow-xs">
            <HelpCircle className="w-7 h-7 text-[#737373]" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-bold text-[#111111]">
              Pesanan Tidak Ditemukan
            </h1>
            <p className="text-xs text-[#737373] max-w-xs mx-auto leading-relaxed">
              Nomor pesanan &quot;{orderId}&quot; tidak tersimpan di riwayat perangkat ini.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/home"
              className="inline-flex items-center justify-center px-6 py-2.5 bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Kembali ke Beranda
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Order status flags
  const isPaid = order.paymentStatus === "Lunas";
  const isCancelled = order.paymentStatus === "Dibatalkan" || order.orderStatus === "Dibatalkan";
  const isExpired = !isPaid && (isCancelled || timeLeftSeconds <= 0);
  const isAwaitingVerification = !isPaid && !isExpired && order.paymentStatus === "Menunggu Verifikasi";

  // Authoritative merchant details
  const merchantName = storeSettings?.qrisMerchantName || order.merchantName || "Nook by Jina";
  const merchantNmid = storeSettings?.qrisNmid || "";
  const qrisImageUrl = storeSettings?.qrisImageUrl || "";
  const adminWhatsapp = storeSettings?.adminWhatsapp || STORE_SETTINGS.adminWhatsapp;

  // Format countdown string HH:MM:SS
  const hours = Math.floor(timeLeftSeconds / 3600);
  const minutes = Math.floor((timeLeftSeconds % 3600) / 60);
  const seconds = timeLeftSeconds % 60;
  const formattedCountdown = `${String(hours).padStart(2, "0")}:${String(
    minutes
  ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Deadline timestamp formatted in WIB (UTC+7)
  const deadlineDate = order.paymentDeadline ? new Date(order.paymentDeadline) : new Date();
  const formattedDeadlineWIB = deadlineDate.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }) + " WIB";

  // Pre-filled WhatsApp message for customer payment confirmation
  const waMessage = `Halo admin Nook by Jina, saya ingin konfirmasi pembayaran untuk:
- No. Pesanan: ${order.id}
- Nama: ${order.customerName}
- Total: ${formatRupiah(order.total)}
- Metode: QRIS Statis (${merchantName})

Mohon dicek di riwayat transaksi merchant. Terima kasih!`;

  const waUrl = `https://wa.me/${adminWhatsapp}?text=${encodeURIComponent(waMessage)}`;

  // Copy Order ID
  const handleCopyOrderId = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(order.id);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = order.id;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedOrderId(true);
      setTimeout(() => setCopiedOrderId(false), 2000);
    } catch (err) {
      console.error("Failed to copy order ID:", err);
    }
  };

  // Copy Payment Amount (Raw numeric only, e.g. "25000" or "50000" without Rp/dots)
  const handleCopyAmount = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (order.total === undefined || order.total === null) return;
    try {
      const rawNumberString = String(Math.round(order.total));
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(rawNumberString);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = rawNumberString;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    } catch (err) {
      console.error("Failed to copy amount:", err);
    }
  };

  return (
    <div className="min-h-screen pb-16 bg-[#F6F6F7]">
      <Header
        title="Pembayaran QRIS"
        showBack={true}
        backHref={resolvedToken ? `/pesanan/${resolvedToken}` : "/pesanan"}
        showCart={false}
      />

      <main className="max-w-md mx-auto px-3 sm:px-4 pt-3.5 space-y-2.5">
        {/* =========================================================================
            ORDER SUMMARY CARD
            ========================================================================= */}
        <section className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-[#737373]">No. Pesanan:</span>
              <span className="text-xs font-mono font-bold text-[#111111]">
                {order.id}
              </span>
              <button
                type="button"
                onClick={handleCopyOrderId}
                title="Salin nomor pesanan"
                aria-label="Salin nomor pesanan"
                className="text-[#737373] hover:text-[#111111] p-1 transition-colors cursor-pointer rounded-md hover:bg-neutral-100"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {copiedOrderId && (
                <span className="text-[10px] text-[#18794E] font-medium bg-emerald-50 px-1.5 py-0.5 rounded animate-landing-fade">
                  Tersalin!
                </span>
              )}
            </div>
            <StatusBadge status={order.paymentStatus} type="payment" />
          </div>

          <div className="pt-3 border-t border-[#E5E5E5] flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#737373]">
              Total yang Harus Dibayar
            </span>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {copiedAmount && (
                <span className="text-[10px] text-[#18794E] font-medium bg-emerald-50 px-1.5 py-0.5 rounded animate-landing-fade">
                  Nominal disalin!
                </span>
              )}
              <button
                type="button"
                onClick={handleCopyAmount}
                title="Salin nominal transfer (hanya angka)"
                aria-label={`Salin nominal transfer ${order.total}`}
                className="group inline-flex items-center gap-1.5 px-2 py-1 -mr-1 rounded-xl hover:bg-neutral-100/80 active:bg-neutral-200/60 transition-colors cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-[#F25B09]/20"
              >
                <span className="text-xl font-extrabold text-[#F25B09] tracking-tight group-hover:opacity-95">
                  {formatRupiah(order.total)}
                </span>
                <Copy className="w-3.5 h-3.5 text-[#F25B09] opacity-75 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            </div>
          </div>
        </section>

        {/* =========================================================================
            PAYMENT STATUS BANNERS
            ========================================================================= */}
        {isExpired ? (
          /* Cancelled or Expired State */
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-2 text-xs text-[#B42318] shadow-xs">
            <div className="flex items-center gap-2 font-bold text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>Pesanan Dibatalkan</span>
            </div>
            <p className="leading-relaxed">
              Batas waktu pembayaran telah berakhir (30 menit) atau pesanan telah dibatalkan oleh sistem.
            </p>
            <p className="text-[11px] text-red-700 pt-1 leading-relaxed">
              Jika Anda sudah terlanjur melakukan transfer setelah batas waktu berakhir, silakan hubungi admin toko secara manual dengan melampirkan nomor pesanan <strong>{order.id}</strong>.
            </p>
            <div className="pt-1.5">
              <Link
                href="/home"
                className="inline-flex items-center gap-1.5 font-bold text-[#B42318] hover:underline"
              >
                Kembali ke Beranda <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : isPaid ? (
          /* Verified Payment Success Panel */
          <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3 text-xs text-[#18794E] shadow-xs">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-[#18794E]" />
              <span>Pembayaran Terverifikasi Lunas!</span>
            </div>
            <p className="leading-relaxed text-[#18794E]">
              Merchant telah memeriksa dan memverifikasi transaksi Anda. Pesanan sedang diproses sesuai jadwal operasional dapur toko.
            </p>
            <div className="pt-1">
              <Link
                href={resolvedToken ? `/pesanan/${resolvedToken}` : "/pesanan"}
                className="inline-flex items-center gap-1.5 font-bold text-white bg-[#18794E] hover:bg-emerald-700 px-4 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
              >
                <span>Lihat Detail Pesanan & Token Akses</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          /* Active Payment: 30-Minute Countdown & Subtle Pending Guidance */
          <div className="space-y-2.5">
            {/* Subtle Pending Status Notice */}
            <div className="p-3 bg-neutral-100/80 border border-[#E5E5E5] rounded-xl flex items-center justify-between text-xs text-[#737373]">
              <span className="font-medium text-[#111111]">
                {isAwaitingVerification
                  ? "Menunggu Konfirmasi & Verifikasi Merchant"
                  : "Menunggu Pembayaran"}
              </span>
              <span className="text-[11px] text-[#737373]">
                Pindai QRIS & bayar nominal tepat
              </span>
            </div>

            {/* Countdown Box */}
            <div className="p-3.5 bg-[#FFF4E5] border border-[#FBD38D] rounded-xl flex items-center justify-between text-xs text-[#8A4B08] shadow-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#8A4B08] flex-shrink-0" />
                <div>
                  <span className="font-semibold block leading-tight">
                    Batas Pembayaran: {formattedDeadlineWIB}
                  </span>
                  <span className="text-[11px] text-[#8A4B08]/80">
                    Selesaikan transfer sebelum:
                  </span>
                </div>
              </div>
              <span className="font-mono font-bold text-base bg-white px-2.5 py-1 rounded-lg border border-[#FBD38D] text-[#8A4B08]">
                {formattedCountdown}
              </span>
            </div>
          </div>
        )}

        {/* =========================================================================
            MERCHANT INFORMATION OUTSIDE THE CARD
            (Visible only when payment is active: not paid, not cancelled/expired)
            ========================================================================= */}
        {!isPaid && !isExpired && (
          <div className="text-center space-y-1 px-1">
            <h2 className="text-base sm:text-lg font-bold text-[#111111] tracking-tight">
              Pindai QRIS Merchant
            </h2>
            <div className="space-y-0.5 text-xs text-[#737373]">
              <p className="font-medium text-[#111111]">
                Merchant: <strong className="font-bold text-[#111111]">{merchantName}</strong>
              </p>
              {merchantNmid ? (
                <p className="text-[11px] font-mono text-[#737373]">
                  NMID: {merchantNmid}
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* =========================================================================
            ENLARGED SEPARATE QRIS IMAGE CARD
            (Visible only when payment is active)
            ========================================================================= */}
        {!isPaid && !isExpired && (
          <>
            {qrisImageUrl ? (
              <div className="bg-white border border-[#E5E5E5] rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col items-center justify-center space-y-2.5">
                {/* Full card width QR container preserving full uncropped aspect ratio */}
                <div className="w-full aspect-square relative bg-white flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrisImageUrl}
                    alt={`QRIS Merchant ${merchantName}`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-[11px] text-[#737373] text-center max-w-xs leading-relaxed px-1">
                  Periksa dan pastikan nama merchant <strong className="text-[#111111]">{merchantName}</strong> muncul di aplikasi Anda sebelum memasukkan PIN.
                </p>
              </div>
            ) : (
              /* Neutral Fallback State if QRIS is not configured by merchant */
              <div className="p-6 bg-neutral-50 border border-[#E5E5E5] rounded-2xl text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#E5E5E5] text-[#737373] flex items-center justify-center mx-auto shadow-xs">
                  <AlertCircle className="w-6 h-6 text-[#737373]" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <h3 className="text-xs font-bold text-[#111111]">
                    QRIS Merchant Belum Dikonfigurasi
                  </h3>
                  <p className="text-[11px] text-[#737373] leading-relaxed">
                    Toko belum mengunggah kode QRIS resmi. Pembayaran mandiri via QRIS sementara tidak dapat diproses.
                  </p>
                </div>
                <div className="pt-1">
                  <a
                    href={`https://wa.me/${adminWhatsapp}?text=${encodeURIComponent(
                      `Halo admin Nook by Jina, saya ingin membayar pesanan ${order.id} (${formatRupiah(order.total)}) tetapi QRIS belum tersedia di aplikasi.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#111111] hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    <MessageCircle className="w-4 h-4 fill-white" />
                    <span>Hubungi Toko via WhatsApp</span>
                  </a>
                </div>
              </div>
            )}

            {/* Payment Instructions (5 Steps) in a separate clean card */}
            <section className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 text-xs text-[#737373] space-y-2 shadow-xs">
              <p className="font-semibold text-[#111111] flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#F25B09] flex-shrink-0" />
                Petunjuk Pembayaran:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed pl-0.5">
                <li>Buka aplikasi mobile banking atau e-wallet (BCA, Mandiri, BRI, BNI, DANA, GoPay, OVO, ShopeePay, dll).</li>
                <li>Pindai QRIS yang tertera pada halaman ini.</li>
                <li>Pastikan nama merchant yang muncul sesuai: <strong className="text-[#111111]">{merchantName}</strong>.</li>
                <li>Masukkan nominal transfer tepat sebesar <strong className="text-[#111111]">{formatRupiah(order.total)}</strong>.</li>
                <li>Setelah berhasil melakukan pembayaran, tekan tombol konfirmasi WhatsApp di bawah.</li>
              </ol>
            </section>

            {/* WhatsApp Confirmation Action (Only if QRIS image is configured) */}
            {qrisImageUrl && (
              <div className="space-y-2">
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <MessageCircle className="w-5 h-5 fill-white" />
                  <span>Konfirmasi Pembayaran ke WhatsApp</span>
                </a>

                {/* Verification Notice: Non-authoritative WhatsApp confirmation */}
                <div className="p-3 bg-neutral-100/70 rounded-xl border border-[#E5E5E5] text-[11px] text-[#737373] text-left leading-relaxed">
                  <p>
                    <strong>Catatan Verifikasi:</strong> Admin akan memeriksa riwayat mutasi aktual pada akun merchant. Menekan tombol WhatsApp atau melampirkan screenshot bukti transfer tidak otomatis menandai pesanan lunas.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Link to order detail & token */}
        <div>
          <Link
            href={resolvedToken ? `/pesanan/${resolvedToken}` : "/pesanan"}
            className="w-full min-h-[44px] px-4 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs font-semibold text-[#111111] flex items-center justify-center gap-2 hover:bg-neutral-50 transition-colors shadow-xs"
          >
            <span>Buka Detail Pesanan & Token Akses</span>
            <ChevronRight className="w-4 h-4 text-[#737373]" />
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center text-xs text-[#737373]">
          <Loader2 className="w-5 h-5 text-[#111111] animate-spin mr-2" />
          Memuat rincian pembayaran...
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}

