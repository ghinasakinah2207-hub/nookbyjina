import { NextResponse } from "next/server";
import { getOrderByToken, sanitizeOrderForCustomer } from "@/lib/orders-store";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;

    if (!token || typeof token !== "string" || token.trim().length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: "Token akses pesanan tidak valid.",
        },
        { status: 400 }
      );
    }

    const order = await getOrderByToken(token.trim());

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: "Pesanan tidak ditemukan atau tautan akses telah kedaluwarsa.",
        },
        { status: 404 }
      );
    }

    // Sanitize customer private data (phone number, etc.) per PRD Section 14
    const sanitized = sanitizeOrderForCustomer(order);

    return NextResponse.json(
      {
        success: true,
        order: sanitized,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memuat detail pesanan.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
