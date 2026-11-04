"use client";

import React from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useAdminNotification } from "@/context/AdminNotificationContext";

interface AdminNotificationSoundToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function AdminNotificationSoundToggle({
  className = "",
  showLabel = false,
}: AdminNotificationSoundToggleProps) {
  const { soundEnabled, toggleSound } = useAdminNotification();

  return (
    <button
      type="button"
      onClick={toggleSound}
      title={
        soundEnabled
          ? "Suara Notifikasi: Aktif (Klik untuk menonaktifkan)"
          : "Suara Notifikasi: Hening (Klik untuk mengaktifkan)"
      }
      aria-label={soundEnabled ? "Nonaktifkan suara notifikasi" : "Aktifkan suara notifikasi"}
      className={`inline-flex items-center gap-1.5 p-1.5 rounded-lg border transition-colors cursor-pointer select-none ${
        soundEnabled
          ? "border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100/70"
          : "border-neutral-200 bg-neutral-50 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
      } ${className}`}
    >
      {soundEnabled ? (
        <Volume2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-600" />
      ) : (
        <VolumeX className="w-3.5 h-3.5 flex-shrink-0 text-neutral-400" />
      )}
      {showLabel && (
        <span className="text-[11px] font-medium">
          {soundEnabled ? "Suara Aktif" : "Suara Hening"}
        </span>
      )}
    </button>
  );
}
