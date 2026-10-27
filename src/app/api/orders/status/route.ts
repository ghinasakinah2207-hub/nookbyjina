import { NextResponse } from "next/server";
import { updateOrderStatusServer, getOrderByToken } from "@/lib/orders-store";
import { OrderStatus, PaymentStatus } from "@/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const VALID_ORDER_STATUSES: OrderStatus[] = [
  "Pesanan baru",
  "Diproses",
  "Siap",
  "Selesai",
  "Dibatalkan",
];

const VALID_PAYMENT_STATUSES: PaymentStatus[] = [
  "Menunggu Pembayaran",
  "Menunggu Verifikasi",
  "Lunas",
  "Dibatalkan",
];

async function isCallerAdmin(): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { orderId, token, orderStatus, paymentStatus } = body;

    const identifier = token || orderId;
    if (!identifier || typeof identifier !== "string") {
      return NextResponse.json(
        { success: false, error: "Identifikasi pesanan (orderId atau token) wajib disertakan." },
        { status: 400 }
      );
    }

    // Validate requested statuses against allowed enums
    if (orderStatus && !VALID_ORDER_STATUSES.includes(orderStatus as OrderStatus)) {
      return NextResponse.json(
        { success: false, error: `Status pesanan "${orderStatus}" tidak valid.` },
        { status: 400 }
      );
    }

    if (paymentStatus && !VALID_PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)) {
      return NextResponse.json(
        { success: false, error: `Status pembayaran "${paymentStatus}" tidak valid.` },
        { status: 400 }
      );
    }

    const isAdmin = await isCallerAdmin();

    // If caller is not admin, strictly enforce Zero-Trust permissions
    if (!isAdmin) {
      // Customers cannot mark orders as paid, approve payments, or advance order preparation
      if (
        paymentStatus === "Lunas" ||
        orderStatus === "Diproses" ||
        orderStatus === "Siap" ||
        orderStatus === "Selesai"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Akses ditolak: Hanya admin toko yang berhak memverifikasi pembayaran dan memproses pesanan.",
          },
          { status: 403 }
        );
      }

      // If customer is cancelling, must provide matching secret token
      if (token) {
        const existing = await getOrderByToken(token);
        if (!existing) {
          return NextResponse.json(
            { success: false, error: "Pesanan tidak ditemukan dengan token akses yang diberikan." },
            { status: 404 }
          );
        }
        // Reject cancellation of paid or completed orders before attempting mutation
        if (existing.paymentStatus === "Lunas") {
          return NextResponse.json(
            { success: false, error: "Pesanan yang telah berstatus Lunas tidak dapat dibatalkan." },
            { status: 400 }
          );
        }
        if (existing.orderStatus === "Selesai") {
          return NextResponse.json(
            { success: false, error: "Pesanan yang telah selesai tidak dapat dibatalkan." },
            { status: 400 }
          );
        }

        // Allow cancellation of unpaid orders
        if (orderStatus === "Dibatalkan" || paymentStatus === "Dibatalkan") {
          const updated = await updateOrderStatusServer(
            existing.id,
            "Dibatalkan",
            "Dibatalkan"
          );
          return NextResponse.json({ success: true, order: updated });
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: "Pelanggan tidak memiliki izin untuk mengubah status pesanan secara sepihak.",
        },
        { status: 403 }
      );
    }

    // Admin authorized update
    const updated = await updateOrderStatusServer(
      identifier,
      orderStatus as OrderStatus | undefined,
      paymentStatus as PaymentStatus | undefined
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Pesanan tidak ditemukan di sistem." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      order: updated,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memperbarui status pesanan.";
    const isClientError =
      message.includes("tidak dapat") ||
      message.includes("tidak valid") ||
      message.includes("Akses ditolak") ||
      message.includes("kedaluwarsa");
    return NextResponse.json(
      { success: false, error: message },
      { status: isClientError ? 400 : 500 }
    );
  }
}
