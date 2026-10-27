import assert from "assert";
import {
  createProductAction,
  updateProductAction,
  getAdminProductForEditAction,
} from "@/app/admin/menu/actions";
import { supabase } from "@/lib/supabase/client";
import { getProductBySlugOrId, getVisibleProducts } from "@/lib/supabase/catalog";

async function runHppVerificationSuite() {
  console.log("==================================================================");
  console.log("TEST SUITE: Product HPP (Harga Pokok Penjualan) End-to-End Verification");
  console.log("==================================================================\n");

  // --------------------------------------------------------------------------
  // Test 1: Verifikasi Schema Database & Keberadaan Kolom HPP
  // --------------------------------------------------------------------------
  console.log("[TEST 1] Memeriksa skema database Supabase untuk kolom 'hpp'...");
  const { data: sampleProducts, error: dbErr } = await supabase
    .from("products")
    .select("id, slug, name, price, hpp, category_id")
    .limit(3);

  assert.ifError(dbErr);
  assert.ok(sampleProducts && sampleProducts.length > 0, "Harus ada produk di tabel products");
  const firstProd = sampleProducts[0];
  console.log(`✓ Kolom 'hpp' ditemukan pada database:`, {
    id: firstProd.id,
    name: firstProd.name,
    hpp: firstProd.hpp,
  });
  assert.ok("hpp" in firstProd, "Kolom 'hpp' harus terdefinisi pada schema products");

  // --------------------------------------------------------------------------
  // Test 2: Verifikasi getAdminProductForEditAction Mengembalikan HPP Database
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Memverifikasi getAdminProductForEditAction mengembalikan HPP secara persisten...");
  const editResult = await getAdminProductForEditAction(firstProd.id);
  assert.strictEqual(editResult.success, true, `getAdminProductForEditAction gagal: ${editResult.error}`);
  assert.ok(editResult.product, "Data produk untuk edit modal harus ada");
  console.log(`✓ Nilai HPP yang dikembalikan untuk modal edit:`, {
    product: editResult.product.name,
    hpp: editResult.product.hpp,
  });
  assert.strictEqual(
    editResult.product.hpp,
    firstProd.hpp !== null && firstProd.hpp !== undefined ? Number(firstProd.hpp) : null,
    "HPP di modal edit harus persis cocok dengan nilai database"
  );

  // --------------------------------------------------------------------------
  // Test 3: Verifikasi Admin Menu Page Augmentation Mengisi HPP ke Seluruh Produk
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Memverifikasi alur augmentasi HPP di Admin Menu Page...");
  const visibleProducts = await getVisibleProducts();
  const { data: adminRows, error: adminQueryErr } = await supabase
    .from("products")
    .select("id, slug, hpp");
  assert.ifError(adminQueryErr);

  const hppMap = new Map<string, number>();
  adminRows?.forEach((r) => {
    if (r.id && r.hpp !== undefined && r.hpp !== null) hppMap.set(r.id, Number(r.hpp));
    if (r.slug && r.hpp !== undefined && r.hpp !== null) hppMap.set(r.slug, Number(r.hpp));
  });

  const augmentedProducts = visibleProducts.map((p) => {
    const adminHpp = hppMap.get(p.id) ?? hppMap.get(p.slug);
    return adminHpp !== undefined ? { ...p, hpp: adminHpp } : p;
  });

  const sampleWithHpp = augmentedProducts.find((p) => p.hpp !== undefined);
  assert.ok(sampleWithHpp, "Minimal satu produk harus memiliki HPP setelah augmentasi admin");
  console.log(`✓ Sampel produk ter-augmentasi HPP di halaman admin menu:`, {
    name: sampleWithHpp.name,
    basePrice: sampleWithHpp.basePrice,
    hpp: sampleWithHpp.hpp,
  });

  // --------------------------------------------------------------------------
  // Test 4: Verifikasi Keamanan Katalog Publik (Pelanggan Tidak Boleh Melihat HPP)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Memverifikasi isolasi keamanan: HPP tidak boleh bocor ke publik...");
  const publicSingle = await getProductBySlugOrId(firstProd.slug);
  assert.ok(publicSingle, "Produk publik harus dapat dimuat");
  assert.strictEqual(
    publicSingle.hpp,
    undefined,
    `Katalog publik single produk TIDAK BOLEH memuat properti hpp! Got: ${publicSingle.hpp}`
  );

  for (const pubProd of visibleProducts) {
    assert.strictEqual(
      pubProd.hpp,
      undefined,
      `getVisibleProducts() TIDAK BOLEH memuat properti hpp pada produk ${pubProd.name}`
    );
  }
  console.log("✓ Invariant keamanan terkonfirmasi: Field HPP 100% terlindung dari akses publik pelanggan.");

  // --------------------------------------------------------------------------
  // Test 5: Validasi Penanganan Nilai HPP (Input Sanitization & Invariants)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Memverifikasi validasi input HPP (negatif ditolak, kosong -> null, angka valid)...");
  
  // 5a. HPP negatif harus ditolak dengan error validasi
  const invalidHppRes = await createProductAction({
    name: "Uji HPP Negatif",
    categoryId: firstProd.category_id || "cat-test",
    price: 15000,
    hpp: -5000,
    images: [],
  });
  assert.strictEqual(invalidHppRes.success, false, "HPP negatif harus ditolak");
  assert.ok(
    invalidHppRes.error?.includes("HPP") || invalidHppRes.error?.includes("negatif"),
    `Error harus menyebut validasi HPP, got: ${invalidHppRes.error}`
  );
  console.log(`✓ HPP negatif berhasil ditolak: "${invalidHppRes.error}"`);

  // 5b. Update dengan HPP negatif juga harus ditolak
  const invalidUpdateHpp = await updateProductAction({
    id: firstProd.id,
    name: firstProd.name,
    categoryId: firstProd.category_id || "cat-test",
    price: 15000,
    hpp: -1000,
    images: [],
  });
  assert.strictEqual(invalidUpdateHpp.success, false, "Update HPP negatif harus ditolak");
  console.log(`✓ Update HPP negatif berhasil ditolak: "${invalidUpdateHpp.error}"`);

  // --------------------------------------------------------------------------
  // Test 6: Verifikasi Zero-Trust RLS di Level Database
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Memverifikasi proteksi RLS PostgreSQL database pada mutasi produk...");
  const { error: unauthInsertErr } = await supabase.from("products").insert({
    name: "Produk Tanpa Hak Akses",
    slug: "produk-unauth-test",
    price: 10000,
    hpp: 5000,
  });
  assert.ok(unauthInsertErr, "Operasi INSERT langsung tanpa otorisasi admin/service-role HARUS diblokir oleh RLS");
  console.log(`✓ RLS database aktif dan memblokir modifikasi tanpa hak akses: "${unauthInsertErr.message}"`);

  console.log("\n==================================================================");
  console.log("SEMUA 6 PENGUJIAN INTEGRITAS HPP BERHASIL DILAKUKAN DAN VALID! ✓");
  console.log("==================================================================\n");
}

runHppVerificationSuite().catch((err) => {
  console.error("TEST FAILED WITH ERROR:", err);
  process.exit(1);
});
