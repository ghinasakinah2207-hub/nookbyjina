import React, { Suspense } from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { OrdersManager } from "@/components/admin/OrdersManager";

export const instant = false;

export default async function AdminPesananPage() {
  await requireAdminAuth();

  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-[#737373]">
          Memuat data pesanan...
        </div>
      }
    >
      <OrdersManager />
    </Suspense>
  );
}

