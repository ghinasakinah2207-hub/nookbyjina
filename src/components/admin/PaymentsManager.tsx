"use client";

import React, { useState } from "react";
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  Banknote,
  RefreshCw,
} from "lucide-react";
import { useOrder } from "@/context/OrderContext";
import { Order, StoreSettings } from "@/types";
import { formatRupiah, STORE_SETTINGS } from "@/data/dummy-data";
import {
  isQrisMethod,
  isPendingQrisStatus,
  isPendingCashStatus,
  isPaidStatus,
} from "@/lib/order-normalizer";

export function PaymentsManager() {
  const { orders, updateOrderStatus, addOrder } = useOrder();
  const [confirmQrisOrder, setConfirmQrisOrder] = useState<Order | null>(null);
  const [confirmCashOrder, setConfirmCashOrder] = useState<Order | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchOrders = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/admin/orders");
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.orders)) {
          data.orders.forEach((serverOrder: Order) => {
            addOrder(serverOrder);
          });
        }
      }
    } catch {
      // Ignore background fetch errors
    } finally {
      setIsRefreshing(false);
    }
  }, [addOrder]);

  React.useEffect(() => {
    fetch("/api/store-settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.settings) {
          setStoreSettings(data.settings);
        }
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    let ignore = false;
    fetch("/api/admin/orders")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data && data.success && Array.isArray(data.orders)) {
          data.orders.forEach((serverOrder: Order) => {
            addOrder(serverOrder);
          });
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [addOrder]);

  const pendingQrisPayments = orders.filter(
    (o) => isQrisMethod(o.paymentMethod) && isPendingQrisStatus(o.paymentStatus)
  );

  const pendingCashPayments = orders.filter(
    (o) => o.paymentMethod === "Cash" && isPendingCashStatus(o.paymentStatus)
  );

  const verifiedPayments = orders.filter((o) => isPaidStatus(o.paymentStatus));

  const handleConfirmQrisLunas = async (orderId: string) => {
    const res = await updateOrderStatus(orderId, "Diproses", "Lunas");
    setConfirmQrisOrder(null);
    if (!res.success) {
      alert(res.error || "Gagal memverifikasi pembayaran QRIS.");
    } else {
      fetchOrders();
    }
  };

  const handleConfirmCashLunas = async (orderId: string) => {
    const currentOrder = orders.find((o) => o.id === orderId);
    const nextOrderStatus =
      currentOrder?.orderStatus === "Pesanan baru" ? "Diproses" : currentOrder?.orderStatus;
    const res = await updateOrderStatus(orderId, nextOrderStatus, "Lunas");
    setConfirmCashOrder(null);
    if (!res.success) {
      alert(res.error || "Gagal mengonfirmasi pembayaran tunai.");
    } else {
      fetchOrders();
    }
  };

  const getCleanWhatsappLink = (
    phone: string,
    orderId: string,
    name: string,
    isCash: boolean = false
  ) => {
    let cleanNumber = phone.replace(/[^0-9]/g, "");
    if (cleanNumber.startsWith("0")) {
      cleanNumber = "62" + cleanNumber.slice(1);
    }
    const topic = isCash ? "pembayaran tunai" : "verifikasi pembayaran QRIS";
    const message = encodeURIComponent(
      `Halo Kak ${name}, ini dari Nook by Jina mengenai ${topic} pesanan ${orderId}.`
    );
    return `https://wa.me/${cleanNumber}?text=${message}`;
  };

  return (
    <div className="space-y-4">
      {/* =========================================================================
          OPERATIONAL INSTRUCTIONS BANNER
          ========================================================================= */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2.5 pb-2 border-b border-neutral-100">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#8A4B08] flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-[#111111]">
              SOP Pembayaran & Verifikasi Transaksi
            </h2>
            <p className="text-[11px] text-[#737373]">
              Protokol resmi penerimaan dana sebelum menandai pesanan lunas
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-neutral-50 rounded-xl space-y-1">
            <span className="font-bold text-[#111111] block">1. Cek Mutasi QRIS</span>
            <p className="text-[#737373] text-[11px] leading-relaxed">
              Buka aplikasi DANA Bisnis. Pastikan dana riil telah masuk dan jangan hanya percaya screenshot chat pembeli.
            </p>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl space-y-1">
            <span className="font-bold text-[#111111] block">2. Penerimaan Uang Kas</span>
            <p className="text-[#737373] text-[11px] leading-relaxed">
              Untuk pesanan Cash, konfirmasi lunas hanya setelah uang fisik diterima di kasir atau disetorkan oleh kurir.
            </p>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl space-y-1">
            <span className="font-bold text-[#111111] block">3. Laporan Keuangan</span>
            <p className="text-[#737373] text-[11px] leading-relaxed">
              Hanya pesanan berstatus Lunas yang otomatis dihitung ke omzet dan laba kotor laporan toko.
            </p>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PENDING QRIS VERIFICATION ORDERS
          ========================================================================= */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-[#8A4B08]" />
            <h3 className="text-sm font-bold text-[#111111]">
              Menunggu Verifikasi DANA (QRIS) ({pendingQrisPayments.length})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchOrders}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 disabled:opacity-50 transition-colors cursor-pointer"
              title="Segarkan daftar verifikasi"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#8A4B08]" : ""}`} />
              <span className="hidden sm:inline">{isRefreshing ? "Menyinkronkan..." : "Segarkan"}</span>
            </button>
            {pendingQrisPayments.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-[#8A4B08]">
                Perlu Verifikasi
              </span>
            )}
          </div>
        </div>

        {pendingQrisPayments.length === 0 ? (
          <div className="py-6 text-center space-y-1.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#18794E] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#111111]">
              Semua pembayaran QRIS telah terverifikasi
            </p>
            <p className="text-[11px] text-[#737373]">
              Tidak ada transaksi QRIS yang sedang menunggu konfirmasi admin.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pendingQrisPayments.map((order) => {
              const dateObj = new Date(order.createdAt);
              const timeFormatted = dateObj.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={order.id}
                  className="p-4 rounded-xl border border-amber-300 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#111111]">
                        {order.id}
                      </span>
                      <span className="text-[10px] text-[#737373]">
                        Dibuat: {timeFormatted} WIB
                      </span>
                      <span className="text-[10px] text-[#8A4B08] bg-[#FFF4E5] px-2 py-0.5 rounded-md font-medium">
                        Tenggat 30 Menit
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        QRIS Statis
                      </span>
                    </div>

                    <div className="text-xs text-[#111111]">
                      <span className="font-semibold">{order.customerName}</span>
                      <span className="text-[#737373] font-mono ml-1.5">
                        ({order.customerWhatsapp})
                      </span>
                    </div>

                    <p className="text-[11px] text-[#737373]">
                      Pesanan: {order.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ")}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-amber-200">
                    <div className="text-left sm:text-right">
                      <span className="text-xs text-[#737373] block">Nominal Tagihan:</span>
                      <span className="text-sm font-extrabold text-[#111111]">
                        {formatRupiah(order.total)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={getCleanWhatsappLink(
                          order.customerWhatsapp,
                          order.id,
                          order.customerName,
                          false
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-50 text-[#25D366] transition-colors"
                        title="Chat Pelanggan"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>

                      <button
                        onClick={() => setConfirmQrisOrder(order)}
                        className="px-3.5 py-2 rounded-xl bg-[#18794E] hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verifikasi QRIS</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          PENDING CASH PAYMENT ORDERS
          ========================================================================= */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-[#18794E]" />
            <h3 className="text-sm font-bold text-[#111111]">
              Menunggu Pembayaran Tunai (Cash) ({pendingCashPayments.length})
            </h3>
          </div>
          {pendingCashPayments.length > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-[#18794E]">
              Perlu Diterima
            </span>
          )}
        </div>

        {pendingCashPayments.length === 0 ? (
          <div className="py-6 text-center space-y-1.5">
            <div className="w-10 h-10 rounded-2xl bg-neutral-100 text-[#737373] flex items-center justify-center mx-auto">
              <Banknote className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#111111]">
              Tidak ada tagihan kas tertunda
            </p>
            <p className="text-[11px] text-[#737373]">
              Semua pesanan tunai telah lunas diterima atau belum ada pesanan tunai baru.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pendingCashPayments.map((order) => {
              const dateObj = new Date(order.createdAt);
              const timeFormatted = dateObj.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={order.id}
                  className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#111111]">
                        {order.id}
                      </span>
                      <span className="text-[10px] text-[#737373]">
                        Dibuat: {timeFormatted} WIB
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-neutral-100 text-[#111111]">
                        {order.fulfillmentType === "delivery"
                          ? `Delivery (${order.deliveryArea})`
                          : "Pickup di Toko"}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-[#18794E] border border-emerald-200">
                        Cash
                      </span>
                    </div>

                    <div className="text-xs text-[#111111]">
                      <span className="font-semibold">{order.customerName}</span>
                      <span className="text-[#737373] font-mono ml-1.5">
                        ({order.customerWhatsapp})
                      </span>
                    </div>

                    <p className="text-[11px] text-[#737373]">
                      Pesanan: {order.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ")}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-emerald-200">
                    <div className="text-left sm:text-right">
                      <span className="text-xs text-[#737373] block">Nominal Tunai:</span>
                      <span className="text-sm font-extrabold text-[#111111]">
                        {formatRupiah(order.total)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={getCleanWhatsappLink(
                          order.customerWhatsapp,
                          order.id,
                          order.customerName,
                          true
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-50 text-[#25D366] transition-colors"
                        title="Chat Pelanggan"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>

                      <button
                        onClick={() => setConfirmCashOrder(order)}
                        className="px-3.5 py-2 rounded-xl bg-[#18794E] hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Banknote className="w-3.5 h-3.5" />
                        <span>Terima Kas</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          QRIS CONFIGURATION CARD & VERIFIED TRANSACTIONS
          ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* QRIS Merchant Info */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
            <h3 className="text-xs font-bold text-[#111111]">
              Informasi QRIS Merchant
            </h3>
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-[#18794E]">
              QRIS Statis Aktif
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#737373]">Nama Merchant:</span>
              <span className="font-semibold text-[#111111]">
                {storeSettings?.qrisMerchantName || STORE_SETTINGS.qrisMerchantName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#737373]">NMID Merchant:</span>
              <span className="font-mono text-[#111111]">
                {storeSettings?.qrisNmid || STORE_SETTINGS.qrisNmid}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#737373]">Penyedia Akun:</span>
              <span className="text-[#111111]">DANA Bisnis Merchant</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#737373]">Tenggat Waktu Bayar:</span>
              <span className="text-[#111111]">30 Menit (Hanya QRIS)</span>
            </div>
          </div>
        </div>

        {/* Recently Verified Payments */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
            <h3 className="text-xs font-bold text-[#111111]">
              Riwayat Pembayaran Lunas ({verifiedPayments.length})
            </h3>
          </div>

          {verifiedPayments.length === 0 ? (
            <p className="text-xs text-[#737373] py-4 text-center">
              Belum ada transaksi lunas tercatat.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {verifiedPayments.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl bg-[#FAF9F8] flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-[#111111]">
                        {p.id}
                      </span>
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                          p.paymentMethod === "Cash"
                            ? "bg-emerald-50 text-[#18794E] border border-emerald-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {p.paymentMethod === "Cash" ? "Cash" : "QRIS Statis"}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#737373] block mt-0.5">
                      {p.customerName}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-[#18794E] block">
                      {formatRupiah(p.total)}
                    </span>
                    <span className="text-[9px] text-[#737373]">Lunas</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* QRIS Confirmation Modal */}
      {confirmQrisOrder && (
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
                <p className="text-xs text-[#737373]">Pesanan {confirmQrisOrder.id}</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-[#8A4B08] space-y-1.5">
              <p className="font-semibold text-amber-950">
                Periksa riwayat mutasi aktual di aplikasi DANA Bisnis merchant!
              </p>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                Nominal harus masuk tepat{" "}
                <strong className="text-[#111111]">
                  {formatRupiah(confirmQrisOrder.total)}
                </strong>{" "}
                atas nama {confirmQrisOrder.customerName}. Jangan tandai lunas hanya berdasar screenshot chat.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmQrisOrder(null)}
                className="px-3.5 py-2 rounded-xl border border-[#E5E5E5] text-xs font-semibold text-[#737373] hover:text-[#111111]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleConfirmQrisLunas(confirmQrisOrder.id)}
                className="px-4 py-2 rounded-xl bg-[#18794E] hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                Sudah Dicek & Tandai Lunas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Confirmation Modal */}
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

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-[#18794E] space-y-1.5">
              <p className="font-semibold text-emerald-950">
                Pastikan uang tunai fisik telah diterima di kasir atau dari kurir!
              </p>
              <p className="text-[11px] text-emerald-900 leading-relaxed">
                Nominal tunai yang diterima tepat{" "}
                <strong className="text-[#111111]">
                  {formatRupiah(confirmCashOrder.total)}
                </strong>{" "}
                dari pelanggan {confirmCashOrder.customerName} (Layanan: {confirmCashOrder.fulfillmentType}).
              </p>
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
    </div>
  );
}
