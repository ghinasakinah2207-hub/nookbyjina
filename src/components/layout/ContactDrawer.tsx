"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  X,
  MapPin,
  Clock,
  Truck,
  ArrowUpRight,
  UtensilsCrossed,
  Heart,
  ReceiptText,
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
  const settings = fetchedSettings ?? initialSettings ?? null;

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
      aria-label="Menu Kontak dan Media Sosial Nook by Jina"
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
        className={`fixed top-0 left-0 bottom-0 w-[86%] max-w-[340px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden transform transition-transform duration-300 ease-out will-change-transform ${
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
          {/* Section 1: Contact Admin (WhatsApp) */}
          <section aria-labelledby="contact-heading" className="space-y-2">
            <span
              id="contact-heading"
              className="text-[11px] font-bold text-[#737373] uppercase tracking-wider px-1"
            >
              Hubungi Kami
            </span>

            {waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="group flex items-start gap-3 p-3.5 bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-200/70 hover:border-emerald-300 rounded-2xl transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-[#25D366] text-white flex items-center justify-center flex-shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  <WhatsAppIcon className="w-5.5 h-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-neutral-900 group-hover:text-emerald-950">
                      Chat WhatsApp Admin
                    </h3>
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-700 opacity-80" />
                  </div>
                  <p className="text-xs font-semibold text-emerald-800 mt-0.5 tracking-wide">
                    {formattedWhatsapp}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1 leading-snug">
                    Tanya menu, katering, atau konfirmasi pesanan
                  </p>
                </div>
              </a>
            ) : (
              <div className="flex items-start gap-3 p-3.5 bg-neutral-50 border border-dashed border-[#E5E5E5] rounded-2xl select-none">
                <div className="w-10 h-10 rounded-xl bg-neutral-200 text-neutral-500 flex items-center justify-center flex-shrink-0">
                  <WhatsAppIcon className="w-5.5 h-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-neutral-700">
                      WhatsApp Toko
                    </h3>
                    <span className="text-[9.5px] font-medium bg-neutral-200/80 text-neutral-600 px-1.5 py-0.5 rounded-full">
                      Belum Diatur
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                    Nomor WhatsApp toko belum dikonfigurasi di Pengaturan.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Section 2: Social Media (Instagram) */}
          <section aria-labelledby="social-heading" className="space-y-2">
            <span
              id="social-heading"
              className="text-[11px] font-bold text-[#737373] uppercase tracking-wider px-1"
            >
              Media Sosial
            </span>

            {isInstagramConfigured && igValidation ? (
              <a
                href={igValidation.normalized}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="group flex items-center justify-between p-3 bg-white hover:bg-neutral-50 border border-[#E5E5E5] hover:border-neutral-300 rounded-xl transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                    <InstagramIcon className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-[#111111]">
                      Instagram Resmi
                    </h3>
                    <p className="text-[11px] text-[#737373] truncate">
                      {igValidation.handle || BRAND.social.instagramHandle || "Kunjungi Profil Instagram"}
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-neutral-400 group-hover:text-black transition-colors" />
              </a>
            ) : (
              <div className="flex items-start gap-3 p-3 bg-neutral-50 border border-dashed border-[#E5E5E5] rounded-xl select-none">
                <div className="w-9 h-9 rounded-lg bg-neutral-200 text-neutral-500 flex items-center justify-center flex-shrink-0">
                  <InstagramIcon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-neutral-800">
                      Instagram
                    </h3>
                    <span className="text-[9.5px] font-medium bg-neutral-200/80 text-neutral-600 px-1.5 py-0.5 rounded-full">
                      Belum Diatur
                    </span>
                  </div>
                  <p className="text-[10.5px] text-neutral-500 mt-0.5 leading-snug">
                    Akun media sosial Instagram toko belum ditautkan.
                  </p>
                </div>
              </div>
            )}
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

          {/* Section 4: Quick Navigation */}
          <section aria-labelledby="nav-heading" className="space-y-1.5 pt-1">
            <span
              id="nav-heading"
              className="text-[11px] font-bold text-[#737373] uppercase tracking-wider px-1"
            >
              Navigasi Cepat
            </span>

            <div className="grid grid-cols-1 gap-1">
              <Link
                href="/menu"
                onClick={onClose}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-neutral-800 hover:bg-neutral-100 hover:text-black transition-colors"
              >
                <UtensilsCrossed className="w-4 h-4 text-neutral-500" />
                <span>Jelajahi Semua Menu</span>
              </Link>
              <Link
                href="/favorit"
                onClick={onClose}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-neutral-800 hover:bg-neutral-100 hover:text-black transition-colors"
              >
                <Heart className="w-4 h-4 text-neutral-500" />
                <span>Menu Favorit</span>
              </Link>
              <Link
                href="/pesanan"
                onClick={onClose}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-neutral-800 hover:bg-neutral-100 hover:text-black transition-colors"
              >
                <ReceiptText className="w-4 h-4 text-neutral-500" />
                <span>Lacak Status Pesanan</span>
              </Link>
            </div>
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
