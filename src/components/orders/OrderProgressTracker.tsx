"use client";

import React from "react";
import {
  CreditCard,
  ChefHat,
  Truck,
  Store,
  CheckCircle2,
  Check,
  XCircle,
} from "lucide-react";
import { Order } from "@/types";
import { isOrderExpired } from "@/lib/order-normalizer";

export type StageState = "completed" | "active" | "upcoming";

export interface StageInfo {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: StageState;
}

export interface OrderProgressTrackerProps {
  order: Order;
  className?: string;
}

/**
 * Computes authoritative visual progression across 4 lifecycle stages:
 * Stage 1: Pembayaran
 * Stage 2: Diproses
 * Stage 3: Dalam Pengiriman (delivery) | Siap Diambil (pickup)
 * Stage 4: Selesai
 */
export function computeOrderProgress(order: Order) {
  const isExpired = isOrderExpired(order);
  const isCancelled =
    order.orderStatus === "Dibatalkan" ||
    order.paymentStatus === "Dibatalkan" ||
    isExpired;

  if (isCancelled) {
    let desc = "Pesanan ini telah dibatalkan dan tidak dapat diproses lebih lanjut.";

    if (order.paymentStatus === "Lunas") {
      desc =
        "Pesanan ini dibatalkan. Informasi penyelesaian dan pengembalian dana (refund) dapat diakses melalui Detail Pesanan.";
    } else if (isExpired) {
      desc =
        "Batas waktu pembayaran QRIS (30 menit) telah kedaluwarsa sebelum pembayaran terverifikasi.";
    }

    return {
      isCancelled: true,
      desc,
      stages: [] as StageInfo[],
      line0Active: false,
      line1Active: false,
      line2Active: false,
      statusSummaryText: "Pesanan Dibatalkan",
      statusDotColor: "bg-red-500",
    };
  }

  const isPaid = order.paymentStatus === "Lunas";
  const orderStatus = order.orderStatus;
  const isPickup = order.fulfillmentType === "pickup";

  // Stage 1: Pembayaran
  // Completed if payment is Lunas, or if kitchen has already advanced to Diproses/Siap/Selesai
  let stage1Status: StageState = "upcoming";
  if (isPaid || orderStatus === "Diproses" || orderStatus === "Siap" || orderStatus === "Selesai") {
    stage1Status = "completed";
  } else {
    stage1Status = "active";
  }

  // Stage 2: Diproses
  // Active when store has started preparing (orderStatus === "Diproses")
  // Completed when order has reached Siap or Selesai
  // Upcoming if order is still "Pesanan baru" (even if paid, kitchen hasn't started cooking yet!)
  let stage2Status: StageState = "upcoming";
  if (orderStatus === "Siap" || orderStatus === "Selesai") {
    stage2Status = "completed";
  } else if (orderStatus === "Diproses") {
    stage2Status = "active";
  } else {
    stage2Status = "upcoming";
  }

  // Stage 3: Dalam Pengiriman (delivery) or Siap Diambil (pickup)
  // Active when kitchen has marked ready (orderStatus === "Siap")
  // Completed when orderStatus === "Selesai"
  let stage3Status: StageState = "upcoming";
  if (orderStatus === "Selesai") {
    stage3Status = "completed";
  } else if (orderStatus === "Siap") {
    stage3Status = "active";
  } else {
    stage3Status = "upcoming";
  }

  // Stage 4: Selesai
  // Completed when orderStatus === "Selesai"
  const stage4Status: StageState = orderStatus === "Selesai" ? "completed" : "upcoming";

  // Connecting lines
  // Line 0: Segment between Stage 1 & Stage 2
  // Line 0 is active when Stage 2 is active or completed
  const line0Active = stage2Status === "active" || stage2Status === "completed";

  // Line 1: Segment between Stage 2 & Stage 3
  // Line 1 is active when Stage 3 is active or completed
  const line1Active = stage3Status === "active" || stage3Status === "completed";

  // Line 2: Segment between Stage 3 & Stage 4
  // Line 2 is active when Stage 4 is completed
  const line2Active = stage4Status === "completed";

  // Status Summary Text
  let statusSummaryText = "Menunggu Pembayaran";
  let statusDotColor = "bg-amber-500";

  if (orderStatus === "Selesai") {
    statusSummaryText = "Pesanan telah selesai";
    statusDotColor = "bg-emerald-500";
  } else if (orderStatus === "Siap") {
    statusSummaryText = isPickup
      ? "Pesanan siap diambil di dapur"
      : "Pesanan dalam pengantaran kurir";
    statusDotColor = "bg-[#F25B09]";
  } else if (orderStatus === "Diproses") {
    statusSummaryText = "Pesanan sedang disiapkan dapur";
    statusDotColor = "bg-[#F25B09]";
  } else if (orderStatus === "Pesanan baru") {
    if (isPaid) {
      statusSummaryText = "Pembayaran terverifikasi • Menunggu dapur";
      statusDotColor = "bg-blue-500";
    } else if (order.paymentMethod === "Cash") {
      statusSummaryText = "Menunggu pembayaran tunai (Cash)";
      statusDotColor = "bg-amber-500";
    } else if (order.gatewayProvider === "duitku" || order.paymentMethod === "QRIS") {
      statusSummaryText = "Menunggu verifikasi otomatis QRIS Duitku";
      statusDotColor = "bg-amber-500";
    } else {
      statusSummaryText = "Menunggu verifikasi pembayaran QRIS";
      statusDotColor = "bg-amber-500";
    }
  }

  const stages: StageInfo[] = [
    {
      id: "pembayaran",
      label: "Pembayaran",
      icon: CreditCard,
      status: stage1Status,
    },
    {
      id: "diproses",
      label: "Diproses",
      icon: ChefHat,
      status: stage2Status,
    },
    {
      id: "fulfillment",
      label: isPickup ? "Siap Diambil" : "Dalam Pengiriman",
      icon: isPickup ? Store : Truck,
      status: stage3Status,
    },
    {
      id: "selesai",
      label: "Selesai",
      icon: CheckCircle2,
      status: stage4Status,
    },
  ];

  return {
    isCancelled: false,
    paymentBadge: "",
    desc: "",
    stages,
    line0Active,
    line1Active,
    line2Active,
    statusSummaryText,
    statusDotColor,
  };
}

