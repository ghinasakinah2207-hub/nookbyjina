import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { OrdersManager } from "@/components/admin/OrdersManager";

export const instant = false;

export default async function AdminPesananPage() {
  const { user } = await requireAdminAuth();

  return (
    <AdminShell
      userEmail={user.email}
      pageTitle="Manajemen Pesanan"
      badgeText="Operasional"
    >
      <OrdersManager />
    </AdminShell>
  );
}
