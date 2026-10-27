"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Layers,
  QrCode,
  BarChart3,
  Settings,
  Store,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { logoutAction } from "@/app/admin/actions";
import { supabase } from "@/lib/supabase/client";

interface AdminShellProps {
  children: React.ReactNode;
  userEmail?: string;
  pageTitle?: string;
  pageDescription?: string;
  badgeText?: string;
  action?: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    name: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    name: "Pesanan",
    href: "/admin/pesanan",
    icon: ShoppingBag,
    badge: "Order",
    badgeColor: "bg-orange-100 text-[#F25B09]",
  },
  {
    name: "Menu & Produk",
    href: "/admin/menu",
    icon: UtensilsCrossed,
  },
  {
    name: "Seksi Beranda",
    href: "/admin/beranda",
    icon: Layers,
    badge: "Etalase",
    badgeColor: "bg-blue-100 text-blue-700",
  },
  {
    name: "Verifikasi QRIS",
    href: "/admin/pembayaran",
    icon: QrCode,
    badge: "DANA",
    badgeColor: "bg-emerald-100 text-[#18794E]",
  },
  {
    name: "Laporan Penjualan",
    href: "/admin/laporan",
    icon: BarChart3,
  },
  {
    name: "Pengaturan Toko",
    href: "/admin/pengaturan",
    icon: Settings,
  },
];

interface RouteHeaderConfig {
  title: string;
  badge?: string;
  description?: string;
}

const ROUTE_CONFIG: Record<string, RouteHeaderConfig> = {
  "/admin": {
    title: "Dasbor Operasional",
    badge: "Owner Aktif",
  },
  "/admin/pesanan": {
    title: "Manajemen Pesanan",
    badge: "Operasional",
  },
  "/admin/menu": {
    title: "Katalog Menu & Produk",
    badge: "Katalog",
  },
  "/admin/beranda": {
    title: "Manajemen Seksi Beranda",
    badge: "Etalase Toko",
    description:
      "Konfigurasi banner hero beranda, susunan seksi, visibilitas, dan penugasan produk etalase beranda pelanggan",
  },
  "/admin/pembayaran": {
    title: "Verifikasi Pembayaran & QRIS",
    badge: "QRIS Merchant",
    description:
      "Pemeriksaan mutasi DANA Bisnis merchant dan konfirmasi pesanan lunas",
  },
  "/admin/laporan": {
    title: "Laporan Penjualan & Keuangan",
    badge: "Keuangan",
    description:
      "Ringkasan omzet, estimasi laba kotor, dan analitik produk terlaris",
  },
  "/admin/pengaturan": {
    title: "Pengaturan Toko",
    badge: "Pengaturan",
    description:
      "Konfigurasi status toko, jam operasional, kontak WhatsApp, QRIS, dan tarif ongkir",
  },
};

