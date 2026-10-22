import fs from "fs";
import path from "path";

// Pre-empt server-only module restriction in test harness
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(require.cache as any)[require.resolve("server-only")] = { exports: {} };

console.log("==================================================================");
console.log("STARTING TEST SUITE: Admin Security Remediation & Regression Audit");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function testAssert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  const { toggleProductAvailabilityAction, uploadProductImageAction } = await import(
    "@/app/admin/menu/actions"
  );
  const { saveHomepageSectionAction, uploadBannerImageAction } = await import(
    "@/app/admin/beranda/actions"
  );
  const adminActionsModule = await import("@/app/admin/actions");

  const BASE_URL = "http://localhost:3000";

  // =========================================================================
  // 1. POST /api/store-settings Security Boundary & Authorization
  // =========================================================================
  console.log("--- 1. Testing POST /api/store-settings Security Boundary ---");
  try {
    // 1a. Unauthenticated POST -> HTTP 401
    const resNoAuth = await fetch(`${BASE_URL}/api/store-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeName: "Tampered Store Name" }),
    });
    testAssert(
      resNoAuth.status === 401,
      `Unauthenticated POST /api/store-settings returns HTTP 401 (actual: ${resNoAuth.status})`
    );
    const jsonNoAuth = await resNoAuth.json();
    testAssert(jsonNoAuth.success === false, "Unauthenticated response contains success: false");
    testAssert(
      jsonNoAuth.error.includes("Sesi tidak ditemukan") || jsonNoAuth.error.includes("admin"),
      "Error message informs caller session is missing"
    );

    // 1b. Authenticated Non-Admin verification -> HTTP 403
    // Inspect and verify route logic strictly rejects non-admin users with 403
    const routeContent = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/store-settings/route.ts"),
      "utf-8"
    );
    testAssert(
      routeContent.includes("if (!adminRecord) {") &&
      routeContent.includes("status: 403") &&
      routeContent.includes("Akses ditolak: Akun Anda tidak terdaftar sebagai pemilik toko"),
      "POST /api/store-settings strictly returns HTTP 403 Forbidden for authenticated non-admin users"
    );

    // 1c. Forged dev_admin cookie POST -> HTTP 401 (Cookie bypass permanently disabled)
    const resAdmin = await fetch(`${BASE_URL}/api/store-settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "dev_admin=true",
      },
      body: JSON.stringify({
        storeName: "Forged Dev Admin Setting",
        isOpen: true,
      }),
    });
    testAssert(
      resAdmin.status === 401,
      `Forged dev_admin cookie POST /api/store-settings is rejected with HTTP 401 (actual: ${resAdmin.status})`
    );

    // 1d. Public GET /api/store-settings remains accessible
    const resGet = await fetch(`${BASE_URL}/api/store-settings`);
    testAssert(resGet.status === 200, "Public GET /api/store-settings remains 200 OK without authentication");
    const jsonGet = await resGet.json();
    testAssert(jsonGet.success === true && Boolean(jsonGet.settings), "Public GET returns valid store settings");
  } catch (err: unknown) {
    testAssert(false, `POST /api/store-settings failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // =========================================================================
  // 2. toggleProductAvailabilityAction Authorization Verification
  // =========================================================================
  console.log("\n--- 2. Testing toggleProductAvailabilityAction Authorization ---");
  const menuActionsContent = fs.readFileSync(
    path.join(process.cwd(), "src/app/admin/menu/actions.ts"),
    "utf-8"
  );
  testAssert(
    menuActionsContent.includes("export async function toggleProductAvailabilityAction"),
    "toggleProductAvailabilityAction is exported"
  );

  const toggleFnStart = menuActionsContent.indexOf("export async function toggleProductAvailabilityAction");
  const toggleFnBody = menuActionsContent.slice(toggleFnStart);
  const authIdx = toggleFnBody.indexOf("verifyAdminCaller(supabase)");
  const updateIdx = toggleFnBody.indexOf(".update(");

  testAssert(
    authIdx !== -1 && updateIdx !== -1 && authIdx < updateIdx,
    "verifyAdminCaller executes strictly BEFORE any database update query in toggleProductAvailabilityAction"
  );

  // Directly execute toggleProductAvailabilityAction without admin session
  try {
    const unauthToggleRes = await toggleProductAvailabilityAction("test-product-id", true);
    testAssert(
      unauthToggleRes.success === false,
      "Unauthorized direct invocation of toggleProductAvailabilityAction returns success: false"
    );
    testAssert(
      Boolean(unauthToggleRes.error && unauthToggleRes.error.length > 0),
      `Unauthorized call rejected with error: "${unauthToggleRes.error}"`
    );
  } catch (err: unknown) {
    testAssert(false, `toggleProductAvailabilityAction invocation threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  // =========================================================================
  // 3. Homepage Development Authorization Hardening in beranda/actions.ts
  // =========================================================================
  console.log("\n--- 3. Testing Homepage Actions Authorization Hardening ---");
  const berandaActionsContent = fs.readFileSync(
    path.join(process.cwd(), "src/app/admin/beranda/actions.ts"),
    "utf-8"
  );
  testAssert(
    !berandaActionsContent.includes('if (process.env.NODE_ENV === "development") {\n    return { authorized: true'),
    "Unconditional development bypass based solely on NODE_ENV is eliminated"
  );
  testAssert(
    !berandaActionsContent.includes("dev_admin"),
    "Homepage actions contain zero references to dev_admin"
  );

  // Directly execute saveHomepageSectionAction without admin session
  try {
    const unauthSaveSection = await saveHomepageSectionAction({
      title: "Test Section",
      isActive: true,
    });
    testAssert(
      unauthSaveSection.success === false,
      "Unauthorized direct invocation of saveHomepageSectionAction returns success: false"
    );
    testAssert(
      Boolean(unauthSaveSection.error && unauthSaveSection.error.length > 0),
      `Homepage server action rejected with auth error: "${unauthSaveSection.error}"`
    );
  } catch (err: unknown) {
    testAssert(false, `saveHomepageSectionAction invocation threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  // =========================================================================
  // 4. Complete Removal of Dev Login & dev_admin Bypass
  // =========================================================================
  console.log("\n--- 4. Testing Permanent Removal of Dev Login & dev_admin Bypass ---");
  const adminActionsContent = fs.readFileSync(
    path.join(process.cwd(), "src/app/admin/actions.ts"),
    "utf-8"
  );
  testAssert(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adminActionsModule as any).loginDevAdminAction === undefined,
    "loginDevAdminAction is completely deleted and not exported from @/app/admin/actions"
  );
  testAssert(
    !adminActionsContent.includes("dev_admin"),
    "admin/actions.ts contains zero references to dev_admin"
  );
  testAssert(
    !adminActionsContent.includes("loginDevAdminAction"),
    "admin/actions.ts contains zero references to loginDevAdminAction"
  );

  // =========================================================================
  // 5. Login Security, Error Sanitization & Mobile UX in login/page.tsx
  // =========================================================================
  console.log("\n--- 5. Testing Login Form Security, Sanitization & UX ---");
  const loginPageContent = fs.readFileSync(
    path.join(process.cwd(), "src/app/admin/login/page.tsx"),
    "utf-8"
  );
  testAssert(
    !loginPageContent.includes("loginDevAdminAction"),
    "login/page.tsx has zero imports or references to loginDevAdminAction"
  );
  testAssert(
    !loginPageContent.includes("Masuk Cepat Mode Dev"),
    "login/page.tsx does not render 'Masuk Cepat Mode Dev (Owner)' button"
  );
  testAssert(
    loginPageContent.includes('throw new Error("Email atau password tidak sesuai.");'),
    "Generic error message used for authentication failures to prevent user enumeration"
  );
  testAssert(
    loginPageContent.includes("rate limit") || loginPageContent.includes("too many requests"),
    "Dedicated non-sensitive rate limit handling included"
  );
  testAssert(
    loginPageContent.includes('id="admin-email"') &&
    loginPageContent.includes("disabled={loading}"),
    "Email input is disabled during form submission"
  );
  testAssert(
    loginPageContent.includes('id="admin-password"') &&
    loginPageContent.includes("disabled={loading}"),
    "Password input is disabled during form submission"
  );
  testAssert(
    loginPageContent.includes("text-[16px] sm:text-xs"),
    "Mobile input font size is set to minimum 16px (text-[16px] sm:text-xs) to prevent iOS Safari auto-zoom"
  );
  testAssert(
    loginPageContent.includes("Eye") &&
    loginPageContent.includes("EyeOff") &&
    loginPageContent.includes("setShowPassword"),
    "Password visibility toggle with Eye/EyeOff icons implemented"
  );
  testAssert(
    loginPageContent.includes('id="admin-login-error"') &&
    loginPageContent.includes('aria-describedby={error ? "admin-login-error" : undefined}') &&
    loginPageContent.includes("aria-invalid={Boolean(error)}"),
    "Accessible aria-invalid and aria-describedby relationships configured for validation errors"
  );

  // =========================================================================
  // 6. Persistent Image Uploads (Supabase Storage vs Local Filesystem)
  // =========================================================================
  console.log("\n--- 6. Testing Persistent Image Upload Implementations ---");
  testAssert(
    menuActionsContent.includes('.from("store-assets")') &&
    menuActionsContent.includes('.upload(storagePath, fileBuffer,'),
    "uploadProductImageAction uses Supabase Storage store-assets bucket"
  );
  testAssert(
    berandaActionsContent.includes('.from("store-assets")') &&
    berandaActionsContent.includes('.upload(storagePath, fileBuffer,'),
    "uploadBannerImageAction uses Supabase Storage store-assets bucket"
  );
  testAssert(
    !menuActionsContent.includes("fs.writeFileSync(filePath, buffer)"),
    "uploadProductImageAction no longer unconditionally writes to local disk with buffer"
  );
  testAssert(
    !berandaActionsContent.includes("fs.writeFileSync(filePath, buffer)"),
    "uploadBannerImageAction no longer unconditionally writes to local disk with buffer"
  );
  testAssert(
    menuActionsContent.includes("crypto.randomUUID()"),
    "uploadProductImageAction generates cryptographically unique filenames"
  );
  testAssert(
    berandaActionsContent.includes("crypto.randomUUID()"),
    "uploadBannerImageAction generates cryptographically unique filenames"
  );

  // 6b. Directly test uploadProductImageAction authorization rejection
  try {
    const unauthForm = new FormData();
    unauthForm.append("file", new Blob(["fake-image-content"], { type: "image/jpeg" }), "test.jpg");
    const unauthUploadRes = await uploadProductImageAction(unauthForm);
    testAssert(
      unauthUploadRes.success === false,
      "Unauthorized uploadProductImageAction rejected without session"
    );
  } catch (err: unknown) {
    testAssert(false, `uploadProductImageAction threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 6c. Directly test uploadBannerImageAction authorization rejection
  try {
    const unauthBannerForm = new FormData();
    unauthBannerForm.append("file", new Blob(["fake-banner-content"], { type: "image/jpeg" }), "banner.jpg");
    const unauthBannerRes = await uploadBannerImageAction(unauthBannerForm);
    testAssert(
      unauthBannerRes.success === false,
      "Unauthorized uploadBannerImageAction rejected without session"
    );
  } catch (err: unknown) {
    testAssert(false, `uploadBannerImageAction threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 6d. File size & MIME constraints verification
  testAssert(
    menuActionsContent.includes("const MAX_SIZE = 2 * 1024 * 1024") &&
    menuActionsContent.includes("const validMimeTypes = [\"image/jpeg\", \"image/png\", \"image/webp\"]"),
    "uploadProductImageAction validates file size (max 2 MB) and MIME types (JPG, PNG, WebP)"
  );
  testAssert(
    berandaActionsContent.includes("const MAX_SIZE = 5 * 1024 * 1024") &&
    berandaActionsContent.includes("const validMimeTypes = [\"image/jpeg\", \"image/png\", \"image/webp\"]"),
    "uploadBannerImageAction validates file size (max 5 MB) and MIME types (JPG, PNG, WebP)"
  );

  // =========================================================================
  // 7. Order Status API Security (Customer vs Admin Permissions)
  // =========================================================================
  console.log("\n--- 7. Testing Order Status API Zero-Trust Boundaries ---");
  try {
    const resFakePaid = await fetch(`${BASE_URL}/api/orders/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "TJ-261021-001",
        paymentStatus: "Lunas",
      }),
    });
    testAssert(
      resFakePaid.status === 403,
      `Unauthenticated customer attempt to set paymentStatus='Lunas' returns HTTP 403 (actual: ${resFakePaid.status})`
    );
    const jsonFakePaid = await resFakePaid.json();
    testAssert(jsonFakePaid.success === false, "Access rejected: Customer cannot mark orders as paid");
  } catch (err: unknown) {
    testAssert(false, `PATCH /api/orders/status test failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // =========================================================================
  // 8. Admin Reports & Orders Server-Side Authorization
  // =========================================================================
  console.log("\n--- 8. Testing Admin Protected Reports and Orders APIs ---");
  try {
    const resReportsNoAuth = await fetch(`${BASE_URL}/api/admin/reports`);
    testAssert(
      resReportsNoAuth.status === 401,
      `GET /api/admin/reports without admin session returns HTTP 401 (actual: ${resReportsNoAuth.status})`
    );

    const resOrdersNoAuth = await fetch(`${BASE_URL}/api/admin/orders`);
    testAssert(
      resOrdersNoAuth.status === 401,
      `GET /api/admin/orders without admin session returns HTTP 401 (actual: ${resOrdersNoAuth.status})`
    );

    const resReportsDevAdmin = await fetch(`${BASE_URL}/api/admin/reports`, {
      headers: { Cookie: "dev_admin=true" },
    });
    testAssert(
      resReportsDevAdmin.status === 401,
      `GET /api/admin/reports with forged dev_admin cookie is rejected with HTTP 401 (actual: ${resReportsDevAdmin.status})`
    );

    const resAdminPageForged = await fetch(`${BASE_URL}/admin`, {
      headers: { Cookie: "dev_admin=true" },
      redirect: "manual",
    });
    testAssert(
      resAdminPageForged.status === 307 || resAdminPageForged.status === 302 || resAdminPageForged.status === 303,
      `GET /admin with forged dev_admin cookie redirects to /admin/login (actual: ${resAdminPageForged.status})`
    );
  } catch (err: unknown) {
    testAssert(false, `Admin APIs test failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // =========================================================================
  // 9. SQL Migration Safety Integrity
  // =========================================================================
  console.log("\n--- 9. Testing SQL Migration Hardened Safety Invariants ---");
  const persistenceSql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261022000000_production_order_persistence.sql"),
    "utf-8"
  );
  testAssert(
    persistenceSql.includes("uq_anonymous_order_tokens_active_hash"),
    "SQL migration enforces unique index on active anonymous order tokens"
  );
  testAssert(
    persistenceSql.includes("pg_advisory_xact_lock(hashtext(lower(trim(p_token_hash))))"),
    "Atomic order RPC implements advisory transaction lock for token idempotency"
  );
  testAssert(
    persistenceSql.includes("(auth.role() IS DISTINCT FROM 'service_role') AND (public.is_admin() IS NOT TRUE)"),
    "Admin RPCs enforce null-safe, fail-closed authorization checks"
  );
  testAssert(
    persistenceSql.includes("EXCEPTION WHEN unique_violation THEN"),
    "Atomic order creation gracefully recovers from unique violations via subtransaction savepoint"
  );

  const storageSql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261021010000_create_qris_storage_bucket.sql"),
    "utf-8"
  );
  testAssert(
    storageSql.includes("WITH CHECK (\n    bucket_id = 'store-assets'\n    AND public.is_admin()\n  )"),
    "Storage UPDATE policy includes symmetric WITH CHECK clause matching admin and bucket requirements"
  );

  console.log("\n==================================================================");
  console.log(`TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
