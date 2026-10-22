import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppProvider } from "@/context/AppProvider";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  fallback: [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

// Determine canonical site origin for metadata resolution.
// In production, configure NEXT_PUBLIC_SITE_URL (e.g. "https://your-domain.com").
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
  `http://localhost:${process.env.PORT || 3000}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Nook by Jina — Makanan Homemade Penuh Rasa & Kehangatan",
  description:
    "Pesan menu makanan homemade lezat dari Nook by Jina di Lhoksukon. Nasi bakar cakalang, risol mayo lumer, dimsum mentai, dan minuman segar untuk pickup dan delivery.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Nook by Jina — Makanan Homemade",
    description: "Pemesanan makanan homemade praktis dan terpercaya di Lhoksukon.",
    type: "website",
    locale: "id_ID",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#F6F6F7",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${plusJakartaSans.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[#F6F6F7] text-[#111111] font-sans antialiased">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
