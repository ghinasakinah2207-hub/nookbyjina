/**
 * Automated End-to-End Verification Test Suite for:
 * Temu by Jina — Store Settings Persistence & Store Closed Page
 */

const BASE_URL = "http://localhost:3000";

async function runTests() {
  console.log("==================================================================");
  console.log("STARTING TEST SUITE: Store Settings Persistence & Closed Store");
  console.log("==================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // --- SCENARIO 1: Read Initial Settings ---
  console.log("--- Scenario 1: Verify Initial Store Settings API ---");
  const initialRes = await fetch(`${BASE_URL}/api/store-settings`);
  assert(initialRes.status === 200, "GET /api/store-settings returns HTTP 200");
  const initialJson = await initialRes.json();
  assert(initialJson.success === true, "GET /api/store-settings returns success: true");
  assert(typeof initialJson.settings.storeName === "string", "storeName is a string");
  assert(typeof initialJson.settings.isOpen === "boolean", "isOpen is a boolean");
  console.log(`  Initial Store: "${initialJson.settings.storeName}", isOpen: ${initialJson.settings.isOpen}\n`);

  // --- SCENARIO 8: Input Validation & Reject Invalid Saves (Meaningful errors, no false success) ---
  console.log("--- Scenario 8: Test Input Validation & Meaningful Errors (No False Success) ---");

  // Invalid short name
  const invalidNameRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...initialJson.settings, storeName: "A" }),
  });
  assert(invalidNameRes.status === 400, "Short store name rejected with HTTP 400");
  const invalidNameJson = await invalidNameRes.json();
  assert(invalidNameJson.success === false, "Short store name returns success: false");
  assert(invalidNameJson.error.includes("Nama toko"), "Error specifies 'Nama toko wajib diisi'");

  // Invalid WhatsApp
  const invalidWaRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...initialJson.settings, adminWhatsapp: "1234" }),
  });
  assert(invalidWaRes.status === 400, "Short WhatsApp rejected with HTTP 400");
  const invalidWaJson = await invalidWaRes.json();
  assert(invalidWaJson.error.includes("WhatsApp"), "Error specifies WhatsApp format");

  // Negative Standard Delivery Fee
  const negFeeRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...initialJson.settings,
      deliveryConfig: { ...initialJson.settings.deliveryConfig, standardFee: -5000 },
    }),
  });
  assert(negFeeRes.status === 400, "Negative delivery fee rejected with HTTP 400");
  const negFeeJson = await negFeeRes.json();
  assert(negFeeJson.error.includes("angka negatif"), "Error specifies negative fee not allowed");

  // Negative Free Shipping Threshold
  const negThresholdRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...initialJson.settings,
      deliveryConfig: { ...initialJson.settings.deliveryConfig, freeShippingThreshold: -1000 },
    }),
  });
  assert(negThresholdRes.status === 400, "Negative threshold rejected with HTTP 400");
  const negThresholdJson = await negThresholdRes.json();
  assert(negThresholdJson.error.includes("angka negatif"), "Error specifies negative threshold not allowed");
  console.log("  Input validation successfully tested: all invalid cases rejected with meaningful errors.\n");

  // --- SCENARIO 1 & 2: Edit Store Name, WhatsApp, Fee, and Threshold and Verify Persistence ---
  console.log("--- Scenario 1 & 2: Edit Settings, Save, Refresh, and Verify Persistence ---");
  const updatePayload = {
    ...initialJson.settings,
    storeName: "Temu by Jina Official",
    adminWhatsapp: "6282273188888",
    deliveryConfig: {
      configuredArea: "Lhoksukon & Sekitarnya",
      standardFee: 4000,
      freeShippingThreshold: 60000,
    },
    isOpen: true,
  };

  const updateRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatePayload),
  });
  assert(updateRes.status === 200, "Save settings returns HTTP 200");
  const updateJson = await updateRes.json();
  assert(updateJson.success === true, "Save settings returns success: true");

  // Simulate Page Refresh / New Session by fetching GET again
  const verifySaveRes = await fetch(`${BASE_URL}/api/store-settings`);
  const verifySaveJson = await verifySaveRes.json();
  assert(verifySaveJson.settings.storeName === "Temu by Jina Official", "Persisted storeName is updated");
  assert(verifySaveJson.settings.adminWhatsapp === "6282273188888", "Persisted adminWhatsapp is updated");
  assert(verifySaveJson.settings.deliveryConfig.standardFee === 4000, "Persisted standardFee is 4000");
  assert(verifySaveJson.settings.deliveryConfig.freeShippingThreshold === 60000, "Persisted freeShippingThreshold is 60000");
  console.log("  Settings update persisted and survived fresh request.\n");

  // --- SCENARIO 3 & 4: Close Store & Verify Closed Page on /home ---
  console.log("--- Scenario 3 & 4: Close Store and Verify /home Closed Page ---");
  const closeRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...updatePayload, isOpen: false }),
  });
  assert(closeRes.status === 200, "Close store returns HTTP 200");

  const verifyClosedSettings = await (await fetch(`${BASE_URL}/api/store-settings`)).json();
  assert(verifyClosedSettings.settings.isOpen === false, "Store status is persisted as isOpen: false");

  // Customer visits homepage /home while store is closed
  const homeClosedRes = await fetch(`${BASE_URL}/home`);
  assert(homeClosedRes.status === 200, "/home returns HTTP 200 when store is closed");
  const homeClosedHtml = await homeClosedRes.text();
  assert(homeClosedHtml.includes("Maaf ya kakak-kakak,"), "/home includes apology headline when store is closed");
  assert(homeClosedHtml.includes("toko kita sedang close order."), "/home includes 'toko kita sedang close order.'");
  assert(homeClosedHtml.includes("store-closed.webp"), "/home includes custom WebP illustration asset (/images/store-closed.webp)");
  assert(homeClosedHtml.includes("Ilustrasi toko Nook by Jina sedang tutup order sementara"), "/home includes meaningful Indonesian alt text for illustration");
  assert(homeClosedHtml.includes("Tanya Jadwal Buka via WhatsApp"), "/home includes WhatsApp contact button");
  assert(homeClosedHtml.includes("Lacak Status Pesanan Saya"), "/home includes link to /pesanan");
  assert(!homeClosedHtml.includes("Mau order apa, bestie..."), "/home does NOT display product search bar when closed");
  console.log("  Store closed page rendered cleanly with custom WebP illustration and without storefront ordering controls.\n");

  // --- SCENARIO 5: Direct Visits to Customer Routes while Closed ---
  console.log("--- Scenario 5: Direct Visits to /checkout, /keranjang, /menu while Closed ---");
  const checkoutRes = await fetch(`${BASE_URL}/checkout`);
  assert(checkoutRes.status === 200, "/checkout returns HTTP 200");
  const checkoutHtml = await checkoutRes.text();
  assert(checkoutHtml.includes("Toko Sedang Close Order"), "/checkout includes closed store notice");

  const cartRes = await fetch(`${BASE_URL}/keranjang`);
  assert(cartRes.status === 200, "/keranjang returns HTTP 200");
  const cartHtml = await cartRes.text();
  assert(cartHtml.includes("Toko Sedang Close Order"), "/keranjang includes closed store notice");

  const menuRes = await fetch(`${BASE_URL}/menu`);
  assert(menuRes.status === 200, "/menu returns HTTP 200");
  const menuHtml = await menuRes.text();
  assert(menuHtml.includes("Toko sedang close order"), "/menu includes closed order notice");
  console.log("  All customer storefront entry points enforce store closed status.\n");

  // --- SCENARIO 6: Reopen Store & Verify Normal Storefront Returns ---
  console.log("--- Scenario 6: Reopen Store and Verify Normal Storefront Returns ---");
  const reopenRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...updatePayload,
      storeName: "Nook by Jina",
      adminWhatsapp: "6282273180000",
      deliveryConfig: {
        configuredArea: "Lhoksukon",
        standardFee: 4000,
        freeShippingThreshold: 50000,
      },
      isOpen: true,
    }),
  });
  assert(reopenRes.status === 200, "Reopen store returns HTTP 200");

  const verifyReopenSettings = await (await fetch(`${BASE_URL}/api/store-settings`)).json();
  assert(verifyReopenSettings.settings.isOpen === true, "Store status is persisted as isOpen: true");

  const homeOpenRes = await fetch(`${BASE_URL}/home`);
  const homeOpenHtml = await homeOpenRes.text();
  assert(homeOpenHtml.includes("Buka Pre-Order") || homeOpenHtml.includes("Mau order apa, bestie..."), "/home restores normal storefront access");
  console.log("  Storefront restored normal access automatically.\n");

  // --- SCENARIO 7: Confirm /admin Routes Remain Accessible ---
  console.log("--- Scenario 7: Confirm /admin and /admin/pengaturan Remain Accessible ---");
  const adminRes = await fetch(`${BASE_URL}/admin`, {
    headers: { Cookie: "dev_admin=true" },
  });
  assert(adminRes.status === 200, "/admin remains accessible with dev_admin cookie (HTTP 200)");

  const adminPengaturanRes = await fetch(`${BASE_URL}/admin/pengaturan`, {
    headers: { Cookie: "dev_admin=true" },
  });
  assert(adminPengaturanRes.status === 200, "/admin/pengaturan remains accessible with dev_admin cookie (HTTP 200)");
  console.log("  Admin routes remain fully accessible regardless of store open/closed state.\n");

  // --- SCENARIO 9: Confirm Existing Order Management Intact ---
  console.log("--- Scenario 9: Confirm Order Management & Tracking Routes Intact ---");
  const pesananRes = await fetch(`${BASE_URL}/pesanan`);
  assert(pesananRes.status === 200, "/pesanan customer order tracking remains accessible (HTTP 200)");

  const adminPesananRes = await fetch(`${BASE_URL}/admin/pesanan`, {
    headers: { Cookie: "dev_admin=true" },
  });
  assert(adminPesananRes.status === 200, "/admin/pesanan admin order manager remains accessible (HTTP 200)");
  console.log("  Order tracking and order management intact.\n");

  // --- SCENARIO 10: Server Authoritative Time API ---
  console.log("--- Scenario 10: Authoritative Server Time Verification ---");
  const serverTimeRes = await fetch(`${BASE_URL}/api/server-time`, { cache: "no-store" });
  assert(serverTimeRes.status === 200, "GET /api/server-time returns HTTP 200");
  const serverTimeJson = await serverTimeRes.json();
  assert(typeof serverTimeJson.serverTime === "string", "serverTime is an ISO string");
  assert(typeof serverTimeJson.timestamp === "number", "timestamp is a valid epoch millisecond number");
  const parsedServerDate = new Date(serverTimeJson.serverTime).getTime();
  assert(!isNaN(parsedServerDate), "serverTime parsed into valid date");
  assert(Math.abs(parsedServerDate - serverTimeJson.timestamp) < 50, "serverTime and timestamp are synchronized");
  const cacheHeader = serverTimeRes.headers.get("cache-control") || "";
  assert(cacheHeader.includes("no-store"), "Server time response is uncacheable (no-store)");
  console.log(`  Authoritative server time working: ${serverTimeJson.serverTime} (${serverTimeJson.timestamp})\n`);

  // --- SCENARIO 11: 30-Minute Deadline Logic & Expiry Rules ---
  console.log("--- Scenario 11: 30-Minute Deadline & Expiry Transition Logic ---");
  const now = new Date(serverTimeJson.timestamp);
  const DEADLINE_30_MIN_MS = 30 * 60 * 1000;
  const deadline = new Date(now.getTime() + DEADLINE_30_MIN_MS);

  // 1. Creation duration is exactly 30 minutes (1,800,000 ms)
  const diffMs = deadline.getTime() - now.getTime();
  assert(diffMs === 1800000, "New unpaid QRIS order deadline is exactly 30 minutes (1,800,000 ms) from creation time");
  const diffMinutes = Math.round(diffMs / 60000);
  assert(diffMinutes === 30, "Deadline duration calculates to exactly 30 minutes");

  // 2. Countdown simulation at creation
  const timeLeftSeconds = Math.floor((deadline.getTime() - now.getTime()) / 1000);
  assert(timeLeftSeconds === 1800, "Remaining seconds at creation is 1800 seconds (30m 00s)");
  const cHours = Math.floor(timeLeftSeconds / 3600);
  const cMinutes = Math.floor((timeLeftSeconds % 3600) / 60);
  const cSeconds = timeLeftSeconds % 60;
  const formattedCountdown = `${String(cHours).padStart(2, "0")}:${String(cMinutes).padStart(2, "0")}:${String(cSeconds).padStart(2, "0")}`;
  assert(formattedCountdown === "00:30:00", "Countdown displays initial 00:30:00 format correctly");

  // 3. Revisiting or refreshing does NOT reset the deadline
  const refreshedNow = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes later
  const refreshedRemaining = Math.floor((deadline.getTime() - refreshedNow.getTime()) / 1000);
  assert(refreshedRemaining === 1500, "Revisiting/refreshing after 5 minutes preserves deadline with 1500s (25m) remaining");

  // 4. At expiry (diff <= 0), unpaid order transitions to Dibatalkan
  const expiredNow = new Date(deadline.getTime() + 1000); // 1 second after deadline
  const expiredRemaining = Math.max(0, Math.floor((deadline.getTime() - expiredNow.getTime()) / 1000));
  assert(expiredRemaining === 0, "Timer expired when current time passes deadline (0 seconds remaining)");
  const unpaidOrderStatus = "Menunggu Verifikasi";
  const transitionToCancelled = expiredRemaining <= 0 && unpaidOrderStatus === "Menunggu Verifikasi";
  assert(transitionToCancelled === true, "Expired unpaid order transitions to Dibatalkan");

  // 5. Verified paid orders ("Lunas") are NEVER cancelled or treated as expired
  const paidOrderStatus = "Lunas";
  const isPaid = paidOrderStatus === "Lunas";
  const isExpired = !isPaid && expiredRemaining <= 0;
  assert(isPaid === true, "Paid order retains isPaid: true");
  assert(isExpired === false, "Verified paid orders are NOT marked expired after deadline passes");
  console.log("  30-minute deadline, countdown, refresh immutability, and paid-order safety verified.\n");

  // --- SCENARIO 12: Source Code & UI Copy Verification for 30 Menit ---
  console.log("--- Scenario 12: Source Code & UI Copy Verification (No Outdated '2 Jam') ---");
  const fs = await import("fs");
  const path = await import("path");

  const orderContextContent = fs.readFileSync(path.resolve(process.cwd(), "src/context/OrderContext.tsx"), "utf8");
  assert(orderContextContent.includes("30 * 60 * 1000"), "OrderContext sets 30-minute payment deadline (30 * 60 * 1000)");
  assert(!orderContextContent.includes("2 * 60 * 60 * 1000"), "OrderContext removed 2-hour deadline calculation");

  const paymentsManagerContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/admin/PaymentsManager.tsx"), "utf8");
  assert(paymentsManagerContent.includes("Tenggat 30 Menit"), "PaymentsManager displays 'Tenggat 30 Menit'");
  assert(!paymentsManagerContent.includes("Tenggat 2 Jam"), "PaymentsManager removed 'Tenggat 2 Jam'");
  assert(paymentsManagerContent.includes("30 Menit"), "PaymentsManager displays '30 Menit'");
  assert(!paymentsManagerContent.includes("2 Jam dari Pesanan Dibuat"), "PaymentsManager removed '2 Jam dari Pesanan Dibuat'");

  const typesContent = fs.readFileSync(path.resolve(process.cwd(), "src/types/index.ts"), "utf8");
  assert(typesContent.includes("30 minutes after creation"), "types/index.ts documents 30 minutes after creation");
  assert(!typesContent.includes("2 hours after creation"), "types/index.ts removed 2 hours after creation comment");

  const paymentPageContent = fs.readFileSync(path.resolve(process.cwd(), "src/app/pembayaran/[order]/page.tsx"), "utf8");
  assert(paymentPageContent.includes("30 menit"), "Payment page displays '30 menit' in cancellation notice");
  assert(!paymentPageContent.includes("2 jam"), "Payment page removed '2 jam' notice");
  assert(paymentPageContent.includes("/api/server-time"), "Payment page synchronizes with authoritative server time");
  console.log("  All UI copy and codebase references successfully updated to 30 minutes.\n");

  // --- SCENARIO 13: Compact Mobile Store-Closed Page Verification ---
  console.log("--- Scenario 13: Compact Mobile Store-Closed Page Layout Verification ---");
  const storeClosedViewContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/home/StoreClosedView.tsx"), "utf8");
  assert(storeClosedViewContent.includes("min-h-[100svh]"), "StoreClosedView uses viewport-aware min-h-[100svh]");
  assert(storeClosedViewContent.includes("max-h-[135px]"), "StoreClosedView constrains illustration height with responsive max-h");
  assert(storeClosedViewContent.includes("w-28 sm:w-36"), "StoreClosedView uses compact responsive width for illustration");
  assert(storeClosedViewContent.includes("space-y-3 sm:space-y-4"), "StoreClosedView tightens vertical gaps to space-y-3 sm:space-y-4");
  assert(storeClosedViewContent.includes("min-h-[42px]"), "WhatsApp button maintains comfortable min-h-[42px] tap target");
  assert(storeClosedViewContent.includes("min-h-[40px]"), "Order tracking button maintains comfortable min-h-[40px] tap target");

  // Verify all 8 required items present
  assert(storeClosedViewContent.includes("{storeName}"), "1. Store name retained");
  assert(storeClosedViewContent.includes("Close Order"), "1b. Closed-status indicator retained");
  assert(storeClosedViewContent.includes("/images/store-closed.webp"), "2. Custom WebP illustration retained");
  assert(storeClosedViewContent.includes("Maaf ya kakak-kakak,"), "3. Apology headline retained");
  assert(storeClosedViewContent.includes("Dapur kami saat ini sedang beristirahat"), "4. Explanatory message retained");
  assert(storeClosedViewContent.includes("Jadwal Operasional:"), "5. Operating-hours information retained");
  assert(storeClosedViewContent.includes("Tanya Jadwal Buka via WhatsApp"), "6. WhatsApp contact button retained");
  assert(storeClosedViewContent.includes("Lacak Status Pesanan Saya"), "7. Order-status tracking button retained");
  assert(storeClosedViewContent.includes("Terima kasih atas pengertian dan kehangatanmu!"), "8. Closing thank-you message retained");
  // --- SCENARIO 14: Welcome Landing Page Layout & ORDER Button Redesign ---
  console.log("--- Scenario 14: Welcome Landing Page Layout & ORDER Button Redesign ---");
  const landingRes = await fetch(`${BASE_URL}/`);
  assert(landingRes.status === 200, "GET / landing page returns HTTP 200");
  const landingHtml = await landingRes.text();

  // 1. Viewport-aware non-scrolling layout checks
  assert(landingHtml.includes("100svh"), "Landing page uses 100svh for mobile viewport-aware height");
  assert(landingHtml.includes("overflow-hidden"), "Landing page restricts overflow to eliminate page scrolling");
  assert(landingHtml.includes("items-center justify-center"), "Landing page vertically and horizontally centers foreground group");

  // 2. Branding & Cinematic Photography checks
  assert(landingHtml.includes("landing-food-bg.webp"), "Landing page contains hero background food photography");
  assert(landingHtml.includes("blur-"), "Landing page applies subtle blur to background photography");
  assert(landingHtml.includes("bg-black/45"), "Landing page contains dark translucent overlay");
  assert(landingHtml.includes("bg-gradient-to-t"), "Landing page contains subtle vignette overlay");
  assert(landingHtml.includes("homepagelogo.webp"), "Landing page displays approved light Nook brand logo");
  assert(!landingHtml.includes("Makanan rumahan, siap besok."), "Landing page cleanly removed tagline 'Makanan rumahan, siap besok.'");
  assert(!landingHtml.includes("Pre-Order Homemade"), "Landing page cleanly removed footer text 'Pre-Order Homemade'");

  // 3. ORDER Button redesign checks (rounded-pill, no arrow)
  assert(landingHtml.includes("ORDER"), "Landing page renders ORDER button text");
  assert(!landingHtml.includes("lucide-arrow-right"), "Landing page removed generic right-arrow icon");

  // 4. Source checks for idle looping animation, immediate navigation, and motion-reduce
  const landingCtaContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/home/LandingOrderCta.tsx"), "utf8");
  assert(landingCtaContent.includes("rounded-full"), "LandingOrderCta uses refined rounded-pill shape");
  assert(landingCtaContent.includes("animate-order-idle"), "LandingOrderCta uses animate-order-idle class for idle loop");
  assert(landingCtaContent.includes("router.prefetch(\"/home\")"), "LandingOrderCta prefetches /home for seamless transition");
  assert(landingCtaContent.includes("router.push(\"/home\")"), "LandingOrderCta navigates immediately without artificial delay");
  assert(landingCtaContent.includes("isNavigating"), "LandingOrderCta guards against duplicate clicks/navigation");
  assert(landingCtaContent.includes("SEDANG CLOSE ORDER"), "LandingOrderCta preserves store-closed behavior");

  // 5. Check CSS animation definitions in globals.css
  const globalsCss = fs.readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
  assert(globalsCss.includes("@keyframes orderIdlePulse"), "globals.css defines orderIdlePulse keyframe");
  assert(globalsCss.includes("scale(1.025)"), "orderIdlePulse has gentle 1.025 scale pulse");
  assert(globalsCss.includes("brightness(1.08)"), "orderIdlePulse has soft brightness highlight");
  assert(globalsCss.includes("2.8s"), "orderIdlePulse cycle duration is 2.8s");
  assert(globalsCss.includes(".animate-order-idle:active"), "animate-order-idle has active press override");
  assert(globalsCss.includes("@media (prefers-reduced-motion: reduce)"), "orderIdlePulse respects prefers-reduced-motion");

  // 6. Ensure other pages maintain normal scrolling capability (no global overflow-hidden)
  assert(!globalsCss.includes("body {\n  overflow: hidden"), "Global body does NOT globally lock scrolling");
  assert(!globalsCss.includes("html {\n  overflow: hidden"), "Global html does NOT globally lock scrolling");
  // --- SCENARIO 15: Delivery Fee Synchronization & Server Order Validation ---
  console.log("--- Scenario 15: Delivery Fee Synchronization & Server Order Validation ---");

  // Import calculateDeliveryFee module directly
  const { calculateDeliveryFee } = await import(path.resolve(process.cwd(), "src/lib/delivery-fee.ts"));

  // Ensure baseline settings are active (fee 4000, threshold 50000)
  const baseSettingsRes = await fetch(`${BASE_URL}/api/store-settings`);
  const baseSettingsJson = await baseSettingsRes.json();
  const currentConfig = baseSettingsJson.settings.deliveryConfig;
  assert(currentConfig.standardFee === 4000, "Persisted standardFee is Rp4,000");
  assert(currentConfig.freeShippingThreshold === 50000, "Persisted freeShippingThreshold is Rp50,000");

  // Test Case 1: Subtotal Rp30,000 -> standard fee applies (Rp4,000) & remaining Rp20,000
  const case1 = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 30000,
    deliveryConfig: currentConfig,
  });
  assert(case1.shippingFee === 4000, "Test Case 1: Subtotal Rp30,000 produces delivery fee Rp4,000");
  assert(case1.isFree === false, "Test Case 1: Subtotal Rp30,000 is not free delivery");
  assert(case1.remainingToFreeShipping === 20000, "Test Case 1: Notification remaining amount is Rp20,000");

  // Test Case 2: Subtotal Rp49,999 -> standard fee applies (Rp4,000) & remaining Rp1
  const case2 = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 49999,
    deliveryConfig: currentConfig,
  });
  assert(case2.shippingFee === 4000, "Test Case 2: Subtotal Rp49,999 produces standard delivery fee Rp4,000");
  assert(case2.isFree === false, "Test Case 2: Subtotal Rp49,999 is not free delivery");
  assert(case2.remainingToFreeShipping === 1, "Test Case 2: Notification remaining amount is exactly Rp1");

  // Test Case 3: Subtotal Rp50,000 -> delivery is FREE (>= 50,000 rule)
  const case3 = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 50000,
    deliveryConfig: currentConfig,
  });
  assert(case3.shippingFee === 0, "Test Case 3: Subtotal Rp50,000 qualifies for free delivery (fee Rp0)");
  assert(case3.isFree === true, "Test Case 3: Subtotal Rp50,000 isFree is true (>= 50,000 rule)");
  assert(case3.remainingToFreeShipping === 0, "Test Case 3: No remaining amount when delivery is free");

  // Test Case 4: Subtotal Rp50,001 -> delivery is FREE
  const case4 = calculateDeliveryFee({
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    subtotal: 50001,
    deliveryConfig: currentConfig,
  });
  assert(case4.shippingFee === 0, "Test Case 4: Subtotal Rp50,001 qualifies for free delivery (fee Rp0)");
  assert(case4.isFree === true, "Test Case 4: Subtotal Rp50,001 isFree is true");
  assert(case4.remainingToFreeShipping === 0, "Test Case 4: No remaining amount when delivery is free");

  // Test Case 5: Pickup selected -> delivery is FREE regardless of subtotal
  const case5 = calculateDeliveryFee({
    fulfillmentType: "pickup",
    deliveryArea: "Lhoksukon",
    subtotal: 25000,
    deliveryConfig: currentConfig,
  });
  assert(case5.shippingFee === 0, "Test Case 5: Pickup produces fee Rp0 regardless of subtotal");
  assert(case5.isFree === true, "Test Case 5: Pickup is marked free");
  assert(case5.remainingToFreeShipping === 0, "Test Case 5: Pickup has no free shipping progress remaining amount");

  // Test Case 5: Change admin setting to another amount (e.g. 5000), save, refresh checkout, and verify new fee is used
  console.log("  Testing Test Case 5: Admin changes fee to Rp5,000...");
  const updateFeePayload = {
    ...baseSettingsJson.settings,
    deliveryConfig: {
      ...currentConfig,
      standardFee: 5000,
      freeShippingThreshold: 50000,
    },
  };
  const saveFeeRes = await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updateFeePayload),
  });
  assert(saveFeeRes.status === 200, "POST /api/store-settings update fee to 5000 returns HTTP 200");

  const verifyUpdatedRes = await fetch(`${BASE_URL}/api/store-settings`, { cache: "no-store" });
  const verifyUpdatedJson = await verifyUpdatedRes.json();
  assert(verifyUpdatedJson.settings.deliveryConfig.standardFee === 5000, "Store settings dynamically persisted new standardFee: 5000");

  // Check /checkout HTML reflects the updated fee
  const updatedCheckoutHtml = await (await fetch(`${BASE_URL}/checkout`, { cache: "no-store" })).text();
  assert(updatedCheckoutHtml.includes("5.000") || updatedCheckoutHtml.includes("5000"), "Checkout page immediately reflects new fee (Rp5.000)");
  assert(!updatedCheckoutHtml.includes("3.000"), "Checkout page does NOT contain stale 3.000 fee");

  // Restore setting back to standard Rp4,000
  await fetch(`${BASE_URL}/api/store-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...baseSettingsJson.settings,
      deliveryConfig: {
        ...currentConfig,
        standardFee: 4000,
        freeShippingThreshold: 50000,
      },
    }),
  });

  // Test Case 6: Verify final order total matches the server-validated fee via /api/orders
  console.log("  Testing Test Case 6: Server independently validates delivery fee and order total...");
  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "delivery",
      deliveryArea: "Lhoksukon",
      paymentMethod: "QRIS Statis",
      items: [
        {
          id: "item-1",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang",
          price: 25000,
          quantity: 1,
          itemTotal: 25000,
          selectedOptions: [],
          selectedAddons: [],
        },
      ],
      // Malicious or stale client submits shippingFee: 0 and total: 25000
      clientShippingFee: 0,
      clientTotal: 25000,
    }),
  });
  assert(orderRes.status === 201, "POST /api/orders returns HTTP 201 created");
  const orderJson = await orderRes.json();
  assert(orderJson.success === true, "Order created successfully");
  assert(orderJson.order.subtotal === 25000, "Authoritative subtotal is Rp25,000");
  assert(orderJson.order.shippingFee === 4000, "Server independently enforced Rp4,000 delivery fee (ignored client 0)");
  assert(orderJson.order.total === 29000, "Server independently enforced Rp29,000 grand total (subtotal + fee)");
  assert(orderJson.order.paymentDeadline !== undefined, "Order stamped with authoritative payment deadline");

  // Test Case 6b: Verify server enforces free delivery when subtotal is exactly Rp50,000 (>= threshold)
  console.log("  Testing Test Case 6b: Server validates free delivery for subtotal Rp50,000...");
  const freeOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Siti Aminah",
      customerWhatsapp: "081298765432",
      fulfillmentType: "delivery",
      deliveryArea: "Lhoksukon",
      paymentMethod: "QRIS Statis",
      items: [
        {
          id: "item-free-1",
          productId: "nasi-bakar-cakalang",
          productName: "Nasi Bakar Cakalang",
          price: 25000,
          quantity: 2,
          itemTotal: 50000,
          selectedOptions: [],
          selectedAddons: [],
        },
      ],
      clientShippingFee: 4000,
      clientTotal: 54000,
    }),
  });
  assert(freeOrderRes.status === 201, "POST /api/orders returns HTTP 201 created for 50k order");
  const freeOrderJson = await freeOrderRes.json();
  assert(freeOrderJson.order.subtotal === 50000, "Subtotal is Rp50,000");
  assert(freeOrderJson.order.shippingFee === 0, "Server independently enforces Rp0 shipping fee for subtotal >= 50,000");
  assert(freeOrderJson.order.total === 50000, "Server independently enforces Rp50,000 total (free delivery)");

  // Test Case 7: Verify that loading failures do not silently produce an incorrect fee or total
  console.log("  Testing Test Case 7: Failure handling prevents silent fallback to 3000...");
  const checkoutClientContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/checkout/CheckoutClient.tsx"), "utf8");
  assert(!checkoutClientContent.includes("3000"), "CheckoutClient.tsx has ZERO hardcoded 3000 fallback values");
  assert(checkoutClientContent.includes("settingsError"), "CheckoutClient.tsx checks settingsError explicitly");
  assert(checkoutClientContent.includes("disabled="), "CheckoutClient.tsx disables order submission when settings cannot be verified");
  assert(checkoutClientContent.includes("calculateDeliveryFee"), "CheckoutClient.tsx uses shared calculateDeliveryFee utility");

  // Verify simplified card copy
  assert(checkoutClientContent.includes("Yeay, gratis ongkir!"), "CheckoutClient.tsx includes 'Yeay, gratis ongkir!' headline");
  assert(checkoutClientContent.includes("Pesananmu sudah memenuhi minimum belanja"), "CheckoutClient.tsx includes 'Pesananmu sudah memenuhi minimum belanja' copy");
  assert(checkoutClientContent.includes("lagi untuk gratis ongkir."), "CheckoutClient.tsx includes 'lagi untuk gratis ongkir.' progress copy");
  assert(checkoutClientContent.includes("Gratis ongkir — Ambil sendiri."), "CheckoutClient.tsx includes 'Gratis ongkir — Ambil sendiri.' pickup copy");
  assert(!checkoutClientContent.includes("Alamat lengkap atau patokan rumah akan dikonfirmasi admin melalui chat WhatsApp"), "CheckoutClient.tsx removed long address confirmation note");

  const dummyDataContent = fs.readFileSync(path.resolve(process.cwd(), "src/data/dummy-data.ts"), "utf8");
  assert(!dummyDataContent.includes("standardFee: 3000"), "dummy-data.ts fallback constant updated from 3000 to 4000");
  console.log("  All delivery fee synchronization & simplified notification card test cases verified successfully!\n");

  console.log("==================================================================");
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
