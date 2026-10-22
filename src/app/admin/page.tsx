import React from "react";
import { connection } from "next/server";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { DashboardOverview } from "@/components/admin/DashboardOverview";

import { fetchAdminDashboardDataServer, DashboardMetrics } from "@/lib/admin-reports";
import { Order } from "@/types";

export const instant = false;

export default async function AdminDashboardPage() {
  await connection();
  // Dual server-side check: authentic session + public.admin_users membership
  const { user } = await requireAdminAuth();

  let initialMetrics: DashboardMetrics | null = null;
  let initialOrders: Order[] = [];
  try {
    const data = await fetchAdminDashboardDataServer("today");
    initialMetrics = data.metrics;
    initialOrders = data.orders;
  } catch (err) {
    console.error("Gagal memuat metrik dasbor:", err);
  }

  return (
    <AdminShell
      userEmail={user.email}
      pageTitle="Dasbor Operasional"
      badgeText="Owner Aktif"
    >
      <DashboardOverview
        user={user}
        initialMetrics={initialMetrics}
        initialOrders={initialOrders}
      />
    </AdminShell>
  );
}
