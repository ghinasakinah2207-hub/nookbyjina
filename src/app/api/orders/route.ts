import { NextResponse } from "next/server";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import { getProductBySlugOrId } from "@/lib/supabase/catalog";
import { calculateDeliveryFee } from "@/lib/delivery-fee";
import { Order, CartItem, FulfillmentType, SelectedOption, SelectedAddon, OptionGroup, OptionValue } from "@/types";
import { validateIndonesianPhone } from "@/lib/phone";
import { saveOrder, getOrderByToken } from "@/lib/orders-store";
import { generateSecureOrderToken, isValidTokenFormat } from "@/lib/token-security";
import { isWaroengPayConfigured, createWaroengPayPayment, getWaroengPayPayment } from "@/lib/waroengpay";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      customerName,
      customerWhatsapp,
      fulfillmentType,
      deliveryArea,
      deliveryAddress,
      items,
      orderNote,
      paymentMethod,
    } = body;

    // 1. Fetch authoritative store settings from database/persistent store
    const storeSettings = await getStoreSettings(undefined, { fresh: true });

    // 2. Reject if store is closed
    if (!storeSettings.isOpen) {
      return NextResponse.json(
        {
          success: false,
          error: "Toko sedang close order. Pemesanan tidak dapat diproses.",
        },
        { status: 400 }
      );
    }

    // 2b. Authoritative Payment Method Validation against Store Settings
    const qrisActive = storeSettings.paymentMethods?.qris !== false; // defaults to true
    const cashActive = Boolean(storeSettings.paymentMethods?.cash);

    const selectedPaymentMethod = (paymentMethod as string) || "";
    let canonicalMethod: Order["paymentMethod"] = "QRIS";

    if (selectedPaymentMethod === "Cash") {
      if (!cashActive) {
        return NextResponse.json(
          {
            success: false,
            error: "Metode pembayaran Cash (Tunai) sedang dinonaktifkan oleh toko.",
          },
          { status: 400 }
        );
      }
      canonicalMethod = "Cash";
    } else if (selectedPaymentMethod === "QRIS" || selectedPaymentMethod === "QRIS Statis") {
      if (!qrisActive) {
        return NextResponse.json(
          {
            success: false,
            error: "Metode pembayaran QRIS sedang dinonaktifkan oleh toko.",
          },
          { status: 400 }
        );
      }
      canonicalMethod = "QRIS";
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Metode pembayaran wajib dipilih (QRIS atau Cash).",
        },
        { status: 400 }
      );
    }

    // 3. Ensure valid deliveryConfig exists (do not silently fall back to arbitrary fee)
    if (
      !storeSettings.deliveryConfig ||
      storeSettings.deliveryConfig.standardFee === undefined ||
      storeSettings.deliveryConfig.standardFee === null ||
      isNaN(Number(storeSettings.deliveryConfig.standardFee))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Gagal memvalidasi pengaturan ongkos kirim resmi toko.",
        },
        { status: 500 }
      );
    }

    // 4. Validate customer info
    const cleanName = (customerName || "").trim();
    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: "Nama lengkap wajib diisi (minimal 2 karakter).",
        },
        { status: 400 }
      );
    }

    const phoneValidation = validateIndonesianPhone(customerWhatsapp || "");
    if (!phoneValidation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error:
            phoneValidation.error ||
            "Nomor WhatsApp aktif wajib diisi (minimal 9 digit angka).",
        },
        { status: 400 }
      );
    }
    const cleanWhatsapp = phoneValidation.normalized;

    // 5. Authoritatively validate items against database catalog and calculate subtotal
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Keranjang belanja kosong." },
        { status: 400 }
      );
    }

    let authoritativeSubtotal = 0;
    const validatedItems: CartItem[] = [];

    for (const item of items as CartItem[]) {
      const qty = Number(item.quantity);
      if (!qty || qty <= 0 || !Number.isInteger(qty) || qty > 100) {
        return NextResponse.json(
          {
            success: false,
            error: "Terdapat item pesanan dengan kuantitas tidak valid (harus bilangan bulat 1 - 100).",
          },
          { status: 400 }
        );
      }

      const rawProdId = (item.productId || "").trim();
      if (!rawProdId) {
        return NextResponse.json(
          {
            success: false,
            error: "Item pesanan wajib menyertakan identifikasi produk yang valid.",
          },
          { status: 400 }
        );
      }

      // Look up product in catalog by UUID or slug
      const catalogProduct = await getProductBySlugOrId(rawProdId);
      if (!catalogProduct) {
        return NextResponse.json(
          {
            success: false,
            error: `Produk "${item.productName || rawProdId}" tidak ditemukan dalam katalog toko.`,
          },
          { status: 400 }
        );
      }

      if (catalogProduct.isArchived || !catalogProduct.isAvailable) {
        return NextResponse.json(
          {
            success: false,
            error: `Produk "${catalogProduct.name}" sedang tidak tersedia atau telah diarsipkan.`,
          },
          { status: 400 }
        );
      }

      // Recalculate options & addons authoritative delta directly from catalog
      let optionsDelta = 0;
      const validatedOptions: SelectedOption[] = [];
      const seenOptionValueIds = new Set<string>();
      const groupCountMap = new Map<string, number>();

      if (Array.isArray(item.selectedOptions)) {
        for (const opt of item.selectedOptions) {
          const rawValId = (
            opt.optionValueId ||
            opt.valueId ||
            opt.optionValue ||
            opt.valueName ||
            ""
          )
            .trim()
            .toLowerCase();
          let foundGroup: OptionGroup | undefined;
          let foundVal: OptionValue | undefined;

          for (const g of catalogProduct.optionGroups || []) {
            const v = g.values.find(
              (val) =>
                val.id.toLowerCase() === rawValId ||
                val.name.toLowerCase() === rawValId ||
                val.name.toLowerCase() ===
                  (opt.optionValue || opt.valueName || "").trim().toLowerCase()
            );
            if (v) {
              foundGroup = g;
              foundVal = v;
              break;
            }
          }

          if (!foundVal || !foundGroup) {
            return NextResponse.json(
              {
                success: false,
                error: `Pilihan varian "${opt.optionValue || opt.valueName || opt.optionValueId || opt.valueId}" tidak valid untuk produk "${catalogProduct.name}".`,
              },
              { status: 400 }
            );
          }

          if (seenOptionValueIds.has(foundVal.id.toLowerCase())) {
            return NextResponse.json(
              {
                success: false,
                error: `Pilihan varian "${foundVal.name}" tidak boleh dipilih lebih dari satu kali dalam item yang sama.`,
              },
              { status: 400 }
            );
          }
          seenOptionValueIds.add(foundVal.id.toLowerCase());
          groupCountMap.set(
            foundGroup.id.toLowerCase(),
            (groupCountMap.get(foundGroup.id.toLowerCase()) || 0) + 1
          );

          optionsDelta += Number(foundVal.priceDelta || 0);
          validatedOptions.push({
            groupId: foundGroup.id,
            groupName: foundGroup.name,
            valueId: foundVal.id,
            valueName: foundVal.name,
            optionValueId: foundVal.id,
            optionValue: foundVal.name,
            optionName: foundGroup.name,
            priceDelta: Number(foundVal.priceDelta || 0),
          });
        }
      }

      // Validate option-group cardinality (minSelect, maxSelect, required)
      for (const g of catalogProduct.optionGroups || []) {
        const count = groupCountMap.get(g.id.toLowerCase()) || 0;
        const minSelect =
          g.minSelect !== undefined && g.minSelect !== null
            ? Number(g.minSelect)
            : g.required
            ? 1
            : 0;
        const maxSelect =
          g.maxSelect !== undefined && g.maxSelect !== null
            ? Number(g.maxSelect)
            : 1;

        if (count < minSelect) {
          if (count === 0 && (g.required || minSelect >= 1)) {
            return NextResponse.json(
              {
                success: false,
                error: `Pilihan varian wajib "${g.name}" untuk produk "${catalogProduct.name}" belum dipilih.`,
              },
              { status: 400 }
            );
          } else {
            return NextResponse.json(
              {
                success: false,
                error: `Pilihan varian "${g.name}" untuk produk "${catalogProduct.name}" minimal harus dipilih ${minSelect} opsi (dipilih: ${count}).`,
              },
              { status: 400 }
            );
          }
        }

        if (maxSelect !== undefined && maxSelect !== null && count > maxSelect) {
          if (maxSelect === 1) {
            return NextResponse.json(
              {
                success: false,
                error: `Pilihan varian "${g.name}" untuk produk "${catalogProduct.name}" hanya boleh dipilih maksimal 1 opsi (dipilih: ${count}).`,
              },
              { status: 400 }
            );
          } else {
            return NextResponse.json(
              {
                success: false,
                error: `Pilihan varian "${g.name}" untuk produk "${catalogProduct.name}" maksimal hanya boleh dipilih ${maxSelect} opsi (dipilih: ${count}).`,
              },
              { status: 400 }
            );
          }
        }
      }

      const validatedAddons: SelectedAddon[] = [];
      const seenAddonIds = new Set<string>();
      if (Array.isArray(item.selectedAddons)) {
        for (const addon of item.selectedAddons) {
          const rawAddonId = (addon.addonId || addon.addonName || "").trim().toLowerCase();
          const foundAddon = (catalogProduct.addons || []).find(
            (a) =>
              a.id.toLowerCase() === rawAddonId ||
              a.name.toLowerCase() === rawAddonId ||
              a.name.toLowerCase() === (addon.addonName || "").trim().toLowerCase()
          );

          if (!foundAddon) {
            return NextResponse.json(
              {
                success: false,
                error: `Ekstra add-on "${addon.addonName || addon.addonId}" tidak diizinkan untuk produk "${catalogProduct.name}".`,
              },
              { status: 400 }
            );
          }

          if (seenAddonIds.has(foundAddon.id.toLowerCase())) {
            return NextResponse.json(
              {
                success: false,
                error: `Ekstra add-on "${foundAddon.name}" tidak boleh dipilih lebih dari satu kali dalam item yang sama.`,
              },
              { status: 400 }
            );
          }
          seenAddonIds.add(foundAddon.id.toLowerCase());

          optionsDelta += Number(foundAddon.price || 0);
          validatedAddons.push({
            addonId: foundAddon.id,
            addonName: foundAddon.name,
            price: Number(foundAddon.price || 0),
          });
        }
      }

      const productBasePrice = Number(
        catalogProduct.basePrice ?? (catalogProduct as unknown as { price?: number }).price ?? 0
      );
      const authoritativeUnitPrice = productBasePrice + optionsDelta;
      const authoritativeItemTotal = authoritativeUnitPrice * item.quantity;
      authoritativeSubtotal += authoritativeItemTotal;

      const canonicalProductId = catalogProduct.dbId || catalogProduct.id;

      validatedItems.push({
        ...item,
        productId: canonicalProductId, // Store canonical database UUID
        productName: catalogProduct.name, // Authoritative product name
        productType: catalogProduct.productType || "preorder",
        basePrice: productBasePrice, // Authoritative price
        unitPrice: authoritativeUnitPrice,
        itemTotal: authoritativeItemTotal,
        selectedOptions: validatedOptions,
        selectedAddons: validatedAddons,
      });
    }

    // 6. Authoritative Delivery Fee & Total Calculation from trusted settings
    const targetFulfillment: FulfillmentType =
      fulfillmentType === "pickup" ? "pickup" : "delivery";
    const targetArea = (deliveryArea || "Lhoksukon").trim();

    const deliveryCalc = calculateDeliveryFee({
      fulfillmentType: targetFulfillment,
      deliveryArea: targetArea,
      subtotal: authoritativeSubtotal,
      deliveryConfig: storeSettings.deliveryConfig,
    });

    if (deliveryCalc.isOutsideArea) {
      return NextResponse.json(
        {
          success: false,
          error: `Area pengantaran "${targetArea}" belum terkonfigurasi. Silakan hubungi admin terlebih dahulu.`,
        },
        { status: 400 }
      );
    }

    const authoritativeShippingFee = deliveryCalc.shippingFee;
    const authoritativeTotal = authoritativeSubtotal + authoritativeShippingFee;

    // 7. Authoritative Order Creation & Idempotency / Retry Defense
    const clientProvidedToken =
      typeof body.token === "string" && body.token.trim().length >= 16
        ? body.token.trim()
        : null;

    if (clientProvidedToken && isValidTokenFormat(clientProvidedToken)) {
      // Check if order was already created with this secret token (retry defense)
      const existingOrder = await getOrderByToken(clientProvidedToken);
      if (existingOrder) {
        // If order exists and is a QRIS order with WaroengPay configured, check if we need to reconcile status
        if (existingOrder.paymentMethod === "QRIS" && isWaroengPayConfigured() && existingOrder.waroengpayInvoiceId) {
          try {
            const checkRes = await getWaroengPayPayment(existingOrder.waroengpayInvoiceId);
            if (checkRes && checkRes.status === "paid") {
              existingOrder.paymentStatus = "Lunas";
              existingOrder.orderStatus = "Diproses";
            }
          } catch (retryCheckErr) {
            console.error("[POST /api/orders] Retry WaroengPay status check failed:", retryCheckErr);
          }
        }

        return NextResponse.json(
          {
            success: true,
            order: existingOrder,
            paymentUrl: existingOrder.paymentUrl,
            isRetry: true,
            serverValidated: {
              subtotal: existingOrder.subtotal,
              shippingFee: existingOrder.shippingFee,
              total: existingOrder.total,
              standardFee: deliveryCalc.standardFee,
              freeShippingThreshold: deliveryCalc.freeShippingThreshold,
            },
          },
          {
            status: 200,
            headers: { "Cache-Control": "no-store, max-age=0" },
          }
        );
      }
    }

    const token =
      clientProvidedToken && isValidTokenFormat(clientProvidedToken)
        ? clientProvidedToken
        : generateSecureOrderToken();

    const now = new Date();
    // WaroengPay standard expiry period: 15 minutes
    const EXPIRY_MINUTES = 15;
    const deadline = new Date(now.getTime() + EXPIRY_MINUTES * 60 * 1000);

    const isCashOrder = canonicalMethod === "Cash";

    const order: Order = {
      id: "", // create_order_atomic assigns canonical order_number sequentially inside DB transaction
      token,
      createdAt: now.toISOString(),
      customerName: cleanName,
      customerWhatsapp: cleanWhatsapp,
      fulfillmentType: targetFulfillment,
      deliveryArea:
        targetFulfillment === "pickup"
          ? "Pickup Toko (Lhoksukon)"
          : targetArea,
      deliveryAddress:
        targetFulfillment === "pickup"
          ? ""
          : typeof deliveryAddress === "string"
          ? deliveryAddress.slice(0, 300).trim()
          : "",
      orderNote: (orderNote || "").slice(0, 200).trim(),
      items: validatedItems,
      subtotal: authoritativeSubtotal,
      shippingFee: authoritativeShippingFee,
      total: authoritativeTotal,
      orderStatus: "Pesanan baru",
      paymentStatus: "Menunggu Pembayaran",
      paymentMethod: canonicalMethod,
      paymentDeadline: isCashOrder ? null : deadline.toISOString(),
      merchantName: storeSettings.qrisMerchantName || "Nook by Jina",
    };

    // Persist to server store
    const savedOrder = await saveOrder(order);

    // If QRIS and WaroengPay is configured, request dynamic QRIS invoice from WaroengPay
    let paymentUrl: string | undefined = undefined;
    if (canonicalMethod === "QRIS" && isWaroengPayConfigured()) {
      try {
        const hostDomain = (process.env.NEXT_PUBLIC_APP_URL || "https://www.nookbyjina.my.id").replace(/\/+$/, "");
        const callbackUrl = `${hostDomain}/api/payments/waroengpay/webhook`;
        const redirectUrl = `${hostDomain}/pesanan/${savedOrder.token}`;

        const waroengPayRes = await createWaroengPayPayment(
          {
            amount: savedOrder.total,
            reference: savedOrder.id,
            description: `Pesanan Nook by Jina ${savedOrder.id}`.slice(0, 200),
            callback_url: callbackUrl,
            redirect_url: redirectUrl,
            expires_in: 15,
          },
          savedOrder.id // Idempotency-Key
        );

        paymentUrl = waroengPayRes.pay_url;
        savedOrder.paymentUrl = paymentUrl;
        savedOrder.gatewayProvider = "waroengpay";
        savedOrder.waroengpayInvoiceId = waroengPayRes.id;
        savedOrder.qrisPayload = waroengPayRes.qris;
        savedOrder.uniqueCode = waroengPayRes.unique_code;
        savedOrder.rawAmount = waroengPayRes.amount;
        savedOrder.total = waroengPayRes.amount; // Authoritative amount including unique code
        savedOrder.paymentDeadline = waroengPayRes.expires_at;
        savedOrder.livemode = waroengPayRes.livemode;

        // Store WaroengPay transaction metadata in payments table
        const supabase = getServiceRoleSupabaseClient();
        if (supabase) {
          try {
            let orderUuid = (savedOrder as unknown as { uuid?: string }).uuid;
            if (!orderUuid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderUuid)) {
              const { data: oRow } = await supabase
                .from("orders")
                .select("id")
                .eq("order_number", savedOrder.id)
                .maybeSingle();
              if (oRow?.id) {
                orderUuid = oRow.id;
                savedOrder.uuid = oRow.id;
              }
            }

            if (orderUuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderUuid)) {
              const { error: updateErr } = await supabase
                .from("payments")
                .update({
                  gateway_provider: "waroengpay",
                  payment_url: waroengPayRes.pay_url,
                  gateway_status: "INVOICE_CREATED",
                  raw_response: waroengPayRes as unknown as Record<string, unknown>,
                })
                .eq("order_id", orderUuid);

              if (updateErr) {
                console.error("[POST /api/orders] Error recording WaroengPay payment metadata:", updateErr);
              }
            }
          } catch (updateErr) {
            console.error("[POST /api/orders] Error recording WaroengPay payment metadata:", updateErr);
          }
        }
      } catch (inquiryErr: unknown) {
        console.error("[POST /api/orders] WaroengPay invoice creation failed:", inquiryErr);
        const errMsg = inquiryErr instanceof Error ? inquiryErr.message : "Gagal membuat invoice WaroengPay";
        return NextResponse.json(
          {
            success: false,
            error: errMsg,
            orderId: savedOrder.id,
            token: savedOrder.token,
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        order: savedOrder,
        paymentUrl,
        serverValidated: {
          subtotal: authoritativeSubtotal,
          shippingFee: authoritativeShippingFee,
          total: authoritativeTotal,
          standardFee: deliveryCalc.standardFee,
          freeShippingThreshold: deliveryCalc.freeShippingThreshold,
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan saat memvalidasi dan membuat pesanan.";
    console.error("[POST /api/orders] Order creation failed:", {
      error: message,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
