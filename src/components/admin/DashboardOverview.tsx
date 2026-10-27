"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Clock,
  QrCode,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  Store,
  ChevronRight,
  Package,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Order } from "@/types";
import { DashboardMetrics } from "@/lib/admin-reports";
import { StatusBadge } from "@/components/ui/Badge";
import { formatRupiah } from "@/data/dummy-data";

interface DashboardOverviewProps {
  user: {
    id: string;
    email?: string;
    last_sign_in_at?: string;
    app_metadata?: {
      provider?: string;
    };
  };
  initialMetrics?: DashboardMetrics | null;
  initialOrders?: Order[];
}

export function DashboardOverview({
  user,
  initialMetrics,
  initialOrders = [],
}: DashboardOverviewProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(initialMetrics || null);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>(() => {
    return new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  });

  // Client-side refresh directly against the protected API endpoint
  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports?range=today&metricsOnly=true", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        throw new Error(`Gagal menyinkronkan data (${res.status})`);
      }
      const data = await res.json();
      if (data.success && data.metrics) {
        setMetrics(data.metrics);
        if (Array.isArray(data.metrics.recentOrders)) {
          setOrders(data.metrics.recentOrders);
        }
        setLastRefreshed(
          new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
        );
      } else {
        throw new Error(data.error || "Gagal memproses data dasbor.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat dasbor.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshData();
      }
    }, 20000);
    const handleVis = () => {
      if (document.visibilityState === "visible") {
        refreshData();
      }
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, [refreshData]);

  // Safe fallback if metrics are still loading on client mount
  const currentMetrics = metrics || {
    newOrdersCount: 0,
    pendingQrisCount: 0,
    inProgressCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    totalOrdersCount: orders.length,
    totalRevenue: 0,
    todayOrdersCount: 0,
    todayRevenue: 0,
    unpaidOrdersCount: 0,
    paymentBreakdown: {
      lunas: 0,
      menungguVerifikasi: 0,
      menungguPembayaran: 0,
      dibatalkan: 0,
    },
    recentOrders: orders.slice(0, 5),
  };

  const recentOrders = currentMetrics.recentOrders || orders.slice(0, 5);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* =========================================================================
          TOP ACTION BAR & LIVE SYNC STATUS
          ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white border border-[#E5E5E5] rounded-2xl p-3 sm:px-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[#737373]">
            Data backend Supabase • Diperbarui pk. {lastRefreshed} WIB
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshData}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5E5] hover:bg-neutral-50 text-xs font-medium text-[#111111] transition-colors disabled:opacity-50 cursor-pointer"
            title="Segarkan data dari server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Memperbarui..." : "Segarkan"}</span>
          </button>

          <Link
            href="/admin/pesanan"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <span>Buka Pesanan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* =========================================================================
          STATISTICS OVERVIEW CARDS
          ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Card 1: Pesanan Baru */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#737373] font-medium">Pesanan Baru</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F25B09] flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-[#111111]" suppressHydrationWarning>
              {currentMetrics.newOrdersCount}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {currentMetrics.newOrdersCount > 0 ? (
                <span className="text-[10px] font-semibold text-[#F25B09] bg-orange-50 px-2 py-0.5 rounded-full">
                  Perlu Ditindak
                </span>
              ) : (
                <span className="text-[10px] text-[#737373]">Semua tertangani</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Menunggu Verifikasi QRIS */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#737373] font-medium">Verifikasi QRIS</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#8A4B08] flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-[#111111]" suppressHydrationWarning>
              {currentMetrics.pendingQrisCount}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {currentMetrics.pendingQrisCount > 0 ? (
                <span className="text-[10px] font-semibold text-[#8A4B08] bg-[#FFF4E5] px-2 py-0.5 rounded-full">
                  Cek DANA Bisnis
                </span>
              ) : (
                <span className="text-[10px] text-[#737373]">Tidak ada antrean</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Pesanan Berjalan */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#737373] font-medium">Diproses & Siap</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-[#111111]" suppressHydrationWarning>
              {currentMetrics.inProgressCount}
            </div>
            <div className="mt-1">
              <span className="text-[10px] text-[#737373]" suppressHydrationWarning>
                {currentMetrics.completedCount} pesanan selesai
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Estimasi Omzet Terverifikasi */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#737373] font-medium">Omzet Terverifikasi</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#18794E] flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg sm:text-2xl font-extrabold text-[#111111] truncate" suppressHydrationWarning>
              {formatRupiah(currentMetrics.totalRevenue)}
            </div>
            <div className="mt-1">
              <span className="text-[10px] text-[#737373]">
                Hari ini: {formatRupiah(currentMetrics.todayRevenue)} ({currentMetrics.todayOrdersCount} order)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          OPERATIONAL STATUS SUMMARY ROW
          ========================================================================= */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4">
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#F0F0F0]">
          <h4 className="text-xs font-bold text-[#111111]">Ringkasan Status Operasional</h4>
          <span className="text-[11px] text-[#737373]">
            Total {currentMetrics.totalOrdersCount} pesanan tercatat
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[#FAF9F8] border border-[#F0F0F0] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[#18794E]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="font-medium text-[#111111]">Lunas</span>
            </div>
            <span className="font-bold text-[#111111] font-mono">
              {currentMetrics.paymentBreakdown.lunas}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#FAF9F8] border border-[#F0F0F0] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[#8A4B08]">
              <QrCode className="w-3.5 h-3.5" />
              <span className="font-medium text-[#111111]">Cek QRIS</span>
            </div>
            <span className="font-bold text-[#111111] font-mono">
              {currentMetrics.paymentBreakdown.menungguVerifikasi}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#FAF9F8] border border-[#F0F0F0] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-600">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-medium text-[#111111]">Diproses</span>
            </div>
            <span className="font-bold text-[#111111] font-mono">
              {currentMetrics.inProgressCount}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#FAF9F8] border border-[#F0F0F0] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-neutral-500">
              <XCircle className="w-3.5 h-3.5" />
              <span className="font-medium text-[#111111]">Dibatalkan</span>
            </div>
            <span className="font-bold text-[#111111] font-mono">
              {currentMetrics.cancelledCount}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          QUICK ACTIONS
          ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Link
          href="/admin/pesanan"
          className="bg-white border border-[#E5E5E5] hover:border-neutral-400 p-3.5 rounded-2xl flex items-center gap-3 transition-colors group"
        >
          <div className="w-8 h-8 rounded-xl bg-neutral-100 group-hover:bg-[#111111] group-hover:text-white flex items-center justify-center text-[#111111] transition-colors">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-[#111111] block truncate">
              Kelola Pesanan
            </span>
            <span className="text-[10px] text-[#737373] block truncate">Semua order</span>
          </div>
        </Link>

        <Link
          href="/admin/pembayaran"
          className="bg-white border border-[#E5E5E5] hover:border-neutral-400 p-3.5 rounded-2xl flex items-center gap-3 transition-colors group"
        >
          <div className="w-8 h-8 rounded-xl bg-neutral-100 group-hover:bg-[#111111] group-hover:text-white flex items-center justify-center text-[#111111] transition-colors">
            <QrCode className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-[#111111] block truncate">
              Verifikasi QRIS
            </span>
            <span className="text-[10px] text-[#737373] block truncate">Mutasi DANA</span>
          </div>
        </Link>

        <Link
          href="/admin/menu"
          className="bg-white border border-[#E5E5E5] hover:border-neutral-400 p-3.5 rounded-2xl flex items-center gap-3 transition-colors group"
        >
          <div className="w-8 h-8 rounded-xl bg-neutral-100 group-hover:bg-[#111111] group-hover:text-white flex items-center justify-center text-[#111111] transition-colors">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-[#111111] block truncate">
              Katalog Menu
            </span>
            <span className="text-[10px] text-[#737373] block truncate">Atur HPP & harga</span>
          </div>
        </Link>

        <Link
          href="/admin/laporan"
          className="bg-white border border-[#E5E5E5] hover:border-neutral-400 p-3.5 rounded-2xl flex items-center gap-3 transition-colors group"
        >
          <div className="w-8 h-8 rounded-xl bg-neutral-100 group-hover:bg-[#111111] group-hover:text-white flex items-center justify-center text-[#111111] transition-colors">
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-[#111111] block truncate">
              Laporan Keuangan
            </span>
            <span className="text-[10px] text-[#737373] block truncate">Omzet, HPP, grafik</span>
          </div>
        </Link>
      </div>

      {/* =========================================================================
          RECENT ORDERS LIST (MOBILE-FIRST CARD ROWS)
          ========================================================================= */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0F0F0]">
          <div>
            <h3 className="text-sm font-bold text-[#111111]">Pesanan Terbaru</h3>
            <p className="text-[11px] text-[#737373]">
              Daftar transaksi operasional backend Supabase terbaru
            </p>
          </div>
          <Link
            href="/admin/pesanan"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#F25B09] hover:underline"
          >
            <span>Lihat Semua ({currentMetrics.totalOrdersCount})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-[#737373] flex items-center justify-center mx-auto">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#111111]">Belum ada pesanan masuk</p>
              <p className="text-[11px] text-[#737373] max-w-sm mx-auto mt-0.5">
                Pesanan yang dibuat oleh pelanggan melalui menu toko akan otomatis tercatat di backend Supabase dan tampil di sini.
              </p>
            </div>
            <Link
              href="/menu"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#111111] hover:bg-neutral-50"
            >
              <Store className="w-3.5 h-3.5 text-[#F25B09]" />
              <span>Buka Menu Toko</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentOrders.map((order) => {
              const dateObj = new Date(order.createdAt);
              const timeFormatted = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Jakarta",
                  })
                : "-";
              const dateFormatted = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    timeZone: "Asia/Jakarta",
                  })
                : "-";

              return (
                <div
                  key={order.id}
                  className="p-3.5 rounded-xl border border-[#E5E5E5] bg-[#FAF9F8] hover:bg-white transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#111111]">
                        {order.id}
                      </span>
                      <span className="text-[10px] text-[#737373]" suppressHydrationWarning>
                        {dateFormatted}, {timeFormatted} WIB
                      </span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-neutral-200/60 text-[#111111]">
                        {order.fulfillmentType === "delivery" ? "Delivery" : "Pickup"}
                      </span>
                    </div>

                    <div className="text-xs text-[#111111]">
                      <span className="font-semibold">{order.customerName || "Pelanggan"}</span>
                      {order.customerWhatsapp && (
                        <span className="text-[#737373] text-[11px] ml-1.5 font-mono">
                          ({order.customerWhatsapp})
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-[#737373] line-clamp-1">
                      {Array.isArray(order.items) && order.items.length > 0
                        ? order.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ")
                        : "Tidak ada item tercatat"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-200/50">
                    <div className="text-left sm:text-right">
                      <span className="text-xs font-bold text-[#111111] block">
                        {formatRupiah(order.total)}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <StatusBadge status={order.orderStatus} type="order" />
                      </div>
                    </div>

                    <Link
                      href="/admin/pesanan"
                      className="p-2 rounded-lg border border-[#E5E5E5] bg-white hover:bg-neutral-100 text-[#111111] transition-colors"
                      title="Lihat Detail Pesanan"
                    >
                      <ChevronRight className="w-4 h-4 text-[#737373]" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          VERIFIED OWNER IDENTITY CARD
          ========================================================================= */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#F0F0F0]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-[#111111]">Otorisasi Pemilik Toko</h3>
          </div>
          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            public.admin_users
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[10px] text-[#737373] block">Email Terdaftar</span>
            <span className="font-medium text-[#111111] truncate block">{user.email || "-"}</span>
          </div>
          <div>
            <span className="text-[10px] text-[#737373] block">User ID (Auth)</span>
            <span className="font-mono text-[10px] text-[#111111] truncate block select-all">
              {user.id}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#737373] block">Sesi Masuk</span>
            <span className="text-[#111111]" suppressHydrationWarning>
              {user.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString("id-ID", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "Asia/Jakarta",
                  })
                : "-"}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#737373] block">Provider</span>
            <span className="text-[#111111] capitalize">
              {user.app_metadata?.provider || "Email"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
