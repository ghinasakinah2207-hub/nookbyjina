import { NextRequest, NextResponse } from "next/server";
import { isWaroengPayConfigured, isWaroengPaySandbox, simulateWaroengPayPayment } from "@/lib/waroengpay";

/**
 * Endpoint for testing / simulating WaroengPay sandbox invoice settlement or expiration.
 * Strictly available only in sandbox mode (wp_test_ API key).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isWaroengPayConfigured() || !isWaroengPaySandbox()) {
      return NextResponse.json(
        { success: false, message: "Simulasi hanya tersedia dalam mode Sandbox." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { paymentId, action = "pay" } = body;

    if (!paymentId || typeof paymentId !== "string") {
      return NextResponse.json(
        { success: false, message: "paymentId wajib disertakan (contoh: WRG-...)" },
        { status: 400 }
      );
    }

    const result = await simulateWaroengPayPayment(paymentId, action === "expire" ? "expire" : "pay");

    return NextResponse.json({
      success: true,
      message: `Simulasi ${action === "expire" ? "kedaluwarsa" : "pembayaran"} berhasil dikirim ke WaroengPay.`,
      result,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Gagal menjalankan simulasi";
    console.error("[POST /api/payments/waroengpay/simulate] Error:", errorMsg);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
