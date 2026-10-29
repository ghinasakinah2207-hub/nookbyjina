import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HomeSkeleton,
  MenuSkeleton,
  CartSkeleton,
  OrdersSkeleton,
} from "../components/ui/CustomerSkeletons";

function testLoadingFilesExist() {
  const routes = ["home", "menu", "keranjang", "pesanan"];
  for (const route of routes) {
    const filePath = path.resolve(process.cwd(), `src/app/${route}/loading.tsx`);
    assert(fs.existsSync(filePath), `Route loading file missing: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf-8");
    assert(
      content.includes("Skeleton"),
      `loading.tsx for ${route} does not reference a Skeleton`
    );
  }
  console.log("✓ All 4 route loading.tsx files exist and reference skeletons");
}

function testSkeletonRendering() {
  // Test HomeSkeleton
  const homeHtml = renderToStaticMarkup(React.createElement(HomeSkeleton));
  assert(homeHtml.includes("animate-pulse"), "HomeSkeleton missing animate-pulse");
  assert(
    homeHtml.includes("motion-reduce:animate-none"),
    "HomeSkeleton missing motion-reduce:animate-none"
  );
  assert(
    !homeHtml.includes("aria-label=\"Home\""),
    "HomeSkeleton must not duplicate BottomNavigation"
  );

  // Test MenuSkeleton
  const menuHtml = renderToStaticMarkup(React.createElement(MenuSkeleton));
  assert(menuHtml.includes("animate-pulse"), "MenuSkeleton missing animate-pulse");
  assert(
    menuHtml.includes("motion-reduce:animate-none"),
    "MenuSkeleton missing motion-reduce:animate-none"
  );
  assert(
    !menuHtml.includes("aria-label=\"Menu\""),
    "MenuSkeleton must not duplicate BottomNavigation"
  );

  // Test CartSkeleton (full and embedded)
  const cartHtml = renderToStaticMarkup(React.createElement(CartSkeleton));
  assert(cartHtml.includes("animate-pulse"), "CartSkeleton missing animate-pulse");
  assert(
    cartHtml.includes("calc(4.25rem + env(safe-area-inset-bottom, 0px))"),
    "CartSkeleton checkout bar offset must match CartClient (calc(4.25rem + env(safe-area-inset-bottom, 0px)))"
  );

  const cartEmbeddedHtml = renderToStaticMarkup(
    React.createElement(CartSkeleton, { showHeader: false })
  );
  assert(
    !cartEmbeddedHtml.includes("<header"),
    "CartSkeleton with showHeader=false must not render header"
  );

  // Test OrdersSkeleton (full and embedded)
  const ordersHtml = renderToStaticMarkup(React.createElement(OrdersSkeleton));
  assert(ordersHtml.includes("animate-pulse"), "OrdersSkeleton missing animate-pulse");

  const ordersEmbeddedHtml = renderToStaticMarkup(
    React.createElement(OrdersSkeleton, { showHeader: false })
  );
  assert(
    !ordersEmbeddedHtml.includes("<header"),
    "OrdersSkeleton with showHeader=false must not render header"
  );

  console.log("✓ All skeletons render with correct accessibility classes, responsive layout, and no duplicate navigation");
}

function testHydrationIntegrations() {
  const cartClientPath = path.resolve(
    process.cwd(),
    "src/components/cart/CartClient.tsx"
  );
  const cartClientSrc = fs.readFileSync(cartClientPath, "utf-8");
  assert(
    cartClientSrc.includes("CartSkeleton"),
    "CartClient.tsx must import CartSkeleton"
  );
  assert(
    cartClientSrc.includes("!isHydrated ? ("),
    "CartClient.tsx must handle !isHydrated to prevent empty state flash"
  );

  const pesananPagePath = path.resolve(
    process.cwd(),
    "src/app/pesanan/page.tsx"
  );
  const pesananPageSrc = fs.readFileSync(pesananPagePath, "utf-8");
  assert(
    pesananPageSrc.includes("OrdersSkeleton"),
    "pesanan/page.tsx must import OrdersSkeleton"
  );
  assert(
    !pesananPageSrc.includes("Memuat riwayat pesanan..."),
    "pesanan/page.tsx must replace plain text loader with OrdersSkeleton"
  );

  console.log("✓ In-page hydration skeletons correctly integrated in CartClient and OrderHistoryPage");
}

function runAll() {
  console.log("--- Starting Customer Loading Skeletons Verification ---");
  testLoadingFilesExist();
  testSkeletonRendering();
  testHydrationIntegrations();
  console.log("--- All Customer Loading Skeleton Checks Passed! ---");
}

runAll();

