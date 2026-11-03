import React from "react";
import { Mail, MapPin, ArrowUpRight } from "lucide-react";
import { StoreSettings } from "@/types";
import { BRAND } from "@/lib/branding";

interface HomeFooterProps {
  storeSettings?: StoreSettings | null;
}

function formatWhatsappShort(clean: string): string {
  let local = clean;
  if (local.startsWith("62")) {
    local = "0" + local.slice(2);
  }
  if (local.startsWith("0") && local.length >= 10) {
    const p1 = local.slice(0, 4);
    const p2 = local.slice(4, 8);
    const p3 = local.slice(8);
    return `${p1}-${p2}${p3 ? `-${p3}` : ""}`;
  }
  return local;
}

function getShortAddress(fullAddress: string): string {
  if (!fullAddress) return "Dayah Lb, Lhoksukon, Aceh Utara";
  if (fullAddress.includes("Dayah Lb")) {
    return "Dayah Lb, Lhoksukon, Aceh Utara";
  }
  const cleaned = fullAddress
    .replace(/^[A-Z0-9]{4}\+[A-Z0-9]{3,4},?\s*/i, "")
    .replace(/,\s*(?:Kec\.|Kecamatan)\s*/i, ", ")
    .replace(/,\s*(?:Kab\.|Kabupaten)\s*/i, ", ")
    .replace(/,\s*Aceh\s+\d{5}$/i, "")
    .trim();
  return cleaned || fullAddress;
}

function WhatsAppIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
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

