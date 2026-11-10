import React from "react";
import type { Metadata } from "next";
import { getVisibleProducts } from "@/lib/supabase/catalog";
import FavoritClient from "@/components/favorit/FavoritClient";

export const instant = false;

export const metadata: Metadata = {
  title: "Menu Favorit",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function FavoritPage() {
  const catalogProducts = await getVisibleProducts().catch(() => []);
  return <FavoritClient catalogProducts={catalogProducts} />;
}
