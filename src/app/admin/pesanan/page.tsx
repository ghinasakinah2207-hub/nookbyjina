import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { OrdersManager } from "@/components/admin/OrdersManager";

export const instant = false;

export default async function AdminPesananPage() {
  await requireAdminAuth();

  return <OrdersManager />;
}
