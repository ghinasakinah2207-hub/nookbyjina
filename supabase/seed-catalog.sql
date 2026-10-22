-- ==============================================================================
-- TEMU BY JINA — CATALOG SEED SCRIPT
-- File: supabase/seed-catalog.sql
-- Description: Idempotent seed script to migrate mock catalog data from
--              src/data/dummy-data.ts into the Supabase PostgreSQL schema.
--
-- Prerequisites:
--   - Run migration supabase/migrations/20261012172500_add_is_highlight_to_products.sql
--     to add the `is_highlight` column before executing this seed.
--
-- Target Tables:
--   1. public.categories
--   2. public.products
--   3. public.product_images
--   4. public.product_option_groups
--   5. public.product_option_values
--   6. public.addons
--   7. public.product_addons
--
-- Conflict & Rerun Safety:
--   - Uses `ON CONFLICT (...) DO NOTHING` across all tables to guarantee that
--     rerunning the seed will NEVER overwrite manually edited prices, HPP,
--     descriptions, availability flags, variant deltas, or addon prices.
--   - Uses deterministic UUIDs so parent-child relationships remain stable.
--   - Important: Assumes products have not been pre-inserted with non-deterministic
--     UUIDs for these exact slugs. If slugs pre-exist with different IDs, PostgreSQL
--     will safely reject the transaction via `products_slug_key` without data loss.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CATEGORIES
-- Ensure the 3 standard categories exist. Preserves existing category IDs & names.
-- ------------------------------------------------------------------------------
INSERT INTO public.categories (name, slug, sort_order, is_active)
VALUES
  ('Makanan', 'makanan', 1, true),
  ('Minuman', 'minuman', 2, true),
  ('Snack', 'snack', 3, true)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. PRODUCTS
