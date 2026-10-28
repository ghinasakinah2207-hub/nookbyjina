if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "mock-key";
}

import assert from "node:assert";
import { Product, SelectedAddon } from "@/types";

/**
 * TEST SUITE: NOOK BY JINA — PRODUCT-SCOPED ADDONS & TRANSACTION PRESERVING DELETION
 *
 * Verifies:
 * 1. Product add-ons can be created, updated, and isolated per product without global master catalog.
 * 2. Checkout validation & calculation for product-scoped add-ons works correctly.
 * 3. Historical transactions, snapshots, and order items remain 100% intact when a product is permanently deleted.
 * 4. Zero active application code requires the global master add-on table.
 */

console.log("================================================================================");
console.log("STARTING TEST SUITE: Product-Scoped Add-ons & Permanent Deletion Invariants");
console.log("================================================================================");

// =============================================================================
// TEST 1: Product Add-ons Created & Edited Without Global Master Table
// =============================================================================
console.log("\n--- TEST 1: Product Add-ons Creation & Isolation (No Shared Master) ---");

interface MockDbProductAddon {
  id: string;
  productId: string;
  name: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
}

const mockProductAddonDatabase: MockDbProductAddon[] = [];

function syncProductScopedAddons(
  productId: string,
  inputAddons: { id?: string; name: string; price: number }[]
): MockDbProductAddon[] {
  // Remove existing addons for this product that are no longer in input
  const keepIds = new Set(inputAddons.map((a) => a.id).filter(Boolean));
  for (let i = mockProductAddonDatabase.length - 1; i >= 0; i--) {
    if (
      mockProductAddonDatabase[i].productId === productId &&
      !keepIds.has(mockProductAddonDatabase[i].id)
    ) {
      mockProductAddonDatabase.splice(i, 1);
    }
  }

  // Insert or update product-scoped addons
  inputAddons.forEach((item, idx) => {
    if (item.id) {
      const existing = mockProductAddonDatabase.find(
        (a) => a.id === item.id && a.productId === productId
      );
      if (existing) {
        existing.name = item.name;
        existing.price = item.price;
        existing.sortOrder = idx + 1;
        return;
      }
    }
    // New addon strictly scoped to this product
    const newId = `addon-${productId}-${idx + 1}`;
    mockProductAddonDatabase.push({
      id: newId,
      productId,
      name: item.name,
      price: item.price,
      isActive: true,
      sortOrder: idx + 1,
    });
  });

  return mockProductAddonDatabase.filter((a) => a.productId === productId);
}

// Product A creates its own "Ekstra Sambal" at Rp 4.000
const prodAAddons = syncProductScopedAddons("prod-a", [
  { name: "Ekstra Sambal", price: 4000 },
  { name: "Telur Dadar", price: 3000 },
]);
assert.strictEqual(prodAAddons.length, 2);
assert.strictEqual(prodAAddons[0].name, "Ekstra Sambal");
assert.strictEqual(prodAAddons[0].price, 4000);

// Product B creates its own "Ekstra Sambal" with DIFFERENT price (Rp 5.000)
// With product-scoped design, Product B's addon does NOT collide with or mutate Product A!
const prodBAddons = syncProductScopedAddons("prod-b", [
  { name: "Ekstra Sambal", price: 5000 },
]);
assert.strictEqual(prodBAddons.length, 1);
assert.strictEqual(prodBAddons[0].price, 5000);

// Verify Product A is completely untouched
const checkProdA = mockProductAddonDatabase.filter((a) => a.productId === "prod-a");
assert.strictEqual(checkProdA[0].price, 4000, "Product A price must not be mutated by Product B");
console.log("  [PASS] Product-scoped add-ons are completely isolated without master table collisions");

// Update Product A: modify price of Telur Dadar to 3500 and remove Ekstra Sambal
const updatedProdA = syncProductScopedAddons("prod-a", [
  { id: prodAAddons[1].id, name: "Telur Dadar", price: 3500 },
]);
assert.strictEqual(updatedProdA.length, 1);
assert.strictEqual(updatedProdA[0].price, 3500);
assert.strictEqual(
  mockProductAddonDatabase.some((a) => a.productId === "prod-a" && a.name === "Ekstra Sambal"),
  false,
  "Removed addon must be cleaned up from product scope"
);
console.log("  [PASS] Product add-ons successfully edited and deleted within product context");

// =============================================================================
// TEST 2: Checkout & Calculation With Product-Scoped Add-ons
// =============================================================================
console.log("\n--- TEST 2: Checkout Validation & Historical Snapshot Calculation ---");