export function HomeFooter({ storeSettings }: HomeFooterProps) {
  // WhatsApp configuration (Store Settings priority, fallback to brand defaults)
  const configuredWhatsapp =
    storeSettings?.adminWhatsapp?.trim() || BRAND.contact.whatsappNumber;
  const cleanWhatsapp = configuredWhatsapp.replace(/[^0-9]/g, "");
  const formattedWhatsapp = cleanWhatsapp
    ? formatWhatsappShort(cleanWhatsapp)
    : formatWhatsappShort(BRAND.contact.whatsappNumber);

  const waUrl = cleanWhatsapp
    ? `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
        BRAND.contact.defaultWhatsappMessage
      )}`
    : "";

  // Email configuration (Store Settings priority)
  const rawEmail = storeSettings?.supportEmail?.trim() || "";
  const isEmailConfigured = Boolean(
    rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
  );
  const emailMailtoUrl = isEmailConfigured ? `mailto:${rawEmail}` : "";

  // Business Address & Google Maps configuration (Store Settings priority)
  const fullAddress =
    storeSettings?.address?.trim() || BRAND.contact.addressText;
  const shortAddress = getShortAddress(fullAddress);
  const storeMapsUrl =
    storeSettings?.mapsUrl?.trim() || BRAND.contact.mapsUrl;

  return (
    <footer
      aria-label="Informasi Kontak & Bantuan"
      className="pt-4 pb-2 border-t border-[#E5E5E5] text-neutral-600 space-y-2.5"
    >
      <div className="space-y-1.5">
        <span className="text-[11px] font-bold text-[#737373] uppercase tracking-wider block px-0.5">
          Hubungi Kami
        </span>

        {/* Compact Horizontal Flexbox Row (1 Row on all screen widths) */}
        <div className="bg-white border border-[#E5E5E5] rounded-xl p-2 flex flex-row items-stretch divide-x divide-neutral-100">
          {/* 1. WhatsApp Item */}
          {waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 pr-1.5 sm:pr-2 flex flex-col justify-between group hover:bg-neutral-50/70 rounded-lg p-1 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-0.5 mb-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <div className="w-4 h-4 rounded bg-emerald-50 text-[#25D366] flex items-center justify-center flex-shrink-0">
                      <WhatsAppIcon className="w-2.5 h-2.5" />
                    </div>
                    <span className="text-[10px] sm:text-[10.5px] font-bold text-neutral-900 truncate leading-tight">
                      WhatsApp
                    </span>
                  </div>
                  <ArrowUpRight className="w-2.5 h-2.5 text-neutral-400 group-hover:text-emerald-700 flex-shrink-0 transition-colors" />
                </div>
                <p className="text-[9px] sm:text-[9.5px] font-medium text-emerald-800 break-all leading-tight">
                  {formattedWhatsapp}
                </p>
              </div>
            </a>
          ) : (
            <div className="flex-1 min-w-0 pr-1.5 sm:pr-2 flex flex-col justify-between p-1">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <div className="w-4 h-4 rounded bg-neutral-100 text-neutral-400 flex items-center justify-center flex-shrink-0">
                    <WhatsAppIcon className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-[10px] sm:text-[10.5px] font-bold text-neutral-600 truncate leading-tight">
                    WhatsApp
                  </span>
                </div>
                <p className="text-[9px] sm:text-[9.5px] text-neutral-400 leading-tight">
                  Belum Diatur
                </p>
              </div>
            </div>
          )}

          {/* 2. Email Support Item */}
          {isEmailConfigured ? (
            <a
              href={emailMailtoUrl}
              className="flex-1 min-w-0 px-1.5 sm:px-2 flex flex-col justify-between group hover:bg-neutral-50/70 rounded-lg p-1 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-0.5 mb-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <div className="w-4 h-4 rounded bg-sky-50 text-[#0284C7] flex items-center justify-center flex-shrink-0">
                      <Mail className="w-2.5 h-2.5" strokeWidth={2.2} />
                    </div>
                    <span className="text-[10px] sm:text-[10.5px] font-bold text-neutral-900 truncate leading-tight">
                      Email
                    </span>
                  </div>
                  <ArrowUpRight className="w-2.5 h-2.5 text-neutral-400 group-hover:text-sky-700 flex-shrink-0 transition-colors" />
                </div>
                <p className="text-[9px] sm:text-[9.5px] font-medium text-sky-800 break-all leading-tight line-clamp-2">
                  {rawEmail}
                </p>
              </div>
            </a>
          ) : (
            <div className="flex-1 min-w-0 px-1.5 sm:px-2 flex flex-col justify-between p-1">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <div className="w-4 h-4 rounded bg-neutral-100 text-neutral-400 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-2.5 h-2.5" strokeWidth={2.2} />
                  </div>
                  <span className="text-[10px] sm:text-[10.5px] font-bold text-neutral-600 truncate leading-tight">
                    Email
                  </span>
                </div>
                <p className="text-[9px] sm:text-[9.5px] text-neutral-400 leading-tight">
                  Belum Diatur
                </p>
              </div>
            </div>
          )}

          {/* 3. Alamat Usaha Item */}
          {storeMapsUrl ? (
            <a
              href={storeMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 pl-1.5 sm:pl-2 flex flex-col justify-between group hover:bg-neutral-50/70 rounded-lg p-1 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-0.5 mb-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <div className="w-4 h-4 rounded bg-orange-50 text-[#F25B09] flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-2.5 h-2.5" />
                    </div>
                    <span className="text-[10px] sm:text-[10.5px] font-bold text-neutral-900 truncate leading-tight">
                      Alamat
                    </span>
                  </div>
                  <ArrowUpRight className="w-2.5 h-2.5 text-neutral-400 group-hover:text-[#F25B09] flex-shrink-0 transition-colors" />
                </div>
                <p className="text-[9px] sm:text-[9.5px] text-neutral-600 leading-tight line-clamp-2 break-words">
                  {shortAddress}
                </p>
              </div>
            </a>
          ) : (
            <div className="flex-1 min-w-0 pl-1.5 sm:pl-2 flex flex-col justify-between p-1">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <div className="w-4 h-4 rounded bg-neutral-100 text-neutral-400 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-[10px] sm:text-[10.5px] font-bold text-neutral-600 truncate leading-tight">
                    Alamat
                  </span>
                </div>
                <p className="text-[9px] sm:text-[9.5px] text-neutral-400 leading-tight">
                  {shortAddress}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Copyright Notice */}
      <div className="pt-1.5 text-center text-[10.5px] text-neutral-400">
        <p>© 2026 {BRAND.name}. All rights reserved.</p>
      </div>
    </footer>
  );
}
