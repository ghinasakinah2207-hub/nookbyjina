"use client";

import React, { useState, useCallback, useTransition } from "react";
import Link from "next/link";
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Package,
  RefreshCw,
  AlertCircle,
  Info,
  Calendar,
  Truck,
  Store,
  QrCode,
  Banknote,
  ArrowUpRight,
} from "lucide-react";
import {
  ReportStats,
  ReportTimeRange,
  SalesChartPoint,
} from "@/lib/admin-reports";
import { formatRupiah } from "@/data/dummy-data";

interface ReportsManagerProps {
  initialReports?: ReportStats | null;
}

export function ReportsManager({ initialReports }: ReportsManagerProps) {
  const [selectedRange, setSelectedRange] = useState<ReportTimeRange>(
    initialReports?.range || "7days"
  );
  const [reports, setReports] = useState<ReportStats | null>(initialReports || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const fetchReportsForRange = useCallback(async (range: ReportTimeRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports?range=${range}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        throw new Error(`Gagal memuat laporan (${res.status})`);
      }
      const data = await res.json();
      if (data.success && data.reports) {
        setReports(data.reports);
      } else {
        throw new Error(data.error || "Format laporan tidak valid.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui laporan.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRangeChange = (range: ReportTimeRange) => {
    setSelectedRange(range);
    startTransition(() => {
      fetchReportsForRange(range);
    });
  };

  // Safe fallback if initial reports are absent
  const stats: ReportStats = reports || {
    range: selectedRange,
    rangeLabel: "7 Hari Terakhir",
    startDateWIB: "",
    endDateWIB: "",
    totalRevenue: 0,
    itemRevenue: 0,
    shippingRevenue: 0,
    paidOrdersCount: 0,
    totalOrdersCount: 0,
    cancelledOrdersCount: 0,
    averageOrderValue: 0,
    hppSummary: {
      knownHppTotal: 0,
      itemsWithHppCount: 0,
      itemsWithoutHppCount: 0,
      totalItemsSold: 0,
      hppCoveragePercentage: 0,
      isHppIncomplete: false,
      estimatedGrossProfit: 0,
    },
    deliveryCount: 0,
    pickupCount: 0,
    qrisCount: 0,
    cashCount: 0,
    topProducts: [],
    chartData: [],
  };

  // Calculate maximum revenue for chart bar scaling
  const maxRevenue = Math.max(
    1,
    ...stats.chartData.map((d: SalesChartPoint) => d.revenue)
  );

  return (
    <div className="space-y-4">
      {/* =========================================================================
          CONTROL BAR: TIME RANGE SELECTOR & REFRESH BUTTON
          ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E5E5E5] rounded-2xl p-3 sm:px-4">
        {/* Time range pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => handleRangeChange("today")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedRange === "today"
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 hover:bg-neutral-200 text-[#111111]"
            }`}
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => handleRangeChange("7days")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedRange === "7days"
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 hover:bg-neutral-200 text-[#111111]"
            }`}
          >
            7 Hari Terakhir
          </button>
          <button
            type="button"
            onClick={() => handleRangeChange("30days")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedRange === "30days"
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 hover:bg-neutral-200 text-[#111111]"
            }`}
          >
            30 Hari Terakhir
          </button>
          <button
            type="button"
            onClick={() => handleRangeChange("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedRange === "all"
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 hover:bg-neutral-200 text-[#111111]"
            }`}
          >
            Semua Waktu
          </button>
        </div>

        {/* Sync & Date boundary indicator */}
        <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-[#737373]">
            <Calendar className="w-3.5 h-3.5 text-[#F25B09]" />
            <span className="font-mono text-[11px]">
              {stats.startDateWIB && stats.endDateWIB
                ? `${stats.startDateWIB} s/d ${stats.endDateWIB} (WIB)`
                : "Waktu Indonesia Barat (WIB)"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => fetchReportsForRange(selectedRange)}
            disabled={loading}
            className="p-1.5 rounded-lg border border-[#E5E5E5] hover:bg-neutral-50 text-[#111111] transition-colors disabled:opacity-50 cursor-pointer"
            title="Segarkan data laporan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* =========================================================================
          KEY FINANCIAL METRICS (4 CARDS)
          ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Total Omzet */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#737373] font-medium">Total Omzet Penjualan</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#18794E] flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg sm:text-2xl font-extrabold text-[#111111] truncate">
              {formatRupiah(stats.totalRevenue)}
            </div>
            <span className="text-[10px] text-[#737373] mt-1 block">
              Dari {stats.paidOrdersCount} pesanan lunas
              {stats.cancelledOrdersCount > 0 && (
                <span className="block text-neutral-400">
                  ({stats.cancelledOrdersCount} pesanan batal tidak dihitung)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Estimasi Laba Kotor */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#737373] font-medium">Estimasi Laba Kotor</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F25B09] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg sm:text-2xl font-extrabold text-[#111111] truncate">
              {formatRupiah(stats.hppSummary.estimatedGrossProfit)}
            </div>
            <span className="text-[10px] text-[#737373] mt-1 block">
              {stats.hppSummary.itemsWithHppCount === 0 ? (
                "HPP belum diatur di menu"
              ) : stats.hppSummary.isHppIncomplete ? (
                `Dari ${stats.hppSummary.hppCoveragePercentage}% porsi terdata`
              ) : (
                "Omzet makanan dikurangi HPP bahan"
              )}
            </span>
          </div>
        </div>

        {/* HPP Bahan Pokok (COGS) */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#737373] font-medium">HPP Bahan Terjual</span>
            <div className="w-8 h-8 rounded-xl bg-neutral-100 text-[#111111] flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg sm:text-2xl font-extrabold text-[#111111] truncate">
              {formatRupiah(stats.hppSummary.knownHppTotal)}
            </div>
            <span className="text-[10px] text-[#737373] mt-1 block">
              {stats.hppSummary.itemsWithHppCount === 0
                ? "0 porsi dengan nilai HPP"
                : `${stats.hppSummary.itemsWithHppCount} dari ${stats.hppSummary.totalItemsSold} porsi (${stats.hppSummary.hppCoveragePercentage}%)`}
            </span>
          </div>
        </div>

        {/* Nilai Rata-rata Pesanan (AOV) */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#737373] font-medium">Rata-rata Order (AOV)</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg sm:text-2xl font-extrabold text-[#111111] truncate">
              {formatRupiah(stats.averageOrderValue)}
            </div>
            <span className="text-[10px] text-[#737373] mt-1 block">
              {stats.hppSummary.totalItemsSold} total porsi/item terjual
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          HONEST HPP TRANSPARENCY NOTICE
          ========================================================================= */}
      {stats.hppSummary.isHppIncomplete && (
        <div className="p-3.5 rounded-2xl border border-amber-200 bg-[#FFFBEB] text-[#92400E] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <span className="font-bold block">Transparansi Data HPP:</span>
              <span className="text-[11px] text-[#B45309] block mt-0.5">
                {stats.hppSummary.itemsWithoutHppCount} dari {stats.hppSummary.totalItemsSold} porsi terjual belum memiliki konfigurasi HPP pada katalog produk. Sistem tidak mengarang persentase estimasi tiruan. Estimasi laba kotor di atas dihitung hanya dari produk yang sudah memiliki nilai HPP.
              </span>
            </div>
          </div>
          <Link
            href="/admin/menu"
            className="inline-flex items-center gap-1 self-start sm:self-center px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>Atur HPP Produk</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* =========================================================================
          SALES TREND CHART (DAILY / RANGE SALES CHART)
          ========================================================================= */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0F0F0]">
          <div>
            <h3 className="text-sm font-bold text-[#111111]">Grafik Penjualan Harian</h3>
            <p className="text-[11px] text-[#737373]">
              Tren omzet dan frekuensi pesanan dalam rentang {stats.rangeLabel} (WIB)
            </p>
          </div>
          <span className="text-xs font-extrabold text-[#111111]">
            {formatRupiah(stats.totalRevenue)}
          </span>
        </div>

        {stats.chartData.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#737373]">
            Tidak ada transaksi dalam rentang waktu yang dipilih.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Chart Area */}
            <div className="h-44 sm:h-52 flex items-end gap-1.5 sm:gap-2.5 pt-6 pb-2 overflow-x-auto scrollbar-thin">
              {stats.chartData.map((point: SalesChartPoint, idx: number) => {
                const heightPercent =
                  point.revenue > 0
                    ? Math.max(10, Math.round((point.revenue / maxRevenue) * 100))
                    : 4;

                return (
                  <div
                    key={idx}
                    className="flex-1 min-w-[28px] sm:min-w-[36px] flex flex-col items-center justify-end h-full group relative"
                  >
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity absolute bottom-full mb-2 z-20 bg-[#111111] text-white text-[10px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap text-center">
                      <div className="font-bold">{point.label}</div>
                      <div className="text-emerald-400 font-semibold">{formatRupiah(point.revenue)}</div>
                      <div className="text-neutral-300">{point.orderCount} pesanan lunas</div>
                    </div>

                    {/* Bar element */}
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full max-w-[28px] rounded-t-md transition-all duration-300 ${
                        point.revenue > 0
                          ? "bg-gradient-to-t from-[#F25B09] to-[#FF8C42] group-hover:from-orange-600 group-hover:to-orange-500"
                          : "bg-neutral-100"
                      }`}
                    />

                    {/* Date label */}
                    <span className="text-[9px] text-[#737373] mt-2 block truncate max-w-full text-center">
                      {point.label.split(",")[0] || point.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#F0F0F0] text-[10px] text-[#737373]">
              <span>Titik awal: {stats.chartData[0]?.label || "-"}</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#F25B09] inline-block" />
                  <span>Omzet lunas</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-neutral-200 inline-block" />
                  <span>Tanpa penjualan</span>
                </span>
              </div>
              <span>Titik akhir: {stats.chartData[stats.chartData.length - 1]?.label || "-"}</span>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          OPERATIONAL DISTRIBUTION BREAKDOWN
          ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
        {/* Card: Metode Pengiriman */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#F0F0F0]">
            <span className="text-xs font-bold text-[#111111]">Metode Pengiriman</span>
            <span className="text-[10px] text-[#737373]">Dari pesanan lunas</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[#FAF9F8]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-50 text-[#F25B09] flex items-center justify-center">
                  <Truck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-[#111111] block">Delivery</span>
                  <span className="text-[10px] text-[#737373]">Antar alamat Lhoksukon</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-[#111111] block font-mono">{stats.deliveryCount}</span>
                <span className="text-[10px] text-[#737373]">
                  {stats.paidOrdersCount > 0
                    ? Math.round((stats.deliveryCount / stats.paidOrdersCount) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[#FAF9F8]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-neutral-100 text-[#111111] flex items-center justify-center">
                  <Store className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-[#111111] block">Pickup / Takeaway</span>
                  <span className="text-[10px] text-[#737373]">Ambil mandiri di toko</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-[#111111] block font-mono">{stats.pickupCount}</span>
                <span className="text-[10px] text-[#737373]">
                  {stats.paidOrdersCount > 0
                    ? Math.round((stats.pickupCount / stats.paidOrdersCount) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Metode Pembayaran */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#F0F0F0]">
            <span className="text-xs font-bold text-[#111111]">Metode Pembayaran</span>
            <span className="text-[10px] text-[#737373]">Dari pesanan lunas</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[#FAF9F8]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-[#8A4B08] flex items-center justify-center">
                  <QrCode className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-[#111111] block">QRIS Statis</span>
                  <span className="text-[10px] text-[#737373]">DANA Bisnis</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-[#111111] block font-mono">{stats.qrisCount}</span>
                <span className="text-[10px] text-[#737373]">
                  {stats.paidOrdersCount > 0
                    ? Math.round((stats.qrisCount / stats.paidOrdersCount) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[#FAF9F8]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#18794E] flex items-center justify-center">
                  <Banknote className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-[#111111] block">Tunai / Cash</span>
                  <span className="text-[10px] text-[#737373]">Bayar saat diterima</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-[#111111] block font-mono">{stats.cashCount}</span>
                <span className="text-[10px] text-[#737373]">
                  {stats.paidOrdersCount > 0
                    ? Math.round((stats.cashCount / stats.paidOrdersCount) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TOP PRODUCTS
          ========================================================================= */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0F0F0]">
          <div>
            <h3 className="text-sm font-bold text-[#111111]">Produk Paling Banyak Dipesan</h3>
            <p className="text-[11px] text-[#737373]">
              Berdasarkan kuantitas porsi dari pesanan lunas ({stats.rangeLabel})
            </p>
          </div>
          <span className="text-[10px] text-[#737373]">
            {stats.topProducts.length} varian menu terjual
          </span>
        </div>

        {stats.topProducts.length === 0 ? (
          <p className="text-xs text-[#737373] py-8 text-center">
            Belum ada transaksi penjualan produk yang lunas pada rentang waktu ini.
          </p>
        ) : (
          <div className="space-y-2.5">
            {stats.topProducts.slice(0, 10).map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs p-3 rounded-xl bg-[#FAF9F8] hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-lg font-bold text-[11px] flex items-center justify-center shrink-0 ${
                      idx === 0
                        ? "bg-[#F25B09] text-white"
                        : idx === 1
                        ? "bg-neutral-800 text-white"
                        : idx === 2
                        ? "bg-neutral-300 text-neutral-800"
                        : "bg-neutral-200/80 text-[#111111]"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="font-semibold text-[#111111] block truncate">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-[#737373] mt-0.5 flex-wrap">
                      <span>{item.quantity} porsi terjual</span>
                      <span>•</span>
                      <span>{item.ordersCount} pesanan</span>
                      {item.hasHpp && item.unitHpp !== null && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-700 font-medium">
                            HPP: {formatRupiah(item.unitHpp)} / porsi
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-3">
                  <span className="font-bold text-[#111111] block">
                    {formatRupiah(item.revenue)}
                  </span>
                  {item.hasHpp && item.grossProfit !== null ? (
                    <span className="text-[10px] text-emerald-600 font-medium block">
                      Laba: {formatRupiah(item.grossProfit)}
                    </span>
                  ) : (
                    <span className="text-[9px] text-[#737373] bg-neutral-200/60 px-1.5 py-0.5 rounded block mt-0.5">
                      HPP belum diatur
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
