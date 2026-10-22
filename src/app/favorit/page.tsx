import React from "react";
import { getVisibleProducts } from "@/lib/supabase/catalog";
import FavoritClient from "@/components/favorit/FavoritClient";

export const instant = false;

export default async function FavoritPage() {
  const catalogProducts = await getVisibleProducts().catch(() => []);
  return <FavoritClient catalogProducts={catalogProducts} />;
}