-- 7 Products from src/data/dummy-data.ts
-- Deterministic UUID pattern: b0000001-0000-4000-8000-00000000000X
-- Highlights: Nasi Bakar (true), Ayam Suwir (true), Risol Mayo (true), Dimsum (true)
-- ------------------------------------------------------------------------------
INSERT INTO public.products (
  id,
  category_id,
  name,
  slug,
  description,
  price,
  hpp,
  is_available,
  is_archived,
  is_highlight,
  sort_order
)
VALUES
  (
    'b0000001-0000-4000-8000-000000000001',
    (SELECT id FROM public.categories WHERE slug = 'makanan' LIMIT 1),
    'Nasi Bakar Cakalang Asap',
    'nasi-bakar-cakalang',
    'Nasi gurih kaya rempah beraroma daun kemangi segar, dibungkus daun pisang lalu dibakar hangat. Diisi suwiran ikan cakalang asap gurih pedas istimewa.',
    25000,
    NULL,
    true,
    false,
    true,
    1
  ),
  (
    'b0000001-0000-4000-8000-000000000002',
    (SELECT id FROM public.categories WHERE slug = 'makanan' LIMIT 1),
    'Rice Bowl Ayam Suwir Sambal Matah',
    'ayam-suwir-matah',
    'Nasi putih hangat pulen berpadu suwiran daging ayam gurih empuk, sambal matah serai bawang segar harum, dan telur mata sapi lezat.',
    28000,
    NULL,
    true,
    false,
    true,
    2
  ),
  (
    'b0000001-0000-4000-8000-000000000003',
    (SELECT id FROM public.categories WHERE slug = 'snack' LIMIT 1),
    'Risol Mayo Beef Lumer (Isi 3)',
    'risol-mayo-beef',
    'Kulit risol lembut dengan baluran tepung panir garing keemasan. Isian melimpah: potongan smoked beef premium, telur rebus, keju, dan saus mayo creamy gurih.',
    18000,
    NULL,
    true,
    false,
    true,
    3
  ),
  (
    'b0000001-0000-4000-8000-000000000004',
    (SELECT id FROM public.categories WHERE slug = 'snack' LIMIT 1),
    'Dimsum Mentai Homemade (Isi 4)',
    'dimsum-mentai',
    'Dimsum siomay ayam udang buatan sendiri dengan tekstur kenyal dan padat daging. Disiram saus mentai gurih manis creamy yang dibakar (torched) harum dengan taburan tobiko.',
    22000,
    NULL,
    true,
    false,
    true,
    4
  ),
  (
    'b0000001-0000-4000-8000-000000000005',
    (SELECT id FROM public.categories WHERE slug = 'snack' LIMIT 1),
    'Dessert Box Tiramisu Homemade',
    'dessert-box-tiramisu',
    'Dessert box personal dengan sponge biskuit lembut direndam espresso wangi, krim keju mascarpone lembut tidak enek, dan taburan cokelat bubuk Belanda premium.',
    20000,
    NULL,
    true,
    false,
    false,
    5
  ),
  (
    'b0000001-0000-4000-8000-000000000006',
    (SELECT id FROM public.categories WHERE slug = 'minuman' LIMIT 1),
    'Es Kopi Susu Aren Homemade',
    'es-kopi-susu-aren',
    'Kombinasi espresso kopi lokal Aceh harum, susu segar lembut creamy, dan manisnya sirup gula aren asli. Segar dan cocok dinikmati dingin.',
    15000,
    NULL,
    true,
    false,
    false,
    6
  ),
  (
    'b0000001-0000-4000-8000-000000000007',
    (SELECT id FROM public.categories WHERE slug = 'snack' LIMIT 1),
    'Risol Ragout Ayam Sayur (Isi 3)',
    'risol-ragout-sayur',
    'Risol klasik berisi olahan ragout ayam cincang, wortel, dan kentang gurih harum pala. Disajikan dengan cabai rawit hijau.',
    15000,
    NULL,
    false,
    false,
    false,
    7
  )
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. PRODUCT IMAGES
-- 8 Image records associated with the 7 products
-- Deterministic UUID pattern: b0000002-0000-4000-8000-00000000000X
-- ------------------------------------------------------------------------------
INSERT INTO public.product_images (
  id,
  product_id,
  image_url,
  sort_order
)
VALUES
  -- Nasi Bakar Cakalang Asap (2 images)
  ('b0000002-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', '/images/hero-food.webp', 1),
  ('b0000002-0000-4000-8000-000000000002', 'b0000001-0000-4000-8000-000000000001', '/images/banner-promo-1.webp', 2),

  -- Rice Bowl Ayam Suwir Sambal Matah (1 image)
  ('b0000002-0000-4000-8000-000000000003', 'b0000001-0000-4000-8000-000000000002', '/images/ayam-suwir-matah.webp', 1),

  -- Risol Mayo Beef Lumer (Isi 3) (1 image)
  ('b0000002-0000-4000-8000-000000000004', 'b0000001-0000-4000-8000-000000000003', '/images/risol-mayo.webp', 1),

  -- Dimsum Mentai Homemade (Isi 4) (1 image)
  ('b0000002-0000-4000-8000-000000000005', 'b0000001-0000-4000-8000-000000000004', '/images/dimsum-mentai.webp', 1),

  -- Dessert Box Tiramisu Homemade (1 image)
  ('b0000002-0000-4000-8000-000000000006', 'b0000001-0000-4000-8000-000000000005', '/images/dessert-tiramisu.webp', 1),

  -- Es Kopi Susu Aren Homemade (1 image)
  ('b0000002-0000-4000-8000-000000000007', 'b0000001-0000-4000-8000-000000000006', '/images/kopi-susu-aren.webp', 1),

  -- Risol Ragout Ayam Sayur (Isi 3) (1 image)
  ('b0000002-0000-4000-8000-000000000008', 'b0000001-0000-4000-8000-000000000007', '/images/risol-mayo.webp', 1)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. PRODUCT OPTION GROUPS
