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
    console.log("[Admin Realtime Diagnostic] 📥 Incoming rawOrder received in handler:", rawOrder);
    if (!rawOrder || typeof rawOrder !== "object") {
      console.warn("[Admin Realtime Diagnostic] ⚠️ rawOrder is not a valid object:", rawOrder);
      return;
    }

    const orderId = String(rawOrder.id || rawOrder.order_number || "");
    if (!orderId) {
      console.warn("[Admin Realtime Diagnostic] ⚠️ Order missing both id and order_number:", rawOrder);
      return;
    }

    // Deduplicate against already processed orders
    if (seenOrderIdsRef.current.has(orderId)) {
      console.warn("[Admin Realtime Diagnostic] ⚠️ Event REJECTED by deduplication: Order ID already processed:", orderId);
      return;
    }
    seenOrderIdsRef.current.add(orderId);

    // Safeguard: Check creation timestamp to ensure no historical orders are notified
    const createdAtRaw = rawOrder.created_at;
    if (createdAtRaw && typeof createdAtRaw === "string") {
      const createdTime = new Date(createdAtRaw).getTime();
      const diffMs = subscriptionStartTimeRef.current - createdTime;
      console.log("[Admin Realtime Diagnostic] ⏱️ Timestamp evaluation:", {
        createdAtRaw,
        createdTime,
        subscriptionStartTime: subscriptionStartTimeRef.current,
        diffSecondsFromSubStart: diffMs / 1000,
      });

      // If created more than 15 seconds before the subscription was mounted, ignore as historical
      if (createdTime < subscriptionStartTimeRef.current - 15000) {
        console.warn("[Admin Realtime Diagnostic] ⚠️ Event REJECTED by timestamp check (historical order):", {
          orderId,
          createdAt: createdAtRaw,
          createdTime,
          thresholdTime: subscriptionStartTimeRef.current - 15000,
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

    console.log("[Admin Realtime Diagnostic] 🚀 Event ACCEPTED: Queuing notification item:", notificationItem);

    // Play notification sound (will only play once per order and only if enabled)
    playOrderNotificationSound(orderId);

    // Add to notification queue
    setQueue((prev) => {
      const updated = [...prev, notificationItem];
      console.log("[Admin Realtime Diagnostic] 📋 Queue updated. New length:", updated.length);
      return updated;
    });

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

    isSubscribingRef.current = true;
    subscriptionStartTimeRef.current = Date.now();

    const channelName = "admin-orders-realtime";

    console.log("[Admin Realtime Diagnostic] 🔌 Mounting Realtime subscriber at Admin Layout level");
    console.log("[Admin Realtime Diagnostic] ⚙️ Supabase Project URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

    // Diagnostic check for auth session before connecting
    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      console.log("[Admin Realtime Diagnostic] 🔐 Auth Session Status:", {
        hasSession: Boolean(session),
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        tokenLength: session?.access_token?.length,
        sessionError: sessionError?.message,
      });

      if (session?.access_token) {
        console.log("[Admin Realtime Diagnostic] 🔑 Realtime client setAuth called with admin access_token.");
        supabase.realtime.setAuth(session.access_token);
      } else {
        console.warn("[Admin Realtime Diagnostic] ⚠️ No access_token in session! Realtime connecting as anon role.");
      }
    });

    try {
      console.log(`[Admin Realtime Diagnostic] 📡 Registering channel "${channelName}" for table: public.orders (event: INSERT)...`);

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
            console.log("[Admin Realtime Diagnostic] ⚡ postgres_changes event intercepted:", {
              eventType: payload.eventType,
              table: payload.table,
              schema: payload.schema,
              hasNew: Boolean(payload.new),
              hasOld: Boolean(payload.old),
              rawPayload: payload,
            });

            // Strictly handle INSERT events only; ignore updates/deletes
            if (payload.eventType === "INSERT" && payload.new) {
              handleIncomingNewOrder(payload.new as Record<string, unknown>);
            } else {
              console.log("[Admin Realtime Diagnostic] ℹ️ Ignoring non-INSERT or empty payload event:", payload.eventType);
            }
          }
        )
        .subscribe((status, error) => {
          console.log(`[Admin Realtime Diagnostic] 📡 Channel status transition: ${status}`, error ? { error } : "");
          if (status === "SUBSCRIBED") {
            console.log("[Admin Realtime Diagnostic] ✅ SUBSCRIBED: Channel successfully joined and actively listening to public.orders INSERT!");
          } else if (status === "CHANNEL_ERROR") {
            console.error("[Admin Realtime Diagnostic] ❌ CHANNEL_ERROR:", error);
          } else if (status === "TIMED_OUT") {
            console.warn("[Admin Realtime Diagnostic] ⏱️ TIMED_OUT: Channel subscription timed out");
          } else if (status === "CLOSED") {
            console.log("[Admin Realtime Diagnostic] 🚪 Channel status: CLOSED");
          }
        });

      channelRef.current = channel;
    } catch (err) {
      console.error("[Admin Realtime Diagnostic] ❌ Failed to initialize realtime channel:", err);
    } finally {
      isSubscribingRef.current = false;
    }

    // Cleanup: Remove channel ONLY when the Admin Layout unmounts
    return () => {
      console.log("[Admin Realtime Diagnostic] 🧹 Cleaning up Realtime channel on Admin Layout unmount.");
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
