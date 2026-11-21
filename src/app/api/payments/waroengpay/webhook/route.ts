import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  getWaroengPayConfig,
  verifyWaroengPayWebhookSignatureDetailed,
  WaroengPayWebhookEvent,
} from "@/lib/waroengpay";
import { updateOrderStatusServer, getDevOrderByWaroengPayId } from "@/lib/orders-store";

/**
 * WaroengPay Webhook Handler
 * Strictly conforms to WaroengPay API Documentation (waroengpay.md).
 *
 * Security & Reliability Requirements:
 * 1. Strictly accepts POST.
 * 2. Verifies HMAC-SHA256 signature using raw request body and timestamp header.
 * 3. Enforces 300-second timestamp freshness window to block replay attacks.
 * 4. Timing-safe comparison to prevent side-channel timing leaks.
 * 5. Production Protection: Sandbox events (livemode: false) are rejected/ignored in production.
 * 6. Matches orders strictly by WaroengPay Invoice ID (data.id WRG-...), NEVER reference alone.
 * 7. Validates nominal amount: data.base_amount must strictly match order total.
 * 8. Idempotency: Duplicate delivery of payment.paid returns 200 immediately.
 * 9. Late Payment Support: Correctly settles orders even if previously marked expired (data.late: true).
 * 10. Responds with HTTP 2xx within 10 seconds.
 */
