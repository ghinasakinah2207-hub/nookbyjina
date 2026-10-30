import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CartVariationModal } from "../components/cart/CartVariationModal";
import { CartItem, Product } from "../types";

function testCartClientLayout() {
  const cartClientPath = path.resolve(
    process.cwd(),
    "src/components/cart/CartClient.tsx"
  );
  assert(fs.existsSync(cartClientPath), "CartClient.tsx must exist");
  const cartSrc = fs.readFileSync(cartClientPath, "utf-8");

  // 1. Store Header
  assert(
    cartSrc.includes("Nook By Jina"),
    "Cart must include store name 'Nook By Jina'"
  );
  assert(
    cartSrc.includes(">nook<") || cartSrc.includes("nook"),
    "Cart must include 'nook' brand badge"
  );
  // Verify store card header does not have Hapus Semua
  const storeHeaderSnippet = cartSrc.slice(
    cartSrc.indexOf("{/* Store Header"),
    cartSrc.indexOf("{/* Cart Items List")
  );
  assert(
    !storeHeaderSnippet.includes("Hapus Semua"),
    "Store card header must not contain 'Hapus Semua'"
  );
  // Verify main header still retains Hapus Semua
  const mainHeaderSnippet = cartSrc.slice(
    cartSrc.indexOf("<Header"),
    cartSrc.indexOf("{/* Confirmation Dialog")
  );
  assert(
    mainHeaderSnippet.includes("Hapus Semua"),
    "Main cart header must retain 'Hapus Semua' action"
  );

  // 2. Subtotal and /porsi removal
  assert(
    !cartSrc.includes("/ porsi") && !cartSrc.includes("/porsi"),
    "Cart must remove '/porsi' suffix from item price"
  );
  assert(
    !cartSrc.includes("Subtotal: {"),
    "Cart must remove per-item Subtotal row"
  );

  // 3. Variation dropdown control
  assert(
    cartSrc.includes("ChevronDown"),
    "Cart must include ChevronDown for variation dropdown"
  );
  assert(
    cartSrc.includes("handleOpenVariationModal"),
    "Cart must provide handleOpenVariationModal on variation selector"
  );

  // 4. Quantity controls aligned with price
  assert(
    cartSrc.includes("updateQuantity(item.id, item.quantity - 1)") &&
      cartSrc.includes("updateQuantity(item.id, item.quantity + 1)"),
    "Cart must have minus and plus quantity controls"
  );

  // 5. Variation Modal integration
  assert(
    cartSrc.includes("CartVariationModal"),
    "Cart must render CartVariationModal"
  );

  // 6. Checkout summary preserved & simplified
  assert(
    cartSrc.includes("Total Pembayaran"),
    "Cart must preserve 'Total Pembayaran'"
  );
  assert(
    cartSrc.includes('"Checkout"') || cartSrc.includes(">Checkout<"),
    "Cart must display simplified 'Checkout' button label"
  );
  assert(
    !cartSrc.includes("Lanjut ke Checkout"),
    "Cart must not contain 'Lanjut ke Checkout'"
  );
  assert(
    !cartSrc.includes("ArrowRight"),
    "Cart checkout button must remove ArrowRight icon"
  );

  console.log("✓ CartClient conforms to Shopee-inspired layout requirements");
}

function testVariationModalRendering() {
  const dummyProduct: Product = {
    id: "test-prod-1",
    slug: "test-prod-1",
    name: "Sawi Roll Tahu",
    description: "Delicious test food",
    categoryId: "cat-makanan",
    categoryName: "Makanan",
    basePrice: 10000,
    isAvailable: true,
    images: ["/images/hero-food.webp"],
    optionGroups: [
      {
        id: "opt-porsi",
        name: "Porsi",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        values: [
          { id: "val-4pcs", name: "4 Pcs", priceDelta: 0 },
          { id: "val-6pcs", name: "6 Pcs", priceDelta: 5000 },
        ],
      },
      {
        id: "opt-pedas",
        name: "Level Pedas",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        values: [
          { id: "val-sedang", name: "Sedang", priceDelta: 0 },
          { id: "val-pedas", name: "Pedas", priceDelta: 2000 },
        ],
      },
    ],
    addons: [
      { id: "add-kerupuk", name: "Kerupuk Gurih", price: 3000 },
    ],
  };

  const dummyCartItem: CartItem = {
    id: "test-prod-1___opts:opt-pedas:val-sedang|opt-porsi:val-4pcs___addons:___note:",
    productId: "test-prod-1",
    productName: "Sawi Roll Tahu",
    productImage: "/images/hero-food.webp",
    basePrice: 10000,
    selectedOptions: [
      {
        groupId: "opt-porsi",
        groupName: "Porsi",
        valueId: "val-4pcs",
        valueName: "4 Pcs",
        priceDelta: 0,
      },
      {
        groupId: "opt-pedas",
        groupName: "Level Pedas",
        valueId: "val-sedang",
        valueName: "Sedang",
        priceDelta: 0,
      },
    ],
    selectedAddons: [],
    itemNote: "",
    quantity: 1,
    unitPrice: 10000,
    itemTotal: 10000,
    isAvailable: true,
  };

  const html = renderToStaticMarkup(
    React.createElement(CartVariationModal, {
      isOpen: true,
      cartItem: dummyCartItem,
      product: dummyProduct,
      onClose: () => {},
      onConfirm: () => {},
    })
  );

  assert(html.includes("Sawi Roll Tahu"), "Modal must show product name");
  assert(html.includes("Porsi"), "Modal must show option group 'Porsi'");
  assert(html.includes("Level Pedas"), "Modal must show option group 'Level Pedas'");
  assert(html.includes("4 Pcs"), "Modal must show value '4 Pcs'");
  assert(html.includes("Konfirmasi"), "Modal must show 'Konfirmasi' button");
  assert(
    !html.includes("Konfirmasi •") && !html.includes("Konfirmasi ·"),
    "Modal confirm button must not display price"
  );
  assert(html.includes("Tambahan"), "Modal must show 'Tambahan'");
  assert(html.includes("Kerupuk Gurih"), "Modal must show addon 'Kerupuk Gurih'");

  console.log("✓ CartVariationModal renders options, add-ons, quantity, and confirmation button");
}

function runAll() {
  console.log("--- Starting Shopee-Inspired Cart Redesign Verification ---");
  testCartClientLayout();
  testVariationModalRendering();
  console.log("--- All Shopee Cart Redesign Verifications Passed! ---");
}

runAll();
