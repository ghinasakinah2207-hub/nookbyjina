import fs from "fs";
import path from "path";
import assert from "assert";

console.log("================================================================================");
console.log("TEST SUITE: Product Detail Bottom Action Bar Refinements & 50/50 Dual CTAs");
console.log("================================================================================");

const productDetailPath = path.resolve(process.cwd(), "src/components/product/ProductDetailClient.tsx");
const quickAddPath = path.resolve(process.cwd(), "src/components/product/QuickAddModal.tsx");
const whatsAppIconPath = path.resolve(process.cwd(), "src/components/ui/WhatsAppIcon.tsx");

const productDetailSrc = fs.readFileSync(productDetailPath, "utf-8");
const quickAddSrc = fs.readFileSync(quickAddPath, "utf-8");
const whatsAppIconSrc = fs.readFileSync(whatsAppIconPath, "utf-8");

console.log("\n--- Section 1: WhatsApp Official Brand Icon ---");

// 1. WhatsApp icon component exists in ui
assert(whatsAppIconSrc.includes("export function WhatsAppIcon"), "WhatsAppIcon is exported as reusable component");
assert(whatsAppIconSrc.includes("fill=\"currentColor\""), "WhatsAppIcon uses fill='currentColor' for flexible styling");
console.log("  [PASS] Reusable WhatsApp brand icon component exists");

// 2. Action 1 uses WhatsAppIcon instead of generic MessageCircle
assert(productDetailSrc.includes("<WhatsAppIcon"), "Action 1 uses WhatsAppIcon component");
assert(!productDetailSrc.includes("<MessageCircle"), "Generic MessageCircle is completely removed from ProductDetailClient");
assert(productDetailSrc.includes("sellerChatUrl"), "Action 1 preserves seller WhatsApp chat URL");
console.log("  [PASS] Action 1 uses official WhatsApp brand icon with preserved URL and styling");

console.log("\n--- Section 2: 50/50 Balanced Dual CTA Buttons ---");

// Extract the sticky bottom bar section
const bottomBarIdx = productDetailSrc.indexOf("Sticky Bottom Purchase Action Bar");
const modalIdx = productDetailSrc.indexOf("Bottom-Sheet Variation Modal");
const bottomBarSection = productDetailSrc.slice(bottomBarIdx, modalIdx);

// 3. Cart icon-only button is removed
assert(!bottomBarSection.includes("Action 2: Add to Cart (Icon Only)"), "Icon-only cart button is completely removed");
assert(bottomBarSection.includes("data-testid=\"bottom-bar-add-to-cart\""), "Dedicated + Keranjang CTA button exists");
assert(bottomBarSection.includes("+ Keranjang"), "+ Keranjang label is rendered in bottom bar CTA");

// 4. + Keranjang CTA styling: 50% flex-1 width, border orange, text orange, small cart icon
assert(bottomBarSection.includes("border-[#F25B09]"), "+ Keranjang CTA has orange border");
assert(bottomBarSection.includes("text-[#F25B09]"), "+ Keranjang CTA has orange text");
assert(bottomBarSection.includes("<ShoppingCart className=\"w-4 h-4 shrink-0 text-[#F25B09]\" />"), "+ Keranjang CTA contains small cart icon beside text");
assert(bottomBarSection.includes("handleAddToCart"), "+ Keranjang CTA preserves handleAddToCart function");
console.log("  [PASS] + Keranjang button matches Quick Add Modal style with 50% width and cart icon");

// 5. Beli Sekarang CTA styling: 50% flex-1 width, solid orange, white text
assert(bottomBarSection.includes("data-testid=\"bottom-bar-buy-now\""), "Dedicated Beli Sekarang CTA button exists");
assert(bottomBarSection.includes("bg-[#F25B09]"), "Beli Sekarang CTA has solid orange background");
assert(bottomBarSection.includes("text-white"), "Beli Sekarang CTA has white text");
assert(bottomBarSection.includes("handleDirectBuyNow"), "Beli Sekarang CTA preserves direct checkout function");
console.log("  [PASS] Beli Sekarang CTA preserves direct checkout and solid orange styling");

// 6. Equal 1:1 division and height
const addCartMatch = bottomBarSection.match(/data-testid="bottom-bar-add-to-cart"[\s\S]*?className=\{`([^`]+)`\}/);
const buyNowMatch = bottomBarSection.match(/data-testid="bottom-bar-buy-now"[\s\S]*?className=\{`([^`]+)`\}/);

assert(addCartMatch && addCartMatch[1].includes("flex-1"), "+ Keranjang has flex-1 for balanced 50% CTA split");
assert(buyNowMatch && buyNowMatch[1].includes("flex-1"), "Beli Sekarang has flex-1 for balanced 50% CTA split");
assert(addCartMatch && addCartMatch[1].includes("h-11"), "+ Keranjang has h-11 height");
assert(buyNowMatch && buyNowMatch[1].includes("h-11"), "Beli Sekarang has matching h-11 height");
console.log("  [PASS] Both CTAs strictly have equal 1:1 width (flex-1) and matching height (h-11)");

// 7. QuickAddModal also uses ShoppingCart icon for + Keranjang
assert(quickAddSrc.includes("<ShoppingCart className=\"w-4 h-4 shrink-0\" />"), "QuickAddModal + Keranjang button uses ShoppingCart icon");
console.log("  [PASS] QuickAddModal uses matching ShoppingCart visual icon");

console.log("\n--- Section 3: Layout & Safe Area Invariants ---");

assert(bottomBarSection.includes("w-11 h-11 rounded-xl"), "WhatsApp button retains w-11 h-11 rounded-xl sizing");
assert(bottomBarSection.includes("calc(0.75rem + env(safe-area-inset-bottom, 0px))"), "Preserves safe-area-inset-bottom offset");
console.log("  [PASS] Bottom action bar layout, spacing, and iOS safe area are strictly preserved");

console.log("\n================================================================================");
console.log("ALL ASSERTIONS PASSED! Product Detail Bottom Bar 50/50 Dual CTAs Verified.");
console.log("================================================================================\n");
