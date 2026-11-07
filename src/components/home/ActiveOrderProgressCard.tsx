"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Package, ChevronRight } from "lucide-react";
import { useOrder } from "@/context/OrderContext";
import { formatRupiah } from "@/data/dummy-data";
import { getOrderToken } from "@/lib/order-token-vault";
import { isOrderExpired, getOrderFinalTotal } from "@/lib/order-normalizer";
import { Order } from "@/types";

export const ACTIVE_ORDER_STAGES = [
  "Dibuat",
  "Dibayar",
  "Diproses",
  "Selesai",
] as const;

/**
 * Predicate to determine if an order is currently active.
 * Only returns true for valid, server-confirmed active orders.
 * Excludes cancelled, terminal, expired, completed, or missing-from-server orders.
 */
export function isOrderActive(order?: Order | null): boolean {
  if (!order) return false;

  // 1. Exclude orders confirmed missing from the server
  if (order.syncStatus === "not_found" || order.serverConfirmed === false) {
    return false;
  }

  // 2. Only show server-confirmed active orders (unverified local-only records are excluded)
  if (order.serverConfirmed !== true) {
    return false;
  }

  // 3. Exclude terminal completed orders
  if (order.orderStatus === "Selesai") {
    return false;
  }

  // 4. Exclude terminal cancelled orders
  if (
    order.orderStatus === "Dibatalkan" ||
    order.paymentStatus === "Dibatalkan"
  ) {
    return false;
  }

  // 5. Exclude expired payment window (e.g. 30-min unpaid QRIS)
  if (isOrderExpired(order)) {
    return false;
  }

  return true;
}

export interface ActiveOrderCardViewModel {
  order: Order;
  finalTotal: number;
  statusLabel: string;
  stageIndex: number; // 0: Dibuat, 1: Dibayar, 2: Diproses, 3: Selesai
  isAwaitingPayment: boolean;
  ctaLabel: string;
  ctaHref: string;
  detailHref: string;
}

/**
 * Computes authoritative display view-model for an active order.
 * Strictly adheres to verified payment state (never assumes payment without Lunas).
 */
export function computeActiveOrderViewModel(order: Order): ActiveOrderCardViewModel {
  const token = order.token || getOrderToken(order.id) || "";
  const finalTotal = getOrderFinalTotal(order);
  const detailHref = token
    ? `/pesanan/${encodeURIComponent(token)}`
    : `/pesanan/${encodeURIComponent(order.id)}`;
  const paymentHref = `/pembayaran/${encodeURIComponent(order.id)}${
    token ? `?token=${encodeURIComponent(token)}` : ""
  }`;

  const isCash = order.paymentMethod === "Cash";
  const isPaid = order.paymentStatus === "Lunas";
  const isProcessing = order.orderStatus === "Diproses";
  const isReady = order.orderStatus === "Siap";
  const isPickup = order.fulfillmentType === "pickup";

  // State 1: Awaiting payment (Unpaid QRIS/online gateway)
  const isAwaitingPayment =
    !isPaid && !isCash && order.paymentStatus === "Menunggu Pembayaran";

  // State 2: Payment verification / awaiting confirmation
  const isVerifying = !isPaid && order.paymentStatus === "Menunggu Verifikasi";

  let statusLabel = "Pesanan baru";
  let stageIndex = 0; // Stage 0: Dibuat
  let ctaLabel = "Lihat pesanan";
  let ctaHref = detailHref;

  if (isAwaitingPayment) {
    statusLabel = "Menunggu pembayaran QRIS";
    stageIndex = 0;
    ctaLabel = "Bayar";
    ctaHref = paymentHref;
  } else if (isVerifying) {
    statusLabel = "Menunggu verifikasi pembayaran";
    stageIndex = 0; // Not yet confirmed as paid
    ctaLabel = "Lihat pesanan";
    ctaHref = detailHref;
  } else if (isReady) {
    statusLabel = isPickup
      ? "Pesanan siap diambil di toko"
      : "Pesanan dalam pengantaran";
    stageIndex = 2; // Kitchen finished preparing
    ctaLabel = "Lihat pesanan";
    ctaHref = detailHref;
  } else if (isProcessing) {
    statusLabel = "Pesanan sedang disiapkan dapur";
    stageIndex = 2; // Kitchen preparing
    ctaLabel = "Lihat pesanan";
    ctaHref = detailHref;
  } else if (isPaid) {
    statusLabel = "Pembayaran terverifikasi • Menunggu dapur";
    stageIndex = 1; // Stage 1: Dibayar
    ctaLabel = "Lihat pesanan";
    ctaHref = detailHref;
  } else if (isCash) {
    statusLabel = "Bayar tunai saat pesanan diterima";
    stageIndex = 0;
    ctaLabel = "Lihat pesanan";
    ctaHref = detailHref;
  }

  return {
    order,
    finalTotal,
    statusLabel,
    stageIndex,
    isAwaitingPayment,
    ctaLabel,
    ctaHref,
    detailHref,
  };
}

