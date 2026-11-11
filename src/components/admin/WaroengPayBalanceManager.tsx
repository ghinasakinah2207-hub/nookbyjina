"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  RefreshCw,
  AlertCircle,
  Clock,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  CheckCircle2,
  Calendar,
  Layers,
  ExternalLink,
} from "lucide-react";
import type {
  WaroengPayBalanceResponse,
  WaroengPayUpcomingRelease,
} from "@/lib/waroengpay";

interface WaroengPayBalanceManagerProps {
  initialBalance?: WaroengPayBalanceResponse | null;
  initialError?: string | null;
  isConfigured?: boolean;
  isSandbox?: boolean;
}

function formatRupiah(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return "Rp0";
  }
  const rounded = Math.round(Number(amount));
  return `Rp${rounded.toLocaleString("id-ID")}`;
}

function formatWibDateTime(dateInput?: string | null): string {
  if (!dateInput) return "-";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return dateInput;
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Jakarta",
    }).format(d) + " WIB";
  } catch {
    return dateInput;
  }
}

export function WaroengPayBalanceManager({
  initialBalance = null,
  initialError = null,
  isConfigured = true,
  isSandbox = false,
}: WaroengPayBalanceManagerProps) {
  const [balance, setBalance] = useState<WaroengPayBalanceResponse | null>(initialBalance);
  const [error, setError] = useState<string | null>(initialError);
  const [configured, setConfigured] = useState<boolean>(isConfigured);
  const [sandboxMode, setSandboxMode] = useState<boolean>(isSandbox);
  const [loading, setLoading] = useState<boolean>(!initialBalance && !initialError);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>(
    initialBalance?.server_time || new Date().toISOString()
  );

  const fetchBalance = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch("/api/admin/waroengpay/balance", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        const errorMsg =
          data?.error || `Gagal memuat saldo WaroengPay (HTTP ${res.status}).`;
        setError(errorMsg);
        if (data?.configured !== undefined) {
          setConfigured(data.configured);
        }
      } else {
        setBalance(data.balance);
        setConfigured(true);
        if (typeof data.isSandbox === "boolean") {
          setSandboxMode(data.isSandbox);
        }
        if (data.lastUpdated) {
          setLastUpdated(data.lastUpdated);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan jaringan saat menghubungi server."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch only if initial data wasn't provided server-side
  useEffect(() => {
    let ignore = false;
    if (!initialBalance && !initialError) {
      const loadInitial = async () => {
        try {
          const res = await fetch("/api/admin/waroengpay/balance", {
            cache: "no-store",
          });
          const data = await res.json().catch(() => null);
          if (ignore) return;

          if (!res.ok || !data?.success) {
            setError(data?.error || `Gagal memuat saldo WaroengPay (HTTP ${res.status}).`);
            if (data?.configured !== undefined) {
              setConfigured(data.configured);
            }
          } else {
            setBalance(data.balance);
            setConfigured(true);
            if (typeof data.isSandbox === "boolean") {
              setSandboxMode(data.isSandbox);
            }
            if (data.lastUpdated) {
              setLastUpdated(data.lastUpdated);
            }
          }
        } catch (err) {
          if (ignore) return;
          setError(
            err instanceof Error
              ? err.message
              : "Terjadi kesalahan jaringan saat menghubungi server."
          );
        } finally {
          if (!ignore) {
            setLoading(false);
          }
        }
      };
      loadInitial();
    }
    return () => {
      ignore = true;
    };
  }, [initialBalance, initialError]);

  return (
    <div className="space-y-6">
      {/* =====================================================================
          HEADER SUMMARY & ACTIONS
          ===================================================================== */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E5E5E5] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-orange-50 text-[#F25B09] border border-orange-100 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#111111]">
                Saldo Merchant WaroengPay
              </h2>
              {sandboxMode ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Mode Sandbox
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Live Production
                </span>
              )}
            </div>
            <p className="text-xs text-[#737373] mt-0.5">
              Monitoring saldo akun QRIS, alokasi dana tertahan, dan riwayat penarikan
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
          <div className="text-left sm:text-right">
            <span className="text-[10px] text-[#737373] block">Terakhir Diperbarui</span>
            <span className="text-xs font-medium text-[#111111] block">
              {formatWibDateTime(lastUpdated)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => fetchBalance(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#111111] hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-sm"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing || loading ? "animate-spin" : ""}`}
            />
            <span>{refreshing ? "Memperbarui..." : "Perbarui"}</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          CONFIGURATION GUIDE IF KEY NOT SET
          ===================================================================== */}
      {!configured && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-amber-950">
                Kredensial WaroengPay Belum Dikonfigurasi
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                Variabel lingkungan <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-amber-950">WAROENGPAY_API_KEY</code> belum ditemukan di server. Untuk menghubungkan pemantauan saldo:
              </p>
              <ol className="list-decimal list-inside text-xs text-amber-800 space-y-1">
                <li>Buka dashboard WaroengPay → Integrasi & API → Kredensial.</li>
                <li>Salin API Key (<code className="font-mono">wp_live_...</code> atau <code className="font-mono">wp_test_...</code>).</li>
                <li>Tambahkan <code className="font-mono">WAROENGPAY_API_KEY=wp_...</code> ke dalam file <code className="font-mono">.env.local</code> di server.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ERROR STATE WITH RETRY
          ===================================================================== */}
      {error && (
        <div className="p-4 sm:p-5 rounded-2xl bg-red-50 border border-red-200 text-[#B42318] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#B42318] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold">Gagal Mengambil Informasi Saldo</h3>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchBalance(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-red-300 text-[#B42318] hover:bg-red-50 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      )}

      {/* =====================================================================
          LOADING SKELETON
          ===================================================================== */}
      {loading && !balance && (
        <div className="space-y-6 animate-landing-fade">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-white border border-[#E5E5E5] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="w-24 h-3 bg-neutral-200 rounded-md animate-pulse" />
                  <div className="w-8 h-8 rounded-xl bg-neutral-100 animate-pulse" />
                </div>
                <div className="w-32 h-7 bg-neutral-200 rounded-lg animate-pulse" />
                <div className="w-40 h-2.5 bg-neutral-100 rounded-md animate-pulse" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-[#E5E5E5] space-y-4">
              <div className="w-36 h-4 bg-neutral-200 rounded-md animate-pulse" />
              <div className="space-y-3">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="flex justify-between py-2 border-b border-neutral-100">
                    <div className="w-28 h-3 bg-neutral-100 rounded animate-pulse" />
                    <div className="w-20 h-3 bg-neutral-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-[#E5E5E5] space-y-4">
              <div className="w-44 h-4 bg-neutral-200 rounded-md animate-pulse" />
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="p-3 rounded-xl bg-neutral-50 animate-pulse h-12" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ACTIVE BALANCE MONITORING CARDS
          ===================================================================== */}
      {balance && (
        <div className="space-y-6 animate-landing-fade">
          {/* Top 4 Primary Metric Cards: Clear Distinction (Available vs Held) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Saldo Siap Ditarik (AVAILABLE) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-emerald-500/30 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#737373]">
                  Saldo Siap Ditarik
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#111111] tracking-tight">
                {formatRupiah(balance.available)}
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-[11px]">
                <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Dapat dicairkan
                </span>
                <span className="text-[#737373]">
                  Min: {formatRupiah(balance.min_withdraw)}
                </span>
              </div>
            </div>

            {/* 2. Dana Tertahan (HELD) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E5E5E5] shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#737373]">
                  Dana Tertahan (Held)
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#111111] tracking-tight">
                {formatRupiah(balance.held)}
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-[11px]">
                <span className="text-amber-800 font-medium">Holding Period</span>
                <span className="text-[#737373] text-[10px] truncate max-w-[120px]" title={balance.next_release_at || "Tidak ada"}>
                  {balance.next_release_at ? formatWibDateTime(balance.next_release_at) : "Semua cair"}
                </span>
              </div>
            </div>

            {/* 3. Sedang Diproses (IN PROCESS & PENDING WITHDRAWALS) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E5E5E5] shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#737373]">
                  Proses Penarikan
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#111111] tracking-tight">
                {formatRupiah(balance.in_process)}
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-[11px]">
                <span className="text-blue-700 font-medium">
                  {balance.pending_withdrawals?.count || 0} permintaan
                </span>
                <span className="text-[#737373]">
                  {formatRupiah(balance.pending_withdrawals?.amount || 0)}
                </span>
              </div>
            </div>

            {/* 4. Total Ditarik (WITHDRAWN) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E5E5E5] shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#737373]">
                  Total Telah Ditarik
                </span>
                <div className="w-8 h-8 rounded-xl bg-neutral-100 text-[#737373] flex items-center justify-center">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#111111] tracking-tight">
                {formatRupiah(balance.withdrawn)}
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-[11px]">
                <span className="text-[#737373]">Kumulatif Payout</span>
                <span className="text-emerald-700 font-medium">Lunas</span>
              </div>
            </div>
          </div>

          {/* Detailed Financial Breakdown & Upcoming Releases Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Card Left: Rincian Arus Transaksi & Potongan */}
            <div className="p-5 rounded-2xl bg-white border border-[#E5E5E5] space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#F0F0F0] pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#F25B09]" />
                  <h3 className="text-sm font-bold text-[#111111]">
                    Rincian Arus Transaksi & Biaya
                  </h3>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-[#737373]">
                  {balance.currency || "IDR"}
                </span>
              </div>

              <div className="divide-y divide-neutral-100 text-xs">
                {/* Gross */}
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-[#111111] block">Total Transaksi Bruto (Gross)</span>
                    <span className="text-[10px] text-[#737373] block">Akumulasi seluruh transaksi lunas sebelum potongan</span>
                  </div>
                  <span className="font-bold text-[#111111]">{formatRupiah(balance.gross)}</span>
                </div>

                {/* Fee */}
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-[#111111] block">Biaya Transaksi Gateway (Fee)</span>
                    <span className="text-[10px] text-[#737373] block">Potongan biaya transaksi QRIS WaroengPay</span>
                  </div>
                  <span className="font-bold text-red-600">
                    -{formatRupiah(balance.fee)}
                  </span>
                </div>

                {/* Platform Fee */}
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-[#111111] block">Biaya Platform Mitra (Platform Fee)</span>
                    <span className="text-[10px] text-[#737373] block">Potongan modal mitra / biaya platform tambahan</span>
                  </div>
                  <span className="font-bold text-red-600">
                    -{formatRupiah(balance.platform_fee)}
                  </span>
                </div>

                {/* Adjustments */}
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-[#111111] block">Penyesuaian Saldo (Adjustments)</span>
                    <span className="text-[10px] text-[#737373] block">Koreksi debit/kredit manual oleh sistem gateway</span>
                  </div>
                  <span className={`font-bold ${balance.adjustments < 0 ? "text-red-600" : "text-[#111111]"}`}>
                    {balance.adjustments < 0 ? "-" : "+"}
                    {formatRupiah(Math.abs(balance.adjustments))}
                  </span>
                </div>

                {/* Min Withdraw */}
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-[#111111] block">Batas Minimal Penarikan</span>
                    <span className="text-[10px] text-[#737373] block">Batas minimal pengajuan saldo ke rekening bank</span>
                  </div>
                  <span className="font-semibold text-emerald-700">
                    {formatRupiah(balance.min_withdraw)}
                  </span>
                </div>
              </div>
            </div>

            {/* Card Right: Jadwal Pencairan Dana Tertahan (Upcoming Releases) */}
            <div className="p-5 rounded-2xl bg-white border border-[#E5E5E5] space-y-4 shadow-sm flex flex-col">
              <div className="flex items-center justify-between border-b border-[#F0F0F0] pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#F25B09]" />
                  <h3 className="text-sm font-bold text-[#111111]">
                    Jadwal Pelepasan Dana Tertahan (Upcoming)
                  </h3>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  {balance.upcoming?.length || 0} Batch
                </span>
              </div>

              {balance.upcoming && balance.upcoming.length > 0 ? (
                <div className="space-y-2 flex-1 overflow-y-auto max-h-[260px] pr-1">
                  {balance.upcoming.map((release: WaroengPayUpcomingRelease, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white border border-neutral-200 text-amber-700 flex items-center justify-center flex-shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-semibold text-[#111111] block">
                            {formatWibDateTime(release.at)}
                          </span>
                          <span className="text-[10px] text-[#737373] block">
                            {release.count} transaksi akan dilepas
                          </span>
                        </div>
                      </div>
                      <span className="font-bold text-emerald-700">
                        +{formatRupiah(release.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center rounded-xl bg-neutral-50/60 border border-dashed border-neutral-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
                  <p className="text-xs font-semibold text-[#111111]">
                    Tidak Ada Dana Tertahan Menunggu Rilis
                  </p>
                  <p className="text-[11px] text-[#737373] mt-0.5 max-w-xs">
                    Seluruh dana transaksi yang telah lunas telah dicairkan ke saldo siap tarik.
                  </p>
                </div>
              )}

              {/* Next Release Badge */}
              <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] text-[#737373]">
                <span>Pelepasan Terdekat:</span>
                <span className="font-semibold text-[#111111]">
                  {balance.next_release_at ? formatWibDateTime(balance.next_release_at) : "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* =====================================================================
              SECURITY, AUDIT & READ-ONLY NOTICE
              ===================================================================== */}
          <div className="p-4 rounded-2xl bg-[#FAF9F8] border border-[#E5E5E5] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-[#18794E] flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-[#111111] block">
                  Integrasi Monitoring Saldo Aman (Read-Only)
                </span>
                <span className="text-[11px] text-[#737373] block">
                  Waktu Server Gateway: {formatWibDateTime(balance.server_time)} • Kredensial terlindungi di server
                </span>
              </div>
            </div>

            <a
              href="https://waroengpay.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5E5] bg-white text-xs font-medium text-[#737373] hover:text-[#111111] hover:border-neutral-300 transition-colors"
            >
              <span>Dashboard WaroengPay</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
