import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { getAdminOrdersServer } from "@/lib/orders-store";

export async function GET() {
  try {
    await requireAdminAuth();
    const orders = await getAdminOrdersServer();
    return NextResponse.json(
      { success: true, orders },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memuat pesanan admin.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }
}
