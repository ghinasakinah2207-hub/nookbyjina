import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { ReportsManager } from "@/components/admin/ReportsManager";
import { connection } from "next/server";
import { fetchAdminDashboardDataServer, ReportStats } from "@/lib/admin-reports";

export const instant = false;

export default async function AdminLaporanPage() {
  await connection();
  await requireAdminAuth();

  let initialReports: ReportStats | null = null;
  try {
    const data = await fetchAdminDashboardDataServer("7days");
    initialReports = data.reports;
  } catch (err) {
    console.error("Gagal memuat data laporan awal:", err);
  }

  return <ReportsManager initialReports={initialReports} />;
}
