import React from "react";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import CartClient from "@/components/cart/CartClient";
export const instant = false;

export default async function CartPage() {
  const storeSettings = await getStoreSettings();
  return <CartClient storeOpen={storeSettings.isOpen} />;
}
