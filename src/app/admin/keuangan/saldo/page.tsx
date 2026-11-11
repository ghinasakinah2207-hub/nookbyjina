import React from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requireAdminAuth } from "@/lib/supabase/admin-auth";
import { WaroengPayBalanceManager } from "@/components/admin/WaroengPayBalanceManager";
import {
  getWaroengPayBalance,
  isWaroengPayConfigured,
  isWaroengPaySandbox,
  WaroengPayBalanceResponse,
} from "@/lib/waroengpay";

export const instant = false;

export const metadata: Metadata = {
  title: "Saldo WaroengPay — Dasbor Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminSaldoWaroengPayPage() {
  await connection();
  // Dual server-side check: authentic session + public.admin_users membership
  await requireAdminAuth();

  const isConfigured = isWaroengPayConfigured();
  const isSandbox = isWaroengPaySandbox();

  let initialBalance: WaroengPayBalanceResponse | null = null;
  let initialError: string | null = null;

  if (isConfigured) {
    try {
      initialBalance = await getWaroengPayBalance();
    } catch (err: unknown) {
      const rawMessage =
        err instanceof Error ? err.message : "Gagal memuat saldo WaroengPay.";
      // Clean up sensitive tokens from error string if any
      initialError = rawMessage.replace(/wp_(live|test)_[a-zA-Z0-9_-]+/g, "wp_***");
    }
  }

  return (
    <WaroengPayBalanceManager
      initialBalance={initialBalance}
      initialError={initialError}
      isConfigured={isConfigured}
      isSandbox={isSandbox}
    />
  );
}
