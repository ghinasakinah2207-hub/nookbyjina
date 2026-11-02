"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  X,
  MapPin,
  Clock,
  Truck,
  ArrowUpRight,
  ChevronDown,
  ShoppingBag,
  CreditCard,
  RotateCcw,
  HelpCircle,
} from "lucide-react";
import { BRAND } from "@/lib/branding";
import { StoreSettings } from "@/types";
import { normalizeInstagramUrl } from "@/lib/instagram-url";

interface ContactDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialSettings?: StoreSettings;
}

function formatWhatsappDisplay(clean: string): string {
  if (clean.startsWith("62") && clean.length >= 10) {
    const p1 = clean.slice(2, 5);
    const p2 = clean.slice(5, 9);
    const p3 = clean.slice(9);
    return `+62 ${p1}-${p2}${p3 ? `-${p3}` : ""}`;
  }
  if (clean.startsWith("0") && clean.length >= 10) {
    const p1 = clean.slice(0, 4);
    const p2 = clean.slice(4, 8);
    const p3 = clean.slice(8);
    return `${p1}-${p2}${p3 ? `-${p3}` : ""}`;
  }
  return clean ? `+${clean}` : "";
}

function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.68 12.05 3.68C14.25 3.68 16.31 4.54 17.87 6.1C19.42 7.66 20.28 9.72 20.28 11.92C20.28 16.46 16.59 20.15 12.05 20.15ZM16.57 14.33C16.32 14.2 15.1 13.6 14.87 13.52C14.64 13.43 14.48 13.39 14.31 13.64C14.15 13.89 13.68 14.44 13.54 14.61C13.39 14.77 13.25 14.79 13 14.67C12.75 14.54 11.95 14.28 11 13.44C10.26 12.78 9.76 11.97 9.62 11.72C9.47 11.47 9.6 11.34 9.73 11.21C9.84 11.1 9.98 10.92 10.11 10.77C10.23 10.62 10.28 10.51 10.36 10.35C10.44 10.18 10.4 10.04 10.34 9.91C10.28 9.79 9.78 8.57 9.58 8.06C9.38 7.57 9.17 7.64 9.02 7.63C8.88 7.62 8.71 7.62 8.55 7.62C8.38 7.62 8.11 7.68 7.88 7.93C7.65 8.18 7 8.79 7 10.02C7 11.25 7.89 12.44 8.02 12.61C8.14 12.77 9.79 15.32 12.3 16.41C12.9 16.67 13.36 16.82 13.73 16.94C14.33 17.13 14.88 17.1 15.31 17.04C15.8 16.97 16.81 16.43 17.02 15.84C17.23 15.25 17.23 14.75 17.17 14.64C17.1 14.54 16.94 14.47 16.57 14.33Z" />
    </svg>
  );
}

function InstagramIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function ContactDrawer({
  isOpen,
  onClose,
  initialSettings,
}: ContactDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [fetchedSettings, setFetchedSettings] = useState<StoreSettings | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const settings = fetchedSettings ?? initialSettings ?? null;

  // Toggle single expanded accordion item
  const toggleCategory = (id: string) => {
    setExpandedCategory((prev) => (prev === id ? null : id));
  };

  // Fetch freshest store settings whenever drawer opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    fetch("/api/store-settings")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data?.success && data?.settings) {
          setFetchedSettings(data.settings);
        }
      })
      .catch((err) => {
        console.warn("Gagal memuat pengaturan kontak toko:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Keyboard accessibility: Escape key to close & focus management
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    // Focus the close button when opened
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onClose]);

  // Determine WhatsApp configuration (store settings priority, fallback to brand defaults)
  const configuredWhatsapp =
    settings?.adminWhatsapp?.trim() || BRAND.contact.whatsappNumber;
  const cleanWhatsapp = configuredWhatsapp.replace(/[^0-9]/g, "");
  const formattedWhatsapp = cleanWhatsapp
    ? formatWhatsappDisplay(cleanWhatsapp)
    : BRAND.contact.formattedWhatsapp;

  const waUrl = cleanWhatsapp
    ? `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
        BRAND.contact.defaultWhatsappMessage
      )}`
    : "";

  const faqWaUrl = cleanWhatsapp
    ? `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
        "Halo Admin Nook by Jina, saya butuh bantuan mengenai pemesanan / FAQ."
      )}`
    : "";

  // Determine Instagram configuration (store settings priority, fallback to brand defaults)
  const rawInstagram =
    settings?.instagramUrl?.trim() || BRAND.social.instagramUrl?.trim() || "";
  const igValidation = rawInstagram
    ? normalizeInstagramUrl(rawInstagram)
    : null;
  const isInstagramConfigured = Boolean(
    igValidation && igValidation.isValid && igValidation.normalized
  );

  return (
    <div
      role="dialog"
      id="contact-menu-popup"
      aria-modal="true"
      aria-label="Menu Kontak dan Bantuan Nook by Jina"
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div
        ref={drawerRef}
        className={`fixed top-0 left-0 bottom-0 w-[88%] max-w-[360px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden transform transition-transform duration-300 ease-out will-change-transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between gap-3 bg-neutral-50/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#E5E5E5] flex items-center justify-center p-1 flex-shrink-0 shadow-2xs">
              <Image
                src={BRAND.logos.dark}
                alt="Nook by Jina"
                width={36}
                height={36}
                unoptimized
                className="w-auto h-7 object-contain"
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#111111] leading-tight truncate">
                {BRAND.name}
              </h2>
              <p className="text-[11px] text-[#737373] truncate">
                {BRAND.contact.locationText}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup menu kontak"
            className="w-11 h-11 flex items-center justify-center rounded-xl text-neutral-600 hover:text-black hover:bg-neutral-200/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
          {/* Section 1: Hubungi Kami (Side-by-side WhatsApp and Instagram) */}
          <section aria-labelledby="contact-heading" className="space-y-1.5">
            <span
              id="contact-heading"
              className="text-[11px] font-bold text-[#737373] uppercase tracking-wider px-1"
            >
              Hubungi Kami
            </span>

            <div className="grid grid-cols-2 gap-2 items-stretch">
              {/* Left card — WhatsApp */}
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="group flex flex-col justify-between p-2.5 bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-200/70 hover:border-emerald-300 rounded-xl transition-all h-full"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="w-7 h-7 rounded-lg bg-[#25D366] text-white flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                      </div>
                      <ArrowUpRight className="w-3 h-3 text-emerald-700 opacity-80" />
                    </div>
                    <h3 className="text-[11.5px] font-bold text-neutral-900 group-hover:text-emerald-950 leading-tight">
                      Chat WhatsApp
                    </h3>
                    <p className="text-[10px] sm:text-[10.5px] font-semibold text-emerald-800 mt-0.5 tracking-tight break-all leading-tight">
                      {formattedWhatsapp}
                    </p>
                  </div>
                  <p className="text-[9.5px] text-neutral-500 mt-1.5 leading-tight">
                    Tanya menu, katering, atau konfirmasi pesanan
                  </p>
                </a>
              ) : (
                <div className="flex flex-col justify-between p-2.5 bg-neutral-50 border border-dashed border-[#E5E5E5] rounded-xl select-none h-full">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="w-7 h-7 rounded-lg bg-neutral-200 text-neutral-500 flex items-center justify-center flex-shrink-0">
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[8.5px] font-medium bg-neutral-200/80 text-neutral-600 px-1.5 py-0.5 rounded-full">
                        Belum Diatur
                      </span>
                    </div>
                    <h3 className="text-[11.5px] font-bold text-neutral-700 leading-tight">
                      WhatsApp Toko
                    </h3>
                  </div>
                  <p className="text-[9.5px] text-neutral-500 mt-1.5 leading-tight">
                    Nomor WhatsApp toko belum dikonfigurasi di Pengaturan.
                  </p>
                </div>
              )}

              {/* Right card — Instagram */}
              {isInstagramConfigured && igValidation ? (
                <a
                  href={igValidation.normalized}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="group flex flex-col justify-between p-2.5 bg-white hover:bg-neutral-50 border border-[#E5E5E5] hover:border-neutral-300 rounded-xl transition-all h-full"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                        <InstagramIcon className="w-3.5 h-3.5" />
                      </div>
                      <ArrowUpRight className="w-3 h-3 text-neutral-400 group-hover:text-black transition-colors" />
                    </div>
                    <h3 className="text-[11.5px] font-semibold text-[#111111] leading-tight">
                      Instagram
                    </h3>
                    <p className="text-[10px] sm:text-[10.5px] text-[#737373] mt-0.5 truncate leading-tight">
                      {igValidation.handle || BRAND.social.instagramHandle || "Profil"}
                    </p>
                  </div>
                  <p className="text-[9.5px] text-neutral-500 mt-1.5 leading-tight">
                    Kunjungi akun Instagram resmi Nook by Jina
                  </p>
                </a>
              ) : (
                <div className="flex flex-col justify-between p-2.5 bg-neutral-50 border border-dashed border-[#E5E5E5] rounded-xl select-none h-full">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="w-7 h-7 rounded-lg bg-neutral-200 text-neutral-500 flex items-center justify-center flex-shrink-0">
                        <InstagramIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[8.5px] font-medium bg-neutral-200/80 text-neutral-600 px-1.5 py-0.5 rounded-full">
                        Belum Diatur
                      </span>
                    </div>
                    <h3 className="text-[11.5px] font-semibold text-neutral-800 leading-tight">
                      Instagram
                    </h3>
                  </div>
                  <p className="text-[9.5px] text-neutral-500 mt-1.5 leading-tight">
                    Akun media sosial Instagram toko belum ditautkan.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Section 3: Store Information */}
          <section aria-labelledby="info-heading" className="space-y-2">
            <span
              id="info-heading"
              className="text-[11px] font-bold text-[#737373] uppercase tracking-wider px-1"
            >
              Informasi Toko
            </span>

            <div className="bg-white border border-[#E5E5E5] rounded-2xl p-3 space-y-2.5 text-xs text-neutral-700">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#F25B09] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-neutral-900">Lokasi Dapur</p>
                  <p className="text-[11px] text-neutral-500">
                    {BRAND.contact.locationText}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 border-t border-neutral-100 pt-2.5">
                <Clock className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-neutral-900">Jam Operasional</p>
                  <p className="text-[11px] text-neutral-500">
                    {BRAND.contact.operatingHoursText}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 border-t border-neutral-100 pt-2.5">
                <Truck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-neutral-900">Area Pengantaran</p>
                  <p className="text-[11px] text-neutral-500">
                    {BRAND.contact.serviceAreaText}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Bantuan & Informasi (FAQ Accordion) */}
          <section aria-labelledby="help-heading" className="space-y-2 pt-1">
            <span
              id="help-heading"
              className="text-[11px] font-bold text-[#737373] uppercase tracking-wider px-1"
            >
              Bantuan & Informasi
            </span>

            <div className="space-y-2">
              {/* Category A: Cara Pemesanan */}
              <div className="border border-[#E5E5E5] rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleCategory("cara-pemesanan")}
                  aria-expanded={expandedCategory === "cara-pemesanan"}
                  aria-controls="faq-content-cara-pemesanan"
                  id="faq-header-cara-pemesanan"
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-50 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <ShoppingBag className="w-4 h-4 text-[#F25B09] flex-shrink-0" />
                    <span className="text-xs font-semibold text-neutral-900 truncate">
                      Cara Pemesanan
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform duration-200 ${
                      expandedCategory === "cara-pemesanan" ? "rotate-180 text-neutral-700" : ""
                    }`}
                  />
                </button>
                <div
                  id="faq-content-cara-pemesanan"
                  role="region"
                  aria-labelledby="faq-header-cara-pemesanan"
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    expandedCategory === "cara-pemesanan" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="p-3 pt-0 text-[11px] leading-relaxed text-neutral-600 border-t border-neutral-100 bg-neutral-50/50 space-y-1.5">
                      <ol className="list-decimal list-outside pl-4 space-y-1">
                        <li>Pilih produk dari menu yang tersedia.</li>
                        <li>Tentukan variasi pilihan dan jumlah pesanan.</li>
                        <li>Tambahkan ke keranjang atau gunakan tombol <strong>Beli Sekarang</strong>.</li>
                        <li>Periksa pesanan di keranjang dan pastikan produk yang ingin dipesan tercentang.</li>
                        <li>Isi nama, nomor WhatsApp aktif, serta pilih metode pickup atau delivery.</li>
                        <li>Periksa rincian total pembayaran dan selesaikan transaksi.</li>
                        <li>Pesanan akan diproses oleh dapur setelah status pembayaran terverifikasi.</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category B: Pembayaran */}
              <div className="border border-[#E5E5E5] rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleCategory("pembayaran")}
                  aria-expanded={expandedCategory === "pembayaran"}
                  aria-controls="faq-content-pembayaran"
                  id="faq-header-pembayaran"
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-50 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <CreditCard className="w-4 h-4 text-[#F25B09] flex-shrink-0" />
                    <span className="text-xs font-semibold text-neutral-900 truncate">
                      Pembayaran
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform duration-200 ${
                      expandedCategory === "pembayaran" ? "rotate-180 text-neutral-700" : ""
                    }`}
                  />
                </button>
                <div
                  id="faq-content-pembayaran"
                  role="region"
                  aria-labelledby="faq-header-pembayaran"
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    expandedCategory === "pembayaran" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="p-3 pt-0 text-[11px] leading-relaxed text-neutral-600 border-t border-neutral-100 bg-neutral-50/50 space-y-1.5">
                      <ul className="list-disc list-outside pl-4 space-y-1">
                        <li>Metode pembayaran mengikuti opsi yang aktif saat Anda menyelesaikan pesanan pada halaman checkout.</li>
                        <li>Harap selalu memeriksa nominal tagihan dan ringkasan pesanan sebelum melakukan transfer atau pembayaran.</li>
                        <li>Jika pembayaran sudah berhasil tetapi pesanan belum terkonfirmasi, <strong>jangan langsung membayar ulang</strong>.</li>
                        <li>Segera hubungi admin melalui WhatsApp dengan melampirkan bukti pembayaran yang sah.</li>
                        <li>Jika terjadi pembayaran ganda, silakan konfirmasi ke admin untuk dilakukan pengecekan dan verifikasi.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category C: Pembatalan & Refund */}
              <div className="border border-[#E5E5E5] rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleCategory("pembatalan-refund")}
                  aria-expanded={expandedCategory === "pembatalan-refund"}
                  aria-controls="faq-content-pembatalan-refund"
                  id="faq-header-pembatalan-refund"
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-50 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <RotateCcw className="w-4 h-4 text-[#F25B09] flex-shrink-0" />
                    <span className="text-xs font-semibold text-neutral-900 truncate">
                      Pembatalan & Refund
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform duration-200 ${
                      expandedCategory === "pembatalan-refund" ? "rotate-180 text-neutral-700" : ""
                    }`}
                  />
                </button>
                <div
                  id="faq-content-pembatalan-refund"
                  role="region"
                  aria-labelledby="faq-header-pembatalan-refund"
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    expandedCategory === "pembatalan-refund" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="p-3 pt-0 text-[11px] leading-relaxed text-neutral-600 border-t border-neutral-100 bg-neutral-50/50 space-y-2">
                      <div>
                        <p className="font-semibold text-neutral-800 mb-0.5">Kebijakan Pembatalan:</p>
                        <ul className="list-disc list-outside pl-4 space-y-0.5">
                          <li>Pembatalan dapat diajukan sebelum pesanan mulai diproses atau disiapkan oleh dapur.</li>
                          <li>Setelah pesanan mulai diproses, pembatalan tidak dapat dijamin karena bahan makanan telah disiapkan.</li>
                          <li>Pelanggan harus menghubungi admin melalui WhatsApp sesegera mungkin jika ada perubahan.</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-neutral-800 mb-0.5">Kebijakan Refund (Pengembalian Dana):</p>
                        <ul className="list-disc list-outside pl-4 space-y-0.5">
                          <li>Pengembalian dana ditangani secara manual oleh admin setelah verifikasi.</li>
                          <li>Setiap permohonan diperiksa secara cermat berdasarkan status pesanan dan alasan pengajuan.</li>
                          <li>Jika pesanan tidak dapat dipenuhi karena kendala dari pihak toko, pelanggan dapat menghubungi admin untuk penyelesaian dan pengembalian dana apabila pembayaran sudah diterima.</li>
                          <li>Waktu penyelesaian akan diinformasikan secara jelas oleh admin setelah pemeriksaan dilakukan.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category D: Pengiriman & Pre-Order */}
              <div className="border border-[#E5E5E5] rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleCategory("pengiriman-preorder")}
                  aria-expanded={expandedCategory === "pengiriman-preorder"}
                  aria-controls="faq-content-pengiriman-preorder"
                  id="faq-header-pengiriman-preorder"
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-50 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <Truck className="w-4 h-4 text-[#F25B09] flex-shrink-0" />
                    <span className="text-xs font-semibold text-neutral-900 truncate">
                      Pengiriman & Pre-Order
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform duration-200 ${
                      expandedCategory === "pengiriman-preorder" ? "rotate-180 text-neutral-700" : ""
                    }`}
                  />
                </button>
                <div
                  id="faq-content-pengiriman-preorder"
                  role="region"
                  aria-labelledby="faq-header-pengiriman-preorder"
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    expandedCategory === "pengiriman-preorder" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="p-3 pt-0 text-[11px] leading-relaxed text-neutral-600 border-t border-neutral-100 bg-neutral-50/50 space-y-1.5">
                      <ul className="list-disc list-outside pl-4 space-y-1">
                        <li>Nook by Jina menggunakan sistem pre-order sesuai informasi ketersediaan pada masing-masing produk.</li>
                        <li>Pesanan disiapkan mengikuti jadwal operasional dan slot pengantaran yang berlaku.</li>
                        <li>Area pengiriman mencakup wilayah Lhoksukon dan sekitarnya sesuai konfigurasi layanan toko.</li>
                        <li>Biaya pengiriman dihitung dan ditampilkan secara otomatis pada halaman checkout.</li>
                        <li>Gratis ongkir berlaku mengikuti ketentuan minimum nilai pembelian yang sedang aktif.</li>
                        <li>Bagi pelanggan di luar jangkauan area pengiriman reguler, silakan hubungi admin melalui WhatsApp untuk konfirmasi opsi pengantaran khusus.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category E: Pertanyaan Lainnya */}
              <div className="border border-[#E5E5E5] rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleCategory("pertanyaan-lainnya")}
                  aria-expanded={expandedCategory === "pertanyaan-lainnya"}
                  aria-controls="faq-content-pertanyaan-lainnya"
                  id="faq-header-pertanyaan-lainnya"
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-50 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <HelpCircle className="w-4 h-4 text-[#F25B09] flex-shrink-0" />
                    <span className="text-xs font-semibold text-neutral-900 truncate">
                      Pertanyaan Lainnya
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform duration-200 ${
                      expandedCategory === "pertanyaan-lainnya" ? "rotate-180 text-neutral-700" : ""
                    }`}
                  />
                </button>
                <div
                  id="faq-content-pertanyaan-lainnya"
                  role="region"
                  aria-labelledby="faq-header-pertanyaan-lainnya"
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    expandedCategory === "pertanyaan-lainnya" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="p-3 pt-0 text-[11px] leading-relaxed text-neutral-600 border-t border-neutral-100 bg-neutral-50/50 space-y-2.5">
                      <div>
                        <p className="font-semibold text-neutral-800">Bagaimana jika produk habis setelah dipesan?</p>
                        <p className="mt-0.5 text-neutral-600">
                          Admin akan segera menghubungi nomor WhatsApp Anda untuk konfirmasi menu pengganti atau pembatalan beserta pengembalian dana penuh.
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-neutral-800">Bagaimana jika pesanan yang diterima tidak sesuai?</p>
                        <p className="mt-0.5 text-neutral-600">
                          Harap segera mengambil foto produk yang diterima dan kirimkan ke WhatsApp Admin kami beserta nomor pesanan untuk tindak lanjut cepat.
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-neutral-800">Bagaimana jika salah mengisi nomor WhatsApp saat checkout?</p>
                        <p className="mt-0.5 text-neutral-600">
                          Segera hubungi admin dengan menyebutkan nama pemesan dan perkiraan waktu transaksi agar admin dapat memperbarui kontak konfirmasi Anda.
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-neutral-800">Bagaimana cara menghubungi admin?</p>
                        <p className="mt-0.5 text-neutral-600">
                          Anda dapat menggunakan tombol WhatsApp di bawah atau bagian Hubungi Kami pada menu ini untuk terhubung langsung dengan admin kami.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contextual WhatsApp Support Action */}
            {faqWaUrl && (
              <div className="pt-1.5">
                <a
                  href={faqWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 p-2.5 bg-neutral-50 hover:bg-neutral-100 border border-[#E5E5E5] rounded-xl text-xs font-semibold text-[#111111] transition-colors"
                >
                  <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                  <span>Masih butuh bantuan? Chat WhatsApp Admin</span>
                </a>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E5E5E5] bg-neutral-50/70 text-center text-[10.5px] text-[#737373]">
          <p>© 2026 {BRAND.name}</p>
          <p className="text-[9.5px] text-neutral-400 mt-0.5">
            {BRAND.tagline}
          </p>
        </div>
      </div>
    </div>
  );
}
