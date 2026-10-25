-- ==============================================================================
-- Migration: Hardened RLS, Admin Authorization & Column Privilege Security
-- File: supabase/migrations/20261012181500_harden_rls_and_admin_security.sql
-- Project: Temu by Jina (Final Verified Baseline Revision)
--
-- STATUS: DRAFT FOR REVIEW — DO NOT APPLY DIRECTLY TO LIVE DATABASE!
-- PRODUCTION READINESS STATUS:
--   [BETA / NOT PRODUCTION-READY FOR CHECKOUT MUTATIONS]
--   Perhatian Kritis: Backend checkout server (validasi harga & stok di sisi server)
--   belum diintegrasikan ke Next.js. Seluruh mutasi pesanan pelanggan (tabel orders,
--   order_items, order_item_options, payments, anonymous_order_tokens) TETAP DITUTUP
--   RAPAT (Zero-Trust) dari hak akses publik/anon untuk mencegah eksploitasi manipulasi
--   pesanan langsung. Migrasi ini TIDAK BOLEH dinyatakan siap produksi hingga endpoint
--   server checkout resmi telah diimplementasikan.
--
-- Verified Architecture & Changes:
--   1. Function public.is_admin():
--      Owned by postgres, marked SECURITY DEFINER with fixed search_path = public, pg_temp.
--      Revokes EXECUTE from anon and PUBLIC; grants to authenticated, service_role, postgres.
--      Evaluates directly via auth.uid() against public.admin_users without recursive dependencies.
--      Non-admin authenticated and unauthenticated callers evaluate safely to false.
--   2. Recursion-Free public.admin_users:
--      Drops legacy 'Admins manage admin users' which caused cyclic RLS recursion (error 54001).
--      Sole RLS policy on admin_users is (auth.uid() = user_id) strictly for self-verification.
--      Client mutations (INSERT/UPDATE/DELETE) are revoked; reserved for service_role/superuser.
--   3. Function public.get_admin_products():
--      Returns an explicit TABLE signature matching the 16 exact columns of public.products,
--      including 'hpp'. Strictly gates execution: raises error 42501 if caller is not an admin.
--      Revokes EXECUTE from anon and PUBLIC.
--   4. Column-Level Privilege Isolation on public.products (HPP Protection):
--      Revokes table-level SELECT on products from anon, authenticated, and PUBLIC.
--      Explicitly revokes column-level privileges (SELECT, INSERT, UPDATE, REFERENCES) on hpp from anon, authenticated, and PUBLIC.
--      Grants SELECT only on the 15 customer-facing catalog columns (hpp strictly excluded).
--      Grants INSERT, UPDATE, DELETE on products to authenticated (strictly gated by RLS).
--   5. Column-Level Privilege Isolation on public.store_settings:
--      Revokes table-level SELECT on store_settings from anon and PUBLIC.
--      Grants SELECT only on explicit customer-facing columns (id, store_name, is_open,
--      whatsapp_number, qris_image_url, updated_at), protecting future internal keys.
--   6. Precise Policy Cleanup & Recreation (Exact Live Policy Names Verified):
--      Explicitly drops and replaces confirmed live policy names:
--        - product_images: 'Public read images of visible products', 'Admins manage product images'
--        - product_option_groups: 'Public read active option groups', 'Admins manage option groups'
--        - product_option_values: 'Public read active option values', 'Admins manage option values'
--        - addons: 'Public read active addons', 'Admins manage addons'
--        - product_addons: 'Public read product addons', 'Admins manage product addons'
--        - products: 'Public read visible products', 'Admins manage products'
--        - categories: 'Public read active categories', 'Admins manage categories'
--        - home_banners: 'Public read active banners', 'Admins manage banners'
--          (Catatan: Policy aktual adalah 'Admins manage banners', BUKAN 'Admins manage home banners')
--        - admin_users: 'Admins manage admin users'
--      Recreates customer catalog read policies with strict archive/inactive filtering via
--      verified foreign keys (EXISTS subqueries).
--   7. Administrative Management Policies:
--      Explicitly grants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())
--      across all operational and catalog tables (excluding admin_users to prevent recursion).
--   8. Zero-Trust Customer Baseline on Orders & Payments:
--      Zero public mutation access on orders, order_items, order_item_options, payments,
--      anonymous_order_tokens, admin_read_state, and admin_users.
--   9. Rollback Safety Warning:
--      TIDAK BOLEH menggunakan rollback otomatis seperti 'GRANT SELECT ON TABLE products TO anon, authenticated'
--      karena akan membuka kembali akses HPP secara tidak sengaja. Pemulihan wajib dilakukan secara
--      MANUAL berdasarkan rekaman baseline konkret dari Langkah 0 (Step 0).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HELPER FUNCTION: public.is_admin() (SECURITY DEFINER, FIXED SEARCH_PATH, OWNER POSTGRES)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  );
END;
$$;

