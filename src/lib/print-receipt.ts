import { Order } from "@/types";
import { STORE_SETTINGS, formatRupiah } from "@/data/dummy-data";

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatWIB(dateString: string): string {
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

function formatPhone(phone: string): string {
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
 * Generates printer-friendly HTML for an authentic customer / cashier receipt (Struk Pesanan).
 * Formatted specifically for 58mm and 80mm thermal receipt printers.
 * Contains the store heading, order ID, items breakdown with options and add-ons,
 * financial totals, payment details, and thank-you footer.
 */
export function generateCustomerReceiptHtml(order: Order, width: "58mm" | "80mm"): string {
  const is58mm = width === "58mm";

  const itemsHtml = order.items
    .map((item) => {
      const unitPriceHtml =
        item.quantity > 1
          ? `<div style="font-size: ${is58mm ? "9px" : "10px"}; color: #555; padding-left: 10px;">
              (@ ${formatRupiah(item.unitPrice)})
            </div>`
          : "";

      const optionsHtml =
        item.selectedOptions && item.selectedOptions.length > 0
          ? item.selectedOptions
              .map(
                (opt) =>
                  `<div style="padding-left: 10px; font-size: ${is58mm ? "9px" : "10px"}; color: #333;">
                    • ${escapeHtml(opt.groupName || opt.optionName || "")}: ${escapeHtml(opt.valueName || opt.optionValue || "")}${
                    opt.priceDelta > 0 ? ` (+${formatRupiah(opt.priceDelta)})` : ""
                  }
                  </div>`
              )
              .join("")
          : "";

      const addonsHtml =
        item.selectedAddons && item.selectedAddons.length > 0
          ? item.selectedAddons
              .map(
                (addon) =>
                  `<div style="padding-left: 10px; font-size: ${is58mm ? "9px" : "10px"}; color: #333;">
                    + ${escapeHtml(addon.addonName)} (+${formatRupiah(addon.price)})
                  </div>`
              )
              .join("")
          : "";

      const noteHtml = item.itemNote
        ? `<div style="padding-left: 10px; font-size: ${is58mm ? "9px" : "10px"}; font-style: italic; color: #444;">
            * Catatan: ${escapeHtml(item.itemNote)}
          </div>`
        : "";

      return `
        <div class="receipt-item-row" style="padding: 3px 0; border-bottom: 1px dashed #e0e0e0;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; font-weight: bold; font-size: ${
            is58mm ? "10px" : "11px"
          }; line-height: 1.35;">
            <div style="flex: 1; word-break: break-word;">
              ${item.quantity}x ${escapeHtml(item.productName)}
            </div>
            <div style="flex-shrink: 0; padding-left: 6px; white-space: nowrap;">
              ${formatRupiah(item.itemTotal)}
            </div>
          </div>
          ${unitPriceHtml}
          ${optionsHtml}
          ${addonsHtml}
          ${noteHtml}
        </div>
      `;
    })
    .join("");

  const orderNoteHtml = order.orderNote
    ? `<div style="padding-top: 2px; color: #222;">
        <span style="color: #444;">Catatan Pesanan:</span>
        <div style="font-style: italic; padding-left: 6px; word-break: break-word; margin-top: 1px;">
          &ldquo;${escapeHtml(order.orderNote)}&rdquo;
        </div>
      </div>`
    : "";

  const shippingFeeText =
    order.shippingFee > 0
      ? formatRupiah(order.shippingFee)
      : order.fulfillmentType === "delivery"
      ? "Rp0 (Gratis)"
      : "Rp0";

  const adminPhoneHtml = STORE_SETTINGS.adminWhatsapp
    ? `<div style="font-size: 9px; font-weight: bold;">WA: ${formatPhone(
        STORE_SETTINGS.adminWhatsapp
      )}</div>`
    : "";

  return `
    <div style="text-align: center; padding-bottom: 2px;">
      <div style="font-size: ${is58mm ? "13px" : "14px"}; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;">
        NOOK BY JINA
      </div>
      <div style="font-size: 9px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 1px;">
        STRUK PESANAN
      </div>
      <div style="font-size: 9px; color: #444; margin-top: 2px;">
        ${escapeHtml(STORE_SETTINGS.location)}
      </div>
      ${adminPhoneHtml}
    </div>

    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>

    <div style="font-size: ${is58mm ? "9px" : "10px"}; line-height: 1.35;">
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <span style="color: #444;">No. Pesanan:</span>
        <strong style="font-size: ${is58mm ? "11px" : "12px"}; letter-spacing: 0.3px;">
          ${escapeHtml(order.id)}
        </strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #444;">Waktu:</span>
        <span>${escapeHtml(formatWIB(order.createdAt))}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #444;">Pelanggan:</span>
        <strong style="word-break: break-word; max-width: 65%; text-align: right;">${escapeHtml(
          order.customerName
        )}</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #444;">WhatsApp:</span>
        <span>${escapeHtml(formatPhone(order.customerWhatsapp))}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #444;">Layanan:</span>
        <span style="font-weight: 600;">${
          order.fulfillmentType === "delivery" ? "Delivery" : "Pickup Toko"
        }</span>
      </div>
      ${orderNoteHtml}
    </div>

    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>

    <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 2px; border-bottom: 1px dashed #000;">
      <span>RINCIAN MENU</span>
      <span>JUMLAH</span>
    </div>

    <div style="margin-top: 2px;">
      ${itemsHtml}
    </div>

    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>

    <div class="receipt-totals-section" style="font-size: ${is58mm ? "9px" : "10px"}; line-height: 1.35;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #444;">Subtotal Produk</span>
        <span>${formatRupiah(order.subtotal)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #444;">Ongkos Kirim</span>
        <span>${shippingFeeText}</span>
      </div>
      <div style="border-top: 1px dashed #000; margin: 3px 0;"></div>
      <div style="display: flex; justify-content: space-between; font-size: ${
        is58mm ? "11px" : "13px"
      }; font-weight: 900;">
        <span>TOTAL BAYAR</span>
        <span>${formatRupiah(order.total)}</span>
      </div>
    </div>

    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>

    <div class="receipt-totals-section" style="font-size: 9px; line-height: 1.35;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #444;">Metode Bayar:</span>
        <span style="font-weight: 600;">${escapeHtml(order.paymentMethod)}</span>
      </div>
    </div>

    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>

    <div class="receipt-totals-section" style="text-align: center; font-size: 9px; padding-top: 4px; line-height: 1.35;">
      <div style="font-weight: bold;">Terima kasih atas pesanan Anda!</div>
      <div style="color: #444;">Simpan struk ini sebagai bukti transaksi resmi.</div>
      <div style="font-size: 8px; font-weight: bold; letter-spacing: 0.8px; margin-top: 4px; color: #555;">
        NOOK BY JINA
      </div>
    </div>
  `;
}

/**
 * Cleanly prints an isolated customer/cashier receipt for the selected order.
 * Uses an isolated hidden iframe with exact @page dimensions (58mm/80mm)
 * to avoid printing any surrounding admin dashboard or modal UI,
 * with automatic fallback to native print on mobile.
 */
export function printThermalReceipt(
  order: Order,
  width: "58mm" | "80mm" = "58mm"
): { success: boolean; error?: string } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { success: false, error: "Pencetakan hanya didukung di browser." };
  }

  const is58mm = width === "58mm";
  const widthCss = is58mm ? "58mm" : "80mm";
  const paddingCss = is58mm ? "2mm 2.5mm" : "3mm 4mm";
  const fontSizeCss = is58mm ? "10px" : "12px";

  // 1. Generate customer receipt HTML
  const receiptBodyHtml = generateCustomerReceiptHtml(order, width);

  // 2. Update hidden portal container so mobile/native window.print() fallback has the exact order content
  let portalEl = document.getElementById("thermal-receipt-portal-content");
  if (!portalEl) {
    let rootEl = document.getElementById("thermal-receipt-print-root");
    if (!rootEl) {
      rootEl = document.createElement("div");
      rootEl.id = "thermal-receipt-print-root";
      document.body.appendChild(rootEl);
    }
    portalEl = document.createElement("div");
    portalEl.id = "thermal-receipt-portal-content";
    rootEl.appendChild(portalEl);
  }
  portalEl.innerHTML = receiptBodyHtml;

  // 3. Remove any previous print iframe to avoid duplicate elements
  const existingFrame = document.getElementById("thermal-receipt-print-frame");
  if (existingFrame) {
    existingFrame.remove();
  }

  try {
    // 4. Create isolated hidden iframe
    const iframe = document.createElement("iframe");
    iframe.id = "thermal-receipt-print-frame";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.top = "-9999px";
    iframe.style.left = "-9999px";
    iframe.style.width = widthCss;
    iframe.style.height = "0px";
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return { success: true };
    }

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Struk_${order.id}</title>
  <style>
    @page {
      size: ${widthCss} auto;
      margin: 0mm !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      box-shadow: none !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${widthCss} !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
      font-size: ${fontSizeCss} !important;
      line-height: 1.35 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      overflow: visible !important;
    }
    .print-receipt-shell {
      width: ${widthCss} !important;
      max-width: ${widthCss} !important;
      margin: 0 auto !important;
      padding: ${paddingCss} !important;
      background: #ffffff !important;
      color: #000000 !important;
    }
    .receipt-item-row {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .receipt-totals-section {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
  </style>
</head>
<body>
  <div class="print-receipt-shell">
    ${receiptBodyHtml}
  </div>
</body>
</html>`);
    doc.close();

    // 5. Trigger print once iframe is parsed
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      }
    }, 150);

    return { success: true };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Tidak dapat membuka antarmuka cetak.";
    return { success: false, error: errorMsg };
  }
}
