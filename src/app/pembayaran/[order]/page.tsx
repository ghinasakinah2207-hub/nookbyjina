"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  Clock,
  Copy,
  ChevronRight,
  ChevronDown,
  Info,
  Loader2,
  HelpCircle,
  Download,
  Share2,
  Sparkles,
  Smartphone,
  Check,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatusBadge } from "@/components/ui/Badge";
import { useOrder } from "@/context/OrderContext";
import { formatRupiah, STORE_SETTINGS as DEFAULT_SETTINGS } from "@/data/dummy-data";
import { getOrderToken, saveOrderToken } from "@/lib/order-token-vault";
import { isPendingQrisStatus, isPaidStatus } from "@/lib/order-normalizer";
import { extractNmidFromQris } from "@/lib/qris-nmid";
import { isValidTokenFormat } from "@/lib/token-security";
import { StoreSettings } from "@/types";

function PaymentContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = decodeURIComponent((params?.order as string) || "").trim();
  const queryToken = (searchParams?.get("token") || "").trim();

  const { orders, getOrderById, updateOrderStatus, isHydrated, addOrder } = useOrder();

  // Authoritative server-time offset (serverTime - localTime) in ms
  const serverOffsetRef = useRef<number>(0);

  // Look up order safely by order ID or token
  const order = useMemo(() => {
    if (!isHydrated) return undefined;
    return getOrderById(orderId) || orders.find((o) => o.token === orderId || (queryToken && o.token === queryToken));
  }, [orderId, queryToken, orders, getOrderById, isHydrated]);

  // Authoritatively resolve secure order token:
  // 1. Valid query parameter ?token=...
  // 2. Route param if it already meets token format (length >= 16 and not starting with TJ-)
  // 3. Current order in state (order.token)
  // 4. Token vault lookup by orderId (e.g. TJ-261106-001)
  // 5. Token vault lookup by order.id
  // 6. Matched order in OrderContext cache
  const resolvedToken = useMemo(() => {
    if (isValidTokenFormat(queryToken) && !queryToken.startsWith("TJ-")) return queryToken;
    if (isValidTokenFormat(orderId) && !orderId.startsWith("TJ-")) return orderId;
    if (order?.token && isValidTokenFormat(order.token) && !order.token.startsWith("TJ-")) return order.token;

    if (orderId) {
      const vaultTok = getOrderToken(orderId);
      if (vaultTok && isValidTokenFormat(vaultTok) && !vaultTok.startsWith("TJ-")) return vaultTok;
    }

    if (order?.id && order.id !== orderId) {
      const vaultTok = getOrderToken(order.id);
      if (vaultTok && isValidTokenFormat(vaultTok) && !vaultTok.startsWith("TJ-")) return vaultTok;
    }

    const localMatch = orders.find((o) => o.id === orderId || o.token === orderId);
    if (localMatch?.token && isValidTokenFormat(localMatch.token) && !localMatch.token.startsWith("TJ-")) {
      return localMatch.token;
    }

    return "";
  }, [queryToken, orderId, order, orders]);

  // Status flags needed for early navigation hooks
  const isPaid = isPaidStatus(order?.paymentStatus);

  // Authoritative back navigation: always targets order detail page when token exists
  const handleBackNavigation = useCallback(() => {
    if (resolvedToken) {
      router.push(`/pesanan/${encodeURIComponent(resolvedToken)}`);
    } else {
      router.push("/pesanan");
    }
  }, [resolvedToken, router]);

  // When order is paid, intercept hardware/browser back or popstate
  // to ensure navigation always lands directly on the order detail page
  useEffect(() => {
    if (!isPaid || !resolvedToken) return;

    window.history.pushState({ page: "payment_success" }, "", window.location.href);

    const handlePopState = () => {
      router.replace(`/pesanan/${encodeURIComponent(resolvedToken)}`);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isPaid, resolvedToken, router]);

  // Persist resolved token back to vault whenever available
  useEffect(() => {
    if (resolvedToken) {
      const targetId = order?.id || (orderId && orderId.startsWith("TJ-") ? orderId : "");
      if (targetId) {
        saveOrderToken(targetId, resolvedToken);
      }
    }
  }, [resolvedToken, order?.id, orderId]);

  // Guard refs to prevent concurrent or infinite duplicate fetches
  const inFlightFallbackRef = useRef(false);
  const fetchedTokensRef = useRef<Set<string>>(new Set());
  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Fallback recovery: fetch remote order if not found locally
  useEffect(() => {
    if (!isHydrated || !orderId) return;

    const existsLocally = ordersRef.current.find((o) => o.id === orderId || o.token === orderId);
    if (existsLocally && (existsLocally.qrisPayload || existsLocally.paymentMethod === "Cash")) {
      return;
    }

    const lookupToken =
      resolvedToken ||
      (isValidTokenFormat(orderId) && !orderId.startsWith("TJ-") ? orderId : getOrderToken(orderId));
    if (!lookupToken) return;

    if (fetchedTokensRef.current.has(lookupToken) || inFlightFallbackRef.current) {
      return;
    }

    inFlightFallbackRef.current = true;
    fetchedTokensRef.current.add(lookupToken);

    fetch(`/api/orders/${encodeURIComponent(lookupToken)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.order) {
          addOrder({ ...data.order, token: lookupToken });
        } else {
          fetchedTokensRef.current.delete(lookupToken);
        }
      })
      .catch(() => {
        fetchedTokensRef.current.delete(lookupToken);
      })
      .finally(() => {
        inFlightFallbackRef.current = false;
      });
  }, [isHydrated, orderId, resolvedToken, addOrder]);

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

  // If order uses Cash method, redirect to order detail page immediately
  useEffect(() => {
    if (order && order.paymentMethod === "Cash") {
      router.replace(resolvedToken ? `/pesanan/${encodeURIComponent(resolvedToken)}` : "/pesanan");
    }
  }, [order, resolvedToken, router]);

  // QR Code data URL state
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrError, setQrError] = useState<string | null>(null);

  // Generate QR code from actual qris payload
  useEffect(() => {
    if (!order?.qrisPayload) return;

    QRCode.toDataURL(order.qrisPayload, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#111111",
        light: "#FFFFFF",
      },
    })
      .then((url) => {
        setQrDataUrl(url);
        setQrError(null);
      })
      .catch((err) => {
        console.error("Error generating QR code:", err);
        setQrError("Gagal merender kode QRIS.");
      });
  }, [order?.qrisPayload]);

  // Success Animation Tracking:
  // Trigger ONLY when payment status genuinely transitions from unpaid to paid in real-time.
  // Avoid replaying on subsequent page refreshes.
  const wasAlreadyPaidOnMount = useRef<boolean | null>(null);
  const [isFreshlyPaid, setIsFreshlyPaid] = useState(false);
  const prevPaymentStatusRef = useRef<string | undefined>(undefined);
  const currentPaymentStatus = order?.paymentStatus;

  useEffect(() => {
    if (!currentPaymentStatus) return;

    if (wasAlreadyPaidOnMount.current === null) {
      wasAlreadyPaidOnMount.current = isPaidStatus(currentPaymentStatus);
    } else if (
      !wasAlreadyPaidOnMount.current &&
      isPaidStatus(currentPaymentStatus) &&
      !isPaidStatus(prevPaymentStatusRef.current || "")
    ) {
      setIsFreshlyPaid(true);
    }

    prevPaymentStatusRef.current = currentPaymentStatus;
  }, [currentPaymentStatus]);

  // Polling for payment status (every 6 seconds while pending)
  useEffect(() => {
    if (!order || !resolvedToken) return;
    if (isPaidStatus(order.paymentStatus) || order.paymentStatus === "Dibatalkan" || order.orderStatus === "Dibatalkan") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(resolvedToken)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.order) {
            if (data.order.paymentStatus === "Lunas" || data.order.paymentStatus === "Dibatalkan") {
              addOrder({ ...data.order, token: resolvedToken });
            }
          }
        }
      } catch {
        // Non-fatal polling error
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [order, resolvedToken, addOrder]);

  // 15-minute countdown anchored to order paymentDeadline (expires_at)
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(() => {
    if (!order?.paymentDeadline) return 15 * 60;
    const deadline = new Date(order.paymentDeadline).getTime();
    return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  });

  // Independent copy feedback states
  const [copiedOrderId, setCopiedOrderId] = useState(false);
  const [sharedStatus, setSharedStatus] = useState<string | null>(null);

  // Order details dropdown state
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  // Load verified store settings for authoritative NMID configuration
  useEffect(() => {
    fetch("/api/store-settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.settings) {
          setStoreSettings(data.settings);
        }
      })
      .catch(() => {});
  }, []);

  // Simulation in progress state (Sandbox only)
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulateSuccess, setSimulateSuccess] = useState(false);

  // Manual transaction status check state
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [checkFeedback, setCheckFeedback] = useState<{
    message: string;
    type: "info" | "error" | "success";
  } | null>(null);

  // Manual payment status verification triggered by "CEK TRANSAKSI" button
  const handleCheckTransaction = async () => {
    if (isCheckingStatus || !resolvedToken) return;
    setIsCheckingStatus(true);
    setCheckFeedback(null);

    try {
      const res = await fetch("/api/payments/waroengpay/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resolvedToken }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setCheckFeedback({
          type: "error",
          message: data?.error || "Gagal memeriksa status pembayaran. Silakan coba lagi.",
        });
        return;
      }

      if (data.order) {
        addOrder({ ...data.order, token: resolvedToken });
      }

      const status = data.status || data.order?.paymentStatus;

      if (status === "paid" || data.order?.paymentStatus === "Lunas") {
        setCheckFeedback({
          type: "success",
          message: "Pembayaran berhasil diverifikasi!",
        });
      } else if (status === "cancelled" || data.order?.paymentStatus === "Dibatalkan") {
        setCheckFeedback({
          type: "error",
          message: "Batas waktu pembayaran telah habis atau pesanan telah dibatalkan.",
        });
      } else {
        // Pending
        setCheckFeedback({
          type: "info",
          message: "Pembayaran belum diterima. Silakan tunggu atau coba lagi.",
        });
      }
    } catch {
      setCheckFeedback({
        type: "error",
        message: "Terjadi gangguan jaringan saat memeriksa status. Silakan coba beberapa saat lagi.",
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Countdown timer with WaroengPay 5-minute grace period enforcement
  useEffect(() => {
    if (!order || order.paymentMethod === "Cash" || !order.paymentDeadline) return;

    if (order.paymentStatus === "Lunas" || order.paymentStatus === "Dibatalkan" || order.orderStatus === "Dibatalkan") {
      return;
    }

    const deadline = new Date(order.paymentDeadline).getTime();
    const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5-minute grace period

    const updateCountdown = () => {
      const now = Date.now() + serverOffsetRef.current;
      const diff = Math.floor((deadline - now) / 1000);
      setTimeLeftSeconds(diff);

      // Only mark cancelled after the full 5-minute grace period has passed
      if (now >= deadline + GRACE_PERIOD_MS && isPendingQrisStatus(order.paymentStatus)) {
        updateOrderStatus(order.id, "Dibatalkan", "Dibatalkan", order.token);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [order, updateOrderStatus]);

  // Authoritative NMID: extracted from genuine QRIS payload if available, else verified merchant settings
  const actualNmid = useMemo(() => {
    const fromQris = extractNmidFromQris(order?.qrisPayload);
    if (fromQris) return fromQris;
    return storeSettings?.qrisNmid || DEFAULT_SETTINGS.qrisNmid || "ID1020038829101";
  }, [order?.qrisPayload, storeSettings?.qrisNmid]);

  // Show loading skeleton while waiting for client hydration
  if (!isHydrated) {
    return (
      <div className="min-h-screen pb-16 bg-[#F6F6F7]">
        <Header title="Pembayaran QRIS" showBack={true} backHref="/home" showCart={false} />
        <main className="max-w-md mx-auto px-3 sm:px-4 pt-4 space-y-3">
          <div className="bg-white rounded-2xl p-4 sm:p-5 space-y-3 animate-pulse">
            <div className="h-4 bg-neutral-200 rounded w-1/3" />
            <div className="h-8 bg-neutral-200 rounded w-1/2" />
          </div>
          <div className="bg-white rounded-2xl p-4 space-y-4 text-center animate-pulse flex flex-col items-center justify-center">
            <div className="w-64 h-64 bg-neutral-200 rounded-xl" />
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
        <Header title="Pembayaran QRIS" showBack={true} backHref="/home" showCart={false} />
        <main className="max-w-md mx-auto px-3 sm:px-4 pt-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-white border border-[#E5E5E5] text-[#737373] flex items-center justify-center mx-auto shadow-xs">
            <HelpCircle className="w-7 h-7 text-[#737373]" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-bold text-[#111111]">Pesanan Tidak Ditemukan</h1>
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
  const isCancelled =
    order.paymentStatus === "Dibatalkan" ||
    order.orderStatus === "Dibatalkan" ||
    String(order.paymentStatus || "").toLowerCase() === "dibatalkan";

  // Grace period: countdown <= 0, but still within 5-minute grace period
  const isInGracePeriod = !isPaid && !isCancelled && timeLeftSeconds <= 0 && timeLeftSeconds > -300;
  const isExpired = !isPaid && (isCancelled || timeLeftSeconds <= -300);

  // Authoritative amounts
  const paymentAmount = order.rawAmount || order.total;
  const uniqueCode = order.uniqueCode;
  const isSandbox = order.livemode === false || Boolean(order.waroengpayInvoiceId && order.qrisPayload?.startsWith("WAROENGPAY-TEST"));

  // Format countdown string MM:SS
  const absRemaining = Math.max(0, timeLeftSeconds);
  const countdownMinutes = Math.floor(absRemaining / 60);
  const countdownSeconds = absRemaining % 60;
  const formattedCountdown = `${String(countdownMinutes).padStart(2, "0")}:${String(countdownSeconds).padStart(2, "0")}`;

  // Copy Order ID
  const handleCopyOrderId = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(order.id);
      }
      setCopiedOrderId(true);
      setTimeout(() => setCopiedOrderId(false), 2000);
    } catch (err) {
      console.error("Failed to copy order ID:", err);
    }
  };

  // Download QRIS Image
  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `QRIS-NOOK-${order.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Share QRIS
  const handleShareQr = async () => {
    const shareText = `Halo! Berikut tagihan QRIS untuk pesanan (${order.id}) sebesar ${formatRupiah(paymentAmount)}. Selesaikan pembayaran sebelum masa berlaku habis.`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        if (qrDataUrl && navigator.canShare) {
          const res = await fetch(qrDataUrl);
          const blob = await res.blob();
          const file = new File([blob], `QRIS-${order.id}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `QRIS Pesanan ${order.id}`,
              text: shareText,
              files: [file],
            });
            return;
          }
        }
        await navigator.share({
          title: `QRIS Pesanan ${order.id}`,
          text: shareText,
          url: window.location.href,
        });
      } catch {
        // User cancelled share or unsupported
      }
    } else {
      // Fallback: Copy link
      navigator.clipboard?.writeText(window.location.href);
      setSharedStatus("Tautan disalin ke clipboard!");
      setTimeout(() => setSharedStatus(null), 2500);
    }
  };

  // Simulate payment (Sandbox only)
  const handleSimulatePayment = async () => {
    if (!order.waroengpayInvoiceId || isSimulating) return;
    setIsSimulating(true);
    try {
      const res = await fetch("/api/payments/waroengpay/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: order.waroengpayInvoiceId,
          action: "pay",
        }),
      });
      if (res.ok) {
        setSimulateSuccess(true);
        // Prompt re-fetch of order status
        if (resolvedToken) {
          const orderRes = await fetch(`/api/orders/${encodeURIComponent(resolvedToken)}`, { cache: "no-store" });
          if (orderRes.ok) {
            const data = await orderRes.json();
            if (data?.order) addOrder({ ...data.order, token: resolvedToken });
          }
        }
      }
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="min-h-screen pb-16 bg-[#F6F6F7]">
      <Header
        title="Pembayaran QRIS"
        showBack={true}
        backHref={resolvedToken ? `/pesanan/${encodeURIComponent(resolvedToken)}` : "/pesanan"}
        onBack={handleBackNavigation}
        showCart={false}
      />

      <main className="max-w-md mx-auto px-3 sm:px-4 pt-3.5 space-y-3">
        {/* Sandbox Mode Banner */}
        {isSandbox && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold block text-[11px] uppercase tracking-wider text-amber-800">
                  Mode Uji Sandbox (WaroengPay)
                </span>
                <span className="text-[11px] text-amber-700">
                  Tagihan simulasi — tidak memerlukan transfer uang sungguhan.
                </span>
              </div>
            </div>
            {!isPaid && !isExpired && (
              <button
                type="button"
                onClick={handleSimulatePayment}
                disabled={isSimulating || simulateSuccess}
                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold rounded-lg text-[11px] shrink-0 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-60"
              >
                {isSimulating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                <span>{simulateSuccess ? "Terkirim" : "Simulasi Bayar"}</span>
              </button>
            )}
          </div>
        )}

        {/* Order Info & Nominal Card */}
        <section className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-[#E5E5E5]/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] text-[#737373] uppercase font-semibold tracking-wider">
                Nomor Pesanan
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-[#111111] font-mono">{order.id}</span>
                <button
                  type="button"
                  onClick={handleCopyOrderId}
                  className="p-1 rounded-md hover:bg-neutral-100 text-[#737373] hover:text-[#111111] transition-colors cursor-pointer"
                  title="Salin Nomor Pesanan"
                >
                  {copiedOrderId ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
            <StatusBadge
              status={isPaid ? "Lunas" : isExpired ? "Dibatalkan" : "Menunggu bayar"}
              type="payment"
            />
          </div>

          <div className="h-px bg-neutral-100" />

          {/* Amount to pay & Order Details Dropdown */}
          <div className="space-y-1.5">
            <span className="text-xs text-[#737373] block">Total yang Wajib Ditransfer:</span>
            <div className="flex items-center justify-between gap-2">
              <div className="text-2xl font-black text-[#111111] tracking-tight">
                {formatRupiah(paymentAmount)}
              </div>
              <button
                type="button"
                onClick={() => setIsDetailsOpen((prev) => !prev)}
                aria-expanded={isDetailsOpen}
                aria-controls="order-details-dropdown"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#F25B09] hover:bg-orange-50 active:bg-orange-100 transition-colors cursor-pointer shrink-0 border border-orange-200/60"
              >
                <span>Lihat Detail</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isDetailsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>
            {uniqueCode !== undefined && uniqueCode > 0 ? (
              <p className="text-[11px] text-[#737373] leading-snug">
                Termasuk kode unik <strong className="text-[#111111]">Rp {uniqueCode}</strong> untuk verifikasi instan otomatis.
              </p>
            ) : null}

            {/* Order Details Accordion Content */}
            {isDetailsOpen && (
              <div
                id="order-details-dropdown"
                className="mt-2.5 p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs space-y-2 animate-landing-fade"
              >
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-[#737373]">No. tagihan</span>
                  <span className="font-mono font-medium text-[#111111]">{order.waroengpayInvoiceId || "-"}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-[#737373]">No. pesanan</span>
                  <span className="font-mono font-medium text-[#111111]">{order.id}</span>
                </div>
                <div className="flex justify-between items-start py-0.5 gap-2">
                  <span className="text-[#737373] shrink-0">Keterangan</span>
                  <span className="font-medium text-[#111111] text-right">
                    Pesanan Nook by Jina #{order.id}
                  </span>
                </div>
                <div className="h-px bg-neutral-200/60 my-1" />
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-[#737373]">Subtotal</span>
                  <span className="text-[#111111] font-medium">{formatRupiah(order.subtotal)}</span>
                </div>
                {order.shippingFee > 0 && (
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-[#737373]">Ongkos kirim</span>
                    <span className="text-[#111111] font-medium">{formatRupiah(order.shippingFee)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-[#737373]">Kode unik</span>
                  <span className="text-emerald-600 font-semibold">
                    +{formatRupiah(order.uniqueCode || 0)}
                  </span>
                </div>
                <div className="h-px bg-neutral-200/60 my-1" />
                <div className="flex justify-between items-center py-0.5 font-bold text-sm text-[#111111]">
                  <span>Total</span>
                  <span className="text-[#F25B09]">{formatRupiah(paymentAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Countdown & Grace period indicator */}
          {!isPaid && !isExpired && (
            <div
              className={`p-3 rounded-xl flex items-center justify-between text-xs shadow-xs border ${
                isInGracePeriod
                  ? "bg-amber-50 border-amber-300 text-amber-900"
                  : "bg-[#FFF4E5] border-[#FBD38D] text-[#8A4B08]"
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0" />
                <div>
                  <span className="font-semibold block leading-tight">
                    {isInGracePeriod ? "Masa Tenggang Tambahan (5 Menit)" : "Batas Waktu Pembayaran:"}
                  </span>
                  <span className="text-[11px] opacity-80">
                    {isInGracePeriod
                      ? "Menunggu konfirmasi mutasi bank..."
                      : "Selesaikan sebelum waktu habis:"}
                  </span>
                </div>
              </div>
              <span className="font-mono font-bold text-base bg-white px-2.5 py-1 rounded-lg border border-current">
                {isInGracePeriod ? "00:00" : formattedCountdown}
              </span>
            </div>
          )}
        </section>

        {/* =========================================================================
            STATE 1: PAID (LUNAS) — SUBTLE SUCCESS ANIMATION
            ========================================================================= */}
        {isPaid && (
          <section className="bg-white rounded-2xl p-6 text-center space-y-4 shadow-xs border border-emerald-100 animate-landing-fade">
            {/* Small green checkmark in circular background with scale-in animation */}
            <div
              className={`w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200/60 shadow-xs ${
                isFreshlyPaid ? "animate-payment-success" : ""
              }`}
            >
              <Check className={`w-7 h-7 stroke-[2.5] ${isFreshlyPaid ? "animate-checkmark-pop" : ""}`} />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-bold text-[#111111]">Pembayaran Berhasil!</h2>
              <p className="text-xs text-[#737373] leading-relaxed max-w-xs mx-auto">
                Pembayaran kamu sudah terverifikasi.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href={resolvedToken ? `/pesanan/${encodeURIComponent(resolvedToken)}` : "/pesanan"}
                onClick={(e) => {
                  if (resolvedToken) {
                    e.preventDefault();
                    router.push(`/pesanan/${encodeURIComponent(resolvedToken)}`);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#C2410C] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <span>Lihat Detail Pesanan</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        )}

        {/* =========================================================================
            STATE 2: EXPIRED / CANCELLED (KEDALUWARSA)
            ========================================================================= */}
        {!isPaid && isExpired && (
          <section className="bg-white rounded-2xl p-6 text-center space-y-4 shadow-xs border border-red-100">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-[#111111]">Batas Waktu Pembayaran Habis</h2>
              <p className="text-xs text-[#737373] leading-relaxed max-w-xs mx-auto">
                Tagihan QRIS ini telah kedaluwarsa. Silakan lakukan pemesanan ulang untuk mendapatkan kode QRIS yang baru.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/menu"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 bg-[#111111] hover:bg-neutral-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Pesan Ulang di Menu</span>
              </Link>
            </div>
          </section>
        )}

        {/* =========================================================================
            STATE 3: PENDING (ACTIVE QRIS)
            ========================================================================= */}
        {!isPaid && !isExpired && (
          <div className="space-y-3">
            {/* Real QRIS Code Card (White background) */}
            <section className="bg-white rounded-2xl p-4 sm:p-5 text-center space-y-3.5 shadow-xs border border-[#E5E5E5]/60 flex flex-col items-center">
              <div className="space-y-0.5">
                <p className="text-xs text-[#737373]">
                  Mendukung GoPay, OVO, DANA, ShopeePay & seluruh Mobile Banking
                </p>
              </div>

              {/* Official QRIS Logo Asset (public/QRISLogo.svg) */}
              <div className="pt-1 flex items-center justify-center">
                <Image
                  src="/QRISLogo.svg"
                  alt="QRIS - Quick Response Code Indonesian Standard"
                  width={106}
                  height={40}
                  className="h-8 w-auto object-contain"
                  priority
                />
              </div>

              {/* QR Image */}
              <div className="w-64 h-64 p-3 bg-white border border-[#E5E5E5] rounded-2xl shadow-sm flex items-center justify-center relative">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt={`QRIS Pesanan ${order.id}`}
                    className="w-full h-full object-contain"
                  />
                ) : qrError ? (
                  <div className="text-xs text-red-600 p-4">{qrError}</div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-xs text-[#737373]">
                    <Loader2 className="w-6 h-6 animate-spin text-[#F25B09]" />
                    <span>Membuat kode QRIS...</span>
                  </div>
                )}
              </div>

              {/* WaroengPay NMID Display */}
              <div className="text-xs font-mono font-medium text-[#737373] text-center pt-0.5">
                NMID: {actualNmid}
              </div>

              {/* Merchant Identity Notice */}
              <div className="w-full max-w-sm p-2.5 sm:p-3 bg-sky-50/80 border border-sky-100 rounded-xl text-left flex items-start gap-2 text-[11px] text-sky-950 leading-relaxed shadow-2xs">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <p>
                  Di aplikasi pembayaran akan tertulis: <strong>WAROENGKU</strong> (penampung resmi resi payment Nook by Jina).
                </p>
              </div>

              {/* Action Buttons: Download & Share */}
              <div className="w-full max-w-xs grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  disabled={!qrDataUrl}
                  className="w-full min-h-[44px] px-3 py-2 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-[#111111] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Unduh QRIS</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareQr}
                  disabled={!qrDataUrl}
                  className="w-full min-h-[44px] px-3 py-2 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-[#111111] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>Bagikan</span>
                </button>
              </div>

              {sharedStatus && (
                <p className="text-[11px] text-emerald-600 font-semibold">{sharedStatus}</p>
              )}
            </section>

            {/* CEK TRANSAKSI Button & Status Verification Feedback (Directly below QRIS card) */}
            <div className="space-y-2 pt-0.5">
              <button
                type="button"
                onClick={handleCheckTransaction}
                disabled={isCheckingStatus}
                className="w-full py-3.5 px-4 bg-[#0F172A] hover:bg-[#1E293B] active:bg-[#020617] text-white font-bold text-xs tracking-wider uppercase rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCheckingStatus ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Memeriksa...</span>
                  </>
                ) : (
                  <span>CEK TRANSAKSI</span>
                )}
              </button>

              {checkFeedback && (
                <div
                  className={`p-2.5 rounded-xl text-xs text-center leading-relaxed animate-landing-fade ${
                    checkFeedback.type === "error"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : checkFeedback.type === "success"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-neutral-100 text-neutral-700 border border-neutral-200"
                  }`}
                >
                  {checkFeedback.message}
                </div>
              )}
            </div>

            {/* Instructions for Paying with Single Phone */}
            <section className="bg-white rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs border border-[#E5E5E5]/60 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-100 text-[#F25B09] flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#111111]">Cara Bayar Menggunakan 1 HP</h3>
                  <p className="text-[11px] text-[#737373]">Ikuti 4 langkah mudah berikut:</p>
                </div>
              </div>

              <ol className="space-y-2 text-[#404040] leading-relaxed text-[11px] list-none pl-0">
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-neutral-100 text-[#111111] font-bold flex items-center justify-center shrink-0 text-[10px]">
                    1
                  </span>
                  <span>
                    Ketuk tombol <strong>Unduh QRIS</strong> di atas atau ambil tangkapan layar (screenshot) kode QR.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-neutral-100 text-[#111111] font-bold flex items-center justify-center shrink-0 text-[10px]">
                    2
                  </span>
                  <span>
                    Buka aplikasi m-Banking (BCA, Mandiri, BRI, BSI, dll) atau e-Wallet (GoPay, OVO, DANA, ShopeePay).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-neutral-100 text-[#111111] font-bold flex items-center justify-center shrink-0 text-[10px]">
                    3
                  </span>
                  <span>
                    Pilih menu <strong>Scan / Bayar QRIS</strong>, lalu ketuk ikon <strong>Galeri / Foto</strong> di pojok layar untuk mengunggah gambar QRIS.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-neutral-100 text-[#111111] font-bold flex items-center justify-center shrink-0 text-[10px]">
                    4
                  </span>
                  <span>
                    Periksa nominal transfer (pastikan persis <strong>{formatRupiah(paymentAmount)}</strong>) lalu konfirmasi PIN Anda.
                  </span>
                </li>
              </ol>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-[#F25B09] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-[#737373]">Memuat halaman pembayaran QRIS...</p>
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
