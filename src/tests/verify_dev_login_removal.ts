import fs from "fs";
import path from "path";

async function verifyLive() {
  const BASE_URL = "http://localhost:3000";
  console.log("=== COMPREHENSIVE LIVE VERIFICATION ===");

  // 1. Verify /admin/login page HTML does NOT contain dev login button
  console.log("\n1. Inspecting /admin/login HTML rendering...");
  const loginRes = await fetch(`${BASE_URL}/admin/login`);
  const loginHtml = await loginRes.text();
  if (loginHtml.includes("Masuk Cepat Mode Dev")) {
    throw new Error("FAIL: /admin/login still renders 'Masuk Cepat Mode Dev'!");
  }
  if (loginHtml.includes("loginDevAdminAction")) {
    throw new Error("FAIL: /admin/login contains 'loginDevAdminAction'!");
  }
  console.log("PASS: /admin/login HTML does NOT render 'Masuk Cepat Mode Dev (Owner)' button or dev form.");

  // 2. Verify unauthenticated visitor cannot access /admin
  console.log("\n2. Testing unauthenticated visitor access to /admin...");
  const unauthAdminRes = await fetch(`${BASE_URL}/admin`, { redirect: "manual" });
  console.log(`Unauth /admin status: ${unauthAdminRes.status}, location: ${unauthAdminRes.headers.get("location")}`);
  if (unauthAdminRes.status !== 307 && unauthAdminRes.status !== 302 && unauthAdminRes.status !== 303) {
    throw new Error(`FAIL: Expected redirect to /admin/login, got status ${unauthAdminRes.status}`);
  }
  if (!unauthAdminRes.headers.get("location")?.includes("/admin/login")) {
    throw new Error(`FAIL: Expected redirect location to include /admin/login`);
  }
  console.log("PASS: Unauthenticated visitor is redirected to /admin/login.");

  // 3. Verify forged dev_admin=true cookie does NOT grant access to /admin
  console.log("\n3. Testing forged dev_admin=true cookie on /admin...");
  const forgedAdminRes = await fetch(`${BASE_URL}/admin`, {
    headers: { Cookie: "dev_admin=true" },
    redirect: "manual",
  });
  console.log(`Forged cookie /admin status: ${forgedAdminRes.status}, location: ${forgedAdminRes.headers.get("location")}`);
  if (forgedAdminRes.status !== 307 && forgedAdminRes.status !== 302 && forgedAdminRes.status !== 303) {
    throw new Error(`FAIL: Forged cookie permitted access to /admin with status ${forgedAdminRes.status}`);
  }
  if (!forgedAdminRes.headers.get("location")?.includes("/admin/login")) {
    throw new Error(`FAIL: Forged cookie redirect location is not /admin/login`);
  }
  console.log("PASS: Forged dev_admin=true cookie strictly denied, redirected to /admin/login.");

  // 4. Verify forged dev_admin=true cookie on all protected admin routes
  console.log("\n4. Testing forged dev_admin=true cookie on admin subroutes...");
  const subroutes = ["/admin/beranda", "/admin/menu", "/admin/pengaturan", "/admin/laporan", "/admin/pesanan"];
  for (const route of subroutes) {
    const res = await fetch(`${BASE_URL}${route}`, {
      headers: { Cookie: "dev_admin=true" },
      redirect: "manual",
    });
    if (res.status !== 307 && res.status !== 302 && res.status !== 303) {
      throw new Error(`FAIL: ${route} allowed access with forged cookie! Status: ${res.status}`);
    }
    console.log(`  PASS: ${route} redirected (status: ${res.status})`);
  }

  // 5. Verify forged dev_admin=true cookie on protected APIs
  console.log("\n5. Testing forged dev_admin=true cookie on admin API routes...");
  const reportsRes = await fetch(`${BASE_URL}/api/admin/reports`, {
    headers: { Cookie: "dev_admin=true" },
  });
  if (reportsRes.status !== 401) {
    throw new Error(`FAIL: /api/admin/reports returned ${reportsRes.status} instead of 401`);
  }
  console.log("PASS: /api/admin/reports returned HTTP 401 with forged cookie.");

  const ordersRes = await fetch(`${BASE_URL}/api/admin/orders`, {
    headers: { Cookie: "dev_admin=true" },
  });
  if (ordersRes.status !== 401) {
    throw new Error(`FAIL: /api/admin/orders returned ${ordersRes.status} instead of 401`);
  }
  console.log("PASS: /api/admin/orders returned HTTP 401 with forged cookie.");

  const storeSettingsPostRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "dev_admin=true",
    },
    body: JSON.stringify({ storeName: "Forged Tamper" }),
  });
  if (storeSettingsPostRes.status !== 401) {
    throw new Error(`FAIL: POST /api/store-settings returned ${storeSettingsPostRes.status} instead of 401`);
  }
  console.log("PASS: POST /api/store-settings returned HTTP 401 with forged cookie.");

  const orderStatusPatchRes = await fetch(`${BASE_URL}/api/orders/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: "dev_admin=true",
    },
    body: JSON.stringify({ orderId: "TJ-261021-001", paymentStatus: "Lunas" }),
  });
  if (orderStatusPatchRes.status !== 403) {
    throw new Error(`FAIL: PATCH /api/orders/status returned ${orderStatusPatchRes.status} instead of 403`);
  }
  console.log("PASS: PATCH /api/orders/status returned HTTP 403 with forged cookie.");

  // 6. Verify static file scan: zero dev_admin in application code
  console.log("\n6. Static file scan across src/ (excluding tests)...");
  function scanDir(dir: string): string[] {
    const findings: string[] = [];
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== "tests" && file !== "node_modules" && file !== ".next") {
          findings.push(...scanDir(fullPath));
        }
      } else if (file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".jsx")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes("dev_admin")) {
          findings.push(`dev_admin in ${fullPath}`);
        }
        if (content.includes("loginDevAdminAction")) {
          findings.push(`loginDevAdminAction in ${fullPath}`);
        }
      }
    }
    return findings;
  }
  const violations = scanDir(path.join(process.cwd(), "src"));
  if (violations.length > 0) {
    throw new Error(`FAIL: Found bypass violations in application code:\n${violations.join("\n")}`);
  }
  console.log("PASS: Exactly 0 occurrences of dev_admin or loginDevAdminAction in src/ application code.");

  console.log("\n=== ALL LIVE VERIFICATION CHECKS PASSED ===");
}

verifyLive().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
