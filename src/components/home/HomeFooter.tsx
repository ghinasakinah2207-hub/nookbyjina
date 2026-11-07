import React from "react";
import { Mail, MapPin, ArrowUpRight } from "lucide-react";
import { StoreSettings } from "@/types";
import { BRAND } from "@/lib/branding";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";

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
