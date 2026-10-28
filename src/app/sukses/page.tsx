"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  ArrowRight,
  Share2,
  Receipt,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatusBadge } from "@/components/ui/Badge";
import { useOrder } from "@/context/OrderContext";
import { getOrderToken } from "@/lib/order-token-vault";
import { Suspense } from "react";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { orders } = useOrder();

  const order = orders.find((o) => o.id === orderId) || orders[0];
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "failed">(
    "idle"
  );

  if (!order) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-base font-bold text-[#111111]">
          Pesanan Berhasil Dibuat
        </h1>
        <p className="text-xs text-[#737373] mt-2 mb-6">
          Terima kasih telah memesan di Nook by Jina.
        </p>
        <Link
          href="/pesanan"
          className="px-6 py-2.5 bg-[#111111] text-white text-xs font-semibold rounded-xl"
        >
          Lihat Riwayat Pesanan
        </Link>
      </div>
    );
  }

  const resolvedToken = order.token || (order.id ? getOrderToken(order.id) : "") || "";
  const orderUrl = typeof window !== "undefined"
    ? `${window.location.origin}/pesanan/${resolvedToken}`
    : `/pesanan/${resolvedToken}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(orderUrl);
      setCopyStatus("success");
      setTimeout(() => setCopyStatus("idle"), 2500);
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <div className="min-h-screen pb-16 bg-[#F6F6F7]">
      <Header title="Pesanan Dibuat" showBack={false} showCart={false} />

      <main className="max-w-md mx-auto px-4 pt-5 space-y-2.5">
        {/* Success Icon Card */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 text-[#18794E] flex items-center justify-center border border-emerald-100">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="text-xs text-[#737373] block uppercase tracking-wider font-semibold">
              Pesanan Diterima
            </span>
            <h1 className="text-2xl font-black font-mono text-[#111111] mt-1">
              {order.id}
            </h1>
          </div>

          <div className="flex justify-center pt-1">
            <StatusBadge status={order.orderStatus} />
          </div>

          <p className="text-xs text-[#737373] leading-relaxed pt-2">
            Pesanan Anda telah tercatat di browser ini. Selesaikan pembayaran QRIS agar admin dapat memverifikasi dan menyiapkan hidangan.
          </p>
        </div>

        {/* Share Token Link Box */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#F25B09]" />
            <h2 className="text-xs font-bold text-[#111111]">
              Tautan Akses Pesanan Anonim
            </h2>
          </div>
          <p className="text-[11px] text-[#737373] leading-relaxed">
            Simpan atau bagikan tautan ini untuk memantau status pesanan kapan saja tanpa perlu login akun.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={orderUrl}
              className="flex-1 h-11 px-3 bg-neutral-50 border border-[#E5E5E5] rounded-xl text-xs text-[#737373] font-mono select-all"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="h-11 px-4 bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 min-w-[90px] justify-center transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copyStatus === "success" ? "Tersalin!" : "Salin"}</span>
            </button>
          </div>

          {copyStatus === "success" ? (
            <p className="text-[11px] text-[#18794E] font-medium">
              Tautan pesanan berhasil disalin.
            </p>
          ) : copyStatus === "failed" ? (
            <p className="text-[11px] text-[#B42318]">
              Tautan belum tersalin. Silakan salin alamat ini secara manual.
            </p>
          ) : null}
        </div>

        {/* Action CTAs */}
        <div className="space-y-2 pt-0.5">
          <Link
            href={`/pembayaran/${order.id}`}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#F25B09] hover:bg-[#D94D06] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <span>Lanjut ke Pembayaran QRIS</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href={resolvedToken ? `/pesanan/${resolvedToken}` : "/pesanan"}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-[#E5E5E5] text-[#111111] hover:bg-neutral-50 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Receipt className="w-4 h-4 text-[#737373]" />
            <span>Lihat Detail & Struk Pesanan</span>
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center text-xs text-[#737373]">
          Memuat...
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}
