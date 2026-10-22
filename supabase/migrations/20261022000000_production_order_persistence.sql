-- ==============================================================================
-- Migration: Production Order Persistence & Concurrency-Safe Daily Sequencing
-- File: supabase/migrations/20261022000000_production_order_persistence.sql
-- Project: Nook by Jina
--
-- PURPOSE:
--   1. Provision atomic daily sequence counter for TJ-YYMMDD-NNN order numbering
--      under high concurrent load using Asia/Jakarta (WIB) store timezone.
--   2. Add missing order snapshot columns (delivery_area, items_snapshot, merchant_name)
--      and unique constraint on orders.order_number.
--   3. Index anonymous_order_tokens(token_hash) for sub-millisecond lookup.
--   4. Implement atomic RPC transaction public.create_order_atomic(p_order, p_token_hash)
--      to guarantee order + items + options + token_hash + payment are committed together
--      with zero orphaned records.
--   5. Implement secure token lookup and admin synchronization RPC functions.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ATOMIC DAILY ORDER COUNTER (FOR CONCURRENCY-SAFE TJ-YYMMDD-NNN NUMBERING)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_order_counters (
  order_date text PRIMARY KEY, -- 'YYMMDD' in Asia/Jakarta timezone
  last_sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.daily_order_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_order_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.daily_order_counters TO service_role, postgres;

-- ------------------------------------------------------------------------------
-- 2. DAILY SEQUENCE GENERATOR FUNCTION (ASIA/JAKARTA TIMEZONE AWARE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_daily_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_date text;
  v_seq integer;
BEGIN
  -- 1. Derive date part 'YYMMDD' in store-local WIB timezone (Asia/Jakarta)
  v_date := to_char(timezone('Asia/Jakarta', now()), 'YYMMDD');

  -- 2. Atomically upsert counter row with row-level lock
  INSERT INTO public.daily_order_counters (order_date, last_sequence, updated_at)
  VALUES (v_date, 1, timezone('utc'::text, now()))
  ON CONFLICT (order_date) DO UPDATE
    SET last_sequence = public.daily_order_counters.last_sequence + 1,
        updated_at = timezone('utc'::text, now())
  RETURNING last_sequence INTO v_seq;

  -- 3. Format order number:
  -- Sequence 1..999 is zero-padded to 3 digits (e.g. TJ-261021-001)
  -- Sequence >= 1000 dynamically expands (e.g. TJ-261021-1000) preventing collisions or truncation
  IF v_seq <= 999 THEN
    RETURN 'TJ-' || v_date || '-' || lpad(v_seq::text, 3, '0');
  ELSE
    RETURN 'TJ-' || v_date || '-' || v_seq::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_daily_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_daily_order_number() TO service_role, postgres;

-- ------------------------------------------------------------------------------
-- 3. ENHANCE PUBLIC.ORDERS TABLE (SCHEMA PRESERVATION & CONSTRAINTS)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS delivery_area text,
  ADD COLUMN IF NOT EXISTS items_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS merchant_name text DEFAULT 'Nook by Jina';

-- Ensure unique constraint on order_number specifically on public.orders
DO $$
DECLARE
  v_dup_count integer;
  v_dup_samples text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_order_number_key'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    -- Preflight: Detect whether ANY duplicate non-null order_number exists (unlimited detection)
    SELECT count(*)
    INTO v_dup_count
    FROM (
      SELECT 1
      FROM public.orders
      WHERE order_number IS NOT NULL
      GROUP BY order_number
      HAVING count(*) > 1
    ) all_dups;

    IF v_dup_count > 0 THEN
      -- Gather up to 5 sample duplicate groups for diagnostic message
      SELECT string_agg(order_number || ' (' || cnt::text || 'x)', ', ')
      INTO v_dup_samples
      FROM (
        SELECT order_number, count(*) AS cnt
        FROM public.orders
        WHERE order_number IS NOT NULL
        GROUP BY order_number
        HAVING count(*) > 1
        ORDER BY count(*) DESC, order_number ASC
        LIMIT 5
      ) sample_dups;

      RAISE EXCEPTION 'Migration preflight check failed: Ditemukan duplikasi non-null order_number pada tabel public.orders (% grup terdeteksi, sampel: %). Perbaiki atau selesaikan duplikasi riwayat pesanan secara manual sebelum menerapkan constraint unik.',
        v_dup_count, v_dup_samples
      USING ERRCODE = '23505';
    END IF;

    ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. UNIQUE INDEX ON ANONYMOUS_ORDER_TOKENS(token_hash) FOR ACTIVE TOKENS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_token_count integer;
BEGIN
  SELECT count(*) INTO v_dup_token_count
  FROM (
    SELECT token_hash
    FROM public.anonymous_order_tokens
    WHERE revoked_at IS NULL
    GROUP BY token_hash
    HAVING count(*) > 1
  ) dups;

  IF v_dup_token_count > 0 THEN
    RAISE EXCEPTION 'Migration preflight failed: Ditemukan % duplikasi token_hash aktif pada anonymous_order_tokens.', v_dup_token_count
      USING ERRCODE = '23505';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_anonymous_order_tokens_active_hash 
  ON public.anonymous_order_tokens(token_hash)
  WHERE revoked_at IS NULL;

-- ------------------------------------------------------------------------------
-- 5. ATOMIC ORDER CREATION RPC (SINGLE TRANSACTION — ZERO ORPHANED ROWS)
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
  v_opt_delta numeric;
  v_opt_delta_sum numeric;
  v_addon_id text;
  v_addon_price numeric;
  v_unit_price numeric;
  v_calculated_subtotal numeric := 0;
  v_shipping_fee numeric := 0;
  v_total numeric := 0;
  v_deadline timestamptz := NULL;
  v_created_at timestamptz := now();
  v_payment_method text;
  v_is_cash boolean;
  v_fulfillment_type text;
  v_delivery_area text;
  v_area_fee numeric;
  v_free_thresh numeric;
  v_order_status text := 'Pesanan baru';
  v_payment_status text;
  v_merchant_name text;
BEGIN
  -- 0. Concurrency & Idempotency: Advisory Transaction Lock on Token Hash
  -- Serializes concurrent requests presenting the same checkout token hash,
  -- ensuring zero duplicate order creation and seamless idempotent retry returns.
  IF p_token_hash IS NOT NULL AND trim(p_token_hash) != '' THEN
    PERFORM pg_advisory_xact_lock(hashtext(lower(trim(p_token_hash))));
  END IF;

  -- 0b. Authoritative Merchant Name (Server-Side Store Settings)
  SELECT COALESCE(store_name, 'Nook by Jina') INTO v_merchant_name
  FROM public.store_settings
  LIMIT 1;
  v_merchant_name := COALESCE(v_merchant_name, 'Nook by Jina');

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
  -- If an order has already been committed with this exact token hash, return it immediately
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
    'paymentStatus', o.payment_status,
    'paymentMethod', COALESCE(o.payment_method, 'QRIS Statis'),
    'paymentDeadline', CASE WHEN o.payment_deadline IS NOT NULL THEN to_char(timezone('utc', o.payment_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
    'merchantName', COALESCE(o.merchant_name, 'Nook by Jina')
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
  -- If this token hash was explicitly revoked, permanently forbid creating any new order with it
  IF EXISTS (
    SELECT 1 FROM public.anonymous_order_tokens
    WHERE token_hash = lower(trim(p_token_hash))
      AND revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Token akses pesanan ini telah dicabut atau kedaluwarsa dan tidak dapat digunakan untuk membuat pesanan baru.'
      USING ERRCODE = '22000';
  END IF;

  -- 2c. Validate customer info (aligns with API contract)
  IF p_order->>'customerName' IS NULL OR length(trim(p_order->>'customerName')) < 2 THEN
    RAISE EXCEPTION 'Nama lengkap pelanggan wajib diisi (minimal 2 karakter).' USING ERRCODE = '22000';
  END IF;

  IF p_order->>'customerWhatsapp' IS NULL OR trim(p_order->>'customerWhatsapp') !~* '^(08|62|\+62)[0-9\s\-]{7,15}$' THEN
    RAISE EXCEPTION 'Nomor WhatsApp pelanggan tidak valid (minimal 9 digit angka).' USING ERRCODE = '22000';
  END IF;

  -- 3. Validate payment method
  v_payment_method := trim(COALESCE(p_order->>'paymentMethod', 'QRIS Statis'));
  IF v_payment_method NOT IN ('QRIS Statis', 'Cash') THEN
    RAISE EXCEPTION 'Metode pembayaran "%" tidak didukung (harus "QRIS Statis" atau "Cash").', v_payment_method USING ERRCODE = '22000';
  END IF;
  v_is_cash := (v_payment_method = 'Cash');

  -- 4. Enforce strict initial statuses: prevent client-side payment bypass
  IF p_order->>'orderStatus' IS NOT NULL AND p_order->>'orderStatus' != 'Pesanan baru' THEN
    RAISE EXCEPTION 'Status pesanan awal tidak valid (harus "Pesanan baru").' USING ERRCODE = '22000';
  END IF;

  IF v_is_cash THEN
    IF p_order->>'paymentStatus' IS NOT NULL AND p_order->>'paymentStatus' != 'Menunggu Pembayaran' THEN
      RAISE EXCEPTION 'Status pembayaran awal untuk Cash harus "Menunggu Pembayaran".' USING ERRCODE = '22000';
    END IF;
    v_payment_status := 'Menunggu Pembayaran';
  ELSE
    IF p_order->>'paymentStatus' IS NOT NULL AND p_order->>'paymentStatus' != 'Menunggu Verifikasi' THEN
      RAISE EXCEPTION 'Status pembayaran awal untuk QRIS Statis harus "Menunggu Verifikasi".' USING ERRCODE = '22000';
    END IF;
    v_payment_status := 'Menunggu Verifikasi';
  END IF;

  -- 4b. Authoritative 30-minute payment deadline (satisfies orders.payment_deadline NOT NULL)
  -- Accepts valid client timestamp or authoritatively derives 30 minutes from creation
  IF p_order->>'paymentDeadline' IS NOT NULL AND length(trim(p_order->>'paymentDeadline')) > 0 THEN
    BEGIN
      v_deadline := (p_order->>'paymentDeadline')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_deadline := v_created_at + interval '30 minutes';
    END;
  ELSE
    v_deadline := v_created_at + interval '30 minutes';
  END IF;

  -- 5. Generate unique concurrency-safe daily order number
  v_order_number := public.generate_daily_order_number();

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

    -- If product not found by either UUID or slug, abort transaction with clear error
    IF v_prod_rec.id IS NULL THEN
      RAISE EXCEPTION 'Produk "%" tidak ditemukan dalam katalog toko.', v_raw_prod_id USING ERRCODE = '22000';
    END IF;

    -- Verify product availability and archive status
    IF v_prod_rec.is_archived OR NOT v_prod_rec.is_available THEN
      RAISE EXCEPTION 'Produk "%" saat ini tidak tersedia atau telah diarsipkan.', v_prod_rec.name USING ERRCODE = '22000';
    END IF;

    v_qty := COALESCE((v_item->>'quantity')::integer, 1);
    IF v_qty <= 0 OR v_qty > 100 THEN
      RAISE EXCEPTION 'Kuantitas untuk produk "%" tidak valid (harus bilangan bulat 1 - 100).', v_prod_rec.name USING ERRCODE = '22000';
    END IF;

    v_opt_delta_sum := 0;
    v_item_id := gen_random_uuid();
    v_item_options := '[]'::jsonb;
    v_item_addons := '[]'::jsonb;
    v_seen_opt_val_ids := ARRAY[]::text[];
    v_selected_group_ids := ARRAY[]::text[];
    v_seen_addon_ids := ARRAY[]::text[];

    -- Validate options and recalculate authoritative price deltas from database records
    IF v_item->'selectedOptions' IS NOT NULL AND jsonb_typeof(v_item->'selectedOptions') = 'array' THEN
      FOR v_opt IN SELECT * FROM jsonb_array_elements(v_item->'selectedOptions')
      LOOP
        v_opt_val_id := trim(COALESCE(v_opt->>'valueId', ''));
        v_opt_val_rec := NULL;

        IF v_opt_val_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT pov.id, pov.name, pov.price_delta, pog.id AS group_id, pog.name AS group_name
          INTO v_opt_val_rec
          FROM public.product_option_values pov
          JOIN public.product_option_groups pog ON pog.id = pov.group_id
          WHERE pov.id = v_opt_val_id::uuid
            AND pog.product_id = v_prod_rec.id
            AND pov.is_active = true;
        ELSE
          SELECT pov.id, pov.name, pov.price_delta, pog.id AS group_id, pog.name AS group_name
          INTO v_opt_val_rec
          FROM public.product_option_values pov
          JOIN public.product_option_groups pog ON pog.id = pov.group_id
          WHERE (lower(pov.name) = lower(v_opt_val_id) OR lower(pov.name) = lower(COALESCE(v_opt->>'valueName', '')))
            AND pog.product_id = v_prod_rec.id
            AND pov.is_active = true
          LIMIT 1;
        END IF;

        IF v_opt_val_rec.id IS NULL THEN
          RAISE EXCEPTION 'Pilihan varian "%" tidak valid atau tidak tersedia untuk produk "%".',
            COALESCE(v_opt->>'valueName', v_opt_val_id), v_prod_rec.name
          USING ERRCODE = '22000';
        END IF;

        -- Reject duplicate option-value IDs in the same item
        IF v_opt_val_rec.id::text = ANY(v_seen_opt_val_ids) THEN
          RAISE EXCEPTION 'Pilihan varian "%" tidak boleh dipilih lebih dari satu kali dalam item yang sama.',
            v_opt_val_rec.name
          USING ERRCODE = '22000';
        END IF;

        v_seen_opt_val_ids := array_append(v_seen_opt_val_ids, v_opt_val_rec.id::text);
        v_selected_group_ids := array_append(v_selected_group_ids, v_opt_val_rec.group_id::text);

        v_opt_delta_sum := v_opt_delta_sum + v_opt_val_rec.price_delta;

        -- Buffer child option snapshot in memory (for order_item_options table, associating with v_item_id)
        v_validated_options := v_validated_options || jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_name', v_opt_val_rec.group_name,
          'option_value', v_opt_val_rec.name,
          'price_delta', v_opt_val_rec.price_delta
        );

        -- Buffer authoritative option for customer-facing item snapshot
        v_item_options := v_item_options || jsonb_build_object(
          'groupId', v_opt_val_rec.group_id::text,
          'groupName', v_opt_val_rec.group_name,
          'valueId', v_opt_val_rec.id::text,
          'valueName', v_opt_val_rec.name,
          'priceDelta', v_opt_val_rec.price_delta
        );
      END LOOP;
    END IF;

    -- Validate option-group cardinality (min_select, max_select, is_required)
    FOR v_group_rec IN
      SELECT pog.id, pog.name, pog.is_required, pog.min_select, pog.max_select
      FROM public.product_option_groups pog
      WHERE pog.product_id = v_prod_rec.id
      ORDER BY pog.sort_order ASC
    LOOP
      -- Count valid selections for this group in the current item
      SELECT count(*) INTO v_group_count
      FROM unnest(v_selected_group_ids) AS gid
      WHERE gid = v_group_rec.id::text;

      -- Resolve effective min_select and max_select
      -- If min_select is NULL: defaults to 1 if is_required=true, else 0
      v_min_select := COALESCE(v_group_rec.min_select, CASE WHEN v_group_rec.is_required = true THEN 1 ELSE 0 END);
      -- If max_select is NULL: defaults to 1 (single-choice default)
      v_max_select := COALESCE(v_group_rec.max_select, 1);

      -- 1. Check lower bound (min_select / is_required)
      IF v_group_count < v_min_select THEN
        IF v_group_count = 0 AND (v_group_rec.is_required = true OR v_min_select >= 1) THEN
          RAISE EXCEPTION 'Pilihan varian wajib "%" untuk produk "%" belum dipilih.',
            v_group_rec.name, v_prod_rec.name
          USING ERRCODE = '22000';
        ELSE
          RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" minimal harus dipilih % opsi (dipilih: %).',
            v_group_rec.name, v_prod_rec.name, v_min_select, v_group_count
          USING ERRCODE = '22000';
        END IF;
      END IF;

      -- 2. Check upper bound (max_select)
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

    -- Validate addons and recalculate authoritative price from database records
    IF v_item->'selectedAddons' IS NOT NULL AND jsonb_typeof(v_item->'selectedAddons') = 'array' THEN
      FOR v_addon IN SELECT * FROM jsonb_array_elements(v_item->'selectedAddons')
      LOOP
        v_addon_id := trim(COALESCE(v_addon->>'addonId', ''));
        v_addon_rec := NULL;

        IF v_addon_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT a.id, a.name, a.price
          INTO v_addon_rec
          FROM public.addons a
          JOIN public.product_addons pa ON pa.addon_id = a.id
          WHERE a.id = v_addon_id::uuid
            AND pa.product_id = v_prod_rec.id
            AND a.is_active = true;
        ELSE
          SELECT a.id, a.name, a.price
          INTO v_addon_rec
          FROM public.addons a
          JOIN public.product_addons pa ON pa.addon_id = a.id
          WHERE (lower(a.name) = lower(v_addon_id) OR lower(a.name) = lower(COALESCE(v_addon->>'addonName', '')))
            AND pa.product_id = v_prod_rec.id
            AND a.is_active = true
          LIMIT 1;
        END IF;

        IF v_addon_rec.id IS NULL THEN
          RAISE EXCEPTION 'Ekstra add-on "%" tidak diizinkan atau tidak aktif untuk produk "%".',
            COALESCE(v_addon->>'addonName', v_addon_id), v_prod_rec.name
          USING ERRCODE = '22000';
        END IF;

        -- Reject duplicate add-on IDs in the same item
        IF v_addon_rec.id::text = ANY(v_seen_addon_ids) THEN
          RAISE EXCEPTION 'Ekstra add-on "%" tidak boleh dipilih lebih dari satu kali dalam item yang sama.',
            v_addon_rec.name
          USING ERRCODE = '22000';
        END IF;

        v_seen_addon_ids := array_append(v_seen_addon_ids, v_addon_rec.id::text);

        v_opt_delta_sum := v_opt_delta_sum + v_addon_rec.price;

        -- Buffer child addon snapshot in memory (stored in order_item_options table, associating with v_item_id)
        v_validated_options := v_validated_options || jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_name', 'Add-on',
          'option_value', v_addon_rec.name,
          'price_delta', v_addon_rec.price
        );

        -- Buffer authoritative addon for customer-facing item snapshot
        v_item_addons := v_item_addons || jsonb_build_object(
          'addonId', v_addon_rec.id::text,
          'addonName', v_addon_rec.name,
          'price', v_addon_rec.price
        );
      END LOOP;
    END IF;

    v_unit_price := v_prod_rec.price + v_opt_delta_sum;
    v_calculated_subtotal := v_calculated_subtotal + (v_unit_price * v_qty);

    -- Buffer validated parent item in memory (for order_items table)
    v_validated_items := v_validated_items || jsonb_build_object(
      'id', v_item_id,
      'order_id', v_order_id,
      'product_id', v_prod_rec.id,
      'product_name', v_prod_rec.name,
      'quantity', v_qty,
      'unit_price', v_unit_price,
      'item_note', COALESCE(v_item->>'itemNote', '')
    );

    -- Buffer authoritative customer-facing item snapshot
    -- Strictly uses database-derived names and prices, ignoring any client tampering
    v_items_snapshot := v_items_snapshot || jsonb_build_object(
      'id', COALESCE(v_item->>'id', v_item_id::text),
      'productId', v_prod_rec.id::text,
      'productName', v_prod_rec.name,
      'productImage', COALESCE(v_item->>'productImage', ''),
      'basePrice', v_prod_rec.price,
      'unitPrice', v_unit_price,
      'itemTotal', (v_unit_price * v_qty),
      'quantity', v_qty,
      'itemNote', COALESCE(v_item->>'itemNote', ''),
      'isAvailable', true,
      'selectedOptions', v_item_options,
      'selectedAddons', v_item_addons
    );
  END LOOP;

  -- ============================================================================
  -- EXECUTION STEP 2: CALCULATE AUTHORITATIVE SUBTOTAL AND DELIVERY FEE
  -- ============================================================================
  v_fulfillment_type := lower(trim(COALESCE(p_order->>'fulfillmentType', 'delivery')));
  IF v_fulfillment_type NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'Metode fulfillment "%" tidak valid (harus "pickup" atau "delivery").', v_fulfillment_type USING ERRCODE = '22000';
  END IF;

  IF v_fulfillment_type = 'pickup' THEN
    v_delivery_area := 'Pickup Toko (Lhoksukon)';
    v_shipping_fee := 0;
  ELSE
    IF (p_order->>'deliveryAddress' IS NULL OR trim(p_order->>'deliveryAddress') = '') AND
       (p_order->>'deliveryArea' IS NULL OR trim(p_order->>'deliveryArea') = '') THEN
      RAISE EXCEPTION 'Alamat atau area pengantaran wajib diisi untuk layanan delivery.' USING ERRCODE = '22000';
    END IF;
    v_delivery_area := trim(COALESCE(p_order->>'deliveryArea', 'Lhoksukon'));
    SELECT fee, free_shipping_threshold INTO v_area_fee, v_free_thresh
    FROM public.delivery_areas
    WHERE is_active = true
      AND (lower(name) = lower(v_delivery_area) OR (lower(name) LIKE '%lhoksukon%' AND lower(v_delivery_area) LIKE '%lhoksukon%'))
    ORDER BY sort_order ASC
    LIMIT 1;

    IF v_area_fee IS NULL THEN
      RAISE EXCEPTION 'Area pengantaran "%" belum terkonfigurasi atau tidak aktif.', v_delivery_area USING ERRCODE = '22000';
    END IF;

    -- Free delivery applies when subtotal >= free_shipping_threshold
    IF v_calculated_subtotal >= COALESCE(v_free_thresh, 50000) THEN
      v_shipping_fee := 0;
    ELSE
      v_shipping_fee := v_area_fee;
    END IF;
  END IF;

  v_total := v_calculated_subtotal + v_shipping_fee;

  -- ============================================================================
  -- EXECUTION STEP 3: INSERT PARENT PUBLIC.ORDERS ROW
  -- (Must exist before order_items, anonymous_order_tokens, and payments)
  -- ============================================================================
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

  -- ============================================================================
  -- EXECUTION STEP 4: INSERT EACH PARENT PUBLIC.ORDER_ITEMS ROW
  -- (ALL parent order_items rows are inserted BEFORE any child order_item_options rows)
  -- ============================================================================
  FOR v_val_item IN SELECT * FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items (
      id,
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      item_note,
      created_at
    ) VALUES (
      (v_val_item->>'id')::uuid,
      (v_val_item->>'order_id')::uuid,
      (v_val_item->>'product_id')::uuid,
      v_val_item->>'product_name',
      (v_val_item->>'quantity')::integer,
      (v_val_item->>'unit_price')::numeric,
      COALESCE(v_val_item->>'item_note', ''),
      v_created_at
    );
  END LOOP;

  -- ============================================================================
  -- EXECUTION STEP 5: INSERT CORRESPONDING CHILD PUBLIC.ORDER_ITEM_OPTIONS ROWS
  -- (Guaranteed that referenced order_item_id already exists in public.order_items)
  -- ============================================================================
  IF jsonb_array_length(v_validated_options) > 0 THEN
    FOR v_val_opt IN SELECT * FROM jsonb_array_elements(v_validated_options)
    LOOP
      INSERT INTO public.order_item_options (
        id,
        order_item_id,
        option_name,
        option_value,
        price_delta,
        created_at
      ) VALUES (
        (v_val_opt->>'id')::uuid,
        (v_val_opt->>'order_item_id')::uuid,
        v_val_opt->>'option_name',
        v_val_opt->>'option_value',
        (v_val_opt->>'price_delta')::numeric,
        v_created_at
      );
    END LOOP;
  END IF;

  -- ============================================================================
  -- EXECUTION STEP 6: INSERT ANONYMOUS_ORDER_TOKENS AND PAYMENTS
  -- ============================================================================
  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- Fallback for concurrency: another worker committed this token hash
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
      'paymentStatus', o.payment_status,
      'paymentMethod', COALESCE(o.payment_method, 'QRIS Statis'),
      'paymentDeadline', CASE WHEN o.payment_deadline IS NOT NULL THEN to_char(timezone('utc', o.payment_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
      'merchantName', COALESCE(o.merchant_name, v_merchant_name)
    ) INTO v_existing_order
    FROM public.anonymous_order_tokens aot
    JOIN public.orders o ON o.id = aot.order_id
    WHERE aot.token_hash = lower(trim(p_token_hash))
      AND aot.revoked_at IS NULL
    LIMIT 1;

    IF v_existing_order IS NOT NULL THEN
      RETURN v_existing_order;
    ELSE
      RAISE;
    END IF;
  END;

  INSERT INTO public.payments (
    id,
    order_id,
    method,
    status,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_order_id,
    v_payment_method,
    v_payment_status,
    v_created_at,
    v_created_at
  );

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
    'paymentStatus', v_payment_status,
    'paymentMethod', v_payment_method,
    'paymentDeadline', CASE WHEN v_deadline IS NOT NULL THEN to_char(timezone('utc', v_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
    'merchantName', v_merchant_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, text) TO service_role, postgres;

-- ------------------------------------------------------------------------------
-- 6. ORDER LOOKUP BY TOKEN HASH RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_order_by_token_hash(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF p_token_hash IS NULL OR trim(p_token_hash) = '' OR trim(p_token_hash) !~* '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

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
    'paymentStatus', o.payment_status,
    'paymentMethod', COALESCE(o.payment_method, 'QRIS Statis'),
    'paymentDeadline', CASE WHEN o.payment_deadline IS NOT NULL THEN to_char(timezone('utc', o.payment_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
    'merchantName', COALESCE(o.merchant_name, 'Nook by Jina')
  ) INTO v_res
  FROM public.anonymous_order_tokens aot
  JOIN public.orders o ON o.id = aot.order_id
  WHERE aot.token_hash = lower(trim(p_token_hash))
    AND aot.revoked_at IS NULL
  LIMIT 1;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_order_by_token_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_order_by_token_hash(text) TO service_role, postgres;

-- ------------------------------------------------------------------------------
-- 7. BATCH ORDER HISTORY LOOKUP BY TOKEN HASHES RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_orders_by_token_hashes(p_token_hashes text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF p_token_hashes IS NULL OR array_length(p_token_hashes, 1) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
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
      'paymentStatus', o.payment_status,
      'paymentMethod', COALESCE(o.payment_method, 'QRIS Statis'),
      'paymentDeadline', CASE WHEN o.payment_deadline IS NOT NULL THEN to_char(timezone('utc', o.payment_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
      'merchantName', COALESCE(o.merchant_name, 'Nook by Jina')
    ) ORDER BY o.created_at DESC
  ), '[]'::jsonb) INTO v_res
  FROM public.anonymous_order_tokens aot
  JOIN public.orders o ON o.id = aot.order_id
  WHERE aot.token_hash = ANY(
    SELECT lower(trim(h))
    FROM unnest(p_token_hashes) AS h
    WHERE h IS NOT NULL AND trim(h) ~* '^[0-9a-f]{64}$'
  )
    AND aot.revoked_at IS NULL;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_orders_by_token_hashes(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_orders_by_token_hashes(text[]) TO service_role, postgres;

-- ------------------------------------------------------------------------------
-- 8. ADMIN UPDATE ORDER STATUS RPC (SERVER-ONLY RESTRICTED, SECURITY DEFINER)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_id text,
  p_order_status text,
  p_payment_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_existing_order_status text;
  v_existing_payment_status text;
  v_res jsonb;
BEGIN
  -- Security Guard: Fail-closed authorization check
  -- Permitted ONLY if caller is explicitly service_role OR public.is_admin() returns TRUE
  IF (auth.role() IS DISTINCT FROM 'service_role') AND (public.is_admin() IS NOT TRUE) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya admin toko terotorisasi yang dapat memperbarui status pesanan.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate requested statuses against canonical OrderStatus & PaymentStatus enums
  IF p_order_status IS NOT NULL AND p_order_status NOT IN ('Pesanan baru', 'Diproses', 'Siap', 'Selesai', 'Dibatalkan') THEN
    RAISE EXCEPTION 'Status pesanan "%" tidak valid.', p_order_status USING ERRCODE = '22000';
  END IF;

  IF p_payment_status IS NOT NULL AND p_payment_status NOT IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Lunas', 'Dibatalkan') THEN
    RAISE EXCEPTION 'Status pembayaran "%" tidak valid.', p_payment_status USING ERRCODE = '22000';
  END IF;

  -- Query existing order state
  SELECT id, order_status, payment_status
  INTO v_existing_id, v_existing_order_status, v_existing_payment_status
  FROM public.orders
  WHERE order_number = p_order_id OR id::text = p_order_id;

  IF v_existing_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Transition Rules:
  -- 1. Cancelled orders cannot be resurrected
  IF v_existing_order_status = 'Dibatalkan' AND p_order_status IS NOT NULL AND p_order_status != 'Dibatalkan' THEN
    RAISE EXCEPTION 'Pesanan yang telah dibatalkan tidak dapat diaktifkan kembali.' USING ERRCODE = '22000';
  END IF;

  -- 1b. Cancelled orders cannot receive payment
  IF (v_existing_order_status = 'Dibatalkan' OR v_existing_payment_status = 'Dibatalkan')
     AND p_payment_status = 'Lunas' THEN
    RAISE EXCEPTION 'Pesanan yang telah dibatalkan tidak dapat diubah status pembayarannya menjadi Lunas.'
      USING ERRCODE = '22000';
  END IF;

  -- 2. Completed orders cannot be reverted to preliminary states
  IF v_existing_order_status = 'Selesai' AND p_order_status IS NOT NULL AND p_order_status NOT IN ('Selesai', 'Dibatalkan') THEN
    RAISE EXCEPTION 'Pesanan yang telah selesai tidak dapat dikembalikan ke status persiapan.' USING ERRCODE = '22000';
  END IF;

  -- 3. Cannot mark an order completed if its payment is cancelled
  IF (p_order_status = 'Selesai' OR (p_order_status IS NULL AND v_existing_order_status = 'Selesai'))
     AND (p_payment_status = 'Dibatalkan' OR (p_payment_status IS NULL AND v_existing_payment_status = 'Dibatalkan')) THEN
    RAISE EXCEPTION 'Pesanan dengan status pembayaran "Dibatalkan" tidak dapat diselesaikan.' USING ERRCODE = '22000';
  END IF;

  -- 4. Synchronize payment cancellation if order is cancelled while awaiting payment
  IF p_order_status = 'Dibatalkan' AND p_payment_status IS NULL AND v_existing_payment_status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi') THEN
    p_payment_status := 'Dibatalkan';
  END IF;

  -- 5. Synchronize order cancellation if payment is cancelled while order is in preliminary or ready state
  IF p_payment_status = 'Dibatalkan' AND p_order_status IS NULL AND v_existing_order_status IN ('Pesanan baru', 'Diproses', 'Siap') THEN
    p_order_status := 'Dibatalkan';
  END IF;

  UPDATE public.orders
  SET
    order_status = COALESCE(p_order_status, order_status),
    payment_status = COALESCE(p_payment_status, payment_status),
    paid_at = CASE WHEN p_payment_status = 'Lunas' THEN now() ELSE paid_at END,
    cancelled_at = CASE WHEN p_order_status = 'Dibatalkan' OR p_payment_status = 'Dibatalkan' THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = v_existing_id;

  -- Synchronize payments table
  IF p_payment_status IS NOT NULL THEN
    UPDATE public.payments
    SET status = p_payment_status, updated_at = now()
    WHERE order_id = v_existing_id;
  END IF;

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
    'paymentStatus', o.payment_status,
    'paymentMethod', COALESCE(o.payment_method, 'QRIS Statis'),
    'paymentDeadline', CASE WHEN o.payment_deadline IS NOT NULL THEN to_char(timezone('utc', o.payment_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
    'merchantName', COALESCE(o.merchant_name, 'Nook by Jina')
  ) INTO v_res
  FROM public.orders o
  WHERE o.id = v_existing_id;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(text, text, text) TO service_role, postgres;

-- ------------------------------------------------------------------------------
-- 9. GET ALL ORDERS FOR ADMIN DASHBOARD RPC (SERVER-ONLY RESTRICTED, SECURITY DEFINER)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_res jsonb;
BEGIN
  -- Security Guard: Fail-closed authorization check
  -- Permitted ONLY if caller is explicitly service_role OR public.is_admin() returns TRUE
  IF (auth.role() IS DISTINCT FROM 'service_role') AND (public.is_admin() IS NOT TRUE) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya admin toko terotorisasi yang dapat mengakses daftar pesanan admin.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
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
      'paymentStatus', o.payment_status,
      'paymentMethod', COALESCE(o.payment_method, 'QRIS Statis'),
      'paymentDeadline', CASE WHEN o.payment_deadline IS NOT NULL THEN to_char(timezone('utc', o.payment_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
      'merchantName', COALESCE(o.merchant_name, 'Nook by Jina')
    ) ORDER BY o.created_at DESC
  ), '[]'::jsonb) INTO v_res
  FROM public.orders o;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_orders() TO service_role, postgres;

COMMIT;
