"use client";

import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  QrCode,
  MessageCircle,
  ShoppingBag,
  X,
  Printer,
  Banknote,
} from "lucide-react";
import { useOrder } from "@/context/OrderContext";
import { Order, OrderStatus } from "@/types";
import { StatusBadge } from "@/components/ui/Badge";
import { formatRupiah } from "@/data/dummy-data";
import { OrderReceipt } from "./OrderReceipt";
import { printThermalReceipt } from "@/lib/print-receipt";
import { isQrisMethod, isPendingQrisStatus, isPendingCashStatus } from "@/lib/order-normalizer";

type FilterTab = "semua" | "verifikasi" | "kas" | "berjalan" | "selesai" | "dibatalkan";

export function OrdersManager() {
  const { orders, updateOrderStatus, addOrder } = useOrder();
  const [activeTab, setActiveTab] = useState<FilterTab>("semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [confirmLunasOrder, setConfirmLunasOrder] = useState<Order | null>(null);
  const [confirmCashOrder, setConfirmCashOrder] = useState<Order | null>(null);
  const [confirmCashCompleteOrder, setConfirmCashCompleteOrder] = useState<Order | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<"58mm" | "80mm">("58mm");
  const [printError, setPrintError] = useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/admin/orders")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success && Array.isArray(data.orders)) {
          data.orders.forEach((serverOrder: Order) => {
            addOrder(serverOrder);
          });
        }
      })
      .catch(() => {});
  }, [addOrder]);

  const handlePrintReceipt = (order: Order) => {
    setPrintError(null);
    const result = printThermalReceipt(order, receiptWidth);
    if (!result.success) {
      setPrintError(
        result.error ||
          "Gagal membuka jendela cetak. Pastikan izin pop-up browser telah diberikan."
      );
    }
  };

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      semua: orders.length,
      verifikasi: orders.filter((o) => isQrisMethod(o.paymentMethod) && isPendingQrisStatus(o.paymentStatus)).length,
      kas: orders.filter((o) => o.paymentMethod === "Cash" && isPendingCashStatus(o.paymentStatus)).length,
      berjalan: orders.filter(
        (o) => o.orderStatus === "Pesanan baru" || o.orderStatus === "Diproses" || o.orderStatus === "Siap"
      ).length,
      selesai: orders.filter((o) => o.orderStatus === "Selesai").length,
      dibatalkan: orders.filter((o) => o.orderStatus === "Dibatalkan").length,
    };
  }, [orders]);

  // Filtered orders with priority sorting
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Filter by tab
    if (activeTab === "verifikasi") {
      result = result.filter((o) => isQrisMethod(o.paymentMethod) && isPendingQrisStatus(o.paymentStatus));
    } else if (activeTab === "kas") {
      result = result.filter((o) => o.paymentMethod === "Cash" && isPendingCashStatus(o.paymentStatus));
    } else if (activeTab === "berjalan") {
      result = result.filter(
        (o) => o.orderStatus === "Pesanan baru" || o.orderStatus === "Diproses" || o.orderStatus === "Siap"
      );
    } else if (activeTab === "selesai") {
      result = result.filter((o) => o.orderStatus === "Selesai");
    } else if (activeTab === "dibatalkan") {
      result = result.filter((o) => o.orderStatus === "Dibatalkan");
    }

    // Filter by search query (Order ID or Customer Name)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (o) => o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)
      );
    }

    // Sort priority:
    // 1. Pesanan baru / Menunggu verifikasi / Menunggu pembayaran kas
    // 2. Diproses / Siap
    // 3. Selesai / Dibatalkan
    // In each group: newest first
    const getPriority = (o: Order) => {
      if (
        o.paymentStatus === "Menunggu Verifikasi" ||
        o.paymentStatus === "Menunggu Pembayaran" ||
        o.orderStatus === "Pesanan baru"
      )
        return 1;
      if (o.orderStatus === "Diproses" || o.orderStatus === "Siap") return 2;
      return 3;
    };

    result.sort((a, b) => {
      const prioA = getPriority(a);
      const prioB = getPriority(b);
      if (prioA !== prioB) return prioA - prioB;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [orders, activeTab, searchQuery]);

  const handleMarkLunas = async (orderId: string) => {
    const res = await updateOrderStatus(orderId, "Diproses", "Lunas");
    setConfirmLunasOrder(null);
    if (!res.success) {
      alert(res.error || "Gagal mengonfirmasi pembayaran lunas.");
      return;
    }
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) =>
        prev ? { ...prev, orderStatus: "Diproses", paymentStatus: "Lunas" } : null
      );
    }
  };

  const handleConfirmCashLunas = async (orderId: string) => {
    // When marking cash received, paymentStatus becomes Lunas; if orderStatus was Pesanan baru, transition to Diproses
    const currentOrder = orders.find((o) => o.id === orderId);
    const nextOrderStatus = currentOrder?.orderStatus === "Pesanan baru" ? "Diproses" : currentOrder?.orderStatus;
    const res = await updateOrderStatus(orderId, nextOrderStatus, "Lunas");
    setConfirmCashOrder(null);
    if (!res.success) {
      alert(res.error || "Gagal mengonfirmasi pembayaran tunai.");
      return;
    }
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) =>
        prev
          ? {
              ...prev,
              orderStatus: nextOrderStatus || prev.orderStatus,
              paymentStatus: "Lunas",
            }
          : null
      );
    }
  };

  const handleConfirmCashComplete = async (orderId: string) => {
    const res = await updateOrderStatus(orderId, "Selesai", "Lunas");
    setConfirmCashCompleteOrder(null);
    if (!res.success) {
      alert(res.error || "Gagal menyelesaikan pesanan tunai.");
      return;
    }
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) =>
        prev ? { ...prev, orderStatus: "Selesai", paymentStatus: "Lunas" } : null
      );
    }
  };

  const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
    const res = await updateOrderStatus(orderId, status);
    if (!res.success) {
      alert(res.error || `Gagal mengubah status menjadi ${status}.`);
      return;
    }
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, orderStatus: status } : null));
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (confirm("Apakah Anda yakin ingin membatalkan pesanan ini? Pesanan yang dibatalkan tidak otomatis aktif kembali.")) {
      const res = await updateOrderStatus(orderId, "Dibatalkan", "Dibatalkan");
      if (!res.success) {
        alert(res.error || "Gagal membatalkan pesanan.");
        return;
      }
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) =>
          prev ? { ...prev, orderStatus: "Dibatalkan", paymentStatus: "Dibatalkan" } : null
        );
      }
    }
  };

  const getCleanWhatsappLink = (phone: string, orderId: string, name: string) => {
    let cleanNumber = phone.replace(/[^0-9]/g, "");
    if (cleanNumber.startsWith("0")) {
      cleanNumber = "62" + cleanNumber.slice(1);
    }
    const message = encodeURIComponent(
      `Halo Kak ${name}, ini dari Nook by Jina mengenai pesanan ${orderId}.`
    );
    return `https://wa.me/${cleanNumber}?text=${message}`;
  };

  return (
    <div className="space-y-3">
      {/* =========================================================================
          OPERATIONAL DASHBOARD CONTROLS & ORDERS (Hidden during print)
          ========================================================================= */}
      <div className="space-y-3 print-hide">
        {/* Error Feedback for Printing */}
        {printError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[#B42318] flex items-center justify-between gap-2.5 animate-landing-fade">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-semibold">{printError}</span>
            </div>
            <button
              type="button"
              onClick={() => setPrintError(null)}
              className="p-1 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* =========================================================================
            FILTER TABS & SEARCH BAR
            ========================================================================= */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan nomor order (TJ-...) atau nama pelanggan..."
            className="w-full pl-9 pr-3.5 py-2.5 bg-[#F6F6F7] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] placeholder:text-[#A3A3A3] focus:outline-hidden focus:border-[#111111] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#737373] hover:text-[#111111]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => setActiveTab("semua")}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === "semua"
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 text-[#737373] hover:text-[#111111]"
            }`}
          >
            Semua <span suppressHydrationWarning>({tabCounts.semua})</span>
          </button>

          <button
            onClick={() => setActiveTab("verifikasi")}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === "verifikasi"
                ? "bg-[#8A4B08] text-white"
                : "bg-amber-50 text-[#8A4B08] border border-amber-200"
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Verifikasi QRIS</span>
            {tabCounts.verifikasi > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
            <span suppressHydrationWarning>({tabCounts.verifikasi})</span>
          </button>

          <button
            onClick={() => setActiveTab("kas")}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === "kas"
                ? "bg-[#18794E] text-white"
                : "bg-emerald-50 text-[#18794E] border border-emerald-200"
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>Menunggu Kas</span>
            {tabCounts.kas > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
            <span suppressHydrationWarning>({tabCounts.kas})</span>
          </button>

          <button
            onClick={() => setActiveTab("berjalan")}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === "berjalan"
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 text-[#737373] hover:text-[#111111]"
            }`}
          >
            Diproses & Siap <span suppressHydrationWarning>({tabCounts.berjalan})</span>
          </button>

          <button
            onClick={() => setActiveTab("selesai")}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === "selesai"
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 text-[#737373] hover:text-[#111111]"
            }`}
          >
            Selesai <span suppressHydrationWarning>({tabCounts.selesai})</span>
          </button>

          <button
            onClick={() => setActiveTab("dibatalkan")}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === "dibatalkan"
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 text-[#737373] hover:text-[#111111]"
            }`}
          >
            Dibatalkan <span suppressHydrationWarning>({tabCounts.dibatalkan})</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          ORDERS LIST (MOBILE-FIRST CARD ROWS)
          ========================================================================= */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-[#737373] flex items-center justify-center mx-auto">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#111111]">Tidak ada pesanan</h3>
            <p className="text-xs text-[#737373] mt-0.5">
              {searchQuery
                ? `Tidak ditemukan pesanan dengan kata kunci "${searchQuery}"`
                : "Belum ada pesanan yang sesuai dengan filter ini."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredOrders.map((order) => {
            const dateObj = new Date(order.createdAt);
            const timeFormatted = dateObj.toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const dateFormatted = dateObj.toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
            });

            const isCashOrder = order.paymentMethod === "Cash";
            const needsQrisVerification =
              !isCashOrder && order.paymentStatus === "Menunggu Verifikasi";
            const needsCashReceipt =
              isCashOrder && order.paymentStatus === "Menunggu Pembayaran";

            return (
              <div
                key={order.id}
                className={`bg-white border rounded-2xl p-4 sm:p-5 transition-colors space-y-3.5 ${
                  needsQrisVerification
                    ? "border-amber-300 ring-1 ring-amber-100"
                    : needsCashReceipt
                    ? "border-emerald-300 ring-1 ring-emerald-100"
                    : "border-[#E5E5E5]"
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs sm:text-sm font-bold text-[#111111]">
                      {order.id}
                    </span>
                    <span className="text-[10px] text-[#737373]">
                      {dateFormatted}, {timeFormatted} WIB
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-neutral-100 text-[#111111]">
                      {order.fulfillmentType === "delivery" ? "Delivery (Lhoksukon)" : "Pickup di Toko"}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                        isCashOrder
                          ? "bg-emerald-50 text-[#18794E] border border-emerald-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {order.paymentMethod || "QRIS Statis"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={order.paymentStatus} type="payment" />
                    <StatusBadge status={order.orderStatus} type="order" />
                  </div>
                </div>

                {/* Body Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Customer Information */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#737373] block uppercase tracking-wider font-semibold">
                      Pelanggan
                    </span>
                    <div className="font-bold text-[#111111]">{order.customerName}</div>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-[#737373]">
                      <span>{order.customerWhatsapp}</span>
                      <a
                        href={getCleanWhatsappLink(
                          order.customerWhatsapp,
                          order.id,
                          order.customerName
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#25D366] hover:text-[#18794E] ml-1 p-0.5 inline-flex items-center"
                        title="Hubungi via WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Order Items Summary */}
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-[10px] text-[#737373] block uppercase tracking-wider font-semibold">
                      Item Pesanan ({order.items.reduce((s, i) => s + i.quantity, 0)} item)
                    </span>
                    <div className="space-y-0.5">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px]">
                          <span className="text-[#111111]">
                            <span className="font-semibold">{item.quantity}x</span> {item.productName}
                          </span>
                          <span className="text-[#737373]">{formatRupiah(item.itemTotal)}</span>
                        </div>
                      ))}
                    </div>
                    {order.orderNote && (
                      <p className="text-[11px] text-[#8A4B08] bg-[#FFF4E5] px-2 py-1 rounded-lg mt-1">
                        Catatan: “{order.orderNote}”
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer & Action Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-neutral-100">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] text-[#737373]">Total Transaksi:</span>
                    <span className="text-sm sm:text-base font-extrabold text-[#111111]">
                      {formatRupiah(order.total)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Action 1a: QRIS Verification */}
                    {needsQrisVerification && (
                      <button
                        onClick={() => setConfirmLunasOrder(order)}
                        className="px-3 py-1.5 rounded-xl bg-[#18794E] hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verifikasi QRIS</span>
                      </button>
                    )}

                    {/* Action 1b: Cash Receipt Confirmation */}
                    {needsCashReceipt && (
                      <button
                        onClick={() => setConfirmCashOrder(order)}
                        className="px-3 py-1.5 rounded-xl bg-[#18794E] hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Banknote className="w-3.5 h-3.5" />
                        <span>Terima Kas</span>
                      </button>
                    )}

                    {/* Action 2: Process Order */}
                    {order.orderStatus === "Pesanan baru" && !needsQrisVerification && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, "Diproses")}
                        className="px-3 py-1.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Proses Pesanan
                      </button>
                    )}

                    {/* Action 3: Mark Ready */}
                    {order.orderStatus === "Diproses" && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, "Siap")}
                        className="px-3 py-1.5 rounded-xl bg-[#F25B09] hover:bg-[#D94D06] text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Pesanan Siap
                      </button>
                    )}

                    {/* Action 4: Mark Completed */}
                    {order.orderStatus === "Siap" && (
                      <button
                        onClick={() => {
                          if (order.paymentStatus === "Menunggu Pembayaran") {
                            setConfirmCashCompleteOrder(order);
                          } else if (order.paymentStatus === "Menunggu Verifikasi") {
                            alert("Pesanan QRIS ini belum diverifikasi. Silakan lakukan Verifikasi QRIS terlebih dahulu.");
                          } else {
                            handleUpdateStatus(order.id, "Selesai");
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#18794E] hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Selesai
                      </button>
                    )}

                    {/* Action 5: Cancel */}
                    {order.orderStatus !== "Selesai" && order.orderStatus !== "Dibatalkan" && (
                      <button
                        onClick={() => handleCancelOrder(order.id)}
                        className="px-2.5 py-1.5 rounded-xl border border-red-200 text-[#B42318] hover:bg-red-50 text-xs font-medium transition-colors cursor-pointer"
                      >
                        Batalkan
                      </button>
                    )}

                    {/* Inspect Detail Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(order)}
                      className="px-3 py-1.5 rounded-xl border border-[#E5E5E5] text-[#111111] hover:bg-neutral-100 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Detail
                    </button>

                    {/* Print Receipt Button */}
                    <button
                      type="button"
                      onClick={() => handlePrintReceipt(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5E5] text-[#111111] hover:bg-neutral-100 text-xs font-medium transition-colors cursor-pointer"
                      title="Cetak struk pesanan ini"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#737373]" />
                      <span>Cetak</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          CONFIRMATION MODAL: TANDAI LUNAS (WITH CRITICAL DANA INSTRUCTION)
          ========================================================================= */}
      {confirmLunasOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-landing-fade">
          <div className="bg-white border border-[#E5E5E5] rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-[#8A4B08] flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#111111]">
                  Konfirmasi Pembayaran QRIS Lunas
                </h3>
                <p className="text-xs text-[#737373]">Pesanan {confirmLunasOrder.id}</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-[#8A4B08] space-y-2">
              <p className="font-semibold">
                Perhatian: Periksa riwayat mutasi aktual di aplikasi DANA Bisnis merchant Anda!
              </p>
              <ul className="list-disc list-inside text-[11px] space-y-1 text-amber-900">
                <li>
                  Nominal yang harus masuk:{" "}
                  <strong className="text-[#111111]">
                    {formatRupiah(confirmLunasOrder.total)}
                  </strong>
                </li>
                <li>Nama Pemesan: {confirmLunasOrder.customerName}</li>
                <li>Jangan konfirmasi hanya berdasarkan screenshot WhatsApp pembeli.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmLunasOrder(null)}
                className="px-3.5 py-2 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#737373] hover:text-[#111111]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleMarkLunas(confirmLunasOrder.id)}
                className="px-4 py-2 rounded-xl bg-[#18794E] hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                Sudah Dicek & Tandai Lunas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONFIRMATION MODAL: TERIMA KAS (CASH PAYMENT CONFIRMATION)
          ========================================================================= */}
      {confirmCashOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-landing-fade">
          <div className="bg-white border border-[#E5E5E5] rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#18794E] flex items-center justify-center flex-shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#111111]">
                  Konfirmasi Penerimaan Uang Tunai (Cash)
                </h3>
                <p className="text-xs text-[#737373]">Pesanan {confirmCashOrder.id}</p>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-[#18794E] space-y-2">
              <p className="font-semibold text-emerald-950">
                Pastikan uang tunai fisik telah diterima dari pelanggan atau disetorkan oleh kurir!
              </p>
              <ul className="list-disc list-inside text-[11px] space-y-1 text-emerald-900">
                <li>
                  Total yang harus diterima:{" "}
                  <strong className="text-[#111111]">
                    {formatRupiah(confirmCashOrder.total)}
                  </strong>
                </li>
                <li>Nama Pelanggan: {confirmCashOrder.customerName}</li>
                <li>
                  Layanan:{" "}
                  {confirmCashOrder.fulfillmentType === "pickup"
                    ? "Pickup (Dibayar di kasir/dapur toko)"
                    : `Delivery ke ${confirmCashOrder.deliveryArea} (Dibayar langsung ke kurir)`}
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCashOrder(null)}
                className="px-3.5 py-2 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#737373] hover:text-[#111111]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleConfirmCashLunas(confirmCashOrder.id)}
                className="px-4 py-2 rounded-xl bg-[#18794E] hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                Uang Tunai Diterima & Tandai Lunas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONFIRMATION MODAL: COMPLETE CASH ORDER & CONFIRM RECEIPT
          ========================================================================= */}
      {confirmCashCompleteOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-landing-fade">
          <div className="bg-white border border-[#E5E5E5] rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-[#8A4B08] flex items-center justify-center flex-shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#111111]">
                  Konfirmasi Selesai & Pembayaran Tunai
                </h3>
                <p className="text-xs text-[#737373]">Pesanan {confirmCashCompleteOrder.id}</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-[#8A4B08] space-y-2">
              <p className="font-semibold text-amber-950">
                Pesanan tunai ini belum ditandai Lunas. Setelah berstatus &apos;Selesai&apos;, status pesanan tidak dapat diubah lagi!
              </p>
              <ul className="list-disc list-inside text-[11px] space-y-1 text-amber-900">
                <li>
                  Total yang harus diterima:{" "}
                  <strong className="text-[#111111]">
                    {formatRupiah(confirmCashCompleteOrder.total)}
                  </strong>
                </li>
                <li>Pelanggan: {confirmCashCompleteOrder.customerName}</li>
                <li>Apakah uang tunai fisik telah diterima sehingga pesanan dapat diselesaikan sebagai Lunas?</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCashCompleteOrder(null)}
                className="px-3.5 py-2 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#737373] hover:text-[#111111]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleConfirmCashComplete(confirmCashCompleteOrder.id)}
                className="px-4 py-2 rounded-xl bg-[#18794E] hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                Uang Tunai Diterima & Pesanan Selesai
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* =========================================================================
          ORDER DETAIL DRAWER / MODAL & PRINT CONTAINER
          ========================================================================= */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-landing-fade print-modal-overlay">
          <div className="bg-white border border-[#E5E5E5] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 print-modal-container">
            {/* Interactive Screen-Only Modal Content */}
            <div className="space-y-3 print-hide">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div>
                  <h3 className="text-sm font-bold text-[#111111]">Detail Pesanan</h3>
                  <span className="font-mono text-xs font-bold text-[#737373]">
                    {selectedOrder.id}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-lg text-[#737373] hover:text-[#111111] hover:bg-neutral-100 transition-colors cursor-pointer"
                  aria-label="Tutup modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status overview */}
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedOrder.paymentStatus} type="payment" />
                <StatusBadge status={selectedOrder.orderStatus} type="order" />
              </div>

              {/* Customer & Fulfillment Info */}
              <div className="p-3 bg-[#FAF9F8] rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#737373]">Pelanggan:</span>
                  <span className="font-semibold text-[#111111]">{selectedOrder.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373]">Nomor WhatsApp:</span>
                  <span className="font-mono text-[#111111]">{selectedOrder.customerWhatsapp}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373]">Jenis Layanan:</span>
                  <span className="font-medium text-[#111111] capitalize">
                    {selectedOrder.fulfillmentType} ({selectedOrder.deliveryArea})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373]">Metode Pembayaran:</span>
                  <span className="text-[#111111]">{selectedOrder.paymentMethod}</span>
                </div>
                {selectedOrder.orderNote && (
                  <div className="flex justify-between items-start gap-2 pt-1 border-t border-neutral-200/60">
                    <span className="text-[#737373]">Catatan Pesanan:</span>
                    <span className="font-medium text-[#111111] text-right italic break-words max-w-[65%]">
                      &ldquo;{selectedOrder.orderNote}&rdquo;
                    </span>
                  </div>
                )}
              </div>

              {/* Items Breakdown */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#111111]">Rincian Menu</span>
                <div className="border border-[#E5E5E5] rounded-xl divide-y divide-[#E5E5E5] text-xs">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-3 space-y-1">
                      <div className="flex justify-between font-semibold text-[#111111]">
                        <span>
                          {item.quantity}x {item.productName}
                        </span>
                        <span>{formatRupiah(item.itemTotal)}</span>
                      </div>
                      {item.selectedOptions.length > 0 && (
                        <p className="text-[11px] text-[#737373]">
                          Opsi: {item.selectedOptions.map((o) => `${o.groupName || o.optionName}: ${o.valueName || o.optionValue}`).join(", ")}
                        </p>
                      )}
                      {item.selectedAddons.length > 0 && (
                        <p className="text-[11px] text-[#737373]">
                          Add-on: {item.selectedAddons.map((a) => a.addonName).join(", ")}
                        </p>
                      )}
                      {item.itemNote && (
                        <p className="text-[11px] text-[#8A4B08]">Catatan item: “{item.itemNote}”</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Price Calculations */}
              <div className="space-y-1.5 text-xs pt-2 border-t border-neutral-100">
                <div className="flex justify-between text-[#737373]">
                  <span>Subtotal Produk:</span>
                  <span>{formatRupiah(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-[#737373]">
                  <span>Ongkos Kirim:</span>
                  <span>{formatRupiah(selectedOrder.shippingFee)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-[#111111] pt-1 border-t border-neutral-100">
                  <span>Total:</span>
                  <span>{formatRupiah(selectedOrder.total)}</span>
                </div>
              </div>

              {/* Thermal Receipt Section: Exactly ONE Inline Preview */}
              <div className="p-3.5 bg-[#FAF9F8] border border-[#E5E5E5] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Printer className="w-4 h-4 text-[#F25B09]" />
                    <span className="text-xs font-bold text-[#111111]">
                      Struk Kasir Termal
                    </span>
                  </div>

                  {/* Width selector: 58mm (default) vs 80mm */}
                  <div className="flex items-center gap-1 bg-white border border-[#E5E5E5] p-0.5 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setReceiptWidth("58mm")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        receiptWidth === "58mm"
                          ? "bg-[#111111] text-white"
                          : "text-[#737373] hover:text-[#111111]"
                      }`}
                    >
                      58 mm
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptWidth("80mm")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        receiptWidth === "80mm"
                          ? "bg-[#111111] text-white"
                          : "text-[#737373] hover:text-[#111111]"
                      }`}
                    >
                      80 mm
                    </button>
                  </div>
                </div>

                {/* The single inline receipt preview */}
                <div className="bg-[#EFEFEF] p-3 rounded-xl flex justify-center max-h-72 overflow-y-auto border border-neutral-200">
                  <div className="shadow-xs border border-neutral-300 bg-white">
                    <OrderReceipt order={selectedOrder} width={receiptWidth} />
                  </div>
                </div>

                {/* Print button */}
                <button
                  type="button"
                  onClick={() => handlePrintReceipt(selectedOrder)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm active:scale-[0.99]"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Struk ({receiptWidth})</span>
                </button>
              </div>

              {/* Modal Close Button */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 border border-[#E5E5E5] bg-white hover:bg-neutral-100 text-[#111111] rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Hidden Print Portal (NEVER visible on screen; prints isolated thermal receipt) */}
      {selectedOrder && typeof document !== "undefined" &&
        createPortal(
          <div id="thermal-receipt-print-root">
            <div id="thermal-receipt-portal-content">
              <OrderReceipt
                order={selectedOrder}
                width={receiptWidth}
                isPrintOnly={true}
              />
            </div>
          </div>,
          document.body
        )
      }
    </div>
  );
}
