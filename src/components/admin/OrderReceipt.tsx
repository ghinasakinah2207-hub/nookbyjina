"use client";

import React from "react";
import { Order } from "@/types";
import { STORE_SETTINGS, formatRupiah } from "@/data/dummy-data";

export interface OrderReceiptProps {
  order: Order;
  width?: "58mm" | "80mm";
  className?: string;
  isPrintOnly?: boolean;
}

function formatWIB(dateString: string) {
  try {
    const date = new Date(dateString);
    const dateFormatted = date.toLocaleDateString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const timeFormatted = date.toLocaleTimeString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dateFormatted}, ${timeFormatted} WIB`;
  } catch {
    return dateString;
  }
}

function formatPhone(phone: string) {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("62")) {
    return `+62 ${cleaned.slice(2, 5)}-${cleaned.slice(5, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.startsWith("0")) {
    return `0${cleaned.slice(1, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  }
  return phone;
}

/**
 * Customer / Cashier Receipt (Struk Pesanan Resmi).
 * Accompanies the customer order and allows kitchen/fulfillment staff
 * to easily cross-reference the order number and menu details.
 */
export function OrderReceipt({
  order,
  width = "58mm",
  className = "",
  isPrintOnly = false,
}: OrderReceiptProps) {
  const is58mm = width === "58mm";

  return (
    <div
      id={isPrintOnly ? "thermal-receipt-print" : undefined}
      className={`bg-white text-black font-mono select-none ${
        is58mm
          ? "w-[58mm] max-w-[58mm] text-[10px] leading-[1.35] p-2"
          : "w-[80mm] max-w-[80mm] text-xs leading-[1.4] p-3"
      } ${className}`}
      style={{
        boxSizing: "border-box",
        wordBreak: "break-word",
      }}
    >
      {/* =========================================================================
          STORE HEADER
          ========================================================================= */}
      <div className="text-center space-y-0.5 pb-1">
        <h1
          className={`font-black tracking-wider uppercase ${
            is58mm ? "text-xs" : "text-sm"
          }`}
        >
          NOOK BY JINA
        </h1>
        <p className="text-[9px] font-bold tracking-wide uppercase text-neutral-900">
          STRUK PESANAN
        </p>
        <p className="text-[9px] text-neutral-700">{STORE_SETTINGS.location}</p>
        {STORE_SETTINGS.adminWhatsapp && (
          <p className="text-[9px] font-semibold text-neutral-900">
            WA: {formatPhone(STORE_SETTINGS.adminWhatsapp)}
          </p>
        )}
      </div>

      {/* DASHED SEPARATOR */}
      <div className="border-b border-dashed border-black my-1" />

      {/* =========================================================================
          ORDER METADATA
          ========================================================================= */}
      <div className="space-y-0.5 py-0.5">
        <div className="flex justify-between gap-1 items-baseline">
          <span className="text-neutral-700">No. Pesanan:</span>
          <span className="font-bold text-right text-[11px] sm:text-xs tracking-wide">
            {order.id}
          </span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="text-neutral-700">Waktu:</span>
          <span className="text-right">{formatWIB(order.createdAt)}</span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="text-neutral-700">Pelanggan:</span>
          <span className="font-semibold text-right break-words max-w-[65%]">
            {order.customerName}
          </span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="text-neutral-700">WhatsApp:</span>
          <span className="text-right">{formatPhone(order.customerWhatsapp)}</span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="text-neutral-700">Layanan:</span>
          <span className="font-semibold text-right">
            {order.fulfillmentType === "delivery" ? "Delivery" : "Pickup Toko"}
          </span>
        </div>

        {/* Order-level Customer Note */}
        {order.orderNote && (
          <div className="pt-0.5 text-neutral-800">
            <span className="text-neutral-700">Catatan Pesanan:</span>
            <p className="italic pl-1 break-words leading-tight mt-0.5 font-medium">
              &ldquo;{order.orderNote}&rdquo;
            </p>
          </div>
        )}
      </div>

      {/* DASHED SEPARATOR */}
      <div className="border-b border-dashed border-black my-1" />

      {/* =========================================================================
          ORDERED ITEMS TABLE
          ========================================================================= */}
      <div className="flex justify-between font-bold py-0.5 border-b border-dashed border-black text-[9px] uppercase tracking-wide">
        <span>Rincian Menu</span>
        <span>Jumlah</span>
      </div>

      <div className="divide-y divide-dashed divide-neutral-300 py-0.5">
        {order.items.map((item, idx) => (
          <div key={item.id || idx} className="py-1 receipt-item-row">
            {/* Primary line: Quantity x Name and Total */}
            <div className="flex justify-between items-start gap-1">
              <div className="flex-1 min-w-0 font-bold break-words">
                {item.quantity}x {item.productName}
              </div>
              <div className="flex-shrink-0 text-right font-bold whitespace-nowrap pl-1">
                {formatRupiah(item.itemTotal)}
              </div>
            </div>

            {/* Unit Price Breakdown if multi-quantity */}
            {item.quantity > 1 && (
              <div className="text-[9px] text-neutral-600 pl-3">
                (@ {formatRupiah(item.unitPrice)})
              </div>
            )}

            {/* Selected Options / Variants */}
            {item.selectedOptions && item.selectedOptions.length > 0 && (
              <div className="text-[9px] pl-3 text-neutral-800 space-y-0.5 mt-0.5">
                {item.selectedOptions.map((opt, i) => (
                  <div key={i} className="break-words">
                    • {opt.groupName || opt.optionName}: {opt.valueName || opt.optionValue}
                    {opt.priceDelta > 0
                      ? ` (+${formatRupiah(opt.priceDelta)})`
                      : ""}
                  </div>
                ))}
              </div>
            )}

            {/* Selected Add-ons */}
            {item.selectedAddons && item.selectedAddons.length > 0 && (
              <div className="text-[9px] pl-3 text-neutral-800 space-y-0.5 mt-0.5">
                {item.selectedAddons.map((addon, i) => (
                  <div key={i} className="break-words">
                    + {addon.addonName} (+{formatRupiah(addon.price)})
                  </div>
                ))}
              </div>
            )}

            {/* Customer Item Note */}
            {item.itemNote && (
              <div className="text-[9px] pl-3 italic text-neutral-700 break-words mt-0.5 font-medium">
                * Catatan: {item.itemNote}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* DASHED SEPARATOR */}
      <div className="border-b border-dashed border-black my-1" />

      {/* =========================================================================
          FINANCIAL TOTALS & CALCULATION
          ========================================================================= */}
      <div className="space-y-0.5 py-0.5 receipt-totals-section">
        <div className="flex justify-between gap-1">
          <span className="text-neutral-700">Subtotal Produk</span>
          <span className="text-right font-medium">
            {formatRupiah(order.subtotal)}
          </span>
        </div>

        <div className="flex justify-between gap-1">
          <span className="text-neutral-700">Ongkos Kirim</span>
          <span className="text-right font-medium">
            {order.shippingFee > 0
              ? formatRupiah(order.shippingFee)
              : order.fulfillmentType === "delivery"
              ? "Rp0 (Gratis)"
              : "Rp0"}
          </span>
        </div>

        <div className="border-t border-dashed border-black my-1" />

        <div
          className={`flex justify-between gap-1 font-black ${
            is58mm ? "text-xs" : "text-sm"
          }`}
        >
          <span>TOTAL BAYAR</span>
          <span>{formatRupiah(order.total)}</span>
        </div>
      </div>

      {/* DASHED SEPARATOR */}
      <div className="border-b border-dashed border-black my-1" />

      {/* =========================================================================
          PAYMENT METHOD
          ========================================================================= */}
      <div className="py-0.5 text-[9px] receipt-totals-section">
        <div className="flex justify-between gap-1">
          <span className="text-neutral-700">Metode Bayar:</span>
          <span className="font-semibold text-right">{order.paymentMethod}</span>
        </div>
      </div>

      {/* DASHED SEPARATOR */}
      <div className="border-b border-dashed border-black my-1" />

      {/* =========================================================================
          RECEIPT FOOTER
          ========================================================================= */}
      <div className="text-center pt-1.5 pb-1 space-y-0.5 text-[9px] receipt-totals-section">
        <p className="font-bold">Terima kasih atas pesanan Anda!</p>
        <p className="text-neutral-700">
          Simpan struk ini sebagai bukti transaksi resmi.
        </p>
        <p className="text-[8px] text-neutral-600 font-semibold tracking-wider pt-0.5">
          NOOK BY JINA
        </p>
      </div>
    </div>
  );
}
