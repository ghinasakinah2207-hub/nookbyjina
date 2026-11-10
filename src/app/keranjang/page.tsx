import React from "react";
import type { Metadata } from "next";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import { getVisibleProducts } from "@/lib/supabase/catalog";
import CartClient from "@/components/cart/CartClient";

export const instant = false;

export const metadata: Metadata = {
  title: "Keranjang Belanja",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CartPage() {
  const [storeSettings, products] = await Promise.all([
    getStoreSettings(),
    getVisibleProducts().catch(() => []),
  ]);
  return <CartClient storeOpen={storeSettings.isOpen} initialProducts={products} />;
}
