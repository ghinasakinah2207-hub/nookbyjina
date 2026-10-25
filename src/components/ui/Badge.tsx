import React from "react";
import { OrderStatus, PaymentStatus } from "@/types";
import { isPendingQrisStatus, isPendingCashStatus, isPaidStatus } from "@/lib/order-normalizer";

interface StatusBadgeProps {
  status: OrderStatus | PaymentStatus | string;
  type?: "order" | "payment";
}

export function StatusBadge({ status, type = "order" }: StatusBadgeProps) {
  // Styles based on DESIGN MD section 5 (Komponen Bersama - Status)
  let styleClasses = "bg-neutral-100 text-neutral-800 border-neutral-200";

  const isPendingVerifikasi = isPendingQrisStatus(status);
  const isPendingPembayaran = isPendingCashStatus(status);
  const isPaid = isPaidStatus(status);
  const isCancelled = status === "Dibatalkan" || String(status || "").toLowerCase() === "dibatalkan";

  if (status === "Pesanan baru") {
    styleClasses = "bg-neutral-100 text-[#111111] border-neutral-300 font-medium";
  } else if (isPendingVerifikasi || isPendingPembayaran) {
    // Amber / peringatan
    styleClasses = "bg-[#FFF4E5] text-[#8A4B08] border-[#FBD38D] font-medium";
  } else if (isPaid || status === "Siap") {
    // Hijau
    styleClasses = "bg-emerald-50 text-[#18794E] border-emerald-200 font-semibold";
  } else if (status === "Diproses") {
    // Oranye / aktif
    styleClasses = "bg-orange-50 text-[#F25B09] border-orange-200 font-semibold";
  } else if (status === "Selesai") {
    // Netral
    styleClasses = "bg-neutral-100 text-[#737373] border-neutral-200";
  } else if (isCancelled) {
    // Merah / danger
    styleClasses = "bg-red-50 text-[#B42318] border-red-200 font-medium";
  }

  const displayStatus = isPendingVerifikasi
    ? "Menunggu Verifikasi"
    : isPendingPembayaran
    ? "Menunggu Pembayaran"
    : isPaid
    ? "Lunas"
    : isCancelled
    ? "Dibatalkan"
    : status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border ${styleClasses}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isPaid || status === "Siap"
            ? "bg-[#18794E]"
            : status === "Diproses"
            ? "bg-[#F25B09]"
            : isPendingVerifikasi || isPendingPembayaran
            ? "bg-[#8A4B08]"
            : isCancelled
            ? "bg-[#B42318]"
            : "bg-[#737373]"
        }`}
      />
      {type === "payment" ? `Pembayaran: ${displayStatus}` : displayStatus}
    </span>
  );
}