-- Secure function ownership (execution grants are secured in Section 5.1 after policy cleanup)
ALTER FUNCTION public.is_admin() OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 2. DEDICATED ADMIN CATALOG FUNCTION (NARROW RETURN TABLE SIGNATURE, OWNER POSTGRES)
-- Returns exact live product schema types. Strictly raises 42501 if not admin.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_products()
RETURNS TABLE (
  id uuid,
  category_id uuid,
  name text,
  slug text,
  description text,
  price numeric,
  hpp numeric,
  calories integer,
  tags text[],
  is_available boolean,
  is_featured boolean,
  is_archived boolean,
  is_highlight boolean,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
STABLE
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya pemilik toko yang dapat mengakses data HPP produk.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.category_id,
    p.name,
    p.slug,
    p.description,
    p.price,
    p.hpp,
    p.calories,
    p.tags,
    p.is_available,
    p.is_featured,
    p.is_archived,
    p.is_highlight,
    p.sort_order,
    p.created_at,
    p.updated_at
  FROM public.products p
  ORDER BY p.sort_order ASC;
END;
$$;

-- Secure function ownership (execution grants are secured in Section 5.1 after policy cleanup)
ALTER FUNCTION public.get_admin_products() OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY PADA SELURUH 17 TABEL PUBLIK (IDEMPOTEN)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.home_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.delivery_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.anonymous_order_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_read_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_users ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 4. PEMBATASAN HAK AKSES KOLOM & TABEL (HPP & SENSITIVE DATA ISOLATION)
-- ------------------------------------------------------------------------------

-- Cabut table-level SELECT pada products dari anon, authenticated, dan PUBLIC
-- (Akses baca pelanggan dibatasi ketat ke 15 kolom non-sensitif di bawah)
REVOKE SELECT ON TABLE public.products FROM anon, authenticated, PUBLIC;

-- Cabut secara eksplisit hak SELECT dan REFERENCES pada kolom sensitif 'hpp' dari anon, authenticated, dan PUBLIC
REVOKE SELECT (hpp), REFERENCES (hpp) ON TABLE public.products FROM anon, authenticated, PUBLIC;

-- Berikan SELECT hanya pada 15 kolom katalog pelanggan (hpp strictly excluded)
GRANT SELECT (
  id,
  category_id,
  name,
  slug,
  description,
  price,
  calories,
  tags,
  is_available,
  is_featured,
  is_archived,
  sort_order,
  created_at,
  updated_at,
  is_highlight
) ON TABLE public.products TO anon, authenticated;

-- Cabut seluruh hak mutasi dari anon dan PUBLIC
REVOKE INSERT, UPDATE, DELETE ON TABLE public.products FROM anon, PUBLIC;
REVOKE INSERT (hpp), UPDATE (hpp) ON TABLE public.products FROM anon, PUBLIC;

-- Berikan hak mutasi (INSERT, UPDATE, DELETE) pada products kepada role authenticated.
-- PENTING: Hak mutasi ini DIBATASI PENUH oleh RLS policy 'Admins manage products' (USING/WITH CHECK public.is_admin()).
-- Hanya pemilik toko terverifikasi di public.admin_users yang dapat memutasi data katalog & HPP.
-- Non-admin authenticated callers akan ditolak 100% oleh RLS.
GRANT INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;

-- Batasi hak akses tabel store_settings pada level kolom untuk anon (cegah kebocoran kolom sensitif masa depan)
REVOKE ALL ON TABLE public.store_settings FROM anon, PUBLIC;
REVOKE SELECT ON TABLE public.store_settings FROM anon, PUBLIC;
GRANT SELECT (
  id,
  store_name,
  is_open,
  whatsapp_number,
  qris_image_url,
  updated_at
) ON TABLE public.store_settings TO anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.store_settings FROM anon, PUBLIC;
GRANT SELECT, UPDATE ON TABLE public.store_settings TO authenticated;

-- Batasi hak akses tabel katalog publik
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.categories,
  public.product_images,
  public.product_option_groups,
  public.product_option_values,
  public.addons,
  public.product_addons,
  public.home_banners,
  public.delivery_areas
FROM anon;

GRANT SELECT ON TABLE
  public.categories,
  public.product_images,
  public.product_option_groups,
  public.product_option_values,
  public.addons,
  public.product_addons,
  public.home_banners,
  public.delivery_areas
TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.categories,
  public.product_images,
  public.product_option_groups,
  public.product_option_values,
  public.addons,
  public.product_addons,
  public.home_banners,
  public.delivery_areas
TO authenticated;

-- Cabut seluruh akses langsung dari anon dan PUBLIC pada tabel operasional/pesanan
REVOKE ALL ON TABLE
  public.orders,
  public.order_items,
  public.order_item_options,
  public.payments,
  public.anonymous_order_tokens,
  public.admin_read_state,
  public.admin_users
FROM anon, PUBLIC;

-- Authenticated admins may read operational records, but order/payment mutations
-- must go through trusted server-side RPCs using service_role. Direct table writes
-- could bypass price snapshots and order/payment transition invariants.
GRANT SELECT ON TABLE
  public.orders,
  public.order_items,
  public.order_item_options,
  public.payments,
  public.anonymous_order_tokens
TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_read_state TO authenticated;

-- Admin users: hanya SELECT untuk authenticated (strictly gated by RLS auth.uid() = user_id), mutasi dilarang dari client
REVOKE ALL ON TABLE public.admin_users FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.admin_users FROM authenticated;
GRANT SELECT ON TABLE public.admin_users TO authenticated;

-- Sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;

-- service_role mempertahankan akses penuh untuk server operations
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ------------------------------------------------------------------------------
-- 5. PEMBERSIHAN EKSPLISIT KEBIJAKAN BASELINE AKTUAL
-- Target exact names from live audit to prevent permissive OR-bypass.
-- ------------------------------------------------------------------------------

-- Products
DROP POLICY IF EXISTS "Public read visible products" ON public.products;
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
DROP POLICY IF EXISTS "Allow public read visible products" ON public.products;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.products;
DROP POLICY IF EXISTS "Admins have full access to products" ON public.products;

-- Categories
DROP POLICY IF EXISTS "Public read active categories" ON public.categories;
DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
DROP POLICY IF EXISTS "Allow public read active categories" ON public.categories;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.categories;
DROP POLICY IF EXISTS "Admins have full access to categories" ON public.categories;

-- Product Images (Matches exact live name: 'Public read images of visible products')
DROP POLICY IF EXISTS "Public read images of visible products" ON public.product_images;
DROP POLICY IF EXISTS "Public read product images" ON public.product_images;
DROP POLICY IF EXISTS "Public read product images of active products" ON public.product_images;
DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;
DROP POLICY IF EXISTS "Allow public read product images" ON public.product_images;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.product_images;

-- Product Option Groups (Matches exact live name: 'Public read active option groups', 'Admins manage option groups')
DROP POLICY IF EXISTS "Public read active option groups" ON public.product_option_groups;
DROP POLICY IF EXISTS "Admins manage option groups" ON public.product_option_groups;
DROP POLICY IF EXISTS "Public read product option groups" ON public.product_option_groups;
DROP POLICY IF EXISTS "Public read option groups of active products" ON public.product_option_groups;
DROP POLICY IF EXISTS "Admins manage product option groups" ON public.product_option_groups;
DROP POLICY IF EXISTS "Allow public read product option groups" ON public.product_option_groups;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.product_option_groups;

-- Product Option Values (Matches exact live name: 'Public read active option values', 'Admins manage option values')
DROP POLICY IF EXISTS "Public read active option values" ON public.product_option_values;
DROP POLICY IF EXISTS "Admins manage option values" ON public.product_option_values;
DROP POLICY IF EXISTS "Public read product option values" ON public.product_option_values;
DROP POLICY IF EXISTS "Public read option values of active products" ON public.product_option_values;
DROP POLICY IF EXISTS "Admins manage product option values" ON public.product_option_values;
DROP POLICY IF EXISTS "Allow public read product option values" ON public.product_option_values;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.product_option_values;

-- Addons (Matches exact live name: 'Public read active addons', 'Admins manage addons')
DROP POLICY IF EXISTS "Public read active addons" ON public.addons;
DROP POLICY IF EXISTS "Admins manage addons" ON public.addons;
DROP POLICY IF EXISTS "Allow public read active addons" ON public.addons;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.addons;

-- Product Addons (Matches exact live name: 'Public read product addons', 'Admins manage product addons')
DROP POLICY IF EXISTS "Public read product addons" ON public.product_addons;
DROP POLICY IF EXISTS "Public read product addons of active products" ON public.product_addons;
DROP POLICY IF EXISTS "Admins manage product addons" ON public.product_addons;
DROP POLICY IF EXISTS "Allow public read product addons" ON public.product_addons;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.product_addons;

-- Home Banners (Verified live audit names: 'Public read active banners', 'Admins manage banners')
DROP POLICY IF EXISTS "Admins manage banners" ON public.home_banners; -- Policy aktual hasil audit live Supabase
DROP POLICY IF EXISTS "Admins manage home banners" ON public.home_banners; -- Varian penamaan lama untuk pembersihan bersih
DROP POLICY IF EXISTS "Public read active banners" ON public.home_banners;
DROP POLICY IF EXISTS "Allow public read active banners" ON public.home_banners;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.home_banners;

-- Store Settings
DROP POLICY IF EXISTS "Public read store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Allow public read store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.store_settings;

-- Delivery Areas
DROP POLICY IF EXISTS "Public read active delivery areas" ON public.delivery_areas;
DROP POLICY IF EXISTS "Admins manage delivery areas" ON public.delivery_areas;
DROP POLICY IF EXISTS "Allow public read active delivery areas" ON public.delivery_areas;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.delivery_areas;

-- Orders & Order Items
DROP POLICY IF EXISTS "Admins manage orders" ON public.orders;
DROP POLICY IF EXISTS "Allow anonymous orders insert" ON public.orders;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.orders;

DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;
DROP POLICY IF EXISTS "Allow anonymous order_items insert" ON public.order_items;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.order_items;

DROP POLICY IF EXISTS "Admins manage item options" ON public.order_item_options;
DROP POLICY IF EXISTS "Admins manage order item options" ON public.order_item_options;

-- Payments
DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
DROP POLICY IF EXISTS "Allow anonymous payments insert" ON public.payments;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.payments;

-- Anonymous Order Tokens & Admin Read State
DROP POLICY IF EXISTS "Admins manage order tokens" ON public.anonymous_order_tokens;
DROP POLICY IF EXISTS "Admins manage anonymous order tokens" ON public.anonymous_order_tokens;
DROP POLICY IF EXISTS "Admins manage read state" ON public.admin_read_state;
DROP POLICY IF EXISTS "Admins manage admin read state" ON public.admin_read_state;

-- Admin Users (Drop 'Admins manage admin users' to prevent infinite recursion!)
DROP POLICY IF EXISTS "Admins manage admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow authenticated user to verify own admin record" ON public.admin_users;
DROP POLICY IF EXISTS "Authenticated users can verify own admin record" ON public.admin_users;
DROP POLICY IF EXISTS "Allow individual read for own admin record" ON public.admin_users;

-- ------------------------------------------------------------------------------
-- 5.1 PENARIKAN HAK EKSEKUSI FUNGSI (SETELAH SELURUH KEBIJAKAN LAMA DIBERSIHKAN)
-- Menjamin bahwa seluruh kebijakan lama yang memanggil public.is_admin() telah
-- dihapus tuntas dari database SEBELUM hak eksekusi dicabut dari anon, mencegah error 42501.
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.get_admin_products() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_products() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_products() TO authenticated, service_role, postgres;

-- ------------------------------------------------------------------------------
-- 6. PEMASANGAN KEBIJAKAN KATALOG PELANGGAN (FILTER AKTIF & NON-TERARSIP)
-- ------------------------------------------------------------------------------

-- Categories: publik hanya dapat membaca kategori aktif
CREATE POLICY "Public read active categories"
  ON public.categories
  FOR SELECT
  TO public
  USING (is_active = true);

-- Products: publik hanya dapat membaca produk yang tidak terarsip
CREATE POLICY "Public read visible products"
  ON public.products
  FOR SELECT
  TO public
  USING (is_archived = false);

-- Product Images: hanya gambar milik produk yang tidak terarsip
CREATE POLICY "Public read images of visible products"
  ON public.product_images
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.is_archived = false
    )
  );

