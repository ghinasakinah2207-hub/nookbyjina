import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/supabase/admin-auth";
import {
  getWaroengPayBalance,
  isWaroengPayConfigured,
  isWaroengPaySandbox,
} from "@/lib/waroengpay";

/**
 * GET /api/admin/waroengpay/balance
 * Protected internal route for WaroengPay balance retrieval.
 * Requires authentic Admin session.
 * Never leaks API keys or internal secrets to client.
 */
export async function GET() {
  try {
    // 1. Dual-check zero-trust Admin authorization
    const admin = await getAuthenticatedAdmin();
    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          error: "Akses ditolak. Silakan masuk terlebih dahulu sebagai administrator.",
        },
        { status: 401 }
      );
    }

    // 2. Check if WaroengPay API key is configured
    if (!isWaroengPayConfigured()) {
      return NextResponse.json(
        {
          success: false,
          configured: false,
          error:
            "WAROENGPAY_API_KEY belum dikonfigurasi pada environment server. Harap atur kredensial terlebih dahulu.",
          lastUpdated: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    // 3. Retrieve real-time balance from WaroengPay API
    const balance = await getWaroengPayBalance();

    return NextResponse.json(
      {
        success: true,
        configured: true,
        isSandbox: isWaroengPaySandbox(),
        balance,
        lastUpdated: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: unknown) {
    const rawMessage =
      err instanceof Error ? err.message : "Terjadi kesalahan saat memuat saldo WaroengPay.";

    // Sanitize any accidental sensitive tokens from message
    const sanitizedMessage = rawMessage.replace(/wp_(live|test)_[a-zA-Z0-9_-]+/g, "wp_***");

    const isTimeout =
      sanitizedMessage.toLowerCase().includes("timeout") ||
      sanitizedMessage.toLowerCase().includes("batas waktu");

    const statusCode = isTimeout ? 504 : 502;

    return NextResponse.json(
      {
        success: false,
        configured: isWaroengPayConfigured(),
        error: sanitizedMessage,
        lastUpdated: new Date().toISOString(),
      },
      {
        status: statusCode,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
