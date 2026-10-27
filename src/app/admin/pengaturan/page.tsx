import React from "react";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { SettingsManager } from "@/components/admin/SettingsManager";
import { getStoreSettings } from "@/lib/supabase/store-settings";

export const instant = false;

export default async function AdminPengaturanPage() {
  await requireAdminAuth();
  const settings = await getStoreSettings(undefined, { fresh: true });

  return <SettingsManager initialSettings={settings} />;
}

