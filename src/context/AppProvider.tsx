"use client";

import React, { Suspense } from "react";
import { CartProvider } from "./CartContext";
import { OrderProvider } from "./OrderContext";
import { BottomNavigation, BottomNavContext } from "@/components/layout/BottomNavigation";
import { FloatingCartBar } from "@/components/cart/FloatingCartBar";

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <OrderProvider>
        <BottomNavContext.Provider value={true}>
          {children}
          <Suspense fallback={null}>
            <FloatingCartBar />
            <BottomNavigation isRoot />
          </Suspense>
        </BottomNavContext.Provider>
      </OrderProvider>
    </CartProvider>
  );
}
