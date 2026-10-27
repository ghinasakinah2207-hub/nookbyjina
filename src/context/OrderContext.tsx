"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Order, OrderStatus, PaymentStatus, CartItem, FulfillmentType, PaymentMethod } from "@/types";
import { STORE_SETTINGS, generateOrderId, generateOrderToken } from "@/data/dummy-data";
import { saveOrderToken, getOrderToken, getAllOrderTokens } from "@/lib/order-token-vault";

interface CreateOrderParams {
  customerName: string;
  customerWhatsapp: string;
  fulfillmentType: FulfillmentType;
  deliveryArea: string;
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  orderNote: string;
  paymentMethod?: PaymentMethod;
}

interface OrderContextType {
  orders: Order[];
  isHydrated: boolean;
  createOrder: (params: CreateOrderParams) => Order;
  addOrder: (order: Order) => void;
  mergeOrders: (incomingOrders: Order[]) => void;
  getOrderById: (id: string) => Order | undefined;
  getOrderByToken: (token: string) => Order | undefined;
  refreshOrderByToken: (token: string) => Promise<Order | null>;
  syncWithServer: () => Promise<void>;
  updateOrderStatus: (
    orderId: string,
    orderStatus?: OrderStatus,
    paymentStatus?: PaymentStatus,
    token?: string
  ) => Promise<{ success: boolean; error?: string; order?: Order }>;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

const ORDERS_STORAGE_KEY = "temu_customer_orders_v1";

export function OrderProvider({ children }: { children: React.ReactNode }) {
  // Initialize with hydration-safe empty array so SSR and initial client render match
  const [orders, setOrders] = useState<Order[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const isHydratedRef = React.useRef(false);

  // Restore persisted customer orders after mounting and sync with backend
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(ORDERS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            // Restore token from vault if missing in order
            const withTokens: Order[] = parsed.map((o: Order) => {
              const vaultToken = getOrderToken(o.id);
              const token = o.token || vaultToken || "";
              if (token && o.id) {
                saveOrderToken(o.id, token);
              }
              return {
                ...o,
                token,
              };
            });

            // Defense-in-depth: keep only authentic customer orders (has secret token or in vault)
            const customerOnlyOrders = withTokens.filter(
              (o) => (typeof o.token === "string" && o.token.length >= 8) || Boolean(getOrderToken(o.id))
            );
            setOrders(customerOnlyOrders);

            // Clean up legacy contaminated storage if untokenized orders were present
            if (customerOnlyOrders.length !== parsed.length) {
              try {
                localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(customerOnlyOrders));
              } catch {
                // Ignore storage write error
              }
            }

            // Re-validate and sync latest status from backend for existing customer tokens
            const allTokens = Array.from(
              new Set([
                ...customerOnlyOrders.map((o) => o.token),
                ...getAllOrderTokens(),
              ])
            ).filter((t: string) => typeof t === "string" && t.length >= 8);

            if (allTokens.length > 0) {
              fetch("/api/orders/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tokens: allTokens }),
              })
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                  if (data && data.success && Array.isArray(data.orders) && data.orders.length > 0) {
                    setOrders((prev) => {
                      const updated = prev.map((local) => {
                        const remote = data.orders.find(
                          (r: Order) => r.token === local.token || r.id === local.id
                        );
                        if (!remote) return local;
                        return {
                          ...local,
                          orderStatus: remote.orderStatus,
                          paymentStatus: remote.paymentStatus,
                          paymentDeadline: remote.paymentDeadline,
                          token: local.token || getOrderToken(local.id) || "",
                        };
                      });
                      try {
                        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(updated));
                      } catch {
                        // Ignore storage write error
                      }
                      return updated;
                    });
                  }
                })
                .catch(() => {
                  // Ignore background sync errors
                });
            }
          }
        }
      } catch {
        // Ignore JSON parse errors
      } finally {
        isHydratedRef.current = true;
        setIsHydrated(true);
      }
    });
  }, []);

  // Save orders to localStorage on changes (only after hydration)
  useEffect(() => {
    if (!isHydratedRef.current) return;
    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    } catch {
      // Ignore
    }
  }, [orders]);

  const syncWithServer = async () => {
    const tokens = Array.from(
      new Set([
        ...orders.map((o) => o.token),
        ...getAllOrderTokens(),
      ])
    ).filter((t) => typeof t === "string" && t.length >= 8);

    if (tokens.length === 0) return;

    try {
      const res = await fetch("/api/orders/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.orders)) {
        setOrders((prev) =>
          prev.map((local) => {
            const remote = data.orders.find(
              (r: Order) => r.token === local.token || r.id === local.id
            );
            if (!remote) return local;
            return {
              ...local,
              orderStatus: remote.orderStatus,
              paymentStatus: remote.paymentStatus,
              paymentDeadline: remote.paymentDeadline,
              token: local.token || getOrderToken(local.id) || "",
            };
          })
        );
      }
    } catch {
      // Ignore network failures
    }
  };

  const refreshOrderByToken = async (token: string): Promise<Order | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data && data.success && data.order) {
        const remoteOrder = data.order as Order;
        setOrders((prev) => {
          const index = prev.findIndex((o) => o.token === token || o.id === remoteOrder.id);
          if (index >= 0) {
            const copy = [...prev];
            copy[index] = {
              ...copy[index],
              orderStatus: remoteOrder.orderStatus,
              paymentStatus: remoteOrder.paymentStatus,
              paymentDeadline: remoteOrder.paymentDeadline,
              token: copy[index].token || getOrderToken(copy[index].id) || token,
            };
            return copy;
          }
          return prev;
        });
        return remoteOrder;
      }
    } catch {
      // Return null on failure
    }
    return null;
  };

  const createOrder = (params: CreateOrderParams): Order => {
    const now = new Date();
    const isCash = params.paymentMethod === "Cash";
    // Static QRIS payment deadline is exactly 30 minutes from creation
    const PAYMENT_DEADLINE_MS = 30 * 60 * 1000;
    const deadline = new Date(now.getTime() + PAYMENT_DEADLINE_MS);
    const seq = orders.length + 1;
    const orderId = generateOrderId(seq);
    const token = generateOrderToken();

    const newOrder: Order = {
      id: orderId,
      token,
      createdAt: now.toISOString(),
      customerName: params.customerName.trim(),
      customerWhatsapp: params.customerWhatsapp.trim(),
      fulfillmentType: params.fulfillmentType,
      deliveryArea: params.deliveryArea,
      orderNote: params.orderNote.slice(0, 200).trim(),
      items: params.items,
      subtotal: params.subtotal,
      shippingFee: params.shippingFee,
      total: params.total,
      orderStatus: "Pesanan baru",
      paymentStatus: isCash ? "Menunggu Pembayaran" : "Menunggu Verifikasi",
      paymentMethod: isCash ? "Cash" : "QRIS Statis",
      paymentDeadline: isCash ? "" : deadline.toISOString(),
      merchantName: STORE_SETTINGS.qrisMerchantName,
    };

    saveOrderToken(orderId, token);
    setOrders((prev) => [newOrder, ...prev]);
    return newOrder;
  };

  const addOrder = (order: Order) => {
    setOrders((prev) => {
      const existing = prev.find((o) => o.id === order.id);
      const resolvedToken = order.token || existing?.token || getOrderToken(order.id) || "";
      if (resolvedToken && order.id) {
        saveOrderToken(order.id, resolvedToken);
      }
      const mergedOrder: Order = {
        ...order,
        token: resolvedToken,
      };
      return [mergedOrder, ...prev.filter((o) => o.id !== order.id)];
    });
  };

  /**
   * @deprecated Admin state is isolated in useAdminOrders.
   * Customer OrderContext only accepts orders that possess authentic customer access tokens.
   */
  const mergeOrders = (incomingOrders: Order[]) => {
    if (!Array.isArray(incomingOrders) || incomingOrders.length === 0) return;
    // Strict isolation guard: Only allow orders with customer access tokens
    const validOrders = incomingOrders.filter(
      (o) => (typeof o.token === "string" && o.token.length >= 8) || Boolean(getOrderToken(o.id))
    );
    if (validOrders.length === 0) return;

    setOrders((prev) => {
      const existingMap = new Map(prev.map((o) => [o.id, o]));
      for (const order of validOrders) {
        const existing = existingMap.get(order.id);
        const resolvedToken = order.token || existing?.token || getOrderToken(order.id) || "";
        if (resolvedToken && order.id) {
          saveOrderToken(order.id, resolvedToken);
        }
        existingMap.set(order.id, {
          ...order,
          token: resolvedToken,
        });
      }
      return Array.from(existingMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  };

  const getOrderById = (id: string) => {
    return orders.find((o) => o.id === id);
  };

  const getOrderByToken = (token: string) => {
    return orders.find((o) => o.token === token);
  };

  const updateOrderStatus = async (
    orderId: string,
    orderStatus?: OrderStatus,
    paymentStatus?: PaymentStatus,
    token?: string
  ): Promise<{ success: boolean; error?: string; order?: Order }> => {
    // 1. Snapshot previous state for rollback on failure
    let previousOrder: Order | undefined;
    setOrders((prev) => {
      previousOrder = prev.find((o) => o.id === orderId || o.token === orderId);
      return prev.map((order) => {
        if (order.id !== orderId && order.token !== orderId) return order;
        return {
          ...order,
          orderStatus: orderStatus || order.orderStatus,
          paymentStatus: paymentStatus || order.paymentStatus,
        };
      });
    });

    // 2. Persist to authoritative backend
    try {
      const res = await fetch("/api/orders/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          token,
          orderStatus,
          paymentStatus,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || "Gagal memperbarui status pesanan.";
        // Revert optimistic update to prevent false success in UI
        if (previousOrder) {
          const snapshot = previousOrder;
          setOrders((prev) =>
            prev.map((order) =>
              order.id === orderId || order.token === orderId ? snapshot : order
            )
          );
        }
        return { success: false, error: errorMsg };
      }

      // If backend returned authoritative updated order, synchronize it while preserving token
      if (data.order) {
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== orderId && order.token !== orderId) return order;
            return {
              ...data.order,
              token: order.token || getOrderToken(order.id) || "",
            };
          })
        );
      }
      return { success: true, order: data.order };
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Gagal menghubungi server.";
      // Revert optimistic update on network failure
      if (previousOrder) {
        const snapshot = previousOrder;
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId || order.token === orderId ? snapshot : order
          )
        );
      }
      return { success: false, error: errorMsg };
    }
  };

  return (
    <OrderContext.Provider
      value={{
        orders,
        isHydrated,
        createOrder,
        addOrder,
        mergeOrders,
        getOrderById,
        getOrderByToken,
        refreshOrderByToken,
        syncWithServer,
        updateOrderStatus,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error("useOrder must be used within an OrderProvider");
  }
  return context;
}

