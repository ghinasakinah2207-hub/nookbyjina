import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { PaymentsManager } from "@/components/admin/PaymentsManager";

export const instant = false;

export default async function AdminPembayaranPage() {
  const { user } = await requireAdminAuth();

  return (
    <AdminShell
      userEmail={user.email}
      pageTitle="Verifikasi Pembayaran & QRIS"
      pageDescription="Pemeriksaan mutasi DANA Bisnis merchant dan konfirmasi pesanan lunas"
      badgeText="QRIS Merchant"
    >
      <PaymentsManager />
    </AdminShell>
  );
}