export function ActiveOrderProgressCard() {
  const { orders, isHydrated } = useOrder();

  // Filter and sort active customer orders (predictable selection rule: newest first)
  const activeOrders = useMemo(() => {
    if (!isHydrated || !Array.isArray(orders)) return [];
    return orders
      .filter(isOrderActive)
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
  }, [orders, isHydrated]);

  // When no active orders, render nothing with zero empty placeholder/spacing
  if (!isHydrated || activeOrders.length === 0) {
    return null;
  }

  const primaryOrder = activeOrders[0];
  const otherOrdersCount = activeOrders.length - 1;
  const vm = computeActiveOrderViewModel(primaryOrder);

  // Progress fill percentage based on stageIndex (0 = 0%, 1 = 33.3%, 2 = 66.6%, 3 = 100%)
  const progressPercent =
    vm.stageIndex === 0
      ? 0
      : vm.stageIndex === 1
      ? 33.3
      : vm.stageIndex === 2
      ? 66.6
      : 100;

  return (
    <aside
      aria-label="Status Pesanan Aktif"
      data-testid="active-order-progress-card"
      className="w-full rounded-2xl bg-gradient-to-r from-[#21100C] via-[#35170E] to-[#54220F] border border-white/10 shadow-md shadow-black/25 px-3.5 py-2.5 text-white flex flex-col justify-between transition-all select-none animate-in fade-in duration-200"
      style={{ minHeight: "96px" }}
    >
      {/* 1. Header Row: Icon, Heading, Order #, Total & CTA Action */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex items-center justify-center w-5 h-5 rounded-md bg-white/10 text-white shrink-0">
            <Package className="w-3.5 h-3.5 text-[#F25B09]" />
          </div>
          <span className="text-xs font-bold text-white tracking-tight">
            Pesanan kamu
          </span>
          <span className="text-[11px] font-medium text-neutral-400 truncate">
            • {primaryOrder.id}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            data-testid="active-order-amount"
            className="text-xs font-extrabold text-white tracking-tight"
          >
            {formatRupiah(vm.finalTotal)}
          </span>

          <Link
            href={vm.ctaHref}
            data-testid="active-order-cta"
            aria-label={`${vm.ctaLabel} untuk pesanan ${primaryOrder.id}`}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-0.5 transition-transform active:scale-95 shadow-xs cursor-pointer ${
              vm.isAwaitingPayment
                ? "bg-[#F25B09] hover:bg-[#D94D06] text-white"
                : "bg-white/15 hover:bg-white/25 text-white border border-white/10"
            }`}
          >
            <span>{vm.ctaLabel}</span>
            <ChevronRight className="w-3 h-3 stroke-[2.5]" />
          </Link>
        </div>
      </div>

      {/* 2. Status Label Row */}
      <div className="flex items-center justify-between text-[11px] text-neutral-300 mt-1 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F25B09] shrink-0" />
          <span
            data-testid="active-order-status-label"
            className="font-medium text-white/90 truncate"
          >
            {vm.statusLabel}
          </span>
        </div>

        {otherOrdersCount > 0 && (
          <Link
            href="/pesanan"
            aria-label={`Lihat ${otherOrdersCount} pesanan aktif lainnya`}
            className="text-[10px] text-neutral-400 hover:text-white shrink-0 ml-2 transition-colors underline"
          >
            +{otherOrdersCount} pesanan lainnya
          </Link>
        )}
      </div>

      {/* 3. Horizontal 4-Stage Progress Indicator */}
      <div
        data-testid="active-order-progress-track"
        className="relative pt-1 pb-0.5"
      >
        {/* Track connecting line */}
        <div className="absolute top-[7.5px] left-3 right-3 h-[2px] bg-white/15 rounded-full -z-0">
          <div
            className="h-full bg-[#F25B09] rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* 4 Stage Nodes */}
        <div className="relative z-10 flex items-center justify-between">
          {ACTIVE_ORDER_STAGES.map((stageName, idx) => {
            const isCompleted = idx <= vm.stageIndex;
            const isCurrent = idx === vm.stageIndex;

            return (
              <div
                key={stageName}
                data-testid={`stage-node-${idx}`}
                className="flex flex-col items-center flex-1"
              >
                {/* Dot indicator */}
                <div
                  className={`w-2.5 h-2.5 rounded-full flex items-center justify-center transition-colors ${
                    isCompleted
                      ? "bg-[#F25B09] ring-2 ring-orange-500/25"
                      : "bg-[#3A1810] border border-white/20"
                  }`}
                />
                {/* Stage Label */}
                <span
                  className={`text-[9.5px] mt-1 leading-none transition-colors select-none ${
                    isCurrent
                      ? "font-bold text-white"
                      : isCompleted
                      ? "font-medium text-orange-200/90"
                      : "text-neutral-500"
                  }`}
                >
                  {stageName}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
