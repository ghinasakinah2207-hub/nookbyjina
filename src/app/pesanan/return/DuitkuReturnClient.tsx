"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Clock, ArrowRight } from "lucide-react";
import { getOrderToken } from "@/lib/order-token-vault";

export default function DuitkuReturnClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const merchantOrderId = searchParams.get("merchantOrderId")?.trim() || "";
  const resultCode = searchParams.get("resultCode")?.trim() || "";
  const reference = searchParams.get("reference")?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function resolveCustomerOrder() {
      // 1. Validate parameter existence
      if (!merchantOrderId) {
        setErrorMessage("Parameter transaksi tidak lengkap (merchantOrderId tidak ditemukan).");
        setLoading(false);
        return;
      }

      // 2. Check local token vault for matching token
      // Customers who initiated checkout on this browser will have their token saved by orderId
      const savedToken = getOrderToken(merchantOrderId);

      if (savedToken) {
        // Redirect seamlessly to the customer's authoritative tracking page
        // Never rely on resultCode from URL query parameter; /pesanan/[token] fetches real-time DB status
        router.replace(`/pesanan/${encodeURIComponent(savedToken)}`);
        return;
      }

      // 3. If token is not in local vault (e.g. redirected to a different browser session),
      // do NOT expose other customers' orders or brute force tokens.
      // Display safe guidance to user.
      if (!isCancelled) {
        setLoading(false);
      }
    }

    resolveCustomerOrder();

    return () => {
      isCancelled = true;
    };
  }, [merchantOrderId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-[#F25B09] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-[#737373]">
          Memeriksa status pembayaran pesanan...
        </p>
      </div>
    );
  }

  // Error case: Missing parameter
  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-sm border border-[#E5E5E5] text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 text-[#B42318] rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#111111]">Tautan Pengembalian Tidak Lengkap</h1>
            <p className="text-xs text-[#737373] mt-1">{errorMessage}</p>
          </div>
          <div className="pt-2">
            <Link
              href="/home"
              className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-[#F25B09] hover:bg-[#d94f07] text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Fallback case: Order ID present, but browser token vault does not contain the secret access token
  return (
    <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-sm border border-[#E5E5E5] space-y-4">
        <div className="w-12 h-12 bg-orange-50 text-[#F25B09] rounded-full flex items-center justify-center mx-auto">
          <Clock className="w-6 h-6" />
        </div>

        <div className="text-center">
          <h1 className="text-base font-bold text-[#111111]">Transaksi Telah Diproses</h1>
          <p className="text-xs text-[#737373] mt-1.5 leading-relaxed">
            Sistem pembayaran Duitku telah menyelesaikan proses verifikasi.
          </p>
        </div>

        <div className="p-3 bg-neutral-50 rounded-xl border border-[#E5E5E5] text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#737373]">Nomor Pesanan:</span>
            <span className="font-semibold text-[#111111]">{merchantOrderId}</span>
          </div>
          {reference ? (
            <div className="flex justify-between">
              <span className="text-[#737373]">No. Referensi:</span>
              <span className="font-mono text-[11px] text-[#737373]">{reference}</span>
            </div>
          ) : null}
          {resultCode ? (
            <div className="flex justify-between">
              <span className="text-[#737373]">Status Gateway:</span>
              <span className="text-[11px] font-medium text-[#737373]">
                {resultCode === "00" ? "Berhasil (Menunggu Sinkronisasi)" : "Pending / Selesai"}
              </span>
            </div>
          ) : null}
        </div>

        <p className="text-[11px] text-[#737373] text-center leading-relaxed">
          Jika Anda menggunakan peramban berbeda atau mode penyamaran (incognito), silakan periksa riwayat pesanan Anda di tab peramban tempat Anda membuat pesanan.
        </p>

        <div className="pt-2 space-y-2">
          <Link
            href="/pesanan"
            className="w-full min-h-[44px] px-4 py-2.5 bg-[#F25B09] hover:bg-[#d94f07] text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Buka Riwayat Pesanan Saya</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/home"
            className="w-full min-h-[44px] px-4 py-2.5 bg-white border border-[#E5E5E5] text-[#111111] hover:bg-neutral-50 font-semibold text-xs rounded-xl flex items-center justify-center transition-colors"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