export function AdminShell({
  children,
  userEmail = "owner@temubyjina.com",
  pageTitle,
  pageDescription,
  badgeText,
  action,
}: AdminShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Standalone login route renders without the admin shell
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const routeMeta = ROUTE_CONFIG[pathname];
  const activeTitle = pageTitle || routeMeta?.title;
  const activeBadge = badgeText || routeMeta?.badge;
  const activeDesc = pageDescription || routeMeta?.description;

  const [currentUserEmail, setCurrentUserEmail] = useState(userEmail);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setCurrentUserEmail(data.user.email);
      }
    });
  }, []);

  const isActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[#F6F6F7] flex flex-col md:flex-row">
      {/* =========================================================================
          DESKTOP SIDEBAR (Visible on md and larger)
          ========================================================================= */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-[#E5E5E5] z-30 print-hide">
        {/* Brand Header */}
        <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#111111] text-white flex items-center justify-center font-bold text-xs tracking-wider">
              NJ
            </div>
            <div>
              <span className="text-xs font-bold text-[#111111] block leading-tight">
                Nook by Jina
              </span>
              <span className="text-[10px] text-[#737373] block">Admin Portal</span>
            </div>
          </Link>

          <Link
            href="/menu"
            title="Lihat Tampilan Toko"
            className="p-1.5 rounded-lg border border-[#E5E5E5] text-[#737373] hover:text-[#111111] hover:border-neutral-300 transition-colors"
          >
            <Store className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          <div>
            <div className="px-3 pb-2 text-[10px] font-semibold text-[#737373] uppercase tracking-wider">
              Menu Operasional
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.slice(0, 5).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                      active
                        ? "bg-[#111111] text-white"
                        : "text-[#737373] hover:text-[#111111] hover:bg-neutral-100"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${active ? "text-white" : "text-[#737373]"}`} />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && !active && (
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                          item.badgeColor || "bg-neutral-100 text-[#737373]"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div>
            <div className="px-3 pb-2 text-[10px] font-semibold text-[#737373] uppercase tracking-wider">
              Analitik & Pengaturan
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.slice(5).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                      active
                        ? "bg-[#111111] text-white"
                        : "text-[#737373] hover:text-[#111111] hover:bg-neutral-100"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${active ? "text-white" : "text-[#737373]"}`} />
                      <span>{item.name}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Owner Info & Logout Footer */}
        <div className="p-3 border-t border-[#E5E5E5] space-y-2 bg-[#FAF9F8]">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#18794E] flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold text-[#111111] block truncate">
                {currentUserEmail}
              </span>
              <span className="text-[9px] text-emerald-700 block font-medium">
                Owner Terverifikasi
              </span>
            </div>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-[#B42318] bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar dari Dasbor</span>
            </button>
          </form>
        </div>
      </aside>

      {/* =========================================================================
          MOBILE TOPBAR (Visible on small screens)
          ========================================================================= */}
      <header className="md:hidden bg-white border-b border-[#E5E5E5] sticky top-0 z-40 print-hide">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 -ml-1 rounded-lg text-[#111111] hover:bg-neutral-100 transition-colors"
              aria-label="Buka navigasi admin"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#111111] text-white flex items-center justify-center font-bold text-[10px]">
                NJ
              </div>
              <span className="text-xs font-bold text-[#111111]">Portal Admin</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/menu"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E5E5E5] text-[11px] font-medium text-[#737373] hover:text-[#111111]"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Toko</span>
            </Link>

            <form action={logoutAction}>
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-neutral-100 text-[#111111] hover:bg-neutral-200 transition-colors cursor-pointer"
                title="Keluar"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Mobile Slide-down Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-[#E5E5E5] bg-white px-4 py-3 space-y-4 animate-landing-fade">
            <nav className="grid grid-cols-2 gap-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium transition-colors ${
                      active
                        ? "bg-[#111111] text-white"
                        : "bg-neutral-50 text-[#111111] hover:bg-neutral-100"
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-white" : "text-[#737373]"}`} />
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-2 border-t border-[#E5E5E5] flex items-center justify-between text-xs">
              <span className="text-[11px] text-[#737373] truncate max-w-[200px]">
                {currentUserEmail}
              </span>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Owner Aktif
              </span>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          MAIN CONTENT VIEWPORT
          ========================================================================= */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen print:pl-0">
        {/* Page Title & Context Header */}
        {(activeTitle || action) && (
          <div
            className={`bg-white border-b border-[#E5E5E5] px-4 sm:px-6 print-hide ${
              activeDesc ? "py-4 sm:py-5" : "py-3 sm:py-3.5"
            }`}
          >
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-[#111111] tracking-tight">
                    {activeTitle}
                  </h1>
                  {activeBadge && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-[#F25B09]">
                      {activeBadge}
                    </span>
                  )}
                </div>
                {activeDesc && (
                  <p className="text-xs text-[#737373] mt-0.5">{activeDesc}</p>
                )}
              </div>

              {action && <div className="flex items-center gap-2">{action}</div>}
            </div>
          </div>
        )}

        {/* Content Container */}
        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 max-w-6xl w-full mx-auto print:p-0 print:m-0 print:max-w-none print:w-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
