import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pesanan Berhasil Dibuat",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SuksesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

