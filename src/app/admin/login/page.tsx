"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, Mail, AlertCircle, ArrowLeft, ShieldAlert, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isUnauthorized = searchParams.get("error") === "unauthorized";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If redirected due to unauthorized access, clear non-admin session cleanly
  useEffect(() => {
    if (isUnauthorized) {
      supabase.auth.signOut();
    }
  }, [isUnauthorized]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        const errMsg = authError.message.toLowerCase();
        if (
          errMsg.includes("rate limit") ||
          errMsg.includes("too many requests") ||
          authError.status === 429
        ) {
          throw new Error(
            "Terlalu banyak percobaan masuk. Silakan coba lagi beberapa saat lagi."
          );
        }
        // Generic failure message to prevent account enumeration
        throw new Error("Email atau password tidak sesuai.");
      }

      if (data?.user) {
        router.push("/admin");
        router.refresh();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Terjadi kesalahan saat masuk.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-7 shadow-xs space-y-4">
      {isUnauthorized && !error ? (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>
            Akses Ditolak: Akun Anda tidak terdaftar sebagai admin toko. Silakan masuk dengan akun pemilik yang sah.
          </span>
        </div>
      ) : null}

      {error ? (
        <div
          id="admin-login-error"
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#B42318] flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-[#D92D20] flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      <form onSubmit={handleLogin} className="space-y-3.5">
        <div>
          <label
            htmlFor="admin-email"
            className="block text-xs font-semibold text-[#111111] mb-1"
          >
            Email Pemilik
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
              <Mail className="w-4 h-4" />
            </div>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              required
              disabled={loading}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "admin-login-error" : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@temubyjina.com"
              className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-[16px] sm:text-xs text-[#111111] placeholder:text-[#A3A3A3] focus:outline-hidden focus:border-[#111111] transition-colors disabled:bg-neutral-50 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="block text-xs font-semibold text-[#111111] mb-1"
          >
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
              <Lock className="w-4 h-4" />
            </div>
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={loading}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "admin-login-error" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-[16px] sm:text-xs text-[#111111] placeholder:text-[#A3A3A3] focus:outline-hidden focus:border-[#111111] transition-colors disabled:bg-neutral-50 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#737373] hover:text-[#111111] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl min-h-[42px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mt-2"
        >
          {loading ? "Memverifikasi..." : "Masuk ke Dasbor"}
        </button>
      </form>

      <div className="pt-2 border-t border-[#F0F0F0] text-center">
        <Link
          href="/menu"
          className="inline-flex items-center gap-1.5 text-xs text-[#737373] hover:text-[#111111] transition-colors font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Halaman Toko</span>
        </Link>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-[#F6F6F7] flex flex-col justify-center py-12 px-4 sm:px-6">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand / Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#111111] text-white shadow-xs mx-auto">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-[#111111] tracking-tight">
            Portal Pemilik Toko
          </h1>
          <p className="text-xs text-[#737373]">
            Masuk untuk mengakses dasbor administratif Nook by Jina
          </p>
        </div>

        {/* Suspense boundary for useSearchParams */}
        <Suspense
          fallback={
            <div className="mt-6 bg-white border border-[#E5E5E5] rounded-2xl p-6 text-center text-xs text-[#737373]">
              Memuat formulir...
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
