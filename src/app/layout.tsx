import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AppProvider } from "@/context/AppProvider";
import { getRootJsonLd } from "@/lib/json-ld";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://nookbyjina.my.id"),
  title: {
    default: "Nook by Jina | Pesan Makanan Favoritmu",
    template: "%s | Nook by Jina",
  },
  description:
    "Nook by Jina menyediakan pilihan makanan dan minuman dengan sistem pre-order. Lihat menu dan pesan dengan mudah secara online.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "https://nookbyjina.my.id",
    siteName: "Nook by Jina",
    title: "Nook by Jina | Pesan Makanan Favoritmu",
    description:
      "Nook by Jina menyediakan pilihan makanan dan minuman dengan sistem pre-order. Lihat menu dan pesan dengan mudah secara online.",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "Nook by Jina — Sajian Makanan Homemade & Pre-order",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nook by Jina | Pesan Makanan Favoritmu",
    description:
      "Nook by Jina menyediakan pilihan makanan dan minuman dengan sistem pre-order. Lihat menu dan pesan dengan mudah secara online.",
    images: ["/images/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
  const rootJsonLd = getRootJsonLd();

  return (
    <html lang="id" className={`${plusJakartaSans.variable} h-full`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(rootJsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#F6F6F7] text-[#111111] font-sans antialiased">
        <AppProvider>{children}</AppProvider>
        <Analytics />
      </body>
    </html>
  );
}
