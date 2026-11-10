import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pembayaran Pesanan",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PembayaranLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

