import http from "http";
import assert from "assert";

console.log("================================================================================");
console.log("TEST SUITE: Customer Bottom Navigation Lifecycle & Flash Prevention Verification");
console.log("================================================================================");

interface ChromeTarget {
  type: string;
  webSocketDebuggerUrl: string;
}

interface EvalValue {
  exists?: boolean;
  activeLabel?: string | null;
  width?: number;
  height?: number;
}

interface CDPResponse {
  result?: {
    type?: string;
    value?: EvalValue | boolean | null;
  };
}

async function testAll() {
  const json = await new Promise<ChromeTarget[]>((resolve, reject) => {
    http.get("http://localhost:9222/json", (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(JSON.parse(data) as ChromeTarget[]));
    }).on("error", reject);
  });

  const page = json.find((t) => t.type === "page");
  if (!page) throw new Error("No page target found");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;

  const callbacks = new Map<number, (val: CDPResponse) => void>();
  function send(method: string, params: Record<string, unknown> = {}): Promise<CDPResponse> {
    const curId = id++;
    return new Promise((resolve) => {
      callbacks.set(curId, resolve);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  const consoleErrors: string[] = [];
  const navInsertionsOnWelcome: string[] = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data as string) as { id?: number; result?: CDPResponse; method?: string; params?: { type?: string; args?: Array<{ value?: unknown; description?: string }> } };
    if (msg.id && callbacks.has(msg.id)) {
      callbacks.get(msg.id)!(msg.result as CDPResponse || {});
      callbacks.delete(msg.id);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params?.args) {
      const text = msg.params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(" ");
      if (msg.params.type === "error" || text.includes("Hydration") || text.includes("mismatch")) {
        consoleErrors.push(text);
      }
      if (text.includes("[NAV_ATTACHED]")) {
        navInsertionsOnWelcome.push(text);
      }
    }
  };

  await new Promise(r => ws.onopen = r);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");

  // Track any DOM insertion of nav element with MutationObserver
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              if (node.tagName === 'NAV' || (node.querySelector && node.querySelector('nav'))) {
                const nav = node.tagName === 'NAV' ? node : node.querySelector('nav');
                console.log('[NAV_ATTACHED] path=' + window.location.pathname + ' nav=' + nav.getAttribute('aria-label'));
              }
            }
          }
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    `
  });

  // --- Test 1: First visit to the welcome page: no bottom navigation flash ---
  console.log("\n--- Test 1: First visit to / (welcome page) ---");
  await send("Page.navigate", { url: "http://localhost:3333/" });
  await new Promise(r => setTimeout(r, 2000));

  const welcomeNavCheck = await send("Runtime.evaluate", {
    expression: "document.querySelector('nav[aria-label=\"Navigasi Utama Pelanggan\"]') !== null",
    returnByValue: true
  });
  assert.strictEqual(welcomeNavCheck.result?.value, false, "Bottom navigation must NOT exist on /");
  assert.strictEqual(navInsertionsOnWelcome.length, 0, "No nav elements were ever attached to DOM on /");
  console.log("  [PASS] Welcome page has NO bottom navigation at any point during load");

  // --- Test 2: Refresh the welcome page ---
  console.log("\n--- Test 2: Refresh the welcome page ---");
  navInsertionsOnWelcome.length = 0;
  await send("Page.reload");
  await new Promise(r => setTimeout(r, 2000));

  const welcomeReloadCheck = await send("Runtime.evaluate", {
    expression: "document.querySelector('nav[aria-label=\"Navigasi Utama Pelanggan\"]') !== null",
    returnByValue: true
  });
  assert.strictEqual(welcomeReloadCheck.result?.value, false, "Bottom navigation must NOT exist on refreshed /");
  assert.strictEqual(navInsertionsOnWelcome.length, 0, "No nav elements were attached during reload of /");
  console.log("  [PASS] Refreshed welcome page has NO bottom navigation flash");

  // --- Test 3: Click ORDER and enter home page ---
  console.log("\n--- Test 3: Navigate to /home ---");
  await send("Page.navigate", { url: "http://localhost:3333/home" });
  await new Promise(r => setTimeout(r, 2000));

  const homeNavCheck = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const nav = document.querySelector('nav[aria-label="Navigasi Utama Pelanggan"]');
        if (!nav) return null;
        const activeTab = nav.querySelector('[aria-current="page"]');
        return {
          exists: true,
          activeLabel: activeTab ? activeTab.getAttribute('aria-label') : null
        };
      })()
    `,
    returnByValue: true
  });
  const homeVal = homeNavCheck.result?.value as EvalValue;
  assert(homeVal && homeVal.exists, "Bottom nav must exist on /home");
  assert.strictEqual(homeVal.activeLabel, "Home", "Home tab must be active on /home");
  console.log("  [PASS] Bottom navigation appears correctly on /home with Home tab active");

  // --- Test 4: Navigate between Home, Menu, Keranjang, Pesanan ---
  const routes = [
    { path: "/menu", expectedLabel: "Menu" },
    { path: "/keranjang", expectedLabel: "Keranjang" },
    { path: "/pesanan", expectedLabel: "Pesanan" },
    { path: "/home", expectedLabel: "Home" }
  ];

  for (const r of routes) {
    console.log(`\n--- Test 4: Navigate to ${r.path} ---`);
    await send("Page.navigate", { url: `http://localhost:3333${r.path}` });
    await new Promise(res => setTimeout(res, 1500));

    const check = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const nav = document.querySelector('nav[aria-label="Navigasi Utama Pelanggan"]');
          if (!nav) return null;
          const activeTab = nav.querySelector('[aria-current="page"]');
          return {
            exists: true,
            activeLabel: activeTab ? activeTab.getAttribute('aria-label') : null
          };
        })()
      `,
      returnByValue: true
    });
    const checkVal = check.result?.value as EvalValue;
    assert(checkVal && checkVal.exists, `Bottom nav must exist on ${r.path}`);
    assert.strictEqual(checkVal.activeLabel, r.expectedLabel, `${r.expectedLabel} tab must be active on ${r.path}`);
    console.log(`  [PASS] ${r.path} renders bottom nav correctly with active tab "${r.expectedLabel}"`);
  }

  // --- Test 5: Refresh each intended customer page ---
  for (const r of routes) {
    console.log(`\n--- Test 5: Refresh on ${r.path} ---`);
    await send("Page.navigate", { url: `http://localhost:3333${r.path}` });
    await new Promise(res => setTimeout(res, 1000));
    await send("Page.reload");
    await new Promise(res => setTimeout(res, 1500));

    const check = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const nav = document.querySelector('nav[aria-label="Navigasi Utama Pelanggan"]');
          if (!nav) return null;
          const activeTab = nav.querySelector('[aria-current="page"]');
          return {
            exists: true,
            activeLabel: activeTab ? activeTab.getAttribute('aria-label') : null
          };
        })()
      `,
      returnByValue: true
    });
    const checkVal = check.result?.value as EvalValue;
    assert(checkVal && checkVal.exists, `Bottom nav must exist on refreshed ${r.path}`);
    assert.strictEqual(checkVal.activeLabel, r.expectedLabel, `${r.expectedLabel} tab must be active on refreshed ${r.path}`);
    console.log(`  [PASS] Refreshed ${r.path} maintains correct bottom nav state`);
  }

  // --- Test 6: Check for hydration mismatch warnings ---
  console.log("\n--- Test 6: Hydration mismatch verification ---");
  const hydrationErrors = consoleErrors.filter(e => e.toLowerCase().includes("hydration") || e.toLowerCase().includes("mismatch"));
  assert.strictEqual(hydrationErrors.length, 0, `Expected 0 hydration errors, got: ${hydrationErrors.join("; ")}`);
  console.log("  [PASS] 0 hydration errors/mismatches observed across all transitions");

  // --- Test 7: Mobile and desktop layout viewports ---
  console.log("\n--- Test 7: Mobile and desktop layout viewports ---");
  // Mobile (iPhone 14)
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send("Page.navigate", { url: "http://localhost:3333/home" });
  await new Promise(res => setTimeout(res, 1500));
  const mobileNav = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const el = document.querySelector('nav[aria-label="Navigasi Utama Pelanggan"]');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })()
    `,
    returnByValue: true
  });
  const mobileVal = mobileNav.result?.value as EvalValue;
  assert(mobileVal && mobileVal.width !== undefined && mobileVal.width > 0, "Nav must have positive width on mobile");
  console.log("  [PASS] Mobile viewport renders bottom nav properly (width: " + mobileVal.width + "px)");

  // Desktop (1280x800)
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:3333/home" });
  await new Promise(res => setTimeout(res, 1500));
  const desktopNav = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const el = document.querySelector('nav[aria-label="Navigasi Utama Pelanggan"]');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })()
    `,
    returnByValue: true
  });
  const desktopVal = desktopNav.result?.value as EvalValue;
  assert(desktopVal && desktopVal.width !== undefined && desktopVal.width > 0, "Nav must have positive width on desktop");
  console.log("  [PASS] Desktop viewport renders bottom nav properly (width: " + desktopVal.width + "px)");

  ws.close();
  console.log("\n================================================================================");
  console.log("TEST SUMMARY: All 7 Verification Scenarios PASSED (0 failures)!");
  console.log("================================================================================\n");
}

testAll().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});