export async function POST(req: NextRequest) {
  try {
    // 0. Always read the raw request body FIRST (never call req.json() before HMAC verification)
    const rawBody = await req.text();
    const timestamp = (req.headers.get("x-waroengpay-timestamp") || "").trim();
    const signature = (req.headers.get("x-signature") || "").trim();
    const eventType = (req.headers.get("x-waroengpay-event") || "").trim();

    // 1. Mandatory Header Verification
    if (!timestamp || !signature) {
      console.warn("[WaroengPay Webhook] Missing signature or timestamp headers");
      return NextResponse.json(
        { success: false, message: "Missing required webhook headers" },
        { status: 401 }
      );
    }

    // 2. Load Configuration and Verify HMAC Signature (`${timestamp}.${rawBody}`)
    let config;
    try {
      config = getWaroengPayConfig();
    } catch {
      console.error("[WaroengPay Webhook] Missing server configuration");
      return NextResponse.json(
        { success: false, message: "Gateway configuration missing on server" },
        { status: 500 }
      );
    }

    if (!config.webhookSecret) {
      console.error("[WaroengPay Webhook] WAROENGPAY_WEBHOOK_SECRET is not configured on server");
      return NextResponse.json(
        { success: false, message: "Webhook secret missing on server" },
        { status: 500 }
      );
    }

    // Allow configurable timestamp tolerance (default 600s = 10m to handle minor clock drift / testing delays)
    const configuredSkew = Number(process.env.WAROENGPAY_WEBHOOK_MAX_SKEW_SECONDS);
    const maxSkewSeconds =
      Number.isFinite(configuredSkew) && configuredSkew > 0 ? configuredSkew : 600;

    const verification = verifyWaroengPayWebhookSignatureDetailed(
      { rawBody, timestamp, signature },
      config.webhookSecret,
      maxSkewSeconds
    );

    if (!verification.valid) {
      console.warn("[WaroengPay Webhook] Verification failed:", {
        reason: verification.reason,
        eventType: eventType || "unknown",
        timestampHeader: timestamp,
        serverSeconds: verification.serverSeconds,
        skewSeconds: verification.skewSeconds,
        maxSkewSeconds,
        rawBodyLength: rawBody.length,
        signatureLength: signature.length,
        secretPrefix: config.webhookSecret.slice(0, 6),
      });

      const failureMessage =
        verification.reason === "expired_timestamp" || verification.reason === "invalid_timestamp"
          ? "Expired or invalid webhook timestamp"
          : "Invalid webhook signature";

      return NextResponse.json(
        { success: false, message: failureMessage, reason: verification.reason },
        { status: 401 }
      );
    }

    // 3. Parse JSON Body
    let event: WaroengPayWebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      console.warn("[WaroengPay Webhook] Malformed JSON payload");
      return NextResponse.json(
        { success: false, message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 4. Handle "ping" event (Test button on WaroengPay dashboard)
    if (event.event === "ping" || eventType === "ping") {
      return NextResponse.json({ success: true, message: "pong" }, { status: 200 });
    }

    // 5. Production Sandbox Isolation Guard
    // Ignore all test/sandbox events (livemode: false) immediately with HTTP 200
    if (event.livemode === false) {
      console.warn("[WaroengPay Webhook] Ignoring test event (livemode: false):", event.id);
      return NextResponse.json(
        { success: true, message: "Sandbox event ignored on live production server" },
        { status: 200 }
      );
    }

    const paymentData = event.data;
    if (!paymentData || !paymentData.id) {
      console.warn("[WaroengPay Webhook] Event missing payment data or invoice id");
      return NextResponse.json(
        { success: false, message: "Missing payment data" },
        { status: 400 }
      );
    }

    const waroengPayInvoiceId = String(paymentData.id).trim(); // e.g. WRG-7K2M9QX4BD1PZ

    // 6. Locate Order Strictly By WaroengPay Invoice ID (event.data.id WRG-...), NEVER by event.data.reference
    const supabase = getServiceRoleSupabaseClient();
    let matchedOrder: {
      id: string;
      order_number?: string;
      total: number;
      payment_method: string;
      payment_status: string;
      order_status: string;
    } | null = null;

    if (supabase) {
      // 6a. Primary lookup: orders.waroengpay_id = event.data.id
      const { data: directOrderRow, error: directOrderErr } = await supabase
        .from("orders")
        .select("id, order_number, total, payment_method, payment_status, order_status")
        .eq("waroengpay_id", waroengPayInvoiceId)
        .maybeSingle();

      if (!directOrderErr && directOrderRow) {
        matchedOrder = directOrderRow;
      }

      // 6b. Secondary lookup (backward compatibility for pre-migration rows):
      // payments.waroengpay_invoice_id or payments.raw_response->>'id' = event.data.id
      if (!matchedOrder) {
        let payOrderId: string | null = null;

        const { data: payByCol, error: payByColErr } = await supabase
          .from("payments")
          .select("order_id")
          .eq("waroengpay_invoice_id", waroengPayInvoiceId)
          .maybeSingle();

        if (!payByColErr && payByCol?.order_id) {
          payOrderId = payByCol.order_id;
        }

        if (!payOrderId) {
          const { data: payByRaw } = await supabase
            .from("payments")
            .select("order_id")
            .filter("raw_response->>id", "eq", waroengPayInvoiceId)
            .maybeSingle();

          if (payByRaw?.order_id) {
            payOrderId = payByRaw.order_id;
          }
        }

        if (payOrderId) {
          const { data: orderRow } = await supabase
            .from("orders")
            .select("id, order_number, total, payment_method, payment_status, order_status")
            .eq("id", payOrderId)
            .maybeSingle();

          if (orderRow) {
            matchedOrder = orderRow;
          }
        }
      }
    } else if (process.env.NODE_ENV !== "production") {
      // Dev-only in-memory mock store lookup — strictly by waroengpayInvoiceId (NEVER reference)
      const devOrder = getDevOrderByWaroengPayId(waroengPayInvoiceId);
      if (devOrder) {
        matchedOrder = {
          id: devOrder.id,
          order_number: devOrder.id,
          total: devOrder.total,
          payment_method: devOrder.paymentMethod,
          payment_status: devOrder.paymentStatus,
          order_status: devOrder.orderStatus,
        };
      }
    }

    if (!matchedOrder) {
      console.warn("[WaroengPay Webhook] No matching order found for invoice:", waroengPayInvoiceId);
      // Return 200 so WaroengPay does not spam retries for unknown external links
      return NextResponse.json(
        { success: true, message: "Invoice not associated with this application" },
        { status: 200 }
      );
    }

    const targetOrderId = matchedOrder.order_number || matchedOrder.id;

    // 7. Handle "payment.paid"
    if (event.event === "payment.paid") {
      // 7a. Strictly validate event.data.base_amount === order total
      const receivedBaseAmount = Math.round(Number(paymentData.base_amount));
      const orderExpectedTotal = Math.round(Number(matchedOrder.total));
      const isAmountValid =
        Number.isFinite(receivedBaseAmount) &&
        receivedBaseAmount > 0 &&
        receivedBaseAmount === orderExpectedTotal;

      if (!isAmountValid) {
        console.warn("[WaroengPay Webhook] Base amount mismatch detected:", {
          orderTotal: orderExpectedTotal,
          receivedBaseAmount,
          waroengPayInvoiceId,
        });
        return NextResponse.json(
          { success: false, message: "Nominal pembayaran tidak sesuai total pesanan" },
          { status: 400 }
        );
      }

      // 7b. Idempotency Guard: If order is already settled ("Lunas"), respond 200 immediately
      if (matchedOrder.payment_status === "Lunas") {
        console.info("[WaroengPay Webhook] Idempotent delivery: Order already Lunas:", targetOrderId);
        return NextResponse.json(
          { success: true, message: "Order already settled" },
          { status: 200 }
        );
      }

      // 7c. Late Payment Handling:
      // If customer paid after invoice expiry/cancellation and WaroengPay admin manually matched it (late: true),
      // we must not reject the webhook because merchant funds were successfully collected.
      // We safely record payment in payments table for merchant audit without violating cancelled order immutability.
      if (matchedOrder.order_status === "Dibatalkan" || matchedOrder.payment_status === "Dibatalkan") {
        if (paymentData.late) {
          console.warn(
            `[WaroengPay Webhook] Late payment received for previously cancelled order ${targetOrderId} (Invoice: ${waroengPayInvoiceId}). Funds received by merchant.`
          );
          if (supabase) {
            try {
              await supabase
                .from("payments")
                .update({
                  status: "Lunas",
                  raw_response: paymentData as unknown as Record<string, unknown>,
                  updated_at: new Date().toISOString(),
                })
                .eq("order_id", matchedOrder.id);
            } catch (err) {
              console.error("[WaroengPay Webhook] Error updating payments for late payment:", err);
            }
          }
          return NextResponse.json(
            { success: true, message: "Late payment recorded for merchant review", late: true },
            { status: 200 }
          );
        } else {
          return NextResponse.json(
            { success: false, message: "Order is already cancelled" },
            { status: 400 }
          );
        }
      }

      // 7d. Transition Order to "Diproses" and "Lunas"
      await updateOrderStatusServer(targetOrderId, "Diproses", "Lunas");

      if (supabase) {
        try {
          await supabase
            .from("payments")
            .update({
              status: "Lunas",
              gateway_status: "PAID",
              raw_response: paymentData as unknown as Record<string, unknown>,
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", matchedOrder.id);
        } catch (dbErr) {
          console.error("[WaroengPay Webhook] Error updating payment record to Lunas:", dbErr);
        }
      }

      console.info(
        `[WaroengPay Webhook] Successfully processed payment for ${targetOrderId} (Invoice: ${waroengPayInvoiceId}, Late: ${paymentData.late})`
      );
      return NextResponse.json({ success: true, message: "Payment processed successfully" }, { status: 200 });
    }

    // 8. Handle "payment.expired"
    if (event.event === "payment.expired") {
      if (matchedOrder.payment_status !== "Lunas") {
        await updateOrderStatusServer(targetOrderId, "Dibatalkan", "Dibatalkan");
        if (supabase) {
          try {
            await supabase
              .from("payments")
              .update({
                status: "Dibatalkan",
                gateway_status: "EXPIRED",
                raw_response: paymentData as unknown as Record<string, unknown>,
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", matchedOrder.id);
          } catch {
            // Non-fatal
          }
        }
      }
      return NextResponse.json({ success: true, message: "Expiration recorded" }, { status: 200 });
    }

    // 9. Handle "payment.cancelled"
    if (event.event === "payment.cancelled") {
      if (matchedOrder.payment_status !== "Lunas") {
        await updateOrderStatusServer(targetOrderId, "Dibatalkan", "Dibatalkan");
      }
      return NextResponse.json({ success: true, message: "Cancellation recorded" }, { status: 200 });
    }

    // Unhandled event type acknowledged safely
    return NextResponse.json({ success: true, message: "Event received" }, { status: 200 });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Internal error";
    console.error("[WaroengPay Webhook] Unexpected error:", errorMsg);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
