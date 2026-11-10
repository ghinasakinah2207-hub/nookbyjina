import React from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminNotificationProvider } from "@/context/AdminNotificationContext";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

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
