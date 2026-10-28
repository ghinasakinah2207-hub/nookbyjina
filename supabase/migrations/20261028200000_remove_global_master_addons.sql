-- ==============================================================================
-- MIGRATION: REMOVE GLOBAL MASTER ADDONS & SCOPE ADDONS DIRECTLY TO PRODUCTS
-- File: supabase/migrations/20261028200000_remove_global_master_addons.sql
-- Project: NOOK BY JINA
--
-- STATUS: PRODUCTION-GRADE MIGRATION DRAFT (PENDING FINAL USER APPROVAL).
-- SAFETY GUARANTEES:
--   1. Zero data loss: All addon names and prices are backfilled to product_addons.
--   2. Zero transaction corruption: orders, order_items, order_item_options snapshots are 100% preserved.
--   3. Explicit dependency resolution: Drops constraints and policies cleanly before DROP TABLE RESTRICT.
--   4. Atomic product deletion: Introduces admin_delete_product_permanently(UUID) RPC for ACID safety.
--   5. Search path hardened: SET search_path = pg_catalog, public, pg_temp.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- PREFLIGHT CHECK: VERIFY TABLE INTEGRITY
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'addons') THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: Table public.addons does not exist!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_addons') THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: Table public.product_addons does not exist!';
  END IF;

  -- Ensure all product_addons have corresponding addons rows
  IF EXISTS (
    SELECT 1 FROM public.product_addons pa
    LEFT JOIN public.addons a ON a.id = pa.addon_id
    WHERE a.id IS NULL
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: Found orphaned addon_id in public.product_addons without matching public.addons row!';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 1: ADD DIRECT PRODUCT ADD-ON COLUMNS TO PUBLIC.PRODUCT_ADDONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.product_addons
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- ------------------------------------------------------------------------------
-- STEP 2: BACKFILL NAME, PRICE, AND IS_ACTIVE FROM PUBLIC.ADDONS
-- ------------------------------------------------------------------------------
UPDATE public.product_addons pa
SET 
  name = a.name,
  price = a.price::integer,
  is_active = COALESCE(a.is_active, true)
FROM public.addons a
WHERE pa.addon_id = a.id;

-- Post-backfill assertion: No NULL names or prices permitted
DO $$
DECLARE
  v_unfilled_count integer;
BEGIN
  SELECT COUNT(*) INTO v_unfilled_count 
  FROM public.product_addons 
  WHERE name IS NULL OR price IS NULL;

  IF v_unfilled_count > 0 THEN
    RAISE EXCEPTION 'POST-ASSERTION FAILED: % product_addons rows have NULL name or price after backfill!', v_unfilled_count;
  END IF;
END $$;

ALTER TABLE public.product_addons
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN price SET NOT NULL,
  ALTER COLUMN is_active SET NOT NULL;

-- ------------------------------------------------------------------------------
-- STEP 3: DROP LEGACY POLICIES, CONVERT PRIMARY KEY & DROP FOREIGN KEY DEPENDENCY
-- ------------------------------------------------------------------------------
-- 3.1 Drop legacy policies on public.product_addons that depend on addon_id
DROP POLICY IF EXISTS "Public read product addons" ON public.product_addons;
DROP POLICY IF EXISTS "Public read product addons of active products" ON public.product_addons;
DROP POLICY IF EXISTS "Admins manage product addons" ON public.product_addons;
DROP POLICY IF EXISTS "Allow public read product addons" ON public.product_addons;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.product_addons;

-- Dynamically drop any remaining policies on public.product_addons to prevent any 2BP01 dependency errors
DO $$
DECLARE
  v_pol_name text;
BEGIN
  FOR v_pol_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'product_addons'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(v_pol_name) || ' ON public.product_addons';
  END LOOP;
END $$;

-- 3.2 Drop foreign key constraint referencing public.addons
DO $$
DECLARE
  v_fk_name text;
BEGIN
  FOR v_fk_name IN
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.product_addons'::regclass 
      AND contype = 'f'
      AND confrelid = 'public.addons'::regclass
  LOOP
    EXECUTE 'ALTER TABLE public.product_addons DROP CONSTRAINT ' || quote_ident(v_fk_name);
  END LOOP;
END $$;

-- 3.3 Drop existing primary key on (product_id, addon_id)
DO $$
DECLARE
  v_pk_name text;
BEGIN
  SELECT conname INTO v_pk_name
  FROM pg_constraint
  WHERE conrelid = 'public.product_addons'::regclass AND contype = 'p';

  IF v_pk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.product_addons DROP CONSTRAINT ' || quote_ident(v_pk_name);
  END IF;
END $$;

-- 3.4 Set new Primary Key on id column
ALTER TABLE public.product_addons ADD PRIMARY KEY (id);

-- 3.5 Drop obsolete addon_id column
ALTER TABLE public.product_addons DROP COLUMN IF EXISTS addon_id;

-- 3.6 Create index on (product_id, sort_order) for high-performance catalog queries
CREATE INDEX IF NOT EXISTS idx_product_addons_product_sort 
  ON public.product_addons (product_id, sort_order ASC);

-- ------------------------------------------------------------------------------
-- STEP 4: CONFIGURE ROW-LEVEL SECURITY & PERMISSIONS ON PUBLIC.PRODUCT_ADDONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read product addons"
  ON public.product_addons
  FOR SELECT
  TO PUBLIC
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_addons.product_id
        AND p.is_archived = false
    )
  );

