"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, X, ArrowRight, Clock, User, Layers } from "lucide-react";
import { OrderNotificationData } from "@/types";
import { formatRupiah } from "@/data/dummy-data";

interface OrderNotificationToastProps {
  notification: OrderNotificationData | null;
  queueCount: number;
  onDismiss: () => void;
  onViewOrder: (order: OrderNotificationData) => void;
}

const AUTO_DISMISS_MS = 7000;

export function OrderNotificationToast({
  notification,
  queueCount,
  onDismiss,
  onViewOrder,
}: OrderNotificationToastProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [remainingMs, setRemainingMs] = useState(AUTO_DISMISS_MS);
  const [relativeTime, setRelativeTime] = useState("Baru saja");

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const loggedNotificationIdRef = useRef<string | null>(null);

  // Log exactly once per active order ID when notification activates
  useEffect(() => {
    if (!notification || loggedNotificationIdRef.current === notification.id) return;
    loggedNotificationIdRef.current = notification.id;
    console.log("[Admin Notification] 🍞 Toast displayed for order:", {
      orderNumber: notification.orderNumber,
      customerName: notification.customerName,
      total: notification.total,
    });
  }, [notification]);

  const handleTriggerExit = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 240);
  }, [onDismiss]);

  const handleView = useCallback(() => {
    if (!notification) return;
    setIsExiting(true);
    setTimeout(() => {
      onViewOrder(notification);
      router.push(
        `/admin/pesanan?orderId=${encodeURIComponent(
          notification.orderNumber || notification.id
        )}`
      );
      onDismiss();
    }, 150);
  }, [notification, onViewOrder, router, onDismiss]);

  // Relative time updater
  useEffect(() => {
    if (!notification) return;

    const updateRelative = () => {
      const created = new Date(notification.createdAt).getTime();
      const diffSec = Math.floor((Date.now() - created) / 1000);
      if (diffSec < 45) {
        setRelativeTime("Baru saja");
      } else if (diffSec < 3600) {
        setRelativeTime(`${Math.floor(diffSec / 60)} mnt lalu`);
      } else {
        setRelativeTime(`${Math.floor(diffSec / 3600)} jam lalu`);
      }
    };

    updateRelative();
    const interval = setInterval(updateRelative, 15000);
    return () => clearInterval(interval);
  }, [notification]);

  // Auto-dismiss countdown with hover-pause
  useEffect(() => {
    if (!notification || isExiting) return;

    if (isHovered) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const intervalStep = 100;
    timerRef.current = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - intervalStep;
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTriggerExit();
          return 0;
        }
        return next;
      });
    }, intervalStep);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [notification, isHovered, isExiting, handleTriggerExit]);

  if (!notification) return null;

  const progressPercent = Math.max(
    0,
    Math.min(100, (remainingMs / AUTO_DISMISS_MS) * 100)
  );

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-label="Pemberitahuan Pesanan Baru"
      className="fixed top-3 sm:top-5 left-0 right-0 z-[9999] pointer-events-none px-3 sm:px-4 flex justify-center"
    >
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`pointer-events-auto w-full max-w-md bg-white border border-neutral-200/90 rounded-2xl order-toast-shadow overflow-hidden transition-all duration-200 select-none ${
          isExiting ? "animate-order-toast-out" : "animate-order-toast-in"
        }`}
      >
        {/* Card Content */}
        <div className="p-3.5 sm:p-4">
          {/* Top row: Icon, Title, Badge, and Close Button */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#F25B09] flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-[#111111] tracking-tight leading-tight">
                    Pesanan Baru Masuk!
                  </h3>
                  {queueCount > 1 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-50 text-[#F25B09] border border-orange-200 flex-shrink-0">
                      <Layers className="w-2.5 h-2.5" />
                      +{queueCount - 1} antrean
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#737373]">
                  <span className="font-mono font-medium text-[#111111] bg-neutral-100 px-1.5 py-0.5 rounded text-[10px]">
                    {notification.orderNumber}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#737373]" />
                    {relativeTime}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTriggerExit}
              title="Tutup Notifikasi"
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors flex-shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Middle row: Customer details and totals */}
          <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <User className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
              <span className="font-semibold text-[#111111] truncate">
                {notification.customerName || "Pelanggan Toko"}
              </span>
              <span className="text-[#737373] text-[11px] flex-shrink-0">
                ({notification.itemCount}{" "}
                {notification.itemCount > 1 ? "item" : "item"})
              </span>
            </div>

            <div className="text-right flex-shrink-0">
              <span className="font-bold text-[#F25B09] text-xs sm:text-sm">
                {formatRupiah(notification.total)}
              </span>
            </div>
          </div>

          {/* Bottom row: Action Button */}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleView}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#111111] text-white text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer shadow-sm active:scale-[0.98]"
            >
              <span>Lihat Pesanan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress bar countdown */}
        <div className="h-1 bg-orange-100/60 w-full overflow-hidden">
          <div
            className="h-full bg-[#F25B09] transition-all ease-linear"
            style={{
              width: `${progressPercent}%`,
              transitionDuration: isHovered ? "0ms" : "100ms",
            }}
          />
        </div>
      </div>
    </div>
  );
}
