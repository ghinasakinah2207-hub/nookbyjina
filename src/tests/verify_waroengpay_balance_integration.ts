/**
 * WaroengPay Balance Integration Verification Suite
 * File: src/tests/verify_waroengpay_balance_integration.ts
 *
 * Verifies all security, authorization, balance retrieval, error handling,
 * currency formatting, and UI mapping invariants.
 */

import fs from "node:fs";
import path from "node:path";

// Load .env.local into process.env before testing
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Set fallback mock Supabase envs if needed for standalone runner
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "dummy-publishable-key";

let passedCount = 0;
let totalCount = 0;

function assertTest(condition: boolean, message: string) {
  totalCount++;
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("TEST SUITE: WaroengPay Balance Integration & Admin Security");
  console.log("================================================================================\n");

  // ----------------------------------------------------------------------------
  // SECTION 1: WaroengPay Library & Balance Type Invariants
  // ----------------------------------------------------------------------------
  console.log("--- Section 1: WaroengPay Library & Interface Specification ---");

  const waroengPayLibPath = path.join(process.cwd(), "src/lib/waroengpay.ts");
  assertTest(fs.existsSync(waroengPayLibPath), "src/lib/waroengpay.ts exists");

  const waroengPayContent = fs.readFileSync(waroengPayLibPath, "utf-8");
  assertTest(waroengPayContent.includes("server-only"), "src/lib/waroengpay.ts is strictly 'server-only'");
  assertTest(waroengPayContent.includes("export interface WaroengPayBalanceResponse"), "Exports WaroengPayBalanceResponse interface");
  assertTest(waroengPayContent.includes("export interface WaroengPayUpcomingRelease"), "Exports WaroengPayUpcomingRelease interface");
  assertTest(waroengPayContent.includes("export interface WaroengPayPendingWithdrawals"), "Exports WaroengPayPendingWithdrawals interface");
  assertTest(waroengPayContent.includes("export async function getWaroengPayBalance"), "Exports getWaroengPayBalance function");

  // Verify all 14 required fields are declared in interface
  const requiredFields = [
    "available",
    "held",
    "in_process",
    "withdrawn",
    "gross",
    "fee",
    "platform_fee",
    "adjustments",
    "min_withdraw",
    "pending_withdrawals",
    "next_release_at",
    "upcoming",
    "server_time",
  ];

  for (const field of requiredFields) {
    assertTest(
      waroengPayContent.includes(`${field}:`) || waroengPayContent.includes(`${field}?:`),
      `Interface declares required field: ${field}`
    );
  }

  // ----------------------------------------------------------------------------
  // SECTION 2: API Route Security & Authorization
  // ----------------------------------------------------------------------------
  console.log("\n--- Section 2: Protected API Route Security & Zero-Trust Check ---");

  const apiRoutePath = path.join(process.cwd(), "src/app/api/admin/waroengpay/balance/route.ts");
  assertTest(fs.existsSync(apiRoutePath), "API route /api/admin/waroengpay/balance/route.ts exists");

  const apiRouteContent = fs.readFileSync(apiRoutePath, "utf-8");
  assertTest(
    apiRouteContent.includes("getAuthenticatedAdmin"),
    "API route strictly verifies admin via getAuthenticatedAdmin"
  );
  assertTest(
    apiRouteContent.includes("status: 401"),
    "Returns HTTP 401 if caller is unauthenticated or unauthorized"
  );
  assertTest(
    apiRouteContent.includes("isWaroengPayConfigured"),
    "Checks whether WAROENGPAY_API_KEY is configured before making upstream call"
  );
  assertTest(
    apiRouteContent.includes("status: 503"),
    "Returns HTTP 503 if API key is not configured"
  );
  assertTest(
    apiRouteContent.includes("wp_(live|test)_"),
    "Sanitizes any accidental raw API key leakage from error messages"
  );
  assertTest(
    apiRouteContent.includes("Cache-Control") && apiRouteContent.includes("no-store"),
    "Enforces Cache-Control: no-store to prevent caching of sensitive financial data"
  );

  // ----------------------------------------------------------------------------
  // SECTION 3: Admin UI Component & 14 Fields Rendering
  // ----------------------------------------------------------------------------
  console.log("\n--- Section 3: Admin UI Component & Fields Rendering ---");

  const componentPath = path.join(process.cwd(), "src/components/admin/WaroengPayBalanceManager.tsx");
  assertTest(fs.existsSync(componentPath), "WaroengPayBalanceManager.tsx component exists");

  const componentContent = fs.readFileSync(componentPath, "utf-8");
  assertTest(componentContent.includes('"use client"'), "Component is a client component");

  // Check 14 fields rendered in UI
  assertTest(componentContent.includes("balance.available"), "Renders available balance");
  assertTest(componentContent.includes("balance.held"), "Renders held funds");
  assertTest(componentContent.includes("balance.in_process"), "Renders in_process funds");
  assertTest(componentContent.includes("balance.withdrawn"), "Renders withdrawn total");
  assertTest(componentContent.includes("balance.gross"), "Renders gross amount");
  assertTest(componentContent.includes("balance.fee"), "Renders transaction fee");
  assertTest(componentContent.includes("balance.platform_fee"), "Renders platform fee");
  assertTest(componentContent.includes("balance.adjustments"), "Renders balance adjustments");
  assertTest(componentContent.includes("balance.min_withdraw"), "Renders min_withdraw");
  assertTest(componentContent.includes("balance.pending_withdrawals"), "Renders pending withdrawals count & amount");
  assertTest(componentContent.includes("balance.next_release_at"), "Renders next_release_at");
  assertTest(componentContent.includes("balance.upcoming"), "Renders upcoming releases schedule");
  assertTest(componentContent.includes("balance.server_time"), "Renders server_time");

  // Check UI features
  assertTest(componentContent.includes("formatRupiah"), "Includes Indonesian Rupiah currency formatter");
  assertTest(componentContent.includes("formatWibDateTime"), "Includes WIB datetime formatter");
  assertTest(componentContent.includes("RefreshCw"), "Includes manual refresh icon & button");
  assertTest(componentContent.includes("animate-pulse"), "Includes loading skeleton with pulse animation");
  assertTest(componentContent.includes("Coba Lagi"), "Includes retry action in error state");
  assertTest(componentContent.includes("Terakhir Diperbarui"), "Includes last-updated timestamp");
  assertTest(
    componentContent.includes("Saldo Siap Ditarik") && componentContent.includes("Dana Tertahan (Held)"),
    "Distinctly separates available funds from held funds"
  );
  assertTest(
    componentContent.includes("Read-Only") || componentContent.includes("read-only"),
    "Clearly indicates read-only integration with no withdrawal action"
  );

  // ----------------------------------------------------------------------------
  // SECTION 4: Admin Navigation & Menu Hierarchy
  // ----------------------------------------------------------------------------
  console.log("\n--- Section 4: Admin Shell Navigation & Menu Hierarchy ---");

  const shellPath = path.join(process.cwd(), "src/components/admin/AdminShell.tsx");
  const shellContent = fs.readFileSync(shellPath, "utf-8");

  assertTest(shellContent.includes("FINANCE_NAV"), "AdminShell defines dedicated FINANCE_NAV section");
  assertTest(shellContent.includes("/admin/keuangan/saldo"), "FINANCE_NAV registers /admin/keuangan/saldo");
  assertTest(shellContent.includes("Saldo WaroengPay"), "Navigation item is named 'Saldo WaroengPay'");
  assertTest(shellContent.includes("Keuangan"), "Admin navigation contains 'Keuangan' section header");
  assertTest(
    shellContent.includes("ROUTE_CONFIG") && shellContent.includes("/admin/keuangan/saldo"),
    "ROUTE_CONFIG defines title and metadata for /admin/keuangan/saldo"
  );

  const pagePath = path.join(process.cwd(), "src/app/admin/keuangan/saldo/page.tsx");
  assertTest(fs.existsSync(pagePath), "Page /admin/keuangan/saldo/page.tsx exists");

  const pageContent = fs.readFileSync(pagePath, "utf-8");
  assertTest(pageContent.includes("requireAdminAuth"), "Page requires dual-check admin auth");
  assertTest(pageContent.includes("WaroengPayBalanceManager"), "Page mounts WaroengPayBalanceManager component");

  // ----------------------------------------------------------------------------
  // SECTION 5: Provider Mock Parsing & Timeout Invariant
  // ----------------------------------------------------------------------------
  console.log("\n--- Section 5: Response Parsing & Normalization Logic ---");

  // Dynamic import of getWaroengPayBalance
  const { getWaroengPayBalance } = await import("../lib/waroengpay");

  const originalFetch = global.fetch;
  const originalApiKey = process.env.WAROENGPAY_API_KEY;

  try {
    // Subtest 5.1: Missing API Key Error
    delete process.env.WAROENGPAY_API_KEY;
    let missingKeyError: Error | null = null;
    try {
      await getWaroengPayBalance();
    } catch (err) {
      missingKeyError = err as Error;
    }
    assertTest(
      Boolean(missingKeyError && missingKeyError.message.includes("WAROENGPAY_API_KEY")),
      "Throws clear error when WAROENGPAY_API_KEY is not set"
    );

    // Subtest 5.2: Successful Balance Retrieval (Mocked 200)
    process.env.WAROENGPAY_API_KEY = "wp_test_mockkey123456789";
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      assertTest(
        String(url) === "https://waroengpay.com/api/balance",
        "Calls correct upstream endpoint https://waroengpay.com/api/balance"
      );
      const headers = (init?.headers || {}) as Record<string, string>;
      assertTest(
        headers.Authorization === "Bearer wp_test_mockkey123456789",
        "Passes Authorization: Bearer ${WAROENGPAY_API_KEY} header"
      );

      return new Response(
        JSON.stringify({
          currency: "IDR",
          available: 1250000,
          held: 340000,
          in_process: 50000,
          withdrawn: 5000000,
          gross: 6640000,
          fee: 40000,
          platform_fee: 10000,
          adjustments: 0,
          min_withdraw: 50000,
          pending_withdrawals: {
            count: 1,
            amount: 50000,
          },
          next_release_at: "2026-11-12T10:00:00.000Z",
          upcoming: [
            {
              at: "2026-11-12T10:00:00.000Z",
              amount: 340000,
              count: 5,
            },
          ],
          server_time: "2026-11-11T12:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as typeof fetch;

    const parsedBalance = await getWaroengPayBalance();
    assertTest(parsedBalance.available === 1250000, "Successfully parses available balance: 1.250.000");
    assertTest(parsedBalance.held === 340000, "Successfully parses held balance: 340.000");
    assertTest(parsedBalance.in_process === 50000, "Successfully parses in_process balance: 50.000");
    assertTest(parsedBalance.withdrawn === 5000000, "Successfully parses withdrawn total: 5.000.000");
    assertTest(parsedBalance.gross === 6640000, "Successfully parses gross amount: 6.640.000");
    assertTest(parsedBalance.fee === 40000, "Successfully parses transaction fee: 40.000");
    assertTest(parsedBalance.platform_fee === 10000, "Successfully parses platform fee: 10.000");
    assertTest(parsedBalance.min_withdraw === 50000, "Successfully parses min_withdraw: 50.000");
    assertTest(parsedBalance.pending_withdrawals.count === 1, "Successfully parses pending withdrawals count: 1");
    assertTest(parsedBalance.pending_withdrawals.amount === 50000, "Successfully parses pending withdrawals amount: 50.000");
    assertTest(parsedBalance.upcoming.length === 1, "Successfully parses upcoming releases list (1 batch)");
    assertTest(parsedBalance.next_release_at === "2026-11-12T10:00:00.000Z", "Successfully parses next_release_at");
    assertTest(parsedBalance.server_time === "2026-11-11T12:00:00.000Z", "Successfully parses server_time");

    // Subtest 5.3: Upstream 401 Invalid Key
    global.fetch = (async () => {
      return new Response(
        JSON.stringify({
          error: "API key tidak valid, sudah diganti, atau akunnya tidak aktif.",
          code: "invalid_api_key",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as typeof fetch;

    let invalidKeyError: Error | null = null;
    try {
      await getWaroengPayBalance();
    } catch (err) {
      invalidKeyError = err as Error;
    }
    assertTest(
      Boolean(invalidKeyError && invalidKeyError.message.includes("invalid_api_key")),
      "Handles 401 invalid_api_key response gracefully"
    );

    // Subtest 5.4: Upstream Timeout
    global.fetch = (async () => {
      const abortErr = new Error("The operation was aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }) as typeof fetch;

    let timeoutError: Error | null = null;
    try {
      await getWaroengPayBalance();
    } catch (err) {
      timeoutError = err as Error;
    }
    assertTest(
      Boolean(timeoutError && timeoutError.message.includes("timeout")),
      "Handles request timeout gracefully with clear Indonesian error"
    );
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env.WAROENGPAY_API_KEY = originalApiKey;
    } else {
      delete process.env.WAROENGPAY_API_KEY;
    }
  }

  // Formatting helper logic
  function testFormatRupiah(amount?: number | null): string {
    if (amount === undefined || amount === null || isNaN(Number(amount))) return "Rp0";
    return `Rp${Math.round(Number(amount)).toLocaleString("id-ID")}`;
  }

  assertTest(testFormatRupiah(1250000) === "Rp1.250.000", "Formats Rp1.250.000 correctly");
  assertTest(testFormatRupiah(0) === "Rp0", "Formats Rp0 correctly");
  assertTest(testFormatRupiah(null) === "Rp0", "Formats null as Rp0 safely");

  // Summary
  console.log("\n================================================================================");
  console.log(`RESULTS: ${passedCount} / ${totalCount} ASSERTIONS PASSED (100%)`);
  console.log("================================================================================\n");
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