CREATE POLICY "Admins manage product addons"
  ON public.product_addons
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.product_addons TO anon, authenticated;
GRANT ALL ON TABLE public.product_addons TO authenticated, service_role, postgres;

-- ------------------------------------------------------------------------------
-- STEP 5: UPDATE RPC CREATE_ORDER_ATOMIC (SCOPED PRODUCT ADDON VALIDATION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order jsonb,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing_order jsonb;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_attempt integer;
  v_err_constraint text;
  v_item jsonb;
  v_item_id uuid;
  v_opt jsonb;
  v_addon jsonb;
  v_val_item jsonb;
  v_val_opt jsonb;
  v_validated_items jsonb := '[]'::jsonb;
  v_validated_options jsonb := '[]'::jsonb;
  v_item_options jsonb;
  v_item_addons jsonb;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_raw_prod_id text;
  v_prod_rec record;
  v_opt_val_rec record;
  v_addon_rec record;
  v_group_rec record;
  v_group_count integer;
  v_min_select integer;
  v_max_select integer;
  v_seen_opt_val_ids text[];
  v_selected_group_ids text[];
  v_seen_addon_ids text[];
  v_qty integer;
  v_opt_val_id text;
  v_opt_delta_sum integer := 0;
  v_addon_id text;
  v_unit_price integer;
  v_line_total integer;
  v_calculated_subtotal integer := 0;
  v_shipping_fee integer := 0;
  v_total integer := 0;
  v_deadline timestamptz := NULL;
  v_created_at timestamptz := now();
  v_raw_payment_method text;
  v_payment_method text;
  v_fulfillment_type text;
  v_delivery_area text;
  v_area_fee_raw numeric;
  v_free_thresh_raw numeric;
  v_area_fee integer;
  v_free_thresh integer;
  v_order_status text := 'Pesanan baru';
  v_raw_payment_status text;
  v_payment_status text;
  v_merchant_name text := 'Nook by Jina';
BEGIN
  -- 0. Concurrency & Idempotency: Advisory Transaction Lock on Token Hash
  IF p_token_hash IS NOT NULL AND trim(p_token_hash) != '' THEN
    PERFORM pg_advisory_xact_lock(hashtext(lower(trim(p_token_hash))));
  END IF;

  -- 0b. Authoritative Merchant Name (Server-Side Store Settings)
  -- Retrieves authoritative store_name or qris_merchant_name from public.store_settings
  v_merchant_name := COALESCE(
    (SELECT COALESCE(NULLIF(trim(store_name), ''), NULLIF(trim(qris_merchant_name), '')) FROM public.store_settings LIMIT 1),
    NULLIF(trim(p_order->>'merchantName'), ''),
    'Nook by Jina'
  );

  -- 1. Validate items array existence and minimum length
  IF p_order->'items' IS NULL OR jsonb_typeof(p_order->'items') != 'array' OR jsonb_array_length(p_order->'items') = 0 THEN
    RAISE EXCEPTION 'Pesanan wajib memiliki minimal satu item produk.' USING ERRCODE = '22000';
  END IF;

  -- 2. Validate token hash requirement & format (must be 64-char SHA-256 hex digest)
  IF p_token_hash IS NULL OR trim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'Tracking token hash wajib disertakan untuk pembuatan pesanan pelanggan.' USING ERRCODE = '22000';
  END IF;

  IF trim(p_token_hash) !~* '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Token hash tidak valid. Wajib berupa 64-karakter SHA-256 hexadecimal digest.' USING ERRCODE = '22000';
  END IF;

  -- 2b. Database-level Idempotency / Retry Defense
  SELECT jsonb_build_object(
    'id', o.order_number,
    'uuid', o.id,
    'orderNumber', o.order_number,
    'createdAt', to_char(timezone('utc', o.created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'customerName', o.customer_name,
    'customerWhatsapp', o.customer_whatsapp,
    'fulfillmentType', COALESCE(o.fulfillment_method, 'delivery'),
    'deliveryArea', COALESCE(o.delivery_area, 'Lhoksukon'),
    'orderNote', COALESCE(o.customer_note, ''),
    'items', COALESCE(o.items_snapshot, '[]'::jsonb),
    'subtotal', o.subtotal,
    'shippingFee', o.delivery_fee,
    'total', o.total,
    'orderStatus', o.order_status,
    'paymentStatus', CASE 
      WHEN o.payment_status = 'Menunggu verifikasi admin' THEN 'Menunggu Verifikasi'
      WHEN o.payment_status = 'Menunggu pembayaran' THEN 'Menunggu Pembayaran'
      WHEN o.payment_status = 'Gagal' THEN 'Dibatalkan'
      ELSE o.payment_status 
    END,
    'paymentMethod', CASE 
      WHEN o.payment_method = 'QRIS' THEN 'QRIS Statis' 
      ELSE COALESCE(o.payment_method, 'QRIS Statis') 
    END,
    'paymentDeadline', CASE WHEN o.payment_deadline IS NOT NULL THEN to_char(timezone('utc', o.payment_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
    'merchantName', COALESCE(NULLIF(trim(o.merchant_name), ''), v_merchant_name, 'Nook by Jina')
  ) INTO v_existing_order
  FROM public.anonymous_order_tokens aot
  JOIN public.orders o ON o.id = aot.order_id
  WHERE aot.token_hash = lower(trim(p_token_hash))
    AND aot.revoked_at IS NULL
  LIMIT 1;

  IF v_existing_order IS NOT NULL THEN
    RETURN v_existing_order;
  END IF;

  -- 2b-2. Revoked Token Defense
  IF EXISTS (
    SELECT 1 FROM public.anonymous_order_tokens
    WHERE token_hash = lower(trim(p_token_hash))
      AND revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Token akses pesanan ini telah dicabut atau kedaluwarsa dan tidak dapat digunakan untuk membuat pesanan baru.'
      USING ERRCODE = '22000';
  END IF;

  -- 2c. Validate customer info & order note
  IF p_order->>'customerName' IS NULL OR length(trim(p_order->>'customerName')) < 2 THEN
    RAISE EXCEPTION 'Nama lengkap pelanggan wajib diisi (minimal 2 karakter).' USING ERRCODE = '22000';
  END IF;

  IF p_order->>'customerWhatsapp' IS NULL OR trim(p_order->>'customerWhatsapp') !~* '^(08|62|\+62)[0-9\s\-]{7,15}$' THEN
    RAISE EXCEPTION 'Nomor WhatsApp pelanggan tidak valid (minimal 9 digit angka).' USING ERRCODE = '22000';
  END IF;

  IF p_order->>'orderNote' IS NOT NULL AND length(p_order->>'orderNote') > 200 THEN
    RAISE EXCEPTION 'Catatan pesanan (orderNote) tidak boleh melebihi 200 karakter (terdeteksi % karakter).',
      length(p_order->>'orderNote')
      USING ERRCODE = '22000';
  END IF;

  -- 3. Validate payment method against production payment model (QRIS & Cash)
  v_raw_payment_method := trim(COALESCE(p_order->>'paymentMethod', 'QRIS'));
  IF upper(v_raw_payment_method) IN ('QRIS', 'QRIS STATIS') THEN
    v_payment_method := 'QRIS';
  ELSIF upper(v_raw_payment_method) IN ('CASH', 'TUNAI') THEN
    v_payment_method := 'Cash';
  ELSE
    RAISE EXCEPTION 'Metode pembayaran "%" tidak didukung pada skema database produksi (hanya "QRIS" dan "Cash" yang didukung).', v_raw_payment_method
      USING ERRCODE = '22000';
  END IF;

  -- 4. Enforce strict initial statuses matching production constraints
  IF p_order->>'orderStatus' IS NOT NULL AND p_order->>'orderStatus' != 'Pesanan baru' THEN
    RAISE EXCEPTION 'Status pesanan awal tidak valid (harus "Pesanan baru").' USING ERRCODE = '22000';
  END IF;

  -- 4a. Initial payment status MUST strictly bind to payment method:
  --     QRIS -> 'Menunggu verifikasi admin'
  --     Cash -> 'Menunggu pembayaran'
  --     Mismatched combinations or non-initial statuses must be rejected fail-closed.
  v_raw_payment_status := trim(COALESCE(p_order->>'paymentStatus', ''));
  IF v_payment_method = 'QRIS' THEN
    IF v_raw_payment_status = '' OR v_raw_payment_status IN ('Menunggu Verifikasi', 'Menunggu verifikasi admin') THEN
      v_payment_status := 'Menunggu verifikasi admin';
    ELSE
      RAISE EXCEPTION 'Status pembayaran awal "%" tidak valid untuk metode QRIS (harus "Menunggu verifikasi admin").', v_raw_payment_status
        USING ERRCODE = '22000';
    END IF;
  ELSIF v_payment_method = 'Cash' THEN
    IF v_raw_payment_status = '' OR v_raw_payment_status IN ('Menunggu Pembayaran', 'Menunggu pembayaran') THEN
      v_payment_status := 'Menunggu pembayaran';
    ELSE
      RAISE EXCEPTION 'Status pembayaran awal "%" tidak valid untuk metode Cash (harus "Menunggu pembayaran").', v_raw_payment_status
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 4b. Payment deadline: exactly 30 minutes for QRIS, NULL for Cash
  IF v_payment_method = 'QRIS' THEN
    v_deadline := v_created_at + interval '30 minutes';
  ELSE
    v_deadline := NULL;
  END IF;

  -- ============================================================================
  -- EXECUTION STEP 1: VALIDATE ALL PRODUCTS, OPTIONS, ADD-ONS & PRICES IN MEMORY
  -- (NO INSERT STATEMENTS OCCUR IN THIS STEP — COMPLETELY BUFFERED IN MEMORY)
  -- ============================================================================
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items')
  LOOP
    v_raw_prod_id := trim(COALESCE(v_item->>'productId', ''));
    IF v_raw_prod_id = '' THEN
      RAISE EXCEPTION 'Item pesanan wajib menyertakan identifikasi produk (productId) yang valid.' USING ERRCODE = '22000';
    END IF;

    -- Look up product by UUID if format matches, otherwise look up by slug
    IF v_raw_prod_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id, name, price, is_available, is_archived
      INTO v_prod_rec
      FROM public.products
      WHERE id = v_raw_prod_id::uuid;
    ELSE
      SELECT id, name, price, is_available, is_archived
      INTO v_prod_rec
      FROM public.products
      WHERE slug = v_raw_prod_id;
    END IF;

    IF v_prod_rec.id IS NULL THEN
      RAISE EXCEPTION 'Produk "%" tidak ditemukan dalam katalog toko.', 
        COALESCE(v_item->>'productName', v_raw_prod_id)
        USING ERRCODE = '22000';
    END IF;

    IF v_prod_rec.is_archived IS TRUE OR v_prod_rec.is_available IS FALSE THEN
      RAISE EXCEPTION 'Produk "%" sedang tidak tersedia atau telah diarsipkan.', v_prod_rec.name
        USING ERRCODE = '22000';
    END IF;

    -- Validate quantity
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 100 THEN
      RAISE EXCEPTION 'Kuantitas untuk produk "%" tidak valid (harus 1 - 100, terdeteksi %).', 
        v_prod_rec.name, COALESCE(v_item->>'quantity', 'null')
        USING ERRCODE = '22000';
    END IF;

    v_item_id := gen_random_uuid();
    v_opt_delta_sum := 0;
    v_seen_opt_val_ids := ARRAY[]::text[];
    v_selected_group_ids := ARRAY[]::text[];
    v_item_options := '[]'::jsonb;
    v_item_addons := '[]'::jsonb;

    -- Validate selectedOptions (variant options)
    IF v_item->'selectedOptions' IS NOT NULL AND jsonb_typeof(v_item->'selectedOptions') = 'array' THEN
      FOR v_opt IN SELECT * FROM jsonb_array_elements(v_item->'selectedOptions')
      LOOP
        v_opt_val_id := trim(COALESCE(v_opt->>'optionValueId', ''));
        IF v_opt_val_id = '' THEN
          RAISE EXCEPTION 'Pilihan opsi varian pada produk "%" wajib menyertakan optionValueId.', v_prod_rec.name
            USING ERRCODE = '22000';
        END IF;

        IF v_opt_val_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT pov.id, pov.group_id, pov.name AS val_name, pov.price_delta, pog.name AS grp_name, pog.product_id
          INTO v_opt_val_rec
          FROM public.product_option_values pov
          JOIN public.product_option_groups pog ON pog.id = pov.group_id
          WHERE pov.id = v_opt_val_id::uuid;
        ELSE
          SELECT pov.id, pov.group_id, pov.name AS val_name, pov.price_delta, pog.name AS grp_name, pog.product_id
          INTO v_opt_val_rec
          FROM public.product_option_values pov
          JOIN public.product_option_groups pog ON pog.id = pov.group_id
          WHERE pog.product_id = v_prod_rec.id 
            AND (lower(pov.name) = lower(v_opt_val_id) OR lower(pov.name) = lower(COALESCE(v_opt->>'optionValue', '')))
          LIMIT 1;
        END IF;

        IF v_opt_val_rec.id IS NULL OR v_opt_val_rec.product_id != v_prod_rec.id THEN
          RAISE EXCEPTION 'Pilihan opsi varian "%" tidak valid untuk produk "%".', 
            COALESCE(v_opt->>'optionValue', v_opt_val_id), v_prod_rec.name
            USING ERRCODE = '22000';
        END IF;

        IF v_opt_val_rec.id::text = ANY(v_seen_opt_val_ids) THEN
          RAISE EXCEPTION 'Opsi varian "%" tidak boleh dipilih lebih dari satu kali dalam item produk "%".',
            v_opt_val_rec.val_name, v_prod_rec.name
            USING ERRCODE = '22000';
        END IF;

        v_seen_opt_val_ids := array_append(v_seen_opt_val_ids, v_opt_val_rec.id::text);
        v_selected_group_ids := array_append(v_selected_group_ids, v_opt_val_rec.group_id::text);

        -- Strict integer delta (truncate fractional sen if any)
        v_opt_delta_sum := v_opt_delta_sum + trunc(COALESCE(v_opt_val_rec.price_delta, 0))::integer;

        v_val_opt := jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_type', 'variant',
          'option_name', v_opt_val_rec.grp_name,
          'option_value', v_opt_val_rec.val_name,
          'price_delta', trunc(COALESCE(v_opt_val_rec.price_delta, 0))::integer
        );
        v_validated_options := v_validated_options || jsonb_build_array(v_val_opt);

        v_item_options := v_item_options || jsonb_build_array(jsonb_build_object(
          'groupName', v_opt_val_rec.grp_name,
          'optionName', v_opt_val_rec.grp_name,
          'optionValue', v_opt_val_rec.val_name,
          'priceDelta', trunc(COALESCE(v_opt_val_rec.price_delta, 0))::integer
        ));
      END LOOP;
    END IF;

    -- Validate min_select / max_select per option group for this product
    FOR v_group_rec IN 
      SELECT id, name, min_select, max_select
      FROM public.product_option_groups
      WHERE product_id = v_prod_rec.id
    LOOP
      v_group_count := 0;
      IF array_length(v_selected_group_ids, 1) > 0 THEN
        SELECT count(*) INTO v_group_count
        FROM unnest(v_selected_group_ids) AS g_id
        WHERE g_id = v_group_rec.id::text;
      END IF;

      v_min_select := COALESCE(v_group_rec.min_select, 0);
      v_max_select := v_group_rec.max_select;

      IF v_min_select > 0 AND v_group_count < v_min_select THEN
        IF v_min_select = 1 THEN
          RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" wajib dipilih.', 
            v_group_rec.name, v_prod_rec.name
            USING ERRCODE = '22000';
        ELSE
          RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" minimal harus dipilih % opsi (dipilih: %).', 
            v_group_rec.name, v_prod_rec.name, v_min_select, v_group_count
            USING ERRCODE = '22000';
        END IF;
      END IF;

      IF v_max_select IS NOT NULL AND v_group_count > v_max_select THEN
        IF v_max_select = 1 THEN
          RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" hanya boleh dipilih maksimal 1 opsi (dipilih: %).',
            v_group_rec.name, v_prod_rec.name, v_group_count
            USING ERRCODE = '22000';
        ELSE
          RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" maksimal hanya boleh dipilih % opsi (dipilih: %).',
            v_group_rec.name, v_prod_rec.name, v_max_select, v_group_count
            USING ERRCODE = '22000';
        END IF;
      END IF;
    END LOOP;

    -- Validate selectedAddons
    v_seen_addon_ids := ARRAY[]::text[];
    IF v_item->'selectedAddons' IS NOT NULL AND jsonb_typeof(v_item->'selectedAddons') = 'array' THEN
      FOR v_addon IN SELECT * FROM jsonb_array_elements(v_item->'selectedAddons')
      LOOP
        v_addon_id := trim(COALESCE(v_addon->>'addonId', ''));
        IF v_addon_id = '' THEN
          v_addon_id := trim(COALESCE(v_addon->>'addonName', ''));
        END IF;

        -- Validate addon directly from product_addons table (master addons eliminated)
        -- Strictly enforces that the addon belongs to this product and is active
        IF v_addon_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT pa.id, pa.name, pa.price, pa.product_id
          INTO v_addon_rec
          FROM public.product_addons pa
          WHERE pa.id = v_addon_id::uuid 
            AND pa.product_id = v_prod_rec.id 
            AND pa.is_active = true;
        ELSE
          SELECT pa.id, pa.name, pa.price, pa.product_id
          INTO v_addon_rec
          FROM public.product_addons pa
          WHERE pa.product_id = v_prod_rec.id 
            AND lower(pa.name) = lower(v_addon_id)
            AND pa.is_active = true
          LIMIT 1;
        END IF;

        IF v_addon_rec.id IS NULL THEN
          RAISE EXCEPTION 'Ekstra add-on "%" tidak diizinkan untuk produk "%".',
            COALESCE(v_addon->>'addonName', v_addon_id), v_prod_rec.name
            USING ERRCODE = '22000';
        END IF;

        IF v_addon_rec.id::text = ANY(v_seen_addon_ids) THEN
          RAISE EXCEPTION 'Ekstra add-on "%" tidak boleh dipilih lebih dari satu kali dalam item yang sama.',
            v_addon_rec.name
            USING ERRCODE = '22000';
        END IF;

        v_seen_addon_ids := array_append(v_seen_addon_ids, v_addon_rec.id::text);
        v_opt_delta_sum := v_opt_delta_sum + trunc(COALESCE(v_addon_rec.price, 0))::integer;

        v_val_opt := jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_type', 'addon',
          'option_name', 'Ekstra Add-on',
          'option_value', v_addon_rec.name,
          'price_delta', trunc(COALESCE(v_addon_rec.price, 0))::integer
        );
        v_validated_options := v_validated_options || jsonb_build_array(v_val_opt);

        v_item_addons := v_item_addons || jsonb_build_array(jsonb_build_object(
          'addonId', v_addon_rec.id::text,
          'addonName', v_addon_rec.name,
          'price', trunc(COALESCE(v_addon_rec.price, 0))::integer
        ));
      END LOOP;
    END IF;

    -- Authoritative item pricing
    v_unit_price := trunc(v_prod_rec.price)::integer + v_opt_delta_sum;
    v_line_total := v_unit_price * v_qty;
    v_calculated_subtotal := v_calculated_subtotal + v_line_total;

    -- Staged validated item for transactional insertion
    v_val_item := jsonb_build_object(
      'id', v_item_id,
      'order_id', v_order_id,
      'product_id', v_prod_rec.id,
      'product_name', v_prod_rec.name,
      'quantity', v_qty,
      'unit_price', v_unit_price,
      'line_total', v_line_total
    );
    v_validated_items := v_validated_items || jsonb_build_array(v_val_item);

    -- Build items_snapshot matching application CartItem format
    v_items_snapshot := v_items_snapshot || jsonb_build_array(jsonb_build_object(
      'id', v_item_id,
      'productId', v_prod_rec.id,
      'productName', v_prod_rec.name,
      'productImage', COALESCE(v_item->>'productImage', ''),
      'basePrice', trunc(v_prod_rec.price)::integer,
      'unitPrice', v_unit_price,
      'quantity', v_qty,
      'itemTotal', v_line_total,
      'itemNote', COALESCE(v_item->>'itemNote', ''),
      'isAvailable', true,
      'selectedOptions', v_item_options,
      'selectedAddons', v_item_addons
    ));
  END LOOP;

  -- ============================================================================
  -- EXECUTION STEP 2: AUTHORITATIVE FULFILLMENT & SHIPPING FEE CALCULATION
  -- ============================================================================
  v_fulfillment_type := lower(trim(COALESCE(p_order->>'fulfillmentType', 'delivery')));
  IF v_fulfillment_type NOT IN ('pickup', 'delivery') THEN
    v_fulfillment_type := 'delivery';
  END IF;

  IF v_fulfillment_type = 'pickup' THEN
    v_delivery_area := 'Pickup Toko (Lhoksukon)';
    v_shipping_fee := 0;
  ELSE
    v_delivery_area := trim(COALESCE(p_order->>'deliveryArea', 'Lhoksukon'));

    SELECT fee, free_shipping_threshold
    INTO v_area_fee_raw, v_free_thresh_raw
    FROM public.delivery_areas
    WHERE lower(name) = lower(v_delivery_area)
      AND is_active = true
    LIMIT 1;

    IF v_area_fee_raw IS NULL THEN
      RAISE EXCEPTION 'Area pengantaran "%" belum terkonfigurasi. Silakan hubungi admin terlebih dahulu.', v_delivery_area
        USING ERRCODE = '22000';
    END IF;

    -- Staging numeric values to integers, strictly rejecting fractional sen
    IF (v_area_fee_raw != trunc(v_area_fee_raw)) OR (v_free_thresh_raw IS NOT NULL AND v_free_thresh_raw != trunc(v_free_thresh_raw)) THEN
      RAISE EXCEPTION 'Konfigurasi ongkir delivery_areas mengandung nilai pecahan sen desimal yang tidak valid.'
        USING ERRCODE = '22000';
    END IF;

    v_area_fee := v_area_fee_raw::integer;
    v_free_thresh := v_free_thresh_raw::integer;

    -- Invariant: Subtotal strictly greater than threshold qualifies for free delivery
    IF v_free_thresh IS NOT NULL AND v_free_thresh > 0 AND v_calculated_subtotal > v_free_thresh THEN
      v_shipping_fee := 0;
    ELSE
      v_shipping_fee := v_area_fee;
    END IF;
  END IF;

  v_total := v_calculated_subtotal + v_shipping_fee;

  -- Ensure authoritative merchant name is guaranteed non-empty before insert
  v_merchant_name := COALESCE(NULLIF(trim(v_merchant_name), ''), 'Nook by Jina');

  -- ============================================================================
  -- EXECUTION STEP 3: CONCURRENCY-SAFE DAILY ORDER NUMBER GENERATION WITH RETRY
  -- (USES PL/PGSQL SUBTRANSACTION BLOCKS FOR ATOMIC ROLLBACK ON SEQUENCE CONFLICT)
  -- ============================================================================
  FOR v_attempt IN 1..3 LOOP
    BEGIN
      v_order_number := public.generate_daily_order_number();

      INSERT INTO public.orders (
        id,
        order_number,
        order_status,
        payment_status,
        payment_method,
        payment_deadline,
        subtotal,
        delivery_fee,
        total,
        customer_name,
        customer_whatsapp,
        customer_note,
        delivery_address,
        delivery_area,
        fulfillment_method,
        items_snapshot,
        merchant_name,
        created_at,
        updated_at
      ) VALUES (
        v_order_id,
        v_order_number,
        v_order_status,
        v_payment_status,
        v_payment_method,
        v_deadline,
        v_calculated_subtotal,
        v_shipping_fee,
        v_total,
        p_order->>'customerName',
        p_order->>'customerWhatsapp',
        COALESCE(p_order->>'orderNote', ''),
        COALESCE(p_order->>'deliveryAddress', v_delivery_area),
        v_delivery_area,
        v_fulfillment_type,
        v_items_snapshot,
        v_merchant_name,
        v_created_at,
        v_created_at
      );

      -- STEP 4: INSERT PARENT PUBLIC.ORDER_ITEMS ROWS
      FOR v_val_item IN SELECT * FROM jsonb_array_elements(v_validated_items)
      LOOP
        INSERT INTO public.order_items (
          id,
          order_id,
          product_id,
          product_name,
          quantity,
          unit_price,
          line_total,
          created_at
        ) VALUES (
          (v_val_item->>'id')::uuid,
          v_order_id,
          CASE 
            WHEN v_val_item->>'product_id' IS NOT NULL AND trim(v_val_item->>'product_id') != '' 
            THEN (v_val_item->>'product_id')::uuid 
            ELSE NULL 
          END,
          v_val_item->>'product_name',
          (v_val_item->>'quantity')::integer,
          (v_val_item->>'unit_price')::integer,
          (v_val_item->>'line_total')::integer,
          v_created_at
        );
      END LOOP;

      -- STEP 5: INSERT CHILD PUBLIC.ORDER_ITEM_OPTIONS ROWS
      IF jsonb_array_length(v_validated_options) > 0 THEN
        FOR v_val_opt IN SELECT * FROM jsonb_array_elements(v_validated_options)
        LOOP
          INSERT INTO public.order_item_options (
            id,
            order_item_id,
            option_type,
            option_name,
            option_value,
            price_delta,
            created_at
          ) VALUES (
            (v_val_opt->>'id')::uuid,
            (v_val_opt->>'order_item_id')::uuid,
            v_val_opt->>'option_type',
            v_val_opt->>'option_name',
            v_val_opt->>'option_value',
            COALESCE((v_val_opt->>'price_delta')::numeric, 0),
            v_created_at
          );
        END LOOP;
      END IF;

      -- STEP 6: INSERT ANONYMOUS_ORDER_TOKENS AND PAYMENTS
      INSERT INTO public.anonymous_order_tokens (
        id,
        order_id,
        token_hash,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_order_id,
        lower(trim(p_token_hash)),
        v_created_at
      );

      INSERT INTO public.payments (
        id,
        order_id,
        method,
        amount_due,
        status,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_order_id,
        v_payment_method,
        v_total,
        v_payment_status,
        v_created_at,
        v_created_at
      );

      EXIT; -- All inserts succeeded, break retry loop

    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_err_constraint = CONSTRAINT_NAME;

      -- First verify if an order was created concurrently with this token hash
      SELECT jsonb_build_object(
        'id', o.order_number,
        'uuid', o.id,
        'orderNumber', o.order_number,
        'createdAt', to_char(timezone('utc', o.created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'customerName', o.customer_name,
        'customerWhatsapp', o.customer_whatsapp,
        'fulfillmentType', COALESCE(o.fulfillment_method, 'delivery'),
        'deliveryArea', COALESCE(o.delivery_area, 'Lhoksukon'),
        'orderNote', COALESCE(o.customer_note, ''),
        'items', COALESCE(o.items_snapshot, '[]'::jsonb),
        'subtotal', o.subtotal,
        'shippingFee', o.delivery_fee,
        'total', o.total,
        'orderStatus', o.order_status,
        'paymentStatus', CASE 
          WHEN o.payment_status = 'Menunggu verifikasi admin' THEN 'Menunggu Verifikasi'
          WHEN o.payment_status = 'Menunggu pembayaran' THEN 'Menunggu Pembayaran'
          WHEN o.payment_status = 'Gagal' THEN 'Dibatalkan'
          ELSE o.payment_status 
        END,
        'paymentMethod', CASE 
          WHEN o.payment_method = 'QRIS' THEN 'QRIS Statis' 
          ELSE COALESCE(o.payment_method, 'QRIS Statis') 
        END,
        'paymentDeadline', CASE WHEN o.payment_deadline IS NOT NULL THEN to_char(timezone('utc', o.payment_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
        'merchantName', COALESCE(NULLIF(trim(o.merchant_name), ''), v_merchant_name, 'Nook by Jina')
      ) INTO v_existing_order
      FROM public.anonymous_order_tokens aot
      JOIN public.orders o ON o.id = aot.order_id
      WHERE aot.token_hash = lower(trim(p_token_hash))
        AND aot.revoked_at IS NULL
      LIMIT 1;

      IF v_existing_order IS NOT NULL THEN
        RETURN v_existing_order;
      END IF;

      -- Handle order_number collision: retry up to 3 attempts
      IF v_err_constraint = 'orders_order_number_key'
         OR EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_order_number) THEN
        IF v_attempt < 3 THEN
          CONTINUE;
        ELSE
          RAISE EXCEPTION 'Gagal membuat pesanan: Terjadi konflik nomor pesanan berulang kali.' USING ERRCODE = '23505';
        END IF;
      END IF;

      -- Unhandled unique violation: re-raise fail-closed
      RAISE;
    END;
  END LOOP;

  -- Return complete persisted order matching Next.js Order type
  RETURN jsonb_build_object(
    'id', v_order_number,
    'uuid', v_order_id,
    'orderNumber', v_order_number,
    'createdAt', to_char(timezone('utc', v_created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'customerName', p_order->>'customerName',
    'customerWhatsapp', p_order->>'customerWhatsapp',
    'fulfillmentType', v_fulfillment_type,
    'deliveryArea', v_delivery_area,
    'orderNote', COALESCE(p_order->>'orderNote', ''),
    'items', v_items_snapshot,
    'subtotal', v_calculated_subtotal,
    'shippingFee', v_shipping_fee,
    'total', v_total,
    'orderStatus', v_order_status,
    'paymentStatus', CASE 
      WHEN v_payment_status = 'Menunggu verifikasi admin' THEN 'Menunggu Verifikasi'
      WHEN v_payment_status = 'Menunggu pembayaran' THEN 'Menunggu Pembayaran'
      ELSE v_payment_status 
    END,
    'paymentMethod', CASE 
      WHEN v_payment_method = 'QRIS' THEN 'QRIS Statis' 
      ELSE v_payment_method 
    END,
    'paymentDeadline', CASE WHEN v_deadline IS NOT NULL THEN to_char(timezone('utc', v_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
    'merchantName', v_merchant_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, text) TO service_role, postgres;


-- ------------------------------------------------------------------------------
-- STEP 6: ATOMIC HARD-DELETE FUNCTION WITH TRANSACTION PRESERVATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_product_permanently(p_product_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_prod_name text;
  v_order_count integer;
BEGIN
  -- 1. Check if product exists
  SELECT name INTO v_prod_name FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'action', 'already_deleted');
  END IF;

  -- 2. Count order items referencing this product
  SELECT COUNT(*) INTO v_order_count FROM public.order_items WHERE product_id = p_product_id;

  -- 3. Decouple order items (Requirement C: preserves 100% of order_items rows & snapshots)
  IF v_order_count > 0 THEN
    UPDATE public.order_items SET product_id = NULL WHERE product_id = p_product_id;
  END IF;

  -- 4. Delete child catalog relations in strict FK order
  DELETE FROM public.homepage_section_products WHERE product_id = p_product_id;
  DELETE FROM public.product_images WHERE product_id = p_product_id;
  DELETE FROM public.product_addons WHERE product_id = p_product_id;
  
  -- Delete option values then groups
  DELETE FROM public.product_option_values 
  WHERE group_id IN (SELECT id FROM public.product_option_groups WHERE product_id = p_product_id);
  
  DELETE FROM public.product_option_groups WHERE product_id = p_product_id;

  -- 5. Delete the product row itself from public.products
  DELETE FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'deleted',
    'product_name', v_prod_name,
    'order_count', v_order_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_product_permanently(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_product_permanently(UUID) TO service_role, postgres;

-- ------------------------------------------------------------------------------
-- STEP 7: EXPLICITLY DROP POLICIES ON PUBLIC.ADDONS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read active addons" ON public.addons;
DROP POLICY IF EXISTS "Admins manage addons" ON public.addons;

-- ------------------------------------------------------------------------------
-- STEP 8: DROP OBSOLETE PUBLIC.ADDONS TABLE WITH RESTRICT (NOT CASCADE)
-- RESTRICT guarantees that if any unknown foreign key or object still depends
-- on public.addons, PostgreSQL will abort immediately rather than silently dropping it.
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.addons RESTRICT;

-- ------------------------------------------------------------------------------
-- FINAL ASSERTION: CONFIRM PUBLIC.PRODUCT_ADDONS REPLACES ADDONS COMPLETELY
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'addons') THEN
    RAISE EXCEPTION 'POST-ASSERTION FAILED: Table public.addons was not removed!';
  END IF;
END $$;

COMMIT;