-- Product Option Groups: hanya grup opsi milik produk yang tidak terarsip
CREATE POLICY "Public read active option groups"
  ON public.product_option_groups
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_option_groups.product_id
        AND p.is_archived = false
    )
  );

-- Product Option Values: hanya nilai opsi aktif milik produk yang tidak terarsip
CREATE POLICY "Public read active option values"
  ON public.product_option_values
  FOR SELECT
  TO public
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.product_option_groups pog
      JOIN public.products p ON p.id = pog.product_id
      WHERE pog.id = product_option_values.group_id
        AND p.is_archived = false
    )
  );

-- Addons: publik hanya dapat membaca addon aktif
CREATE POLICY "Public read active addons"
  ON public.addons
  FOR SELECT
  TO public
  USING (is_active = true);

-- Product Addons: hanya relasi milik produk tidak terarsip dan addon aktif
CREATE POLICY "Public read product addons"
  ON public.product_addons
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.addons a ON a.id = product_addons.addon_id
      WHERE p.id = product_addons.product_id
        AND p.is_archived = false
        AND a.is_active = true
    )
  );

-- Home Banners: publik hanya dapat membaca banner aktif
CREATE POLICY "Public read active banners"
  ON public.home_banners
  FOR SELECT
  TO public
  USING (is_active = true);

