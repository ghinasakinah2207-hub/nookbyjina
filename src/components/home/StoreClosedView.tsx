import React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Clock,
  MessageCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { StoreSettings } from "@/types";

interface StoreClosedViewProps {
  storeSettings?: StoreSettings;
}

/**
 * Custom WebP Store Closed Illustration.
 * Uses the asset from /images/store-closed.webp with preserved aspect ratio and responsive compact sizing.
 */
export function StoreClosedIllustration({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative w-28 sm:w-36 md:w-44 max-h-[135px] sm:max-h-[170px] mx-auto flex items-center justify-center ${className}`}
    >
      <Image
        src="/images/store-closed.webp"
        alt="Ilustrasi toko Nook by Jina sedang tutup order sementara"
        width={1145}
        height={1374}
        priority
        className="w-full max-h-[135px] sm:max-h-[170px] h-auto object-contain select-none"
        sizes="(max-width: 640px) 112px, 144px"
      />
    </div>
  );
}

export function StoreClosedView({ storeSettings }: StoreClosedViewProps) {
  const storeName = storeSettings?.storeName || "Nook by Jina";
  const operatingHours =
    storeSettings?.operatingHoursText || "Buka Setiap Hari (10:00 - 20:00 WIB)";
  const whatsappNumber = storeSettings?.adminWhatsapp || "6282273180000";

  const waInquiryUrl = `https://wa.me/${whatsappNumber.replace(
    /[^0-9]/g,
    ""
  )}?text=${encodeURIComponent(
    `Halo ${storeName}, mau tanya kapan pesanan berikutnya dibuka kembali? Terima kasih.`
  )}`;

  return (
    <div className="min-h-[100svh] bg-[#F6F6F7] flex flex-col justify-between px-4 py-3 sm:py-6">
      {/* Top Brand Tag */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between text-xs text-[#737373] shrink-0">
        <div className="flex items-center gap-1.5 font-bold text-[#111111]">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span>{storeName}</span>
        </div>
        <span className="text-[11px] bg-red-50 text-[#B42318] font-semibold px-2.5 py-1 rounded-full border border-red-200">
          Close Order
        </span>
      </header>

      {/* Main Apology Content Card */}
      <main className="w-full max-w-md mx-auto my-auto py-2 sm:py-4 flex flex-col items-center text-center space-y-3 sm:space-y-4 animate-landing-fade">
        {/* Custom WebP Apology Illustration */}
        <StoreClosedIllustration />

        {/* Headline & Description */}
        <div className="space-y-1.5 sm:space-y-2 px-2">
          <h1 className="text-lg sm:text-xl font-extrabold text-[#111111] tracking-tight leading-snug">
            Maaf ya kakak-kakak,
            <br />
            toko kita sedang close order.
          </h1>
          <p className="text-[11px] sm:text-xs text-[#737373] leading-relaxed max-w-xs mx-auto">
            Dapur kami saat ini sedang beristirahat atau kuota pesanan hari ini sudah penuh. Kami akan segera kembali membuka pemesanan untuk sajian lezat berikutnya!
          </p>
        </div>

        {/* Operating Hours Info Badge */}
        {operatingHours && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-[#F25B09] flex-shrink-0" />
            <span className="font-medium text-[10px] sm:text-[11px] text-[#737373]">
              Jadwal Operasional:{" "}
              <strong className="text-[#111111] font-semibold">
                {operatingHours}
              </strong>
            </span>
          </div>
        )}

        {/* Action Controls */}
        <div className="w-full space-y-2 pt-1">
          {/* Primary Action: Chat Admin WhatsApp */}
          <a
            href={waInquiryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <MessageCircle className="w-4 h-4 text-[#25D366]" />
            <span>Tanya Jadwal Buka via WhatsApp</span>
          </a>

          {/* Secondary Action: Order Tracking for Existing Customers */}
          <Link
            href="/pesanan"
            className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-neutral-50 text-[#111111] border border-[#E5E5E5] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-[#737373]" />
            <span>Lacak Status Pesanan Saya</span>
          </Link>
        </div>
      </main>

      {/* Footer Note */}
      <footer className="w-full max-w-md mx-auto text-center pt-2 sm:pt-4 border-t border-neutral-200/60 shrink-0">
        <p className="text-[10px] sm:text-[11px] text-[#737373] flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3 text-[#F25B09]" />
          <span>Terima kasih atas pengertian dan kehangatanmu!</span>
        </p>
      </footer>
    </div>
  );
}
