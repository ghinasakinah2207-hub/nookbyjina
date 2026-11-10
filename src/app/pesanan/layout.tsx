import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Status Pesanan",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PesananLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

