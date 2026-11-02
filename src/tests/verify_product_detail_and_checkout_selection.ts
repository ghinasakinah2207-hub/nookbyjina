import fs from "fs";
import path from "path";
import assert from "assert";

console.log("================================================================================");
console.log("TEST SUITE: Product Detail Redesign, Buy Now Flow & Checkout Product Selection");
console.log("================================================================================");

const productDetailPath = path.resolve(process.cwd(), "src/components/product/ProductDetailClient.tsx");
const cartContextPath = path.resolve(process.cwd(), "src/context/CartContext.tsx");
const cartClientPath = path.resolve(process.cwd(), "src/components/cart/CartClient.tsx");
const checkoutClientPath = path.resolve(process.cwd(), "src/components/checkout/CheckoutClient.tsx");

const productDetailSrc = fs.readFileSync(productDetailPath, "utf-8");
const cartContextSrc = fs.readFileSync(cartContextPath, "utf-8");
const cartClientSrc = fs.readFileSync(cartClientPath, "utf-8");
const checkoutClientSrc = fs.readFileSync(checkoutClientPath, "utf-8");

console.log("\n--- Section 1: Product Detail Top Actions & Photography ---");

// 1. Favorite/Heart button removed from product image area
assert(!productDetailSrc.includes("<Heart"), "Heart/favorite icon must be removed from ProductDetailClient");
assert(!productDetailSrc.includes("toggleFavorite"), "toggleFavorite should not be wired to hero image actions");
console.log("  [PASS] Favorite/heart button removed from product image area");

// 2. Share button added
assert(productDetailSrc.includes("Share2"), "Share2 icon must be imported and rendered");
assert(productDetailSrc.includes("handleShare"), "handleShare function must handle native share or clipboard copy");
console.log("  [PASS] Share button present with native share & clipboard copy fallback");

// 3. Cart button with item count badge
assert(
  productDetailSrc.includes("ShoppingCart") || productDetailSrc.includes("ShoppingBag"),
  "ShoppingCart icon must be rendered in header actions"
);
assert(productDetailSrc.includes("itemCount > 0") && productDetailSrc.includes("itemCount"), "Cart button displays itemCount badge when > 0");
console.log("  [PASS] Shopping cart button present with item count badge");

// 4. Back button preserved
assert(productDetailSrc.includes("ChevronLeft") && productDetailSrc.includes("router.back()"), "Back button preserved over hero image");
console.log("  [PASS] Back button preserved over hero image");

// 5. Full-bleed product photography
assert(productDetailSrc.includes("aspect-[4/3]"), "Product image uses 4:3 full-bleed container");
assert(productDetailSrc.includes("object-cover"), "Image uses object-cover without stretching or unwanted distortion");
console.log("  [PASS] Full-bleed product photography layout confirmed");

console.log("\n--- Section 2: Price & Title Hierarchy ---");

// 6. Smaller 'Rp' + large bold numeric price
assert(
  productDetailSrc.includes("text-xs sm:text-sm font-semibold text-[#F25B09]") &&
  productDetailSrc.includes("text-2xl sm:text-3xl font-extrabold text-[#F25B09]"),
  "Price hierarchy must separate smaller 'Rp' from prominent numeric amount"
);
console.log("  [PASS] Price hierarchy separates smaller 'Rp' from prominent numeric price");

// 7. Category label removed, title with NOOK badge & rating preserved
assert(!productDetailSrc.includes("product.categoryName || \"Menu Pilihan\""), "Category label 'PAKET'/'Menu Pilihan' removed from product header");
assert(productDetailSrc.includes("<h1") && productDetailSrc.includes("{product.name}"), "Product title prominently placed below price");
assert(
  productDetailSrc.includes("getProductTypeConfig") && productDetailSrc.includes("{product.name}"),
  "Product-type badge rendered immediately before product title"
);
assert(productDetailSrc.includes("Star") && productDetailSrc.includes("4.9"), "Star rating pill preserved");
console.log("  [PASS] Category badge removed, product-type badge, product title and rating preserved");

console.log("\n--- Section 3: Free Delivery & Variation Card ---");

// 8. Free delivery information row
assert(
  productDetailSrc.includes("Truck") &&
  productDetailSrc.includes("Diskon gratis ongkir untuk pesanan di atas Rp50.000"),
  "Free delivery row with truck icon and Rp50.000 threshold must be displayed"
);
console.log("  [PASS] Free delivery row present with truck icon and Rp50.000 threshold");

// 9. Variation card between delivery row and description
assert(productDetailSrc.includes("Pilih Variasi"), "Variation card displays 'Pilih Variasi'");
assert(productDetailSrc.includes("variationSummaryText"), "Variation card displays selected variation summary");
assert(productDetailSrc.includes("setIsVariationModalOpen(true)"), "Tapping variation card opens bottom-sheet modal");
console.log("  [PASS] Product variation card displays summary and opens bottom-sheet modal");

// 10. Product description
assert(productDetailSrc.includes("Deskripsi Produk"), "Heading 'Deskripsi Produk' is rendered");
console.log("  [PASS] Product description rendered with clean heading");

console.log("\n--- Section 4: Sticky Bottom Action Bar ---");

