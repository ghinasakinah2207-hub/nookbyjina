import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { PaymentsManager } from "@/components/admin/PaymentsManager";

export const instant = false;

export default async function AdminPembayaranPage() {
  await requireAdminAuth();

  return <PaymentsManager />;
}
