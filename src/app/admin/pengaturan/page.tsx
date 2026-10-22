import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsManager } from "@/components/admin/SettingsManager";
import { getStoreSettings } from "@/lib/supabase/store-settings";

export const instant = false;

export default async function AdminPengaturanPage() {
  const { user } = await requireAdminAuth();
  const settings = await getStoreSettings();

  return (
    <AdminShell
      userEmail={user.email}
      pageTitle="Pengaturan Toko"
      pageDescription="Konfigurasi status toko, jam operasional, kontak WhatsApp, QRIS, dan tarif ongkir"
      badgeText="Pengaturan"
    >
      <SettingsManager initialSettings={settings} />
    </AdminShell>
  );
}