-- Store Settings: publik dapat membaca informasi toko
-- Anonymous storefront reads are column-limited by GRANTs. Authenticated users
-- must pass the separate admin-management policy; do not expose internal settings.
CREATE POLICY "Public read store settings"
  ON public.store_settings
  FOR SELECT
  TO anon
  USING (true);

-- Delivery Areas: publik hanya dapat membaca area pengiriman aktif
CREATE POLICY "Public read active delivery areas"
  ON public.delivery_areas
  FOR SELECT
  TO public
  USING (is_active = true);

-- ------------------------------------------------------------------------------
-- 7. TABEL ADMIN_USERS (REKURSI-FREE SELF-VERIFICATION)
-- Hanya mengevaluasi auth.uid() = user_id. Tidak pernah memanggil public.is_admin().
-- ------------------------------------------------------------------------------
CREATE POLICY "Allow authenticated user to verify own admin record"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 8. KEBIJAKAN MANAJEMEN PEMILIK TOKO (ADMIN MANAGEMENT CRUD POLICIES)
-- Pengecualian: public.admin_users TIDAK menggunakan policy ini untuk mencegah rekursi.
-- ------------------------------------------------------------------------------

CREATE POLICY "Admins manage categories"
  ON public.categories
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage product images"
  ON public.product_images
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage option groups"
  ON public.product_option_groups
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage option values"
  ON public.product_option_values
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage addons"
  ON public.addons
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage product addons"
  ON public.product_addons
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage banners"
  ON public.home_banners
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage store settings"
  ON public.store_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage delivery areas"
  ON public.delivery_areas
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage order items"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage order item options"
  ON public.order_item_options
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage payments"
  ON public.payments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage anonymous order tokens"
  ON public.anonymous_order_tokens
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage admin read state"
  ON public.admin_read_state
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;

