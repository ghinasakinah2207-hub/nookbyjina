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
  X,
  ShieldCheck,
  MoreHorizontal,
  ChevronRight,
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
  const [currentUserEmail, setCurrentUserEmail] = useState(userEmail);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [orderQueueCount, setOrderQueueCount] = useState<number>(0);
  const [qrisQueueCount, setQrisQueueCount] = useState<number>(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setCurrentUserEmail(data.user.email);
      }
    });
  }, []);

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMoreSheetOpen(false);
  }

  // Close sheet on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && moreSheetOpen) {
        setMoreSheetOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreSheetOpen]);

  // Lock body scroll when mobile sheet is open
  useEffect(() => {
    if (moreSheetOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [moreSheetOpen]);

  // Background queue count fetcher (lightweight, resilient)
  useEffect(() => {
    let isMounted = true;
    const fetchQueueCounts = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/orders");
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data?.success && Array.isArray(data.orders)) {
          let newOrders = 0;
          let pendingQris = 0;
          for (const order of data.orders) {
            const status = String(order.orderStatus || order.status || "").toLowerCase();
            const payStatus = String(order.paymentStatus || "").toLowerCase();
            const method = String(order.paymentMethod || order.payment_method || "").toLowerCase();
            const isExpired = order.expiresAt ? new Date(order.expiresAt).getTime() < Date.now() : false;

            // Pending/new orders queue
            if ((status === "pesanan baru" || status === "menunggu_konfirmasi") && !isExpired) {
              newOrders++;
            }
            // Pending QRIS queue
            const isQris = method.includes("qris") || method.includes("dana");
            const isWaitingVerification = payStatus.includes("menunggu") || payStatus === "pending";
            if (isQris && isWaitingVerification && !isExpired && status !== "dibatalkan") {
              pendingQris++;
            }
          }
          setOrderQueueCount(newOrders);
          setQrisQueueCount(pendingQris);
        }
      } catch {
        // Silently catch background errors
      }
    };

    fetchQueueCounts();
    const interval = setInterval(fetchQueueCounts, 20000);
    const handleVis = () => {
      if (document.visibilityState === "visible") fetchQueueCounts();
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, []);

  // Standalone login route renders without the admin shell
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const routeMeta = ROUTE_CONFIG[pathname];
  const activeTitle = pageTitle || routeMeta?.title;
  const activeBadge = badgeText || routeMeta?.badge;
  const activeDesc = pageDescription || routeMeta?.description;

  const isActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  // Mobile Bottom Tab Bar Active States
  const isDashboardActive = pathname === "/admin";
  const isOrdersActive = pathname.startsWith("/admin/pesanan");
  const isMenuActive = pathname.startsWith("/admin/menu") || pathname.startsWith("/admin/produk");
  const isQrisActive = pathname.startsWith("/admin/pembayaran");
  const isMoreActive =
    moreSheetOpen ||
    pathname.startsWith("/admin/beranda") ||
    pathname.startsWith("/admin/laporan") ||
    pathname.startsWith("/admin/pengaturan");

  return (
    <div className="min-h-screen bg-[#F6F6F7] flex flex-col md:flex-row">
      {/* =========================================================================
          DESKTOP SIDEBAR (Visible on md and larger) - 100% Preserved
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
          MOBILE TOPBAR (Visible on small screens, md:hidden)
          ========================================================================= */}
      <header className="md:hidden bg-white border-b border-[#E5E5E5] sticky top-0 z-30 print-hide">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-[#111111] text-white flex items-center justify-center font-bold text-xs tracking-wider">
              NJ
            </div>
            <div>
              <span className="text-xs font-bold text-[#111111] block leading-tight">
                Nook by Jina
              </span>
              <span className="text-[10px] text-[#737373] block leading-none">Admin Portal</span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/menu"
              title="Lihat Tampilan Toko"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E5E5E5] text-[11px] font-medium text-[#737373] hover:text-[#111111] hover:bg-neutral-50 transition-colors"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Toko</span>
            </Link>
          </div>
        </div>
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

        {/* Content Container (padded bottom on mobile to accommodate fixed tab bar) */}
        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-6 max-w-6xl w-full mx-auto print:p-0 print:m-0 print:max-w-none print:w-auto">
          {children}
        </main>
      </div>

      {/* =========================================================================
          MOBILE BOTTOM TAB BAR (Fixed on small screens, md:hidden)
          ========================================================================= */}
      <nav
        aria-label="Navigasi Utama Admin Mobile"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E5E5] md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="max-w-md mx-auto flex items-center justify-around h-16 px-1">
          {/* 1. Dasbor */}
          <Link
            href="/admin"
            prefetch={true}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[48px] transition-colors select-none ${
              isDashboardActive
                ? "text-[#F25B09] font-medium"
                : "text-[#737373] hover:text-[#111111]"
            }`}
          >
            <div className="relative flex items-center justify-center w-6 h-6">
              <LayoutDashboard
                className="w-5 h-5 transition-transform"
                strokeWidth={isDashboardActive ? 2.3 : 1.8}
                aria-hidden="true"
              />
            </div>
            <span className="text-[11px] mt-1 leading-none">Dasbor</span>
          </Link>

          {/* 2. Pesanan */}
          <Link
            href="/admin/pesanan"
            prefetch={true}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[48px] transition-colors select-none ${
              isOrdersActive
                ? "text-[#F25B09] font-medium"
                : "text-[#737373] hover:text-[#111111]"
            }`}
          >
            <div className="relative flex items-center justify-center w-6 h-6">
              <ShoppingBag
                className="w-5 h-5 transition-transform"
                strokeWidth={isOrdersActive ? 2.3 : 1.8}
                aria-hidden="true"
              />
              {orderQueueCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 bg-[#F25B09] text-white text-[10px] font-semibold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border border-white"
                  aria-label={`${orderQueueCount} pesanan menunggu konfirmasi`}
                >
                  {orderQueueCount > 99 ? "99+" : orderQueueCount}
                </span>
              )}
            </div>
            <span className="text-[11px] mt-1 leading-none">Pesanan</span>
          </Link>

          {/* 3. Menu */}
          <Link
            href="/admin/menu"
            prefetch={true}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[48px] transition-colors select-none ${
              isMenuActive
                ? "text-[#F25B09] font-medium"
                : "text-[#737373] hover:text-[#111111]"
            }`}
          >
            <div className="relative flex items-center justify-center w-6 h-6">
              <UtensilsCrossed
                className="w-5 h-5 transition-transform"
                strokeWidth={isMenuActive ? 2.3 : 1.8}
                aria-hidden="true"
              />
            </div>
            <span className="text-[11px] mt-1 leading-none">Menu</span>
          </Link>

          {/* 4. QRIS */}
          <Link
            href="/admin/pembayaran"
            prefetch={true}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[48px] transition-colors select-none ${
              isQrisActive
                ? "text-[#F25B09] font-medium"
                : "text-[#737373] hover:text-[#111111]"
            }`}
          >
            <div className="relative flex items-center justify-center w-6 h-6">
              <QrCode
                className="w-5 h-5 transition-transform"
                strokeWidth={isQrisActive ? 2.3 : 1.8}
                aria-hidden="true"
              />
              {qrisQueueCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 bg-[#F25B09] text-white text-[10px] font-semibold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border border-white"
                  aria-label={`${qrisQueueCount} verifikasi QRIS menunggu`}
                >
                  {qrisQueueCount > 99 ? "99+" : qrisQueueCount}
                </span>
              )}
            </div>
            <span className="text-[11px] mt-1 leading-none">QRIS</span>
          </Link>

          {/* 5. Lainnya */}
          <button
            type="button"
            onClick={() => setMoreSheetOpen((prev) => !prev)}
            aria-expanded={moreSheetOpen}
            aria-controls="admin-more-sheet"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[48px] transition-colors select-none cursor-pointer ${
              isMoreActive
                ? "text-[#F25B09] font-medium"
                : "text-[#737373] hover:text-[#111111]"
            }`}
          >
            <div className="relative flex items-center justify-center w-6 h-6">
              <MoreHorizontal
                className="w-5 h-5 transition-transform"
                strokeWidth={isMoreActive ? 2.3 : 1.8}
                aria-hidden="true"
              />
            </div>
            <span className="text-[11px] mt-1 leading-none">Lainnya</span>
          </button>
        </div>
      </nav>

      {/* =========================================================================
          MOBILE "LAINNYA" BOTTOM SHEET MODAL (md:hidden)
          ========================================================================= */}
      {moreSheetOpen && (
        <div className="md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 transition-opacity animate-landing-fade"
            onClick={() => setMoreSheetOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet Modal */}
          <div
            id="admin-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Menu Admin Lainnya"
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl border-t border-[#E5E5E5] max-h-[85vh] flex flex-col animate-landing-fade"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
          >
            {/* Drag Handle Indicator */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-neutral-300" />
            </div>

            {/* Sheet Header */}
            <div className="px-5 py-3 flex items-center justify-between border-b border-[#F0F0F0]">
              <div>
                <h2 className="text-sm font-bold text-[#111111]">Menu Lainnya</h2>
                <p className="text-[11px] text-[#737373]">Kelola etalase, analitik & pengaturan toko</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreSheetOpen(false)}
                className="p-1.5 rounded-lg text-[#737373] hover:text-[#111111] hover:bg-neutral-100 transition-colors cursor-pointer"
                aria-label="Tutup menu lainnya"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu Items */}
            <div className="px-4 py-3 space-y-2 overflow-y-auto flex-1">
              {/* Seksi Beranda */}
              <Link
                href="/admin/beranda"
                onClick={() => setMoreSheetOpen(false)}
                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                  pathname.startsWith("/admin/beranda")
                    ? "bg-orange-50 text-[#F25B09] font-medium border border-orange-200"
                    : "bg-neutral-50 hover:bg-neutral-100 text-[#111111] border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      pathname.startsWith("/admin/beranda")
                        ? "bg-orange-100 text-[#F25B09]"
                        : "bg-white text-[#737373] border border-[#E5E5E5]"
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block leading-tight">Seksi Beranda</span>
                    <span className="text-[10px] text-[#737373] block mt-0.5">
                      Kelola hero banner & susunan seksi etalase
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#737373]" />
              </Link>

              {/* Laporan Penjualan */}
              <Link
                href="/admin/laporan"
                onClick={() => setMoreSheetOpen(false)}
                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                  pathname.startsWith("/admin/laporan")
                    ? "bg-orange-50 text-[#F25B09] font-medium border border-orange-200"
                    : "bg-neutral-50 hover:bg-neutral-100 text-[#111111] border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      pathname.startsWith("/admin/laporan")
                        ? "bg-orange-100 text-[#F25B09]"
                        : "bg-white text-[#737373] border border-[#E5E5E5]"
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block leading-tight">Laporan Penjualan</span>
                    <span className="text-[10px] text-[#737373] block mt-0.5">
                      Ringkasan omzet, laba kotor & analitik
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#737373]" />
              </Link>

              {/* Pengaturan Toko */}
              <Link
                href="/admin/pengaturan"
                onClick={() => setMoreSheetOpen(false)}
                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                  pathname.startsWith("/admin/pengaturan")
                    ? "bg-orange-50 text-[#F25B09] font-medium border border-orange-200"
                    : "bg-neutral-50 hover:bg-neutral-100 text-[#111111] border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      pathname.startsWith("/admin/pengaturan")
                        ? "bg-orange-100 text-[#F25B09]"
                        : "bg-white text-[#737373] border border-[#E5E5E5]"
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block leading-tight">Pengaturan Toko</span>
                    <span className="text-[10px] text-[#737373] block mt-0.5">
                      Status toko, jam buka, WhatsApp & ongkir
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#737373]" />
              </Link>

              {/* Lihat Toko Pelanggan */}
              <Link
                href="/menu"
                onClick={() => setMoreSheetOpen(false)}
                className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 text-[#111111] border border-transparent transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white text-[#737373] border border-[#E5E5E5] flex items-center justify-center">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block leading-tight">Lihat Toko Pelanggan</span>
                    <span className="text-[10px] text-[#737373] block mt-0.5">
                      Buka katalog menu pelanggan
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#737373]" />
              </Link>
            </div>

            {/* User Info & Logout Footer */}
            <div className="p-4 border-t border-[#F0F0F0] space-y-2 bg-[#FAF9F8]">
              <div className="flex items-center gap-2.5 px-2 py-1">
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
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#B42318] bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar dari Dasbor</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
