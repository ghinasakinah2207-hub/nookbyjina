import React from "react";
import { connection } from "next/server";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { DashboardOverview } from "@/components/admin/DashboardOverview";
import { fetchAdminDashboardOverviewDataServer, DashboardMetrics } from "@/lib/admin-reports";
import { Order } from "@/types";

export const instant = false;

export default async function AdminDashboardPage() {
  await connection();
  // Dual server-side check: authentic session + public.admin_users membership
  const { user } = await requireAdminAuth();

  let initialMetrics: DashboardMetrics | null = null;
  let initialOrders: Order[] = [];
  try {
    const data = await fetchAdminDashboardOverviewDataServer();
    initialMetrics = data.metrics;
    initialOrders = data.recentOrders;
  } catch (err) {
    console.error("Gagal memuat metrik dasbor:", err);
  }

  return (
    <DashboardOverview
      user={user}
      initialMetrics={initialMetrics}
      initialOrders={initialOrders}
    />
  );
}
