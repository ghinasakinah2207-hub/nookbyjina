import { Suspense } from "react";
import PaymentReturnClient from "./PaymentReturnClient";

export const metadata = {
  title: "Memverifikasi Pembayaran | Nook by Jina",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PaymentReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-[#F25B09] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-[#737373]">
            Memverifikasi status transaksi pembayaran...
          </p>
        </div>
      }
    >
      <PaymentReturnClient />
    </Suspense>
  );
}
