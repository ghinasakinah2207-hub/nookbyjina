import { NextRequest, NextResponse } from "next/server";
import { getOrderByToken, updateOrderStatusServer } from "@/lib/orders-store";
import { isValidTokenFormat } from "@/lib/token-security";
import { isWaroengPayConfigured, getWaroengPayPayment } from "@/lib/waroengpay";
import { getServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token } = body;

    if (!token || typeof token !== "string" || !isValidTokenFormat(token)) {
      return NextResponse.json(
        { success: false, error: "Token pesanan tidak valid." },
        { status: 400 }
      );
    }

    const order = await getOrderByToken(token.trim());
    if (!order) {
      return NextResponse.json(
        { success: false, error: "Pesanan tidak ditemukan." },
        { status: 404 }
      );
    }

    // 1. If already paid, return immediately
    if (order.paymentStatus === "Lunas") {
      return NextResponse.json({
        success: true,
        status: "paid",
        order,
      });
    }

    // 2. If already cancelled/expired, return immediately
    if (order.paymentStatus === "Dibatalkan" || order.orderStatus === "Dibatalkan") {
      return NextResponse.json({
        success: true,
        status: "cancelled",
        order,
      });
    }

    // 3. Query authoritative status from WaroengPay if configured
    if (order.waroengpayInvoiceId && isWaroengPayConfigured()) {
      try {
        const wpPayment = await getWaroengPayPayment(order.waroengpayInvoiceId);

        if (wpPayment.status === "paid") {
          // Verify nominal amount
          const baseAmount = Math.round(Number(wpPayment.base_amount));
          const totalAmount = Math.round(Number(wpPayment.amount));
          const expected = Math.round(Number(order.total));
          const subtotal = Math.round(Number(order.subtotal));

          const isValidAmount =
            baseAmount === expected ||
            totalAmount === expected ||
            baseAmount === subtotal;

          if (isValidAmount) {
            await updateOrderStatusServer(order.id, "Pesanan baru", "Lunas");

            // Update payments table
            const supabase = getServiceRoleSupabaseClient();
            if (supabase && order.uuid) {
              await supabase
                .from("payments")
                .update({
                  gateway_status: "PAID",
                  paid_at: wpPayment.paid_at || new Date().toISOString(),
                })
                .eq("order_id", order.uuid);
            }

            const updated = await getOrderByToken(token.trim());
            return NextResponse.json({
              success: true,
              status: "paid",
              order: updated || order,
            });
          }
        } else if (wpPayment.status === "expired" || wpPayment.status === "cancelled") {
          await updateOrderStatusServer(order.id, "Dibatalkan", "Dibatalkan");
          const updated = await getOrderByToken(token.trim());
          return NextResponse.json({
            success: true,
            status: "cancelled",
            order: updated || order,
          });
        }
      } catch (err) {
        console.warn("[WaroengPay Check] Status query warning:", err);
      }
    }

    // Still pending
    return NextResponse.json({
      success: true,
      status: "pending",
      order,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memeriksa status transaksi.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