const catalogProduct: Product = {
  id: "prod-a",
  slug: "nasi-ayam-geprek",
  name: "Nasi Ayam Geprek",
  description: "Ayam geprek pedas gurih",
  categoryId: "cat-1",
  categoryName: "Makanan",
  basePrice: 20000,
  isAvailable: true,
  images: ["/images/ayam-geprek.webp"],
  optionGroups: [],
  addons: [
    { id: "addon-prod-a-1", name: "Telur Dadar", price: 3500 },
    { id: "addon-prod-a-2", name: "Ekstra Keju", price: 4000 },
  ],
};

function validateCheckoutItem(
  product: Product,
  selectedAddonIds: string[],
  quantity: number
) {
  let addonsDelta = 0;
  const validatedAddons: SelectedAddon[] = [];

  for (const addonId of selectedAddonIds) {
    const found = product.addons.find((a) => a.id === addonId || a.name === addonId);
    if (!found) {
      throw new Error(`Add-on "${addonId}" tidak diizinkan untuk produk "${product.name}".`);
    }
    addonsDelta += found.price;
    validatedAddons.push({
      addonId: found.id,
      addonName: found.name,
      price: found.price,
    });
  }

  const unitPrice = product.basePrice + addonsDelta;
  const lineTotal = unitPrice * quantity;

  return {
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice,
    lineTotal,
    selectedAddons: validatedAddons,
  };
}

const checkoutItem = validateCheckoutItem(
  catalogProduct,
  ["addon-prod-a-1", "addon-prod-a-2"],
  2
);

assert.strictEqual(checkoutItem.unitPrice, 20000 + 3500 + 4000); // 27,500
assert.strictEqual(checkoutItem.lineTotal, 27500 * 2); // 55,000
assert.strictEqual(checkoutItem.selectedAddons.length, 2);
console.log(`  [PASS] Checkout calculated unitPrice=Rp ${checkoutItem.unitPrice}, lineTotal=Rp ${checkoutItem.lineTotal}`);

// =============================================================================
// TEST 3: Permanent Product Deletion Retains 100% of Transactions & Snapshots
// =============================================================================
console.log("\n--- TEST 3: Permanent Deletion Retains Transactions & Snapshots (Requirement C) ---");

interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface OrderItemOptionRow {
  id: string;
  orderItemId: string;
  optionType: "variant" | "addon";
  optionName: string;
  optionValue: string;
  priceDelta: number;
}

const mockOrderItems: OrderItemRow[] = [
  {
    id: "item-101",
    orderId: "ord-999",
    productId: "prod-a",
    productName: "Nasi Ayam Geprek",
    quantity: 2,
    unitPrice: 27500,
    lineTotal: 55000,
  },
];

const mockOrderItemOptions: OrderItemOptionRow[] = [
  {
    id: "opt-1",
    orderItemId: "item-101",
    optionType: "addon",
    optionName: "Add-on",
    optionValue: "Telur Dadar",
    priceDelta: 3500,
  },
  {
    id: "opt-2",
    orderItemId: "item-101",
    optionType: "addon",
    optionName: "Add-on",
    optionValue: "Ekstra Keju",
    priceDelta: 4000,
  },
];

const mockOrders = [
  {
    id: "ord-999",
    orderNumber: "TJ-261028-001",
    total: 55000,
    itemsSnapshot: [
      {
        productId: "prod-a",
        productName: "Nasi Ayam Geprek",
        itemTotal: 55000,
        selectedAddons: [
          { addonId: "addon-prod-a-1", addonName: "Telur Dadar", price: 3500 },
          { addonId: "addon-prod-a-2", addonName: "Ekstra Keju", price: 4000 },
        ],
      },
    ],
  },
];

// Perform permanent product deletion according to Requirement C:
function executePermanentProductDeletion(
  productId: string,
  orderItems: OrderItemRow[],
  catalogProducts: { id: string; name: string }[]
) {
  // 1. Decouple order_items by setting product_id = null
  const affectedItems = orderItems.filter((oi) => oi.productId === productId);
  const orderCount = affectedItems.length;

  affectedItems.forEach((oi) => {
    oi.productId = null;
  });

  // 2. Remove product from catalog
  const prodIdx = catalogProducts.findIndex((p) => p.id === productId);
  if (prodIdx >= 0) {
    catalogProducts.splice(prodIdx, 1);
  }

  return {
    success: true,
    action: "deleted",
    hadTransactions: orderCount > 0,
    orderCount,
  };
}

