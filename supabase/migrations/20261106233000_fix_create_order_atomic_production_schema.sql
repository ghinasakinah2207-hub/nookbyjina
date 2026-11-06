-- Migration: 20261106233000_fix_create_order_atomic_production_schema.sql
-- Description:
-- Production Schema Alignment & Robust Fix for create_order_atomic RPC.
-- 1. Aligns public.payments columns with production schema (id, order_id, method, amount_due, status, created_at, updated_at).
--    Fixes Postgres error 42703 (undefined_column) caused by referencing non-existent columns (amount, payment_status, payment_method).
-- 2. Aligns public.daily_order_counters with production schema (order_date, last_sequence, updated_at).
--    Uses atomic CTE with ON CONFLICT (order_date) DO UPDATE and safe format padding.
-- 3. Strictly targets public.orders canonical columns (customer_whatsapp, avoiding customer_phone).
-- 4. Guarantees gen_random_uuid() for public.anonymous_order_tokens.id and public.payments.id.
-- 5. Preserves authoritative product_type ('ready' | 'preorder') in items_snapshot derived directly from public.products.
-- 6. Enforces robust 5-attempt retry loop and concurrency-safe advisory locks.

BEGIN;

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

  IF p_order->>'customerWhatsapp' IS NULL OR length(trim(p_order->>'customerWhatsapp')) < 8 THEN
    RAISE EXCEPTION 'Nomor WhatsApp pelanggan wajib diisi (minimal 8 digit).' USING ERRCODE = '22000';
  END IF;

  IF p_order->>'orderNote' IS NOT NULL AND length(trim(p_order->>'orderNote')) > 200 THEN
    RAISE EXCEPTION 'Catatan pesanan maksimal 200 karakter.' USING ERRCODE = '22000';
  END IF;

  -- 3. Strict Payment Method Validation
  v_raw_payment_method := trim(COALESCE(p_order->>'paymentMethod', ''));
  IF v_raw_payment_method IN ('QRIS', 'QRIS Statis') THEN
    v_payment_method := 'QRIS';
  ELSIF v_raw_payment_method = 'Cash' THEN
    v_payment_method := 'Cash';
  ELSE
    RAISE EXCEPTION 'Metode pembayaran "%" tidak valid (harus "QRIS" atau "Cash").', v_raw_payment_method
      USING ERRCODE = '22000';
  END IF;

  -- 4. Enforce strict initial statuses matching production constraints
  IF p_order->>'orderStatus' IS NOT NULL AND p_order->>'orderStatus' != 'Pesanan baru' THEN
    RAISE EXCEPTION 'Status pesanan awal tidak valid (harus "Pesanan baru").' USING ERRCODE = '22000';
  END IF;

  -- 4a. Initial payment status MUST strictly bind to payment method:
  --     QRIS -> 'Menunggu verifikasi admin' or 'Menunggu pembayaran' (gateway QRIS)
  --     Cash -> 'Menunggu pembayaran'
  v_raw_payment_status := trim(COALESCE(p_order->>'paymentStatus', ''));
  IF v_payment_method = 'QRIS' THEN
    IF v_raw_payment_status = '' OR v_raw_payment_status IN ('Menunggu Verifikasi', 'Menunggu verifikasi admin') THEN
      v_payment_status := 'Menunggu verifikasi admin';
      v_deadline := v_created_at + interval '30 minutes';
    ELSIF v_raw_payment_status IN ('Menunggu Pembayaran', 'Menunggu pembayaran') THEN
      v_payment_status := 'Menunggu pembayaran';
      IF p_order->>'paymentDeadline' IS NOT NULL AND p_order->>'paymentDeadline' != '' THEN
        BEGIN
          v_deadline := (p_order->>'paymentDeadline')::timestamptz;
        EXCEPTION WHEN OTHERS THEN
          v_deadline := v_created_at + interval '15 minutes';
        END;
      ELSE
        v_deadline := v_created_at + interval '15 minutes';
      END IF;
    ELSE
      RAISE EXCEPTION 'Status pembayaran awal "%" tidak valid untuk metode QRIS.', v_raw_payment_status
        USING ERRCODE = '22000';
    END IF;
  ELSIF v_payment_method = 'Cash' THEN
    IF v_raw_payment_status != '' AND v_raw_payment_status NOT IN ('Menunggu Pembayaran', 'Menunggu pembayaran') THEN
      RAISE EXCEPTION 'Status pembayaran awal "%" tidak valid untuk metode Cash (harus "Menunggu pembayaran").', v_raw_payment_status
        USING ERRCODE = '22000';
    END IF;
    v_payment_status := 'Menunggu pembayaran';
    v_deadline := NULL;
  END IF;

  -- ============================================================================
  -- EXECUTION STEP 1: VALIDATE ALL PRODUCTS, OPTIONS, ADD-ONS & PRICES IN MEMORY
  -- ============================================================================
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items')
  LOOP
    v_raw_prod_id := trim(COALESCE(v_item->>'productId', ''));
    IF v_raw_prod_id = '' THEN
      RAISE EXCEPTION 'Item pesanan wajib menyertakan identifikasi produk (productId) yang valid.' USING ERRCODE = '22000';
    END IF;

    -- Look up product by UUID if format matches, otherwise look up by slug (including product_type)
    IF v_raw_prod_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id, name, price, is_available, is_archived, product_type
      INTO v_prod_rec
      FROM public.products
      WHERE id = v_raw_prod_id::uuid;
    ELSE
      SELECT id, name, price, is_available, is_archived, product_type
      INTO v_prod_rec
      FROM public.products
      WHERE slug = v_raw_prod_id;
    END IF;

    IF v_prod_rec.id IS NULL THEN
      RAISE EXCEPTION 'Produk dengan identifikasi "%" tidak ditemukan dalam katalog.', v_raw_prod_id USING ERRCODE = '22000';
    END IF;

    IF v_prod_rec.is_archived IS TRUE THEN
      RAISE EXCEPTION 'Produk "%" sudah diarsipkan dan tidak lagi tersedia untuk dipesan.', v_prod_rec.name USING ERRCODE = '22000';
    END IF;

    IF v_prod_rec.is_available IS NOT TRUE THEN
      RAISE EXCEPTION 'Produk "%" saat ini sedang habis atau tidak tersedia.', v_prod_rec.name USING ERRCODE = '22000';
    END IF;

    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Jumlah item untuk produk "%" wajib bernilai minimal 1.', v_prod_rec.name USING ERRCODE = '22000';
    END IF;

    v_item_id := gen_random_uuid();
    v_opt_delta_sum := 0;
    v_seen_opt_val_ids := ARRAY[]::text[];
    v_selected_group_ids := ARRAY[]::text[];
    v_seen_addon_ids := ARRAY[]::text[];
    v_item_options := '[]'::jsonb;
    v_item_addons := '[]'::jsonb;

    -- Validate selectedOptions
    IF v_item->'selectedOptions' IS NOT NULL AND jsonb_typeof(v_item->'selectedOptions') = 'array' THEN
      FOR v_opt IN SELECT * FROM jsonb_array_elements(v_item->'selectedOptions')
      LOOP
        v_opt_val_id := trim(COALESCE(v_opt->>'optionValueId', v_opt->>'valueId', ''));
        IF v_opt_val_id = '' THEN
          RAISE EXCEPTION 'Opsi varian produk "%" wajib memiliki optionValueId yang valid.', v_prod_rec.name USING ERRCODE = '22000';
        END IF;

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
          WHERE lower(pov.name) = lower(v_opt_val_id)
            AND pog.product_id = v_prod_rec.id
            AND pov.is_active = true
          LIMIT 1;
        END IF;

        IF v_opt_val_rec.id IS NULL THEN
          RAISE EXCEPTION 'Pilihan varian "%" tidak valid atau tidak tersedia untuk produk "%".',
            COALESCE(v_opt->>'valueName', v_opt->>'optionValue', v_opt_val_id), v_prod_rec.name
            USING ERRCODE = '22000';
        END IF;

        IF v_opt_val_rec.id::text = ANY(v_seen_opt_val_ids) THEN
          RAISE EXCEPTION 'Pilihan varian "%" tidak boleh dipilih lebih dari satu kali dalam item yang sama.',
            v_opt_val_rec.name
            USING ERRCODE = '22000';
        END IF;

        v_seen_opt_val_ids := array_append(v_seen_opt_val_ids, v_opt_val_rec.id::text);
        v_selected_group_ids := array_append(v_selected_group_ids, v_opt_val_rec.group_id::text);
        v_opt_delta_sum := v_opt_delta_sum + trunc(COALESCE(v_opt_val_rec.price_delta, 0))::integer;

        v_val_opt := jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_type', 'variant',
          'option_name', v_opt_val_rec.group_name,
          'option_value', v_opt_val_rec.name,
          'price_delta', trunc(COALESCE(v_opt_val_rec.price_delta, 0))::integer
        );
        v_validated_options := v_validated_options || jsonb_build_array(v_val_opt);

        v_item_options := v_item_options || jsonb_build_array(jsonb_build_object(
          'groupId', v_opt_val_rec.group_id::text,
          'groupName', v_opt_val_rec.group_name,
          'valueId', v_opt_val_rec.id::text,
          'valueName', v_opt_val_rec.name,
          'optionValueId', v_opt_val_rec.id::text,
          'optionValue', v_opt_val_rec.name,
          'priceDelta', trunc(COALESCE(v_opt_val_rec.price_delta, 0))::integer
        ));
      END LOOP;
    END IF;

    -- Validate option groups cardinality
    FOR v_group_rec IN
      SELECT pog.id, pog.name, pog.is_required, pog.min_select, pog.max_select
      FROM public.product_option_groups pog
      WHERE pog.product_id = v_prod_rec.id
    LOOP
      v_group_count := 0;
      IF array_length(v_selected_group_ids, 1) IS NOT NULL THEN
        SELECT count(*) INTO v_group_count
        FROM unnest(v_selected_group_ids) AS g_id
        WHERE g_id = v_group_rec.id::text;
      END IF;

      v_min_select := COALESCE(v_group_rec.min_select, CASE WHEN v_group_rec.is_required IS TRUE THEN 1 ELSE 0 END);
      v_max_select := COALESCE(v_group_rec.max_select, 1);

      IF v_group_count < v_min_select THEN
        IF v_group_count = 0 AND (v_group_rec.is_required IS TRUE OR v_min_select >= 1) THEN
          RAISE EXCEPTION 'Pilihan varian wajib "%" untuk produk "%" belum dipilih.',
            v_group_rec.name, v_prod_rec.name
            USING ERRCODE = '22000';
        ELSE
          RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" minimal harus dipilih % opsi (dipilih: %).',
            v_group_rec.name, v_prod_rec.name, v_min_select, v_group_count
            USING ERRCODE = '22000';
        END IF;
      END IF;

      IF v_max_select IS NOT NULL AND v_group_count > v_max_select THEN
        RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" maksimal hanya boleh dipilih % opsi (dipilih: %).',
          v_group_rec.name, v_prod_rec.name, v_max_select, v_group_count
          USING ERRCODE = '22000';
      END IF;
    END LOOP;

    -- Validate addons
    IF v_item->'selectedAddons' IS NOT NULL AND jsonb_typeof(v_item->'selectedAddons') = 'array' THEN
      FOR v_addon IN SELECT * FROM jsonb_array_elements(v_item->'selectedAddons')
      LOOP
        v_addon_id := trim(COALESCE(v_addon->>'addonId', ''));
        IF v_addon_id = '' THEN
          RAISE EXCEPTION 'Add-on produk "%" wajib memiliki addonId yang valid.', v_prod_rec.name USING ERRCODE = '22000';
        END IF;

        IF v_addon_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT pa.id, pa.name, pa.price
          INTO v_addon_rec
          FROM public.product_addons pa
          WHERE pa.id = v_addon_id::uuid
            AND pa.product_id = v_prod_rec.id
            AND pa.is_active = true;
        ELSE
          SELECT pa.id, pa.name, pa.price
          INTO v_addon_rec
          FROM public.product_addons pa
          WHERE lower(pa.name) = lower(v_addon_id)
            AND pa.product_id = v_prod_rec.id
            AND pa.is_active = true
          LIMIT 1;
        END IF;

        IF v_addon_rec.id IS NULL THEN
          RAISE EXCEPTION 'Ekstra add-on "%" tidak diizinkan atau tidak aktif untuk produk "%".',
            COALESCE(v_addon->>'addonName', v_addon_id), v_prod_rec.name
            USING ERRCODE = '22000';
        END IF;

        IF v_addon_rec.id::text = ANY(v_seen_addon_ids) THEN
          RAISE EXCEPTION 'Ekstra add-on "%" tidak boleh ditambahkan lebih dari satu kali.', v_addon_rec.name USING ERRCODE = '22000';
        END IF;

        v_seen_addon_ids := array_append(v_seen_addon_ids, v_addon_rec.id::text);
        v_opt_delta_sum := v_opt_delta_sum + trunc(COALESCE(v_addon_rec.price, 0))::integer;

        v_val_opt := jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_type', 'addon',
          'option_name', 'Add-on',
          'option_value', v_addon_rec.name,
          'price_delta', trunc(COALESCE(v_addon_rec.price, 0))::integer
        );
        v_validated_options := v_validated_options || jsonb_build_array(v_val_opt);

        v_item_addons := v_item_addons || jsonb_build_array(jsonb_build_object(
          'id', v_addon_rec.id::text,
          'addonId', v_addon_rec.id::text,
          'name', v_addon_rec.name,
          'addonName', v_addon_rec.name,
          'price', trunc(COALESCE(v_addon_rec.price, 0))::integer
        ));
      END LOOP;
    END IF;

    -- Calculate unit price and line total
    v_unit_price := trunc(v_prod_rec.price)::integer + v_opt_delta_sum;
    v_line_total := v_unit_price * v_qty;
    v_calculated_subtotal := v_calculated_subtotal + v_line_total;

    -- Buffer validated item for batch persistence
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

    -- Build items_snapshot matching application CartItem format (WITH authoritative productType)
    v_items_snapshot := v_items_snapshot || jsonb_build_array(jsonb_build_object(
      'id', v_item_id,
      'productId', v_prod_rec.id,
      'productName', v_prod_rec.name,
      'productImage', COALESCE(v_item->>'productImage', ''),
      'productType', CASE
        WHEN lower(trim(COALESCE(v_prod_rec.product_type, ''))) = 'ready' THEN 'ready'
        ELSE 'preorder'
      END,
      'basePrice', trunc(v_prod_rec.price)::integer,
      'unitPrice', v_unit_price,
      'quantity', v_qty,
      'selectedOptions', v_item_options,
      'selectedAddons', v_item_addons
    ));
  END LOOP;

  -- ============================================================================
  -- EXECUTION STEP 2: CALCULATE DELIVERY FEE & AUTHORITATIVE ORDER TOTAL
  -- ============================================================================
  v_fulfillment_type := lower(trim(COALESCE(p_order->>'fulfillmentType', 'delivery')));
  IF v_fulfillment_type NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Metode pemenuhan pesanan (fulfillmentType) tidak valid (harus "delivery" atau "pickup").' USING ERRCODE = '22000';
  END IF;

  IF v_fulfillment_type = 'pickup' THEN
    v_delivery_area := 'Pickup Toko (Lhoksukon)';
    v_shipping_fee := 0;
  ELSE
    v_delivery_area := trim(COALESCE(p_order->>'deliveryArea', 'Lhoksukon'));
    SELECT fee, free_shipping_threshold INTO v_area_fee_raw, v_free_thresh_raw
    FROM public.delivery_areas
    WHERE is_active = true
      AND (lower(name) = lower(v_delivery_area) OR (lower(name) LIKE '%lhoksukon%' AND lower(v_delivery_area) LIKE '%lhoksukon%'))
    ORDER BY sort_order ASC
    LIMIT 1;

    IF v_area_fee_raw IS NULL THEN
      RAISE EXCEPTION 'Area pengantaran "%" belum terkonfigurasi atau tidak aktif.', v_delivery_area USING ERRCODE = '22000';
    END IF;

    v_area_fee := trunc(v_area_fee_raw)::integer;
    v_free_thresh := CASE WHEN v_free_thresh_raw IS NOT NULL THEN trunc(v_free_thresh_raw)::integer ELSE NULL END;

    IF v_free_thresh IS NOT NULL AND v_free_thresh > 0 AND v_calculated_subtotal >= v_free_thresh THEN
      v_shipping_fee := 0;
    ELSE
      v_shipping_fee := v_area_fee;
    END IF;
  END IF;

  v_total := v_calculated_subtotal + v_shipping_fee;

  -- Verify client subtotal and total if provided
  IF p_order->>'subtotal' IS NOT NULL AND (p_order->>'subtotal')::integer != v_calculated_subtotal THEN
    RAISE EXCEPTION 'Subtotal tidak sesuai dengan harga katalog saat ini (server: %, request: %).',
      v_calculated_subtotal, (p_order->>'subtotal')::integer
      USING ERRCODE = '22000';
  END IF;

  IF p_order->>'total' IS NOT NULL AND (p_order->>'total')::integer != v_total THEN
    RAISE EXCEPTION 'Total pesanan tidak sesuai dengan kalkulasi server (server: %, request: %).',
      v_total, (p_order->>'total')::integer
      USING ERRCODE = '22000';
  END IF;

  -- ============================================================================
  -- EXECUTION STEP 3: TRANSACTIONAL DATABASE PERSISTENCE WITH RETRY LOOP
  -- ============================================================================
  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 5 THEN
      RAISE EXCEPTION 'Gagal membuat nomor urut pesanan unik setelah 5 percobaan. Silakan coba lagi.' USING ERRCODE = '40001';
    END IF;

    -- Concurrency-safe atomic increment of daily sequence counter
    WITH counter_subquery AS (
      INSERT INTO public.daily_order_counters (
        order_date,
        last_sequence,
        updated_at
      )
      VALUES (
        to_char(timezone('Asia/Jakarta', v_created_at), 'YYMMDD'),
        1,
        timezone('utc'::text, now())
      )
      ON CONFLICT (order_date)
      DO UPDATE SET
        last_sequence = public.daily_order_counters.last_sequence + 1,
        updated_at = timezone('utc'::text, now())
      RETURNING last_sequence AS next_val
    )
    SELECT
      'TJ-' ||
      to_char(timezone('Asia/Jakarta', v_created_at), 'YYMMDD') ||
      '-' ||
      CASE
        WHEN next_val <= 999 THEN lpad(next_val::text, 3, '0')
        ELSE next_val::text
      END
    INTO v_order_number
    FROM counter_subquery;

    BEGIN
      -- STEP 3a: INSERT INTO PUBLIC.ORDERS - Strict canonical columns matching production schema
      INSERT INTO public.orders (
        id,
        order_number,
        customer_name,
        customer_whatsapp,
        fulfillment_method,
        delivery_area,
        delivery_address,
        customer_note,
        subtotal,
        delivery_fee,
        total,
        order_status,
        payment_status,
        payment_method,
        payment_deadline,
        items_snapshot,
        merchant_name,
        created_at,
        updated_at
      ) VALUES (
        v_order_id,
        v_order_number,
        trim(p_order->>'customerName'),
        trim(p_order->>'customerWhatsapp'),
        v_fulfillment_type,
        v_delivery_area,
        trim(COALESCE(p_order->>'deliveryAddress', '')),
        trim(COALESCE(p_order->>'orderNote', '')),
        v_calculated_subtotal,
        v_shipping_fee,
        v_total,
        v_order_status,
        v_payment_status,
        v_payment_method,
        v_deadline,
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
          (v_val_item->>'order_id')::uuid,
          (v_val_item->>'product_id')::uuid,
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
            (v_val_opt->>'price_delta')::integer,
            v_created_at
          );
        END LOOP;
      END IF;

      -- STEP 6: INSERT ANONYMOUS ORDER TOKEN
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

      -- STEP 7: INSERT PAYMENT INITIAL RECORD (Strict production schema columns)
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

      -- Idempotency check: verify if an order was created concurrently with this token hash
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

      -- Handle order_number collision: retry up to 5 attempts
      IF v_err_constraint = 'orders_order_number_key'
         OR EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_order_number) THEN
        IF v_attempt < 5 THEN
          CONTINUE;
        ELSE
          RAISE EXCEPTION 'Gagal membuat nomor urut pesanan unik setelah 5 percobaan. Silakan coba lagi.' USING ERRCODE = '40001';
        END IF;
      END IF;

      -- Re-raise unhandled unique violation
      RAISE;
    END;
  END LOOP;

  -- Return complete persisted order matching Next.js Order type
  RETURN jsonb_build_object(
    'id', v_order_number,
    'uuid', v_order_id,
    'orderNumber', v_order_number,
    'createdAt', to_char(timezone('utc', v_created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'customerName', trim(p_order->>'customerName'),
    'customerWhatsapp', trim(p_order->>'customerWhatsapp'),
    'fulfillmentType', v_fulfillment_type,
    'deliveryArea', v_delivery_area,
    'orderNote', trim(COALESCE(p_order->>'orderNote', '')),
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

COMMIT;
