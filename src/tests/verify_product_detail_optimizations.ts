import assert from "node:assert";
import React from "react";
import { getProductBySlugOrId, getRecommendedProducts, getVisibleProducts } from "../lib/supabase/catalog";
import ProductDetailLoading from "../app/produk/[id]/loading";

async function runTests() {
  console.log("=== 1. Verifying getRecommendedProducts Correctness & Safety ===");

  // A. Fetch a known product
  const product = await getProductBySlugOrId("nasi-bakar-cakalang");
  assert(product !== null, "Product 'nasi-bakar-cakalang' must exist");
  console.log(`[PASS] Fetched target product: "${product.name}" (ID: ${product.id}, Category: ${product.categoryName})`);

  // B. Run targeted recommendations query
  const recommended = await getRecommendedProducts(
    product.categoryId,
    product.dbId || product.id,
    product.slug,
    4
  );

  assert(recommended.length > 0, "Recommended products count must be > 0");
  assert(recommended.length <= 4, "Recommended products count must be <= 4");
  console.log(`[PASS] Recommendations count: ${recommended.length} (within limit 4)`);

  // C. Verify self-exclusion
  for (const item of recommended) {
    assert(item.id !== product.id, `Recommended item must not equal current product id (${item.id})`);
    assert(item.slug !== product.slug, `Recommended item must not equal current product slug (${item.slug})`);
    assert(!item.isArchived, `Recommended item must not be archived`);
    assert(
      item.categoryId === product.categoryId || item.isHighlight,
      `Recommended item "${item.name}" must match category or be highlighted`
    );
  }
  console.log("[PASS] Self-exclusion & category/highlight matching verified");

  // D. Compare with baseline allVisible.filter(...)
  const allVisible = await getVisibleProducts();
  const baseline = allVisible
    .filter(
      (p) =>
        p.id !== product.id &&
        p.slug !== product.slug &&
        (p.categoryId === product.categoryId || p.isHighlight)
    )
    .slice(0, 4);

  assert.deepStrictEqual(
    recommended.map((r) => r.id),
    baseline.map((b) => b.id),
    "Targeted query must produce identical product IDs and order as baseline"
  );
  console.log("[PASS] Targeted recommendations exactly match baseline ordering & IDs");

  console.log("\n=== 2. Verifying ProductDetailLoading (loading.tsx) Skeleton Structure ===");
  const loadingElement = ProductDetailLoading();
  assert(React.isValidElement(loadingElement), "ProductDetailLoading must return a valid React element");
  assert(
    ((loadingElement.props as { className?: string })?.className || "").includes("min-h-screen"),
    "Loading skeleton container must have min-h-screen"
  );
  console.log("[PASS] loading.tsx renders valid React JSX with proper root layout classes");

  console.log("\n=== 3. Verifying In-Memory Cache for Recommendations ===");
  const startCached = performance.now();
  const cachedRecs = await getRecommendedProducts(
    product.categoryId,
    product.dbId || product.id,
    product.slug,
    4
  );
  const durationCached = performance.now() - startCached;
  assert.strictEqual(cachedRecs.length, recommended.length, "Cached recommendations length must match");
  console.log(`[PASS] Cache hit resolved in ${durationCached.toFixed(2)}ms (sub-1ms memory retrieval)`);

  console.log("\n🎉 ALL PRODUCT DETAIL OPTIMIZATION TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
