import { NextResponse } from "next/server";
import { getOrdersByTokens, sanitizeOrderForCustomer } from "@/lib/orders-store";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tokens } = body;

    if (!tokens || !Array.isArray(tokens)) {
      return NextResponse.json(
        {
          success: true,
          orders: [],
        },
        { status: 200 }
      );
    }

    // Limit to reasonable batch size to prevent abuse
    const cleanTokens = tokens
      .filter((t): t is string => typeof t === "string" && t.trim().length >= 8)
      .slice(0, 50);

    if (cleanTokens.length === 0) {
      return NextResponse.json(
        {
          success: true,
          orders: [],
        },
        { status: 200 }
      );
    }

    const matchedOrders = await getOrdersByTokens(cleanTokens);
    const sanitizedOrders = matchedOrders.map(sanitizeOrderForCustomer);

    return NextResponse.json(
      {
        success: true,
        orders: sanitizedOrders,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memuat riwayat pesanan.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
