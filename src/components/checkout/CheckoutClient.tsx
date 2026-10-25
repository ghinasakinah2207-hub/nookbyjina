"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Store,
  Bike,
  AlertCircle,
  MessageCircle,
  QrCode,
  CreditCard,
  Banknote,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useCart } from "@/context/CartContext";
import { useOrder } from "@/context/OrderContext";
import { STORE_SETTINGS, formatRupiah, generateOrderToken } from "@/data/dummy-data";
import { FulfillmentType, StoreSettings, PaymentMethod } from "@/types";
import { calculateDeliveryFee } from "@/lib/delivery-fee";
import { validateIndonesianPhone } from "@/lib/phone";
import { saveOrderToken } from "@/lib/order-token-vault";

interface CheckoutClientProps {
  initialStoreSettings?: StoreSettings;
}

export default function CheckoutClient({ initialStoreSettings }: CheckoutClientProps) {
  const router = useRouter();
  const { cart, subtotal, orderNote, clearCart, hasSoldOutItem } = useCart();
  const { addOrder } = useOrder();

  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("pickup");
  const [deliveryArea, setDeliveryArea] = useState<string>("Lhoksukon");

  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(
    initialStoreSettings || null
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [errors, setErrors] = useState<{
    customerName?: string;
    customerWhatsapp?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stable idempotency token for this checkout session to defend against duplicate orders on retry
  const [checkoutToken, setCheckoutToken] = useState<string>(() => generateOrderToken());

  // Dynamic Payment Methods configured authoritatively by store admin
  const availablePaymentMethods: PaymentMethod[] = useMemo(() => {
    const methods: PaymentMethod[] = [];
    const qrisActive = storeSettings?.paymentMethods?.qris !== false; // defaults to true
    const cashActive = Boolean(storeSettings?.paymentMethods?.cash);
    if (qrisActive) methods.push("QRIS Statis");
    if (cashActive) methods.push("Cash");
    return methods;
  }, [storeSettings]);

  const [userSelectedPaymentMethod, setUserSelectedPaymentMethod] = useState<PaymentMethod | null>(null);

  // Derive active selection from available methods and user preference without cascading renders
  const selectedPaymentMethod: PaymentMethod | null = useMemo(() => {
    if (userSelectedPaymentMethod && availablePaymentMethods.includes(userSelectedPaymentMethod)) {
      return userSelectedPaymentMethod;
    }
    return availablePaymentMethods.length > 0 ? availablePaymentMethods[0] : null;
  }, [userSelectedPaymentMethod, availablePaymentMethods]);

  const setSelectedPaymentMethod = (method: PaymentMethod) => {
    setUserSelectedPaymentMethod(method);
  };

  // Revalidate with freshest store settings on mount (no-store cache)
  useEffect(() => {
    let isMounted = true;
    async function refreshSettings() {
      try {
        const res = await fetch("/api/store-settings", { cache: "no-store" });
        if (!res.ok) throw new Error("Gagal mengambil pengaturan toko.");
        const data = await res.json();
        if (data.success && data.settings && isMounted) {
          setStoreSettings(data.settings);
          setSettingsError(null);
        }
      } catch {
        if (isMounted && !initialStoreSettings) {
          setSettingsError(
            "Gagal memuat tarif ongkos kirim resmi toko. Silakan segarkan halaman."
          );
        }
      }
    }
    refreshSettings();
    return () => {
      isMounted = false;
    };
  }, [initialStoreSettings]);

  // Authoritative delivery fee calculation using persisted settings as single source of truth
  const deliveryCalc = useMemo(() => {
    if (!storeSettings?.deliveryConfig) return null;
    return calculateDeliveryFee({
      fulfillmentType,
      deliveryArea,
      subtotal,
      deliveryConfig: storeSettings.deliveryConfig,
    });
  }, [storeSettings, fulfillmentType, deliveryArea, subtotal]);

  const configuredAreaName = storeSettings?.deliveryConfig.configuredArea || "Lhoksukon";
  const isOutsideConfiguredArea =
    fulfillmentType === "delivery" && Boolean(deliveryCalc?.isOutsideArea);
  const shippingFee =
    fulfillmentType === "pickup" ? 0 : deliveryCalc ? deliveryCalc.shippingFee : 0;
  const grandTotal = subtotal + (isOutsideConfiguredArea ? 0 : shippingFee);

  const isFreeDeliveryQualified =
    subtotal >= (storeSettings?.deliveryConfig.freeShippingThreshold ?? 50000);
  const standardDeliveryFee = storeSettings?.deliveryConfig.standardFee ?? 4000;
  const deliveryRowFeeDisplay =
    fulfillmentType === "delivery" && deliveryArea !== configuredAreaName
      ? "Perlu konfirmasi"
      : isFreeDeliveryQualified
      ? "Gratis"
      : formatRupiah(standardDeliveryFee);

  // WhatsApp link for unconfigured area inquiry
  const waInquiryUrl = useMemo(() => {
    const storePhone = (
      storeSettings?.adminWhatsapp || STORE_SETTINGS.adminWhatsapp
    ).replace(/[^0-9]/g, "");

    const trimmedName = customerName.trim();
    const intro = trimmedName
      ? `Halo admin Nook by Jina, saya ${trimmedName}.`
      : "Halo admin Nook by Jina,";

    const itemsSummary = cart
      .map((item) => `- ${item.quantity}x ${item.productName}`)
      .join("\n");

    const message = `${intro}\n\nSaya ingin memesan menu berikut:\n${itemsSummary}\nTotal Menu: ${formatRupiah(
      subtotal
    )}\n\nPengantaran ke: Area Lainnya (di luar ${configuredAreaName}).\nMohon info apakah area saya terjangkau dan berapa estimasi ongkos kirimnya? Terima kasih.`;

    return `https://wa.me/${storePhone}?text=${encodeURIComponent(message)}`;
  }, [
    storeSettings?.adminWhatsapp,
    customerName,
    cart,
    subtotal,
    configuredAreaName,
  ]);

  // If cart is empty, render redirect prompt
  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex flex-col items-center justify-center p-6 text-center">
        <ShoppingBag className="w-12 h-12 text-[#737373] mb-3 stroke-[1.5]" />
        <h1 className="text-base font-bold text-[#111111]">Keranjang Kosong</h1>
        <p className="text-xs text-[#737373] mt-1 mb-6">
          Tidak ada item untuk di-checkout. Silakan pilih menu terlebih dahulu.
        </p>
        <Link
          href="/menu"
          className="px-6 py-2.5 bg-[#F25B09] text-white text-xs font-semibold rounded-xl"
        >
          Lihat Menu
        </Link>
      </div>
    );
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasSoldOutItem) return;

    if (!storeSettings) {
      setSubmitError(
        "Gagal memuat pengaturan toko resmi. Silakan segarkan halaman sebelum membuat pesanan."
      );
      return;
    }

    // Validate inputs
    const newErrors: { customerName?: string; customerWhatsapp?: string } = {};

    if (!customerName.trim() || customerName.trim().length < 2) {
      newErrors.customerName = "Nama lengkap wajib diisi (minimal 2 karakter).";
    }

    const phoneValidation = validateIndonesianPhone(customerWhatsapp);
    if (!phoneValidation.isValid) {
      newErrors.customerWhatsapp = phoneValidation.error;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (isOutsideConfiguredArea) {
      return;
    }

    if (!selectedPaymentMethod) {
      setSubmitError(
        "Metode pembayaran tidak tersedia saat ini. Silakan hubungi admin toko."
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Independent server-side order validation & creation with idempotency token
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: checkoutToken,
          customerName: customerName.trim(),
          customerWhatsapp: phoneValidation.normalized,
          fulfillmentType,
          deliveryArea:
            fulfillmentType === "pickup"
              ? `Pickup Toko (${configuredAreaName})`
              : deliveryArea,
          items: cart,
          orderNote,
          clientShippingFee: shippingFee,
          clientTotal: grandTotal,
          paymentMethod: selectedPaymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal membuat pesanan.");
      }

      // Reset checkout idempotency token for any subsequent order
      setCheckoutToken(generateOrderToken());

      // Persist raw token immediately to token vault
      if (data.order?.id && data.order?.token) {
        saveOrderToken(data.order.id, data.order.token);
      }

      // Store server-validated order into client OrderContext for tracking & payments
      addOrder(data.order);

      // Clear shopping cart
      clearCart();

      // Navigate appropriately based on selected payment method
      if (selectedPaymentMethod === "Cash") {
        router.push(`/pesanan/${data.order.token}`);
      } else {
        router.push(`/pembayaran/${data.order.id}`);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat memproses pesanan.";
      setSubmitError(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#F6F6F7] relative"
      style={{
        paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <Header
        title="Checkout Pesanan"
        showBack={true}
        backHref="/keranjang"
        showCart={false}
      />

      <main className="max-w-md mx-auto px-4 pt-3 space-y-3">
        {/* Explicit Error Display if Settings Loading Failed (Never Silent Fallback) */}
        {settingsError ? (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-[#B42318] space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4" />
              <span>Gagal Memuat Tarif Pengantaran</span>
            </div>
            <p>{settingsError}</p>
          </div>
        ) : null}

        {/* Submit Error Banner */}
        {submitError ? (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-[#B42318] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        ) : null}

        <form id="checkout-form" onSubmit={handleCreateOrder} className="space-y-3">
          {/* Card 1: Customer Contact Info (Without "Data Pemesan (Tanpa Login)" heading) */}
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3.5">
            {/* Customer Name */}
            <div className="space-y-1">
              <label
                htmlFor="customerNameInput"
                className="text-xs font-semibold text-[#111111] block"
              >
                Nama Lengkap / Panggilan <span className="text-[#B42318]">*</span>
              </label>
              <input
                id="customerNameInput"
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (errors.customerName) {
                    setErrors((prev) => ({ ...prev, customerName: undefined }));
                  }
                }}
                placeholder="Contoh: Rina Safitri"
                className={`w-full h-12 px-3.5 bg-white border rounded-xl text-xs sm:text-sm text-[#111111] placeholder:text-[#737373] focus:outline-hidden ${
                  errors.customerName
                    ? "border-[#B42318] bg-red-50/20"
                    : "border-[#E5E5E5] focus:border-[#F25B09]"
                }`}
              />
              {errors.customerName ? (
                <p className="text-[11px] text-[#B42318] flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.customerName}
                </p>
              ) : null}
            </div>

            {/* WhatsApp Number */}
            <div className="space-y-1">
              <label
                htmlFor="customerWhatsappInput"
                className="text-xs font-semibold text-[#111111] block"
              >
                Nomor WhatsApp Aktif <span className="text-[#B42318]">*</span>
              </label>
              <input
                id="customerWhatsappInput"
                type="tel"
                inputMode="numeric"
                value={customerWhatsapp}
                onChange={(e) => {
                  setCustomerWhatsapp(e.target.value);
                  if (errors.customerWhatsapp) {
                    setErrors((prev) => ({
                      ...prev,
                      customerWhatsapp: undefined,
                    }));
                  }
                }}
                placeholder="Contoh: 081234567890"
                className={`w-full h-12 px-3.5 bg-white border rounded-xl text-xs sm:text-sm text-[#111111] placeholder:text-[#737373] focus:outline-hidden ${
                  errors.customerWhatsapp
                    ? "border-[#B42318] bg-red-50/20"
                    : "border-[#E5E5E5] focus:border-[#F25B09]"
                }`}
              />
              {errors.customerWhatsapp ? (
                <p className="text-[11px] text-[#B42318] flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.customerWhatsapp}
                </p>
              ) : null}
            </div>
          </div>

          {/* Card 2: Ringkasan Menu */}
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-bold text-[#111111] flex items-center justify-between">
              <span>Ringkasan Menu</span>
              <span className="text-xs font-normal text-[#737373]">
                {cart.length} item
              </span>
            </h2>

            <div className="space-y-2 text-xs divide-y divide-[#E5E5E5]/60">
              {cart.map((item) => (
                <div key={item.id} className="pt-2 first:pt-0 flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[#111111] truncate">
                      {item.quantity}x {item.productName}
                    </p>
                    {item.selectedOptions.length > 0 ? (
                      <p className="text-[11px] text-[#737373] truncate">
                        {item.selectedOptions.map((o) => o.valueName || o.optionValue).join(", ")}
                      </p>
                    ) : null}
                    {item.itemNote ? (
                      <p className="text-[10px] text-[#737373] italic truncate">
                        Catatan: {item.itemNote}
                      </p>
                    ) : null}
                  </div>
                  <span className="font-semibold text-[#111111] shrink-0">
                    {formatRupiah(item.itemTotal)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Opsi Pengiriman */}
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3.5">
            <h2 className="text-sm font-bold text-[#111111]">
              Opsi Pengiriman
            </h2>

            {/* Compact Shipping Option Cards */}
            <div role="radiogroup" aria-label="Opsi Pengiriman" className="space-y-2.5">
              {/* Option 1: Ambil Sendiri */}
              <button
                type="button"
                role="radio"
                aria-checked={fulfillmentType === "pickup"}
                onClick={() => setFulfillmentType("pickup")}
                className={`w-full p-3 sm:p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#F25B09] ${
                  fulfillmentType === "pickup"
                    ? "border-[#F25B09] bg-orange-50/30 ring-1 ring-[#F25B09]"
                    : "border-[#E5E5E5] bg-white hover:border-neutral-300"
                }`}
              >
                {/* Left side: Icon container and title + description */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      fulfillmentType === "pickup"
                        ? "bg-[#F25B09]/10 text-[#F25B09]"
                        : "bg-neutral-100 text-[#737373]"
                    }`}
                  >
                    <Store className="w-5 h-5 stroke-[1.75]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs sm:text-sm font-bold text-[#111111] block">
                      Ambil Sendiri
                    </span>
                    <span className="text-[11px] text-[#737373] block leading-snug">
                      Ambil pesanan langsung di toko
                    </span>
                  </div>
                </div>

                {/* Right side: Shipping cost & selection indicator */}
                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 text-right">
                  <span
                    className={`text-xs sm:text-sm whitespace-nowrap font-bold ${
                      fulfillmentType === "pickup" ? "text-[#F25B09]" : "text-[#737373]"
                    }`}
                  >
                    Gratis
                  </span>
                  {fulfillmentType === "pickup" ? (
                    <div className="w-4 h-4 rounded-full bg-[#F25B09] flex items-center justify-center text-white shrink-0">
                      <svg
                        className="w-2.5 h-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-[#D4D4D4] shrink-0" />
                  )}
                </div>
              </button>

              {/* Option 2: Pengantaran */}
              <button
                type="button"
                role="radio"
                aria-checked={fulfillmentType === "delivery"}
                onClick={() => setFulfillmentType("delivery")}
                className={`w-full p-3 sm:p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#F25B09] ${
                  fulfillmentType === "delivery"
                    ? "border-[#F25B09] bg-orange-50/30 ring-1 ring-[#F25B09]"
                    : "border-[#E5E5E5] bg-white hover:border-neutral-300"
                }`}
              >
                {/* Left side: Icon container and title + description */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      fulfillmentType === "delivery"
                        ? "bg-[#F25B09]/10 text-[#F25B09]"
                        : "bg-neutral-100 text-[#737373]"
                    }`}
                  >
                    <Bike className="w-5 h-5 stroke-[1.75]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs sm:text-sm font-bold text-[#111111] block">
                      Pengantaran
                    </span>
                    <span className="text-[11px] text-[#737373] block leading-snug">
                      Pesanan diantar ke alamat tujuan
                    </span>
                  </div>
                </div>

                {/* Right side: Shipping cost & selection indicator */}
                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 text-right">
                  <span
                    className={`text-xs sm:text-sm whitespace-nowrap font-bold ${
                      fulfillmentType === "delivery" ? "text-[#F25B09]" : "text-[#737373]"
                    }`}
                  >
                    {deliveryRowFeeDisplay}
                  </span>
                  {fulfillmentType === "delivery" ? (
                    <div className="w-4 h-4 rounded-full bg-[#F25B09] flex items-center justify-center text-white shrink-0">
                      <svg
                        className="w-2.5 h-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-[#D4D4D4] shrink-0" />
                  )}
                </div>
              </button>
            </div>

            {/* Pickup Info Banner */}
            {fulfillmentType === "pickup" && (
              <div className="pt-3.5 border-t border-[#E5E5E5]">
                <div className="p-3 bg-neutral-50 border border-neutral-200/80 rounded-xl text-xs text-[#737373]">
                  <p>Gratis ongkir — Ambil sendiri.</p>
                </div>
              </div>
            )}

            {/* Conditional Delivery Area Selection - Shown ONLY when Delivery is selected */}
            {fulfillmentType === "delivery" && (
              <div className="pt-3.5 border-t border-[#E5E5E5] space-y-3">
                <label className="text-xs font-bold text-[#111111] block">
                  Pilih Area Pengantaran
                </label>

                <div className="space-y-2">
                  {/* Choice 1: Lhoksukon (Kota & Sekitarnya) */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={deliveryArea === configuredAreaName}
                    onClick={() => setDeliveryArea(configuredAreaName)}
                    className={`w-full p-3 rounded-xl border text-left flex items-start justify-between gap-3 transition-all cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#F25B09] ${
                      deliveryArea === configuredAreaName
                        ? "border-[#F25B09] bg-orange-50/20 ring-1 ring-[#F25B09]"
                        : "border-[#E5E5E5] bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#111111]">
                          {configuredAreaName} (Kota & Sekitarnya)
                        </span>
                        {deliveryCalc?.isFree && deliveryArea === configuredAreaName && (
                          <span className="px-1.5 py-0.5 bg-orange-100 text-[#F25B09] text-[10px] font-bold rounded">
                            Gratis Ongkir
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#737373]">
                        {deliveryCalc?.isFree && deliveryArea === configuredAreaName
                          ? `Gratis ongkir (min. belanja ${formatRupiah(
                              deliveryCalc.freeShippingThreshold
                            )})`
                          : `Tarif standar: ${formatRupiah(
                              storeSettings?.deliveryConfig.standardFee ?? 4000
                            )} • Gratis ongkir min. ${formatRupiah(
                              storeSettings?.deliveryConfig.freeShippingThreshold ?? 50000
                            )}`}
                      </p>
                    </div>
                    <div className="pt-0.5">
                      {deliveryArea === configuredAreaName ? (
                        <div className="w-4 h-4 rounded-full bg-[#F25B09] flex items-center justify-center text-white">
                          <svg
                            className="w-2.5 h-2.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-[#D4D4D4]" />
                      )}
                    </div>
                  </button>

                  {/* Choice 2: Area Lainnya */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={deliveryArea !== configuredAreaName}
                    onClick={() => setDeliveryArea("Area Lainnya")}
                    className={`w-full p-3 rounded-xl border text-left flex items-start justify-between gap-3 transition-all cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#F25B09] ${
                      deliveryArea !== configuredAreaName
                        ? "border-[#F25B09] bg-orange-50/20 ring-1 ring-[#F25B09]"
                        : "border-[#E5E5E5] bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="text-xs font-bold text-[#111111] block">
                        Area Lainnya
                      </span>
                      <p className="text-[11px] text-[#737373]">
                        Di luar {configuredAreaName} • Tarif ongkir perlu konfirmasi admin via
                        WhatsApp
                      </p>
                    </div>
                    <div className="pt-0.5">
                      {deliveryArea !== configuredAreaName ? (
                        <div className="w-4 h-4 rounded-full bg-[#F25B09] flex items-center justify-center text-white">
                          <svg
                            className="w-2.5 h-2.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-[#D4D4D4]" />
                      )}
                    </div>
                  </button>
                </div>

                {/* Delivery Rule Info for Configured Area */}
                {deliveryArea === configuredAreaName &&
                  (deliveryCalc?.isFree ? (
                    <div className="p-3 bg-orange-50/70 border border-orange-100 rounded-xl text-xs space-y-0.5 text-[#111111]">
                      <p className="font-bold text-[#F25B09]">Yeay, gratis ongkir!</p>
                      <p className="text-[11px] text-[#737373]">
                        Pesananmu sudah memenuhi minimum belanja{" "}
                        {formatRupiah(deliveryCalc.freeShippingThreshold)}.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-orange-50/70 border border-orange-100 rounded-xl text-xs space-y-0.5 text-[#111111]">
                      <p className="font-bold text-[#111111]">
                        Ongkir {configuredAreaName}:{" "}
                        {formatRupiah(deliveryCalc?.shippingFee ?? 4000)}
                      </p>
                      <p className="text-[11px] text-[#737373]">
                        Belanja{" "}
                        {formatRupiah(deliveryCalc?.remainingToFreeShipping ?? 0)} lagi untuk gratis ongkir.
                      </p>
                    </div>
                  ))}

                {/* WhatsApp Confirmation Box for Area Lainnya */}
                {deliveryArea !== configuredAreaName && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-[#8A4B08] space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-[#8A4B08]">
                          Konfirmasi Pengantaran Diperlukan
                        </p>
                        <p className="text-[11px] leading-relaxed">
                          Pengantaran ke area di luar {configuredAreaName} belum memiliki
                          tarif tetap. Silakan konfirmasi ketersediaan kurir dan ongkir
                          terlebih dahulu dengan admin via WhatsApp.
                        </p>
                      </div>
                    </div>
                    <a
                      href={waInquiryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full min-h-[44px] px-3.5 py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Konfirmasi Area via WhatsApp</span>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 4: Metode Pembayaran (Dinamis Sesuai Pengaturan Toko) */}
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#111111] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#F25B09]" />
                <span>Metode Pembayaran</span>
              </h2>
              {availablePaymentMethods.length > 1 && (
                <span className="text-[10px] text-[#737373]">Pilih salah satu</span>
              )}
            </div>

            {availablePaymentMethods.length === 0 ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#B42318] space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Tidak Ada Metode Pembayaran Aktif</span>
                </div>
                <p className="leading-relaxed text-[11px]">
                  Saat ini toko sedang menonaktifkan seluruh metode pembayaran. Silakan
                  hubungi admin atau kembali beberapa saat lagi.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Option 1: QRIS Statis */}
                {availablePaymentMethods.includes("QRIS Statis") && (
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedPaymentMethod === "QRIS Statis"
                        ? "border-[#F25B09] bg-orange-50/40 ring-1 ring-[#F25B09]"
                        : "border-[#E5E5E5] bg-white hover:border-neutral-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethodOption"
                      value="QRIS Statis"
                      checked={selectedPaymentMethod === "QRIS Statis"}
                      onChange={() => setSelectedPaymentMethod("QRIS Statis")}
                      className="w-4 h-4 mt-0.5 text-[#F25B09] focus:ring-[#F25B09] accent-[#F25B09]"
                    />
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-[#F25B09]" />
                        <span className="text-xs font-bold text-[#111111]">
                          QRIS Statis
                        </span>
                      </div>
                      <p className="text-[11px] text-[#737373] leading-relaxed">
                        Pembayaran non-tunai melalui QRIS merchant (
                        {storeSettings?.qrisMerchantName || "Nook by Jina"}). Kode QR dan
                        panduan transfer akan ditampilkan setelah pesanan dibuat.
                      </p>
                    </div>
                  </label>
                )}

                {/* Option 2: Cash (Bayar Tunai) */}
                {availablePaymentMethods.includes("Cash") && (
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedPaymentMethod === "Cash"
                        ? "border-[#F25B09] bg-orange-50/40 ring-1 ring-[#F25B09]"
                        : "border-[#E5E5E5] bg-white hover:border-neutral-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethodOption"
                      value="Cash"
                      checked={selectedPaymentMethod === "Cash"}
                      onChange={() => setSelectedPaymentMethod("Cash")}
                      className="w-4 h-4 mt-0.5 text-[#F25B09] focus:ring-[#F25B09] accent-[#F25B09]"
                    />
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Banknote className="w-3.5 h-3.5 text-[#18794E]" />
                        <span className="text-xs font-bold text-[#111111]">
                          Cash (Bayar Tunai)
                        </span>
                      </div>
                      <p className="text-[11px] text-[#737373] leading-relaxed">
                        {fulfillmentType === "pickup"
                          ? "Bayar dengan uang tunai langsung di kasir saat mengambil pesanan di toko. Pembayaran diverifikasi kasir setelah uang tunai diterima."
                          : "Bayar dengan uang tunai langsung ke kurir saat pesanan tiba di lokasi Anda. Pembayaran diverifikasi kurir/admin setelah uang tunai diterima."}
                      </p>
                    </div>
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Card 5: Rincian Pembayaran */}
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-bold text-[#111111]">
              Rincian Pembayaran
            </h2>

            <div className="space-y-2 text-xs">
              {/* Row 1: Subtotal Pesanan */}
              <div className="flex justify-between items-center text-[#737373]">
                <span>Subtotal Pesanan</span>
                <span className="font-medium text-[#111111]">
                  {formatRupiah(subtotal)}
                </span>
              </div>

              {/* Row 2: Ongkos Kirim */}
              <div className="flex justify-between items-center text-[#737373]">
                <span>
                  Ongkos Kirim
                  {fulfillmentType === "pickup"
                    ? " (Pickup)"
                    : deliveryArea === configuredAreaName
                    ? ` (${configuredAreaName})`
                    : " (Area Lainnya)"}
                </span>
                <span className="font-medium text-[#111111]">
                  {fulfillmentType === "pickup"
                    ? "Gratis"
                    : isOutsideConfiguredArea
                    ? "Perlu konfirmasi"
                    : shippingFee === 0
                    ? "Gratis"
                    : formatRupiah(shippingFee)}
                </span>
              </div>

              {/* Row 3: Divider */}
              <div className="pt-1.5 border-t border-[#E5E5E5]">
                {/* Row 4: Total Pembayaran */}
                <div className="flex justify-between items-center text-sm font-bold text-[#111111]">
                  <span>Total Pembayaran</span>
                  <span className="text-[#F25B09] font-extrabold text-base">
                    {formatRupiah(grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Terms & Agreement Note */}
          <div className="px-2 pb-3">
            <p className="text-center text-[11px] text-[#737373] leading-relaxed">
              Dengan membuat pesanan, Anda menyetujui rincian menu dan ketentuan pemesanan{" "}
              {storeSettings?.storeName || "Nook by Jina"}.
            </p>
          </div>

          {/* Sticky Bottom Checkout Bar */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E5E5]">
            <div
              className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-4"
              style={{
                paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {/* Left: Order Total */}
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium text-[#737373]">Total</span>
                <span className="text-base sm:text-lg font-extrabold text-[#F25B09] leading-tight truncate">
                  {formatRupiah(grandTotal)}
                </span>
              </div>

              {/* Right: Buat Pesanan Action Button */}
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  isOutsideConfiguredArea ||
                  !storeSettings ||
                  Boolean(settingsError) ||
                  !selectedPaymentMethod
                }
                className={`min-h-[44px] px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shrink-0 ${
                  !isOutsideConfiguredArea &&
                  storeSettings &&
                  !settingsError &&
                  Boolean(selectedPaymentMethod) &&
                  !isSubmitting
                    ? "bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] text-white cursor-pointer"
                    : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : isOutsideConfiguredArea ? (
                  <span>Perlu Konfirmasi Area</span>
                ) : (
                  <span>Buat Pesanan</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}