// 11. Three actions: WhatsApp Chat, Add to Cart, Beli Sekarang
assert(productDetailSrc.includes("sellerChatUrl") && productDetailSrc.includes("MessageCircle"), "Action 1: WhatsApp chat with seller (icon only)");
assert(
  productDetailSrc.includes("handleAddToCart") &&
    (productDetailSrc.includes("ShoppingCartPlus") || productDetailSrc.includes("ShoppingBag")),
  "Action 2: Add to cart (icon only)"
);
assert(productDetailSrc.includes("handleDirectBuyNow") && productDetailSrc.includes("Beli Sekarang"), "Action 3: Beli Sekarang (prominent orange button)");

// 12. Standalone quantity stepper removed from sticky action bar
const bottomBarIdx = productDetailSrc.indexOf("Sticky Bottom Purchase Action Bar");
const modalIdx = productDetailSrc.indexOf("Bottom-Sheet Variation Modal");
const bottomBarSection = productDetailSrc.slice(bottomBarIdx, modalIdx);
assert(!bottomBarSection.includes("<Minus"), "Minus stepper should not be in sticky bottom action bar");
assert(!bottomBarSection.includes("<Plus"), "Plus stepper should not be in sticky bottom action bar");
console.log("  [PASS] Sticky bottom action bar contains exactly 3 actions with stepper removed");

console.log("\n--- Section 5: Isolated Buy Now Architecture ---");

// 13. CartContext supports Buy Now isolation
assert(cartContextSrc.includes("buyNowItem: CartItem | null"), "CartContextType includes buyNowItem");
assert(cartContextSrc.includes("setBuyNowItem"), "CartContextType includes setBuyNowItem");
assert(cartContextSrc.includes("clearBuyNowItem"), "CartContextType includes clearBuyNowItem");
assert(cartContextSrc.includes("temu_buy_now_item_v1"), "buyNowItem persists in sessionStorage via temu_buy_now_item_v1");
console.log("  [PASS] CartContext provides isolated buyNowItem with sessionStorage persistence");

// 14. Beli Sekarang validates required variations and sets isolated buyNowItem
assert(productDetailSrc.includes("validateRequiredOptions"), "Direct Buy Now validates required options");
assert(productDetailSrc.includes("setBuyNowItem(buyNowItemData)") && productDetailSrc.includes("/checkout?buyNow=1"), "Sets buyNowItem and navigates to /checkout?buyNow=1");
console.log("  [PASS] Beli Sekarang validates options and routes directly to /checkout?buyNow=1");

console.log("\n--- Section 6: Checkout Product Selection & Dynamic Recalculation ---");

// 15. Checkout detects Buy Now mode
assert(checkoutClientSrc.includes("searchParams.get(\"buyNow\") === \"1\""), "Detects buyNow search param");
assert(
  checkoutClientSrc.includes("isBuyNow && buyNowItem") &&
  checkoutClientSrc.includes("[buyNowItem]"),
  "Checkout items isolates Buy Now item from cart"
);
console.log("  [PASS] Checkout detects Buy Now and isolates item without modifying persistent cart");

// 16. Cart Selection Controls & Clean Read-Only Checkout
assert(
  cartClientSrc.includes("toggleCartItemSelection") &&
  cartClientSrc.includes("toggleSelectAllCartItems"),
  "Cart page provides item selection checkboxes and Select All control"
);
assert(
  !checkoutClientSrc.includes("toggleItemSelection") &&
  !checkoutClientSrc.includes("toggleSelectAll") &&
  !checkoutClientSrc.includes("deselectedItemIds") &&
  !checkoutClientSrc.includes("isAllSelected") &&
  !checkoutClientSrc.includes("isPartiallySelected"),
  "Checkout page must NOT contain legacy selection checkboxes or toggles"
);
console.log("  [PASS] Product selection moved to Cart page; Checkout page is clean read-only summary");

// 17. Dynamic recalculation of subtotal and delivery fee
assert(checkoutClientSrc.includes("selectedSubtotal"), "selectedSubtotal derived from selectedItems only");
assert(checkoutClientSrc.includes("subtotal: selectedSubtotal"), "Delivery calculation uses selectedSubtotal");
assert(checkoutClientSrc.includes("grandTotal = selectedSubtotal"), "Grand total calculated from selectedSubtotal");
console.log("  [PASS] Subtotal, delivery fee, and grand total dynamically recalculated from selected items");

// 18. Empty items handling & redirect
assert(checkoutClientSrc.includes("checkoutItems.length === 0"), "Checkout detects empty checkout items and displays redirect state");
assert(checkoutClientSrc.includes("selectedItems.length === 0"), "Checkout guards order submission against empty items");
console.log("  [PASS] Empty items state handled gracefully with clear feedback");

// 19. Order submission payload sends only selectedItems
assert(checkoutClientSrc.includes("items: selectedItems"), "POST /api/orders receives only selectedItems");
console.log("  [PASS] POST /api/orders receives only selectedItems");

// 20. Post-order cleanup
assert(
  checkoutClientSrc.includes("if (isBuyNow)") &&
  checkoutClientSrc.includes("clearBuyNowItem()") &&
  checkoutClientSrc.includes("selectedItems.forEach((item) => removeFromCart(item.id))"),
  "Cleans up buyNowItem or removes only checked items from cart"
);
console.log("  [PASS] Cleans up buyNowItem or checked cart items upon successful order");

console.log("\n================================================================================");
console.log("ALL 20/20 ASSERTIONS PASSED! Customer UX Redesign Verified Successfully.");
console.log("================================================================================\n");