export function OrderProgressTracker({ order, className = "" }: OrderProgressTrackerProps) {
  const progress = computeOrderProgress(order);

  // Dedicated Cancelled Order State (Not a 5th stage)
  if (progress.isCancelled) {
    return (
      <div
        className={`p-3 bg-red-50/70 border border-red-200/80 rounded-xl flex items-start gap-2.5 text-xs text-[#B42318] ${className}`}
      >
        <XCircle className="w-4 h-4 text-[#B42318] shrink-0 mt-0.5" />
        <div className="space-y-0.5 min-w-0 flex-1">
          <span className="font-bold text-red-900 block">Pesanan Dibatalkan</span>
          <p className="text-[11px] text-red-700 leading-snug">
            {progress.desc}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* 4-Stage Horizontal Progress Tracker */}
      <div className="relative w-full pt-1 pb-1">
        {/* Connecting Lines Behind Circles */}
        <div className="absolute top-4 -translate-y-1/2 left-0 right-0 h-[2.5px] pointer-events-none z-0">
          {/* Segment 0: 0 -> 1 */}
          <div
            className={`absolute top-0 h-full left-[12.5%] w-[25%] transition-colors duration-300 motion-reduce:transition-none ${
              progress.line0Active ? "bg-[#F25B09]" : "bg-neutral-200"
            }`}
          />
          {/* Segment 1: 1 -> 2 */}
          <div
            className={`absolute top-0 h-full left-[37.5%] w-[25%] transition-colors duration-300 motion-reduce:transition-none ${
              progress.line1Active ? "bg-[#F25B09]" : "bg-neutral-200"
            }`}
          />
          {/* Segment 2: 2 -> 3 */}
          <div
            className={`absolute top-0 h-full left-[62.5%] w-[25%] transition-colors duration-300 motion-reduce:transition-none ${
              progress.line2Active ? "bg-[#F25B09]" : "bg-neutral-200"
            }`}
          />
        </div>

        {/* 4 Stage Nodes */}
        <div className="relative grid grid-cols-4 gap-1 z-10 select-none">
          {progress.stages.map((stage) => {
            const Icon = stage.icon;
            const isCompleted = stage.status === "completed";
            const isActive = stage.status === "active";

            return (
              <div key={stage.id} className="flex flex-col items-center">
                {/* Circular Icon Container */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 motion-reduce:transition-none ${
                    isCompleted
                      ? "bg-[#F25B09] text-white shadow-2xs"
                      : isActive
                      ? "bg-[#F25B09] text-white ring-4 ring-orange-100 shadow-xs"
                      : "bg-white text-neutral-400 border border-neutral-200"
                  }`}
                  aria-label={`${stage.label}: ${stage.status}`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>

                {/* Stage Label */}
                <span
                  className={`text-[10px] sm:text-[10.5px] text-center leading-tight mt-1.5 transition-colors duration-300 motion-reduce:transition-none px-0.5 ${
                    isCompleted
                      ? "font-semibold text-neutral-900"
                      : isActive
                      ? "font-bold text-[#F25B09]"
                      : "font-normal text-neutral-400"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contextual Status Subtitle Pill */}
      <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-neutral-50/80 border border-neutral-100 flex items-center justify-between text-[11px] leading-tight">
        <div className="flex items-center gap-1.5 min-w-0 pr-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${progress.statusDotColor}`} />
          <span className="font-medium text-neutral-800 truncate">
            {progress.statusSummaryText}
          </span>
        </div>
        <span className="text-[9.5px] font-semibold text-neutral-500 bg-neutral-200/70 px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wider">
          {order.fulfillmentType === "pickup" ? "Pickup" : "Delivery"}
        </span>
      </div>
    </div>
  );
}
