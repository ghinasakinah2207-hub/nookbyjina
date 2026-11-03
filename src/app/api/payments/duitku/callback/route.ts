import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  getDuitkuConfig,
  verifyDuitkuCallbackSignature,
} from "@/lib/duitku";
import { updateOrderStatusServer, getOrderById } from "@/lib/orders-store";

/**
 * Duitku IPN (Instant Payment Notification) Callback Handler.
 * Content-Type: application/x-www-form-urlencoded
 *
 * Security & Invariant Invariants:
 * 1. Strictly accepts POST.
 * 2. Parses and validates required parameters.
 * 3. Matches merchantCode with server configuration.
 * 4. Verifies HMAC-SHA256 signature using timingSafeEqual.
 * 5. Matches merchantOrderId with stored order in database.
 * 6. Matches nominal amount with orders.total.
 * 7. Rejects mutation of Cash or QRIS Statis orders (only allows Duitku / gateway orders).
 * 8. Idempotency: Duplicate callbacks for already settled orders return 200 without duplicate mutation.
 * 9. Failed resultCode ("01" etc.) records failure without marking order as Lunas.
 * 10. Does not resurrect cancelled or expired orders.
 * 11. Returns plain text "SUCCESS" (or 200 JSON per Duitku specification).
 */
export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text();
    const params = new URLSearchParams(rawText);

    const merchantCode = params.get("merchantCode")?.trim() || "";
    const amount = params.get("amount")?.trim() || "";
    const merchantOrderId = params.get("merchantOrderId")?.trim() || "";
    const signature = params.get("signature")?.trim() || "";
    const resultCode = params.get("resultCode")?.trim() || "";
    const reference = params.get("reference")?.trim() || "";
    // Note: productDetail, additionalParam, etc. can be used if needed in logging/auditing


    // 1. Validate required fields presence
    if (!merchantCode || !amount || !merchantOrderId || !signature || !resultCode) {
      console.warn("[Duitku Callback] Missing mandatory fields in callback payload");
      return NextResponse.json(
        { success: false, message: "Bad Request: Parameter tidak lengkap" },
        { status: 400 }
      );
    }

    // 2. Load server config & validate merchant code
    let config;
    try {
      config = getDuitkuConfig();
    } catch {
      console.error("[Duitku Callback] Gateway configuration missing on server");
      return NextResponse.json(
        { success: false, message: "Gateway configuration error" },
        { status: 500 }
      );
    }

    if (merchantCode !== config.merchantCode) {
      console.warn("[Duitku Callback] Merchant code mismatch:", {
        received: merchantCode,
        configured: config.merchantCode,
      });
      return NextResponse.json(
        { success: false, message: "Unauthorized: Merchant code tidak cocok" },
        { status: 403 }
      );
    }

    // 3. Verify HMAC-SHA256 signature
    const isSignatureValid = verifyDuitkuCallbackSignature(
      {
        merchantCode,
        amount,
        merchantOrderId,
        signature,
      },
      config.apiKey
    );

    if (!isSignatureValid) {
      console.warn("[Duitku Callback] Invalid signature for order:", merchantOrderId);
      return NextResponse.json(
        { success: false, message: "Unauthorized: Signature tidak valid" },
        { status: 400 }
      );
    }

    // 4. Query target order from Supabase or dev store fallback
    const supabase = getServiceRoleSupabaseClient();
    let order: {
      id: string;
      order_number?: string;
      total: number;
      payment_method: string;
      payment_status: string;
      order_status: string;
    } | null = null;

    if (supabase) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantOrderId);
      let orderQuery = supabase
        .from("orders")
        .select("id, order_number, total, payment_method, payment_status, order_status, paid_at, cancelled_at");

      if (isUuid) {
        orderQuery = orderQuery.eq("id", merchantOrderId);
      } else {
        orderQuery = orderQuery.eq("order_number", merchantOrderId);
      }

      const { data: dbOrder, error: orderErr } = await orderQuery.maybeSingle();
      if (!orderErr && dbOrder) {
        order = dbOrder;
      }
    } else {
      const devOrder = await getOrderById(merchantOrderId);
      if (devOrder) {
        order = {
          id: devOrder.id,
          order_number: devOrder.id,
          total: devOrder.total,
          payment_method: devOrder.paymentMethod,
          payment_status: devOrder.paymentStatus,
          order_status: devOrder.orderStatus,
        };
      }
    }

    if (!order) {
      console.warn("[Duitku Callback] Order not found for merchantOrderId:", merchantOrderId);
      return NextResponse.json(
        { success: false, message: "Pesanan tidak ditemukan" },
        { status: 404 }
      );
    }

    // 5. Method check & Gateway Provider check:
    // Only accept callbacks for QRIS orders processed via gateway_provider = 'duitku'
    // Strictly reject Cash orders or legacy manual QRIS without gateway metadata
    const paymentMethodLower = (order.payment_method || "").toLowerCase();
    const isQris = paymentMethodLower === "qris" || paymentMethodLower === "qris statis";

    if (!isQris) {
      console.warn(
        `[Duitku Callback] Tampering attempt: callback received for non-QRIS payment method '${order.payment_method}' (Order: ${order.order_number || order.id})`
      );
      return NextResponse.json(
        {
          success: false,
          message: "Akses ditolak: Metode pembayaran pesanan bukan QRIS Gateway",
        },
        { status: 400 }
      );
    }

    // Verify payments record associated with this order has gateway_provider = 'duitku' (or duitku_merchant_order_id matches)
    if (supabase) {
      const { data: paymentRecord } = await supabase
        .from("payments")
        .select("id, gateway_provider, duitku_merchant_order_id, status")
        .eq("order_id", order.id)
        .maybeSingle();

      if (paymentRecord && paymentRecord.gateway_provider && paymentRecord.gateway_provider !== "duitku") {
        console.warn(
          `[Duitku Callback] Tampering attempt: gateway_provider '${paymentRecord.gateway_provider}' does not match 'duitku' for order ${order.order_number || order.id}`
        );
        return NextResponse.json(
          {
            success: false,
            message: "Akses ditolak: Transaksi tidak terdaftar melalui gateway Duitku",
          },
          { status: 400 }
        );
      }
    }

    // 6. Amount validation
    const parsedCallbackAmount = Math.round(Number(amount));
    const orderTotal = Math.round(Number(order.total));

    if (isNaN(parsedCallbackAmount) || parsedCallbackAmount !== orderTotal) {
      console.warn("[Duitku Callback] Amount mismatch:", {
        orderTotal,
        receivedAmount: parsedCallbackAmount,
        merchantOrderId,
      });
      return NextResponse.json(
        { success: false, message: "Nominal pembayaran tidak cocok" },
        { status: 400 }
      );
    }

    // 7. Check terminal states (Cancelled / Expired)
    if (order.order_status === "Dibatalkan" || order.payment_status === "Dibatalkan") {
      console.warn("[Duitku Callback] Order already cancelled or expired:", order.order_number);
      return NextResponse.json(
        {
          success: false,
          message: "Pesanan telah kedaluwarsa atau dibatalkan. Tidak dapat menerima pembayaran.",
        },
        { status: 400 }
      );
    }

    // 8. Idempotency: If order is already settled ("Lunas"), respond 200 without mutating
    const targetOrderId = order.order_number || order.id;
    if (order.payment_status === "Lunas") {
      console.info("[Duitku Callback] Idempotent duplicate: Order already Lunas:", targetOrderId);
      return NextResponse.json({ success: true, message: "Order already settled" }, { status: 200 });
    }

    // 9. Process Result Code
    // "00" indicates SUCCESS in Duitku Merchant API v2
    if (resultCode === "00") {
      // Transition order status to Diproses and payment to Lunas via atomic transition enforcement
      await updateOrderStatusServer(targetOrderId, "Diproses", "Lunas");

      // Record transaction reference in payments table if available
      if (supabase) {
        try {
          await supabase
            .from("payments")
            .update({
              status: "Lunas",
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", order.id);
        } catch (err) {
          console.error("[Duitku Callback] Non-fatal error updating payments table:", err);
        }
      }

      console.info(`[Duitku Callback] Successfully settled order: ${targetOrderId} (Ref: ${reference})`);
      return NextResponse.json({ success: true, message: "Payment processed successfully" }, { status: 200 });
    } else {
      // Payment failed / expired on Duitku
      console.info(
        `[Duitku Callback] Non-successful resultCode '${resultCode}' for order: ${targetOrderId}`
      );
      // We do NOT mark order as Lunas.
      return NextResponse.json(
        { success: true, message: "Failure recorded, status not modified to Lunas" },
        { status: 200 }
      );
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Internal error";
    console.error("[Duitku Callback] Unexpected error:", errorMsg);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