-- 7 Option group records across products
-- Deterministic UUID pattern: b0000003-0000-4000-8000-00000000000X
-- ------------------------------------------------------------------------------
INSERT INTO public.product_option_groups (
  id,
  product_id,
  name,
  is_required,
  min_select,
  max_select,
  sort_order
)
VALUES
  -- Nasi Bakar Cakalang Asap
  ('b0000003-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'Level Pedas', true, 1, 1, 1),
  ('b0000003-0000-4000-8000-000000000002', 'b0000001-0000-4000-8000-000000000001', 'Porsi Nasi', false, 0, 1, 2),

  -- Rice Bowl Ayam Suwir Sambal Matah
  ('b0000003-0000-4000-8000-000000000003', 'b0000001-0000-4000-8000-000000000002', 'Tingkat Kematangan Telur', true, 1, 1, 1),

  -- Risol Mayo Beef Lumer (Isi 3)
  ('b0000003-0000-4000-8000-000000000004', 'b0000001-0000-4000-8000-000000000003', 'Varian Rasa', true, 1, 1, 1),

  -- Dimsum Mentai Homemade (Isi 4)
  ('b0000003-0000-4000-8000-000000000005', 'b0000001-0000-4000-8000-000000000004', 'Kepedasan Saus Mentai', true, 1, 1, 1),

  -- Es Kopi Susu Aren Homemade
  ('b0000003-0000-4000-8000-000000000006', 'b0000001-0000-4000-8000-000000000006', 'Tingkat Manis Gula Aren', true, 1, 1, 1),
  ('b0000003-0000-4000-8000-000000000007', 'b0000001-0000-4000-8000-000000000006', 'Takaran Es Batu', true, 1, 1, 2)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. PRODUCT OPTION VALUES
-- 15 Option value records associated with option groups
-- Deterministic UUID pattern: b0000004-0000-4000-8000-0000000000XX
-- ------------------------------------------------------------------------------
INSERT INTO public.product_option_values (
  id,
  group_id,
  name,
  price_delta,
  is_active,
  sort_order
)
VALUES
  -- Level Pedas (Nasi Bakar)
  ('b0000004-0000-4000-8000-000000000001', 'b0000003-0000-4000-8000-000000000001', 'Level 0 (Tidak Pedas)', 0, true, 1),
  ('b0000004-0000-4000-8000-000000000002', 'b0000003-0000-4000-8000-000000000001', 'Level 1 (Sedang)', 0, true, 2),
  ('b0000004-0000-4000-8000-000000000003', 'b0000003-0000-4000-8000-000000000001', 'Level 2 (Pedas Mantap)', 0, true, 3),

  -- Porsi Nasi (Nasi Bakar)
  ('b0000004-0000-4000-8000-000000000004', 'b0000003-0000-4000-8000-000000000002', 'Standar', 0, true, 1),
  ('b0000004-0000-4000-8000-000000000005', 'b0000003-0000-4000-8000-000000000002', 'Porsi Jumbo (+ Nasi Ekstra)', 5000, true, 2),

  -- Tingkat Kematangan Telur (Ayam Suwir Matah)
  ('b0000004-0000-4000-8000-000000000006', 'b0000003-0000-4000-8000-000000000003', 'Setengah Matang (Lumer)', 0, true, 1),
  ('b0000004-0000-4000-8000-000000000007', 'b0000003-0000-4000-8000-000000000003', 'Matang Sempurna', 0, true, 2),

  -- Varian Rasa (Risol Mayo Beef)
  ('b0000004-0000-4000-8000-000000000008', 'b0000003-0000-4000-8000-000000000004', 'Original Mayo Creamy', 0, true, 1),
  ('b0000004-0000-4000-8000-000000000009', 'b0000003-0000-4000-8000-000000000004', 'Spicy Mayo Pedas Gurih', 1000, true, 2),

  -- Kepedasan Saus Mentai (Dimsum Mentai)
  ('b0000004-0000-4000-8000-000000000010', 'b0000003-0000-4000-8000-000000000005', 'Mentai Regular (Gurih Manis)', 0, true, 1),
  ('b0000004-0000-4000-8000-000000000011', 'b0000003-0000-4000-8000-000000000005', 'Mentai Spicy (Sedikit Pedas)', 0, true, 2),

  -- Tingkat Manis Gula Aren (Es Kopi Susu)
  ('b0000004-0000-4000-8000-000000000012', 'b0000003-0000-4000-8000-000000000006', 'Normal Aren (Pas)', 0, true, 1),
  ('b0000004-0000-4000-8000-000000000013', 'b0000003-0000-4000-8000-000000000006', 'Less Sugar (Sedikit Manis)', 0, true, 2),

  -- Takaran Es Batu (Es Kopi Susu)
  ('b0000004-0000-4000-8000-000000000014', 'b0000003-0000-4000-8000-000000000007', 'Es Standar (Dingin Segar)', 0, true, 1),
  ('b0000004-0000-4000-8000-000000000015', 'b0000003-0000-4000-8000-000000000007', 'Less Ice (Es Sedikit)', 0, true, 2)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. ADDONS
-- 11 Distinct Addon records from mock catalog
-- Deterministic UUID pattern: b0000005-0000-4000-8000-0000000000XX
-- ------------------------------------------------------------------------------
INSERT INTO public.addons (
  id,
  name,
  description,
  price,
  is_active
)
VALUES
  ('b0000005-0000-4000-8000-000000000001', 'Ekstra Sambal Cakalang', NULL, 4000, true),
  ('b0000005-0000-4000-8000-000000000002', 'Telur Dadar Iris Gurih', NULL, 3000, true),
  ('b0000005-0000-4000-8000-000000000003', 'Kerupuk Kaleng Renyah', NULL, 2000, true),
  ('b0000005-0000-4000-8000-000000000004', 'Ekstra Sambal Matah Fresh', NULL, 3000, true),
  ('b0000005-0000-4000-8000-000000000005', 'Ekstra Saus Sambal Cocol', NULL, 1500, true),
  ('b0000005-0000-4000-8000-000000000006', 'Ekstra Keju Mozzarella (+Lumer)', NULL, 4000, true),
  ('b0000005-0000-4000-8000-000000000007', 'Homemade Chili Oil Pedas', NULL, 3000, true),
  ('b0000005-0000-4000-8000-000000000008', 'Ekstra Tobiko Melimpah', NULL, 3500, true),
  ('b0000005-0000-4000-8000-000000000009', 'Kartu Ucapan Mini & Pita', NULL, 2500, true),
  ('b0000005-0000-4000-8000-000000000010', 'Ekstra 1 Shot Espresso', NULL, 4000, true),
  ('b0000005-0000-4000-8000-000000000011', 'Grass Jelly Cincau Hitam', NULL, 3000, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. PRODUCT ADDONS
-- 12 Product-to-Addon linking records
-- ------------------------------------------------------------------------------
INSERT INTO public.product_addons (
  product_id,
  addon_id,
  sort_order
)
VALUES
  -- Nasi Bakar Cakalang Asap
  ('b0000001-0000-4000-8000-000000000001', 'b0000005-0000-4000-8000-000000000001', 1),
  ('b0000001-0000-4000-8000-000000000001', 'b0000005-0000-4000-8000-000000000002', 2),
  ('b0000001-0000-4000-8000-000000000001', 'b0000005-0000-4000-8000-000000000003', 3),

  -- Rice Bowl Ayam Suwir Sambal Matah
  ('b0000001-0000-4000-8000-000000000002', 'b0000005-0000-4000-8000-000000000004', 1),
  ('b0000001-0000-4000-8000-000000000002', 'b0000005-0000-4000-8000-000000000003', 2),

  -- Risol Mayo Beef Lumer (Isi 3)
  ('b0000001-0000-4000-8000-000000000003', 'b0000005-0000-4000-8000-000000000005', 1),
  ('b0000001-0000-4000-8000-000000000003', 'b0000005-0000-4000-8000-000000000006', 2),

  -- Dimsum Mentai Homemade (Isi 4)
  ('b0000001-0000-4000-8000-000000000004', 'b0000005-0000-4000-8000-000000000007', 1),
  ('b0000001-0000-4000-8000-000000000004', 'b0000005-0000-4000-8000-000000000008', 2),

  -- Dessert Box Tiramisu Homemade
  ('b0000001-0000-4000-8000-000000000005', 'b0000005-0000-4000-8000-000000000009', 1),

  -- Es Kopi Susu Aren Homemade
  ('b0000001-0000-4000-8000-000000000006', 'b0000005-0000-4000-8000-000000000010', 1),
  ('b0000001-0000-4000-8000-000000000006', 'b0000005-0000-4000-8000-000000000011', 2)
ON CONFLICT (product_id, addon_id) DO NOTHING;

COMMIT;
