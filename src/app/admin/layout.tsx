import React from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminNotificationProvider } from "@/context/AdminNotificationContext";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminNotificationProvider>
      <AdminShell>{children}</AdminShell>
    </AdminNotificationProvider>
  );
}

