import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import {
  calculateReportStats,
  calculateDashboardMetrics,
  getAdminProductsWithHppServer,
  ReportTimeRange,
} from "@/lib/admin-reports";
import { getAdminOrdersServer } from "@/lib/orders-store";

export async function GET(request: NextRequest) {
  try {
    // 1. Enforce strict dual-verification admin authorization
    await requireAdminAuth();

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get("range");
    const validRanges: ReportTimeRange[] = ["today", "7days", "30days", "all"];
    const range: ReportTimeRange = validRanges.includes(rangeParam as ReportTimeRange)
      ? (rangeParam as ReportTimeRange)
      : "7days";

    // 3. Fetch server data
    const [orders, products] = await Promise.all([
      getAdminOrdersServer(),
      getAdminProductsWithHppServer(),
    ]);

    // 4. Calculate metrics and reports
    const metrics = calculateDashboardMetrics(orders);
    const reports = calculateReportStats(orders, products, range);

    return NextResponse.json(
      {
        success: true,
        metrics,
        reports,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Gagal memuat laporan admin.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }
}