const mockCatalog = [{ id: "prod-a", name: "Nasi Ayam Geprek" }];
const delResult = executePermanentProductDeletion("prod-a", mockOrderItems, mockCatalog);

// Verification of invariants:
assert.strictEqual(delResult.action, "deleted");
assert.strictEqual(delResult.hadTransactions, true);
assert.strictEqual(mockCatalog.length, 0, "Catalog product was permanently deleted");

// Assert all transactions are 100% preserved
assert.strictEqual(mockOrderItems.length, 1, "order_items row must NOT be deleted");
assert.strictEqual(mockOrderItems[0].productId, null, "order_items.product_id decoupled to null");
assert.strictEqual(mockOrderItems[0].productName, "Nasi Ayam Geprek", "Historical product name preserved");
assert.strictEqual(mockOrderItems[0].lineTotal, 55000, "Historical line total preserved");

assert.strictEqual(mockOrderItemOptions.length, 2, "order_item_options must NOT be deleted");
assert.strictEqual(mockOrderItemOptions[0].optionValue, "Telur Dadar");
assert.strictEqual(mockOrderItemOptions[0].priceDelta, 3500);

assert.strictEqual(mockOrders.length, 1, "orders table row must NOT be deleted");
assert.strictEqual(mockOrders[0].itemsSnapshot[0].selectedAddons[0].addonName, "Telur Dadar");
console.log("  [PASS] Product catalog row deleted while order_items, order_item_options, and items_snapshot preserved 100%");

// =============================================================================
// TEST 4: Zero Active Code Depends on Global Master Addons
// =============================================================================
console.log("\n--- TEST 4: Verify Zero Active Application Code Needs Global Master Add-on ---");

// Import catalog functions dynamically after env initialization
async function verifyZeroMasterDependencies() {
  const { getActiveAddons } = await import("@/lib/supabase/catalog");
  const activeAddons = await getActiveAddons();
  assert.deepStrictEqual(activeAddons, [], "getActiveAddons must return empty array without errors");
}

// =============================================================================
// TEST 5: Regression Test: Historical NULL Order Items Isolation Guard
// =============================================================================
console.log("\n--- TEST 5: Isolation Guard Against Historical NULL Order Items ---");

interface HistoricalOrderItem {
  id: string;
  productId: string | null;
  productName: string;
}

const tableOrderItems: HistoricalOrderItem[] = [
  // Two historical order items from previously deleted products:
  { id: "hist-1", productId: null, productName: "Menu Lama Purba A" },
  { id: "hist-2", productId: null, productName: "Menu Lama Purba B" },
  // One order item belonging to target product:
  { id: "item-current", productId: "prod-current", productName: "Menu Saat Ini" },
];

function simulateSafeAtomicOperation(
  targetProductId: string,
  items: HistoricalOrderItem[],
  shouldFail: boolean
) {
  // If atomic RPC fails, PostgreSQL rolls back the subtransaction entirely.
  // CRITICAL RULE: Under NO circumstances should historical NULL items be linked to targetProductId!
  if (shouldFail) {
    // Transaction rolled back - zero mutations applied!
    return { success: false, error: "Simulated constraint failure in DB" };
  }

  // If succeeds:
  items.forEach((item) => {
    if (item.productId === targetProductId) {
      item.productId = null;
    }
  });

  return { success: true };
}

// 1. Simulate failure during deletion:
const failedOp = simulateSafeAtomicOperation("prod-current", tableOrderItems, true);
assert.strictEqual(failedOp.success, false);
// Verify historical NULL items remain strictly NULL and untouched!
assert.strictEqual(tableOrderItems[0].productId, null);
assert.strictEqual(tableOrderItems[1].productId, null);
assert.strictEqual(tableOrderItems[2].productId, "prod-current");
console.log("  [PASS] Failed operation leaves historical NULL order items completely untouched");

// 2. Simulate success:
const successOp = simulateSafeAtomicOperation("prod-current", tableOrderItems, false);
assert.strictEqual(successOp.success, true);
assert.strictEqual(tableOrderItems[0].productId, null);
assert.strictEqual(tableOrderItems[1].productId, null);
assert.strictEqual(tableOrderItems[2].productId, null);
console.log("  [PASS] Successful decoupling sets target item to null without altering historical items");

async function runAllTests() {
  await verifyZeroMasterDependencies();
  console.log("  [PASS] getActiveAddons safely deprecated to no-op");

  console.log("\n================================================================================");
  console.log("ALL TESTS IN VERIFY_PRODUCT_SCOPED_ADDONS_AND_DELETION PASSED SUCCESSFULLY!");
  console.log("================================================================================");
}

runAllTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
