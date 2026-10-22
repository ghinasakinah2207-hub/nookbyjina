import React from "react";
import Link from "next/link";
import { Store } from "lucide-react";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import CheckoutClient from "@/components/checkout/CheckoutClient";
export const instant = false;

export default async function CheckoutPage() {
  const storeSettings = await getStoreSettings();

  // If store is closed, block checkout and render closed message
  if (!storeSettings.isOpen) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-6 text-center animate-landing-fade">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#B42318] flex items-center justify-center mb-3">
          <Store className="w-7 h-7" />
        </div>
        <h1 className="text-base font-bold text-[#111111]">Toko Sedang Close Order</h1>
        <p className="text-xs text-[#737373] mt-2 mb-6 max-w-xs leading-relaxed">
          Maaf ya kakak-kakak, saat ini pemesanan baru tidak dapat diproses karena toko sedang tutup order. Silakan cek kembali nanti atau hubungi admin.
        </p>
        <div className="flex gap-2.5">
          <Link
            href="/home"
            className="px-5 py-2.5 bg-[#111111] text-white text-xs font-semibold rounded-xl hover:bg-neutral-800 transition-colors"
          >
            Kembali ke Beranda
          </Link>
          <Link
            href="/pesanan"
            className="px-5 py-2.5 bg-white text-[#111111] border border-[#E5E5E5] text-xs font-semibold rounded-xl hover:bg-neutral-50 transition-colors"
          >
            Lacak Pesanan
          </Link>
        </div>
      </div>
    );
  }

  return <CheckoutClient initialStoreSettings={storeSettings} />;
}