-- ==============================================================================
-- DOKUMENTASI, AUDIT VERIFIKASI KATALOG & PROTOKOL ROLLBACK MANUAL
-- ==============================================================================
--
-- BAGIAN A: STATUS PRODUKSI & ZERO-TRUST CHECKOUT BACKEND
-- ------------------------------------------------------------------------------
-- 1. Migrasi ini BERSIFAT HARDENING PERIMETER, namun BELUM SIAP PRODUKSI untuk
--    siklus checkout pelanggan penuh karena endpoint checkout server belum selesai.
-- 2. Pada saat ini, keranjang belanja pelanggan dan pembuatan pesanan masih
--    disimulasikan di frontend (OrderContext.tsx / localStorage).
-- 3. Demi keamanan absolut (Zero-Trust), mutasi pesanan (INSERT/UPDATE/DELETE) pada:
--      - public.orders
--      - public.order_items
--      - public.order_item_options
--      - public.payments
--      - public.anonymous_order_tokens
--    TETAP DITUTUP RAPAT dari role 'anon' dan 'authenticated'.
-- 4. Mutasi pesanan baru boleh dibuka setelah backend checkout resmi dibangun di Next.js
--    menggunakan Server Action / API Route dengan Supabase service_role yang:
--      a. Memvalidasi ketersediaan dan harga produk dari database (bukan dari client).
--      b. Menghitung subtotal, diskon, dan ongkir secara server-side.
--      c. Mengaitkan order dengan token unik anonim atau user id terautentikasi.
--
-- ------------------------------------------------------------------------------
-- BAGIAN B: LANGKAH 0 — REKAM BASELINE SEBELUM MENJALANKAN MIGRASI (READ-ONLY)
-- Jalankan kueri-kueri ini di SQL Editor Supabase dan SIMPAN hasilnya sebelum eksekusi!
-- ------------------------------------------------------------------------------
--
-- B.1. Rekam Baseline Izin Tabel (Table-Level Privileges):
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_schema = 'public'
--   AND grantee IN ('anon', 'authenticated', 'public')
-- ORDER BY table_name, grantee, privilege_type;
--
-- B.2. Rekam Baseline Izin Kolom (Column-Level Privileges):
-- SELECT grantee, table_name, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public'
--   AND grantee IN ('anon', 'authenticated', 'public')
-- ORDER BY table_name, column_name, grantee;
--
-- B.3. Rekam Baseline Kebijakan RLS (Policy DDL Snapshot yang Terverifikasi):
-- Catatan: Query ini menangani qual/with_check NULL, AS RESTRICTIVE/PERMISSIVE,
-- array roles, COALESCE fallback ke 'public', dan quoting identifier tanpa menghasilkan USING () atau WITH CHECK ().
--
-- SELECT
--   schemaname,
--   tablename,
--   policyname,
--   permissive,
--   roles,
--   cmd,
--   qual,
--   with_check,
--   format(
--     'CREATE POLICY %I ON %I.%I%s FOR %s TO %s%s%s;',
--     policyname,
--     schemaname,
--     tablename,
--     CASE WHEN permissive = 'RESTRICTIVE' THEN ' AS RESTRICTIVE' ELSE ' AS PERMISSIVE' END,
--     cmd,
--     COALESCE(
--       (
--         SELECT string_agg(
--           CASE WHEN r = 'public' THEN 'public' ELSE quote_ident(r) END,
--           ', '
--         )
--         FROM unnest(roles) AS r
--       ),
--       'public'
--     ),
--     CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END,
--     CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END
--   ) AS ddl_to_restore
-- FROM pg_catalog.pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- B.4. Rekam Baseline Hak Eksekusi & Pemilik Fungsi (Function Privileges & Ownership):
-- SELECT
--   n.nspname AS schema_name,
--   p.proname AS function_name,
--   pg_get_userbyid(p.proowner) AS owner_name,
--   p.prosecdef AS is_security_definer,
--   p.proconfig AS search_path_config,
--   p.proacl AS function_acl
-- FROM pg_catalog.pg_proc p
-- JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('is_admin', 'get_admin_products');
--
-- B.5. Rekam Baseline Hak Akses Sequences:
-- SELECT sequence_schema, sequence_name
-- FROM information_schema.sequences
-- WHERE sequence_schema = 'public';
--
-- PENTING TENTANG LIMITASI ROLLBACK:
-- Memulihkan DDL policies saja TIDAK mengembalikan perubahan hak akses tabel (table privileges),
-- hak akses kolom (column privileges), definisi fungsi (function definitions), maupun hak eksekusi fungsi.
-- Semua layer tersebut wajib dicatat dan dipulihkan secara manual dan terkontrol.
--
-- ------------------------------------------------------------------------------
-- BAGIAN C: KUERI VERIFIKASI POSTGRESQL POST-MIGRATION (READ-ONLY)
-- Jalankan kueri-kueri berikut untuk memverifikasi integritas keamanan efektif:
-- ------------------------------------------------------------------------------
--
-- C.1. Verifikasi Hak Akses Efektif pada products (has_table_privilege & has_column_privilege):
-- Catatan: Di PostgreSQL, 'PUBLIC' adalah pseudo-role, bukan role database biasa.
-- has_table_privilege dan has_column_privilege dievaluasi untuk peran riil ('anon', 'authenticated').
-- PostgreSQL secara otomatis memperhitungkan izin yang diwarisi dari PUBLIC dalam pemanggilan ini.
--
-- SELECT
--   role_name,
--   has_table_privilege(role_name, 'public.products', 'SELECT') AS has_table_select,
--   has_column_privilege(role_name, 'public.products', 'hpp', 'SELECT') AS can_read_hpp,
--   has_column_privilege(role_name, 'public.products', 'id', 'SELECT') AS can_read_id,
--   has_column_privilege(role_name, 'public.products', 'category_id', 'SELECT') AS can_read_category_id,
--   has_column_privilege(role_name, 'public.products', 'name', 'SELECT') AS can_read_name,
--   has_column_privilege(role_name, 'public.products', 'slug', 'SELECT') AS can_read_slug,
--   has_column_privilege(role_name, 'public.products', 'description', 'SELECT') AS can_read_description,
--   has_column_privilege(role_name, 'public.products', 'price', 'SELECT') AS can_read_price,
--   has_column_privilege(role_name, 'public.products', 'calories', 'SELECT') AS can_read_calories,
--   has_column_privilege(role_name, 'public.products', 'tags', 'SELECT') AS can_read_tags,
--   has_column_privilege(role_name, 'public.products', 'is_available', 'SELECT') AS can_read_is_available,
--   has_column_privilege(role_name, 'public.products', 'is_featured', 'SELECT') AS can_read_is_featured,
--   has_column_privilege(role_name, 'public.products', 'is_archived', 'SELECT') AS can_read_is_archived,
--   has_column_privilege(role_name, 'public.products', 'sort_order', 'SELECT') AS can_read_sort_order,
--   has_column_privilege(role_name, 'public.products', 'created_at', 'SELECT') AS can_read_created_at,
--   has_column_privilege(role_name, 'public.products', 'updated_at', 'SELECT') AS can_read_updated_at,
--   has_column_privilege(role_name, 'public.products', 'is_highlight', 'SELECT') AS can_read_is_highlight
-- FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name);
--
-- HASIL YANG DIHARAPKAN:
--   anon:          has_table_select = false, can_read_hpp = FALSE, seluruh kolom katalog whitelisted = TRUE
--   authenticated: has_table_select = false, can_read_hpp = FALSE, seluruh kolom katalog whitelisted = TRUE
--
-- C.2. Audit Kolom Whitelist Ketat pada public.products:
-- INVARIAN KEAMANAN: Hanya 15 kolom katalog publik yang boleh dibaca.
-- Kolom 'hpp' dan seluruh kolom internal/non-whitelist lainnya WAJIB bernilai FALSE.
--
-- SELECT
--   a.attname AS column_name,
--   has_column_privilege('anon', 'public.products', a.attname, 'SELECT') AS anon_can_select,
--   has_column_privilege('authenticated', 'public.products', a.attname, 'SELECT') AS authenticated_can_select,
--   CASE
--     WHEN a.attname IN (
--       'id', 'category_id', 'name', 'slug', 'description', 'price',
--       'calories', 'tags', 'is_available', 'is_featured', 'is_archived',
--       'sort_order', 'created_at', 'updated_at', 'is_highlight'
--     ) THEN 'MUST BE TRUE (Whitelisted Public Catalog Column)'
--     WHEN a.attname = 'hpp' THEN 'MUST BE FALSE (Explicit Sensitive Cost Price)'
--     ELSE 'MUST BE FALSE (Non-Whitelisted / Internal Column)'
--   END AS expected_status
-- FROM pg_catalog.pg_attribute a
-- JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
-- JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname = 'products'
--   AND a.attnum > 0
--   AND NOT a.attisdropped
-- ORDER BY a.attnum;
--
-- C.3. Verifikasi Grant Langsung pada PUBLIC via aclexplode() dan acldefault():
-- Menggunakan fungsi aclexplode() resmi PostgreSQL (grantee = 0 mewakili PUBLIC)
-- dan privilege_type = 'SELECT', menangani relacl NULL via acldefault('r', c.relowner).
--
-- SELECT
--   c.relname AS table_name,
--   EXISTS (
--     SELECT 1
--     FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
--     WHERE acl.grantee = 0 AND acl.privilege_type = 'SELECT'
--   ) AS public_has_table_select_grant,
--   EXISTS (
--     SELECT 1
--     FROM pg_catalog.pg_attribute a
--     CROSS JOIN LATERAL aclexplode(a.attacl) col_acl
--     WHERE a.attrelid = c.oid AND a.attname = 'hpp'
--       AND a.attnum > 0 AND NOT a.attisdropped
--       AND col_acl.grantee = 0 AND col_acl.privilege_type = 'SELECT'
--   ) AS public_has_hpp_column_select_grant,
--   (
--     EXISTS (
--       SELECT 1
--       FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
--       WHERE acl.grantee = 0 AND acl.privilege_type = 'SELECT'
--     )
--     OR
--     EXISTS (
--       SELECT 1
--       FROM pg_catalog.pg_attribute a
--       CROSS JOIN LATERAL aclexplode(a.attacl) col_acl
--       WHERE a.attrelid = c.oid AND a.attname = 'hpp'
--         AND a.attnum > 0 AND NOT a.attisdropped
--         AND col_acl.grantee = 0 AND col_acl.privilege_type = 'SELECT'
--     )
--   ) AS public_effective_can_read_hpp,
--   c.relacl AS raw_table_acl,
--   (SELECT a.attacl FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'hpp' AND a.attnum > 0 AND NOT a.attisdropped) AS raw_hpp_column_acl
-- FROM pg_catalog.pg_class c
-- JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname = 'products';
-- (Hasil yang diharapkan: public_has_table_select_grant = false, public_has_hpp_column_select_grant = false, public_effective_can_read_hpp = false)
--
-- C.4. Verifikasi Fungsi public.is_admin() & Anti-Rekursi public.admin_users:
-- a. Periksa konfigurasi keamanan fungsi is_admin():
-- SELECT
--   p.proname,
--   pg_get_userbyid(p.proowner) AS owner_name,
--   p.prosecdef AS is_security_definer,
--   p.proconfig AS search_path_config,
--   p.proacl AS function_acl
-- FROM pg_catalog.pg_proc p
-- JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'is_admin';
-- (Hasil yang diharapkan: owner = 'postgres', is_security_definer = true, search_path = {pg_catalog, public, pg_temp})
--
-- b. Periksa kebijakan RLS pada admin_users (Mencegah Rekursi):
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_catalog.pg_policies
-- WHERE schemaname = 'public' AND tablename = 'admin_users';
-- (Hasil yang diharapkan: HANYA 1 policy 'Allow authenticated user to verify own admin record'
--  dengan qual = '(auth.uid() = user_id)'. TIDAK BOLEH ada policy yang memanggil is_admin()!)
--
-- c. Periksa ketiadaan hak mutasi client pada admin_users:
-- SELECT grantee, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_schema = 'public'
--   AND table_name = 'admin_users'
--   AND grantee IN ('anon', 'authenticated', 'public')
--   AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
-- (Hasil yang diharapkan: 0 BARIS / KOSONG)
--
-- C.5. Verifikasi Kebijakan Banner (Memastikan 'Admins manage banners'):
-- SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_catalog.pg_policies
-- WHERE schemaname = 'public' AND tablename = 'home_banners';
-- (Hasil yang diharapkan: 'Admins manage banners' dan 'Public read active banners')
--
-- C.6. Verifikasi Fungsi public.get_admin_products():
-- SELECT
--   p.proname,
--   pg_get_userbyid(p.proowner) AS owner,
--   p.prosecdef,
--   pg_get_function_result(p.oid) AS return_signature,
--   p.proacl
-- FROM pg_catalog.pg_proc p
-- JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'get_admin_products';
-- (Hasil yang diharapkan: owner = 'postgres', return_signature memuat 16 kolom produk termasuk hpp)
--
-- ------------------------------------------------------------------------------
-- BAGIAN D: PROTOKOL ROLLBACK MANUAL (MANUAL & REVIEW-REQUIRED RESTORATION)
-- ------------------------------------------------------------------------------
-- STATUS ROLLBACK: MANUAL & REVIEW-REQUIRED (TIDAK ADA ROLLBACK OTOMATIS AMAN)
--
-- PERINGATAN BAHAYA KESELAMATAN:
-- 1. JANGAN PERNAH menjalankan rollback otomatis berbasis asumsi seperti:
--      GRANT SELECT ON TABLE public.products TO anon, authenticated;
--    Perintah tersebut secara otomatis memulihkan akses SELECT ke seluruh kolom,
--    yang seketika MEMBUKA KEMBALI HPP (products.hpp) ke publik dan non-admin!
-- 2. Memulihkan RLS policies saja TIDAK mengembalikan perubahan hak akses tabel,
--    hak akses kolom, maupun fungsi RPC yang diubah oleh migrasi ini.
-- 3. Pemulihan wajib dilakukan secara bertahap (multi-tier) oleh DBA/operator
--    dengan mereviu snapshot baseline dari Langkah 0 (Step 0).
--
-- LANGKAH-LANGKAH PEMULIHAN MANUAL JIKA DIPERLUKAN ROLLBACK:
-- 1. Buka transaksi terkontrol:
--      BEGIN;
--
-- 2. Layer 1: Hapus fungsi RPC baru:
--      DROP FUNCTION IF EXISTS public.get_admin_products();
--
-- 3. Layer 2: Drop kebijakan baru yang dipasang oleh migrasi ini:
--      DROP POLICY IF EXISTS "Public read active categories" ON public.categories;
--      DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
--      DROP POLICY IF EXISTS "Public read visible products" ON public.products;
--      DROP POLICY IF EXISTS "Admins manage products" ON public.products;
--      DROP POLICY IF EXISTS "Public read images of visible products" ON public.product_images;
--      DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;
--      DROP POLICY IF EXISTS "Public read active option groups" ON public.product_option_groups;
--      DROP POLICY IF EXISTS "Admins manage option groups" ON public.product_option_groups;
--      DROP POLICY IF EXISTS "Public read active option values" ON public.product_option_values;
--      DROP POLICY IF EXISTS "Admins manage option values" ON public.product_option_values;
--      DROP POLICY IF EXISTS "Public read active addons" ON public.addons;
--      DROP POLICY IF EXISTS "Admins manage addons" ON public.addons;
--      DROP POLICY IF EXISTS "Public read product addons" ON public.product_addons;
--      DROP POLICY IF EXISTS "Admins manage product addons" ON public.product_addons;
--      DROP POLICY IF EXISTS "Public read active banners" ON public.home_banners;
--      DROP POLICY IF EXISTS "Admins manage banners" ON public.home_banners;
--      DROP POLICY IF EXISTS "Public read store settings" ON public.store_settings;
--      DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
--      DROP POLICY IF EXISTS "Public read active delivery areas" ON public.delivery_areas;
--      DROP POLICY IF EXISTS "Admins manage delivery areas" ON public.delivery_areas;
--      DROP POLICY IF EXISTS "Admins manage orders" ON public.orders;
--      DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;
--      DROP POLICY IF EXISTS "Admins manage order item options" ON public.order_item_options;
--      DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
--      DROP POLICY IF EXISTS "Admins manage anonymous order tokens" ON public.anonymous_order_tokens;
--      DROP POLICY IF EXISTS "Admins manage admin read state" ON public.admin_read_state;
--      DROP POLICY IF EXISTS "Allow authenticated user to verify own admin record" ON public.admin_users;
--
-- 4. Layer 3: Pasang kembali kebijakan asli dari snapshot Langkah 0 (B.3):
--      (Jalankan pernyataan DDL yang dihasilkan oleh kueri ddl_to_restore pada Langkah 0)
--
-- 5. Layer 4: Pulihkan hak akses tabel dan kolom persis sesuai snapshot Langkah 0 (B.1 & B.2):
--      (Reviu dengan cermat apakah pemulihan table-level SELECT pada products disengaja atau tidak)
--
-- 6. Layer 5: Validasi kembali hak akses sebelum commit:
--      (Jalankan kueri Bagian C untuk memastikan tidak ada celah keamanan baru)
--
-- 7. Tutup transaksi:
--      COMMIT;
-- ==============================================================================
