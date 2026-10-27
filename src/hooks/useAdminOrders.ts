"use client";

import { useState, useEffect, useCallback } from "react";
import { Order, OrderStatus, PaymentStatus } from "@/types";

interface UseAdminOrdersOptions {
  pollingIntervalMs?: number;
  initialOrders?: Order[];
}

export function useAdminOrders(options: UseAdminOrdersOptions = {}) {
  const { pollingIntervalMs = 15000, initialOrders = [] } = options;
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const res = await fetch("/api/admin/orders");
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.orders)) {
          setOrders(data.orders);
          setError(null);
        }
      } else {
        if (isManual) {
          setError(`Gagal memuat pesanan (${res.status})`);
        }
      }
    } catch (err: unknown) {
      if (isManual) {
        setError(err instanceof Error ? err.message : "Gagal memuat pesanan");
      }
    } finally {
      if (isManual) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      fetch("/api/admin/orders")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && data && data.success && Array.isArray(data.orders)) {
            setOrders(data.orders);
          }
        })
        .catch(() => {});
    };

    load();
    const interval = setInterval(load, pollingIntervalMs);
    const handleVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", handleVis);

    return () => {
      ignore = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, [pollingIntervalMs]);

  const updateOrderStatus = useCallback(
    async (
      orderId: string,
      orderStatus?: OrderStatus,
      paymentStatus?: PaymentStatus
    ): Promise<{ success: boolean; error?: string; order?: Order }> => {
      let previousOrders: Order[] = [];
      setOrders((prev) => {
        previousOrders = prev;
        return prev.map((o) => {
          if (o.id !== orderId) return o;
          return {
            ...o,
            orderStatus: orderStatus || o.orderStatus,
            paymentStatus: paymentStatus || o.paymentStatus,
          };
        });
      });

      try {
        const res = await fetch("/api/orders/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            orderStatus,
            paymentStatus,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          const errorMsg = data.error || "Gagal memperbarui status pesanan.";
          setOrders(previousOrders);
          return { success: false, error: errorMsg };
        }

        if (data.order) {
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, ...data.order } : o))
          );
        }

        return { success: true, order: data.order };
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : "Gagal menghubungi server.";
        setOrders(previousOrders);
        return { success: false, error: errorMsg };
      }
    },
    []
  );

  return {
    orders,
    setOrders,
    isLoading,
    isRefreshing,
    error,
    fetchOrders,
    updateOrderStatus,
  };
}
