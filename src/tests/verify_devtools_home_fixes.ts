import fs from "fs";
import path from "path";
import assert from "assert";

console.log("================================================================================");
console.log("TEST SUITE: Verify Chrome DevTools Issues Fixes on /home");
console.log("================================================================================");

const searchBarPath = path.resolve(process.cwd(), "src/components/ui/SearchBar.tsx");
const contactDrawerPath = path.resolve(process.cwd(), "src/components/layout/ContactDrawer.tsx");
const quickAddModalPath = path.resolve(process.cwd(), "src/components/product/QuickAddModal.tsx");
const productDetailPath = path.resolve(process.cwd(), "src/components/product/ProductDetailClient.tsx");
const suksesPagePath = path.resolve(process.cwd(), "src/app/sukses/page.tsx");

// 1. SearchBar form field checks
const searchBarSrc = fs.readFileSync(searchBarPath, "utf-8");
assert(searchBarSrc.includes('id = "search-menu-input"'), "SearchBar default id prop is defined");
assert(searchBarSrc.includes('name = "search"'), "SearchBar default name prop is defined");
assert(searchBarSrc.includes("id={id}"), "SearchBar input element binds id");
assert(searchBarSrc.includes("name={name}"), "SearchBar input element binds name");
console.log("  [PASS] SearchBar input has unique semantic id and name attributes");

// 2. ContactDrawer lazy-loaded image dimensions & aspect ratio
const contactDrawerSrc = fs.readFileSync(contactDrawerPath, "utf-8");
assert(contactDrawerSrc.includes("width={36}"), "ContactDrawer image has explicit width attribute");
assert(contactDrawerSrc.includes("height={36}"), "ContactDrawer image has explicit height attribute");
assert(contactDrawerSrc.includes("w-7 h-7") || contactDrawerSrc.includes("aspect-square"), "ContactDrawer image has explicit CSS sizing");
assert(contactDrawerSrc.includes('aspectRatio: "1 / 1"'), "ContactDrawer image has explicit CSS aspect ratio");
const imageTagMatch = contactDrawerSrc.match(/<Image[\s\S]*?\/>/);
assert(imageTagMatch && !imageTagMatch[0].includes("priority"), "ContactDrawer image does NOT force eager priority loading");
console.log("  [PASS] ContactDrawer lazy-loaded image has explicit width/height and CSS aspect-ratio");

// 3. QuickAddModal note form field
const quickAddSrc = fs.readFileSync(quickAddModalPath, "utf-8");
assert(quickAddSrc.includes('id="quickAddNote"'), "QuickAddModal textarea has id attribute");
assert(quickAddSrc.includes('name="quickAddNote"'), "QuickAddModal textarea has name attribute");
console.log("  [PASS] QuickAddModal note textarea has both id and name attributes");

// 4. ProductDetail note form field
const productDetailSrc = fs.readFileSync(productDetailPath, "utf-8");
assert(productDetailSrc.includes('id="item-note-input"'), "ProductDetail input has id attribute");
assert(productDetailSrc.includes('name="itemNote"'), "ProductDetail input has name attribute");
console.log("  [PASS] ProductDetail note input has both id and name attributes");

// 5. Sukses page share url input
const suksesSrc = fs.readFileSync(suksesPagePath, "utf-8");
assert(suksesSrc.includes('id="order-share-url"'), "Sukses page input has id attribute");
assert(suksesSrc.includes('name="orderUrl"'), "Sukses page input has name attribute");
console.log("  [PASS] Sukses page share url input has both id and name attributes");

console.log("================================================================================");
console.log("TEST SUMMARY: All Chrome DevTools Fixes Verified Successfully!");
console.log("================================================================================");
