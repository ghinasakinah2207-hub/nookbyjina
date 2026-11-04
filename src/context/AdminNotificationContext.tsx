"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { OrderNotificationData } from "@/types";
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  playOrderNotificationSound,
  playSampleNotificationSound,
} from "@/lib/notification-sound";
import { OrderNotificationToast } from "@/components/admin/OrderNotificationToast";

interface AdminNotificationContextValue {
  soundEnabled: boolean;
  toggleSound: () => void;
  queue: OrderNotificationData[];
  dismissCurrentNotification: () => void;
  dismissAllNotifications: () => void;
  triggerTestNotification: (customData?: Partial<OrderNotificationData>) => void;
}

const AdminNotificationContext = createContext<AdminNotificationContextValue | null>(null);

export function AdminNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() =>
    isNotificationSoundEnabled()
  );
  const [queue, setQueue] = useState<OrderNotificationData[]>([]);

  // Persistent references that survive re-renders
  const channelRef = useRef<RealtimeChannel | null>(null);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const subscriptionStartTimeRef = useRef<number>(0);
  const isSubscribingRef = useRef<boolean>(false);


  const toggleSound = useCallback(() => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      setNotificationSoundEnabled(next);
      if (next) {
        // Play sample tone so user can verify speakers
        playSampleNotificationSound();
      }
      return next;
    });
  }, []);

  const dismissCurrentNotification = useCallback(() => {
    setQueue((prev) => (prev.length > 0 ? prev.slice(1) : []));
  }, []);

  const dismissAllNotifications = useCallback(() => {
    setQueue([]);
  }, []);

  // Process incoming new order event (deduplicated & validated)
  const handleIncomingNewOrder = useCallback((rawOrder: Record<string, unknown>) => {
    if (!rawOrder || typeof rawOrder !== "object") {
      return;
    }

    const orderId = String(rawOrder.id || rawOrder.order_number || "");
    if (!orderId) {
      return;
    }

    // Deduplicate against already processed orders
    if (seenOrderIdsRef.current.has(orderId)) {
      console.warn("[Admin Notification] ⚠️ Duplicate order event skipped:", orderId);
      return;
    }
    seenOrderIdsRef.current.add(orderId);
    if (rawOrder.order_number && String(rawOrder.order_number) !== orderId) {
      seenOrderIdsRef.current.add(String(rawOrder.order_number));
    }

    // Safeguard: Check creation timestamp with generous tolerance for client/server clock skew
    const createdAtRaw = rawOrder.created_at;
    if (createdAtRaw && typeof createdAtRaw === "string") {
      const createdTime = new Date(createdAtRaw).getTime();

      // 10-minute (600s) skew tolerance: never reject fresh orders due to clock differences
      if (createdTime < subscriptionStartTimeRef.current - 600000) {
        console.warn("[Admin Notification] ⚠️ Historical order skipped (> 10m):", {
          orderId,
          createdAt: createdAtRaw,
        });
        return;
      }
    }

    // Calculate item count safely from items_snapshot without querying database
    let itemCount = 1;
    if (Array.isArray(rawOrder.items_snapshot)) {
      itemCount = rawOrder.items_snapshot.reduce((sum: number, item: unknown) => {
        if (item && typeof item === "object" && "quantity" in item) {
          const q = Number((item as { quantity: unknown }).quantity);
          return sum + (Number.isFinite(q) && q > 0 ? q : 1);
        }
        return sum + 1;
      }, 0);
    }

    const notificationItem: OrderNotificationData = {
      id: orderId,
      orderNumber: String(rawOrder.order_number || rawOrder.id || "TJ-NEW"),
      customerName: String(rawOrder.customer_name || "Pelanggan Toko"),
      itemCount: Math.max(1, itemCount),
      total: Number(rawOrder.total) || 0,
      createdAt: typeof createdAtRaw === "string" ? createdAtRaw : new Date().toISOString(),
    };

    console.log("[Admin Notification] 🔔 New order INSERT received:", {
      orderNumber: notificationItem.orderNumber,
      customerName: notificationItem.customerName,
      total: notificationItem.total,
    });

    // Play notification sound (will only play once per order and only if enabled)
    playOrderNotificationSound(orderId);

    // Add to notification queue
    setQueue((prev) => [...prev, notificationItem]);

    // Dispatch global event so active views (like OrdersManager) can refresh if mounted
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("nook:new-order-received", {
          detail: notificationItem,
        })
      );
    }
  }, []);


  // Test notification helper for manual verification and regression testing
  const triggerTestNotification = useCallback(
    (customData?: Partial<OrderNotificationData>) => {
      const testId = customData?.id || `test-${Date.now()}`;
      const item: OrderNotificationData = {
        id: testId,
        orderNumber: customData?.orderNumber || `TJ-${Math.floor(100000 + Math.random() * 900000)}`,
        customerName: customData?.customerName || "Pelanggan Uji Coba",
        itemCount: customData?.itemCount || 2,
        total: customData?.total || 45000,
        createdAt: customData?.createdAt || new Date().toISOString(),
      };

      seenOrderIdsRef.current.add(testId);
      playOrderNotificationSound(testId);
      setQueue((prev) => [...prev, item]);
    },
    []
  );

  // Setup single persistent Supabase Realtime channel at Admin Layout level
  useEffect(() => {
    // Only run on client side and if not already subscribing/subscribed
    if (typeof window === "undefined") return;
    if (channelRef.current || isSubscribingRef.current) return;

    let isMounted = true;
    isSubscribingRef.current = true;
    subscriptionStartTimeRef.current = Date.now();

    const channelName = "admin-orders-realtime";

    const setupRealtime = async () => {
      try {
        // 1. Resolve auth session strictly BEFORE channel creation and subscribe()
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError) {
          console.warn("[Admin Notification] ⚠️ Auth session check warning:", sessionError.message);
        }

        // 2. Set authentication token on Realtime socket if session exists
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        }

        if (!isMounted) return;
        if (channelRef.current) return;

        const channel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "orders",
            },
            (payload) => {
              // Strictly handle INSERT events only; ignore updates/deletes
              if (payload.eventType === "INSERT" && payload.new) {
                handleIncomingNewOrder(payload.new as Record<string, unknown>);
              }
            }
          )
          .subscribe((status, error) => {
            if (status === "SUBSCRIBED") {
              console.log("[Admin Notification] ✅ Realtime channel SUBSCRIBED to public.orders (INSERT)");
            } else if (status === "CHANNEL_ERROR") {
              console.error("[Admin Notification] ❌ Channel error:", error);
            } else if (status === "TIMED_OUT") {
              console.warn("[Admin Notification] ⏱️ Channel subscription timed out");
            }
          });

        channelRef.current = channel;
      } catch (err) {
        console.error(
          "[Admin Notification] ❌ Failed to initialize realtime channel:",
          err
        );
      } finally {
        isSubscribingRef.current = false;
      }
    };


    setupRealtime();

    // Cleanup: Remove channel ONLY when the Admin Layout unmounts
    return () => {
      isMounted = false;
      isSubscribingRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

    };
  }, [handleIncomingNewOrder]);



  const activeNotification = queue.length > 0 ? queue[0] : null;

  return (
    <AdminNotificationContext.Provider
      value={{
        soundEnabled,
        toggleSound,
        queue,
        dismissCurrentNotification,
        dismissAllNotifications,
        triggerTestNotification,
      }}
    >
      {children}

      {/* Render floating notification toast at root level */}
      <OrderNotificationToast
        key={activeNotification ? activeNotification.id : "empty"}
        notification={activeNotification}
        queueCount={queue.length}
        onDismiss={dismissCurrentNotification}
        onViewOrder={() => {
          // Additional custom handling on view if needed
        }}
      />

    </AdminNotificationContext.Provider>
  );
}

export function useAdminNotification(): AdminNotificationContextValue {
  const ctx = useContext(AdminNotificationContext);
  if (!ctx) {
    throw new Error(
      "useAdminNotification must be used within an AdminNotificationProvider"
    );
  }
  return ctx;
}
