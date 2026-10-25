-- ==============================================================================
-- STANDALONE HOTFIX: Update public.create_order_atomic(jsonb, text)
-- Project: beawwfynrpcgicypzpcy (Nook by Jina / Temu by Jina)
--
-- FIXES:
-- 1. payments.amount_due NOT NULL: Explicitly stores authoritative v_total.
-- 2. order_items.line_total NOT NULL: Explicitly stores unit_price * quantity.
-- 3. order_item_options.option_type NOT NULL: Explicitly stores 'variant' or 'addon'.
-- 4. Check constraints: Normalizes payment_method to 'QRIS' and payment_status
--    to 'Menunggu verifikasi admin'.
-- 5. Safe retry / idempotency: Uses advisory lock on p_token_hash and savepoints.
-- ==============================================================================

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
  v_merchant_name text;
BEGIN
  -- 0. Concurrency & Idempotency: Advisory Transaction Lock on Token Hash
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

  -- 3. Validate payment method against production payment model (strictly QRIS)
  v_raw_payment_method := trim(COALESCE(p_order->>'paymentMethod', 'QRIS'));
  IF upper(v_raw_payment_method) IN ('QRIS', 'QRIS STATIS') THEN
    v_payment_method := 'QRIS';
  ELSE
    RAISE EXCEPTION 'Metode pembayaran "%" tidak didukung pada skema database produksi (hanya "QRIS" yang didukung).', v_raw_payment_method
      USING ERRCODE = '22000';
  END IF;

  -- 4. Enforce strict initial statuses matching production constraints
  IF p_order->>'orderStatus' IS NOT NULL AND p_order->>'orderStatus' != 'Pesanan baru' THEN
    RAISE EXCEPTION 'Status pesanan awal tidak valid (harus "Pesanan baru").' USING ERRCODE = '22000';
  END IF;

  v_raw_payment_status := trim(COALESCE(p_order->>'paymentStatus', 'Menunggu verifikasi admin'));
  IF v_raw_payment_status IN ('Menunggu Verifikasi', 'Menunggu verifikasi admin') THEN
    v_payment_status := 'Menunggu verifikasi admin';
  ELSIF v_raw_payment_status IN ('Menunggu Pembayaran', 'Menunggu pembayaran') THEN
    v_payment_status := 'Menunggu pembayaran';
  ELSE
    RAISE EXCEPTION 'Status pembayaran awal "%" tidak valid untuk pesanan baru.', v_raw_payment_status
      USING ERRCODE = '22000';
  END IF;

  -- 4b. Authoritative 30-minute payment deadline
  v_deadline := v_created_at + interval '30 minutes';

  -- ============================================================================
  -- EXECUTION STEP 1: VALIDATE ALL PRODUCTS, OPTIONS, ADD-ONS & PRICES IN MEMORY
  -- ============================================================================
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items')
  LOOP
    v_raw_prod_id := trim(COALESCE(v_item->>'productId', ''));
    IF v_raw_prod_id = '' THEN
      RAISE EXCEPTION 'Item pesanan wajib menyertakan identifikasi produk (productId) yang valid.' USING ERRCODE = '22000';
    END IF;

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
      RAISE EXCEPTION 'Produk "%" tidak ditemukan dalam katalog toko.', v_raw_prod_id USING ERRCODE = '22000';
    END IF;

    IF v_prod_rec.is_archived OR NOT v_prod_rec.is_available THEN
      RAISE EXCEPTION 'Produk "%" saat ini tidak tersedia atau telah diarsipkan.', v_prod_rec.name USING ERRCODE = '22000';
    END IF;

    IF v_prod_rec.price IS NULL OR v_prod_rec.price < 0 THEN
      RAISE EXCEPTION 'Harga produk "%" tidak valid.', v_prod_rec.name USING ERRCODE = '22000';
    END IF;

    IF v_prod_rec.price != trunc(v_prod_rec.price) THEN
      RAISE EXCEPTION 'Harga produk "%" tidak valid: mengandung nilai desimal (%). Skema mata uang Rupiah (IDR) mengharuskan bilangan bulat.',
        v_prod_rec.name, v_prod_rec.price USING ERRCODE = '22000';
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

    -- Validate options
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

        IF v_opt_val_rec.price_delta IS NOT NULL AND v_opt_val_rec.price_delta != trunc(v_opt_val_rec.price_delta) THEN
          RAISE EXCEPTION 'Selisih harga untuk varian "%" tidak valid: mengandung nilai desimal (%). Skema mata uang Rupiah (IDR) mengharuskan bilangan bulat.',
            v_opt_val_rec.name, v_opt_val_rec.price_delta USING ERRCODE = '22000';
        END IF;

        IF v_opt_val_rec.id::text = ANY(v_seen_opt_val_ids) THEN
          RAISE EXCEPTION 'Pilihan varian "%" tidak boleh dipilih lebih dari satu kali dalam item yang sama.',
            v_opt_val_rec.name
          USING ERRCODE = '22000';
        END IF;
        v_seen_opt_val_ids := array_append(v_seen_opt_val_ids, v_opt_val_rec.id::text);
        v_selected_group_ids := array_append(v_selected_group_ids, v_opt_val_rec.group_id::text);

        v_opt_delta_sum := v_opt_delta_sum + COALESCE(v_opt_val_rec.price_delta::integer, 0);

        v_validated_options := v_validated_options || jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_type', 'variant',
          'option_name', v_opt_val_rec.group_name,
          'option_value', v_opt_val_rec.name,
          'price_delta', COALESCE(v_opt_val_rec.price_delta::integer, 0)
        );

        v_item_options := v_item_options || jsonb_build_object(
          'groupId', v_opt_val_rec.group_id,
          'groupName', v_opt_val_rec.group_name,
          'valueId', v_opt_val_rec.id,
          'valueName', v_opt_val_rec.name,
          'priceDelta', COALESCE(v_opt_val_rec.price_delta::integer, 0)
        );
      END LOOP;
    END IF;

    -- Validate option groups cardinality
    FOR v_group_rec IN
      SELECT pog.id, pog.name, pog.min_select, pog.max_select, pog.is_required
      FROM public.product_option_groups pog
      WHERE pog.product_id = v_prod_rec.id
    LOOP
      v_group_count := 0;
      IF array_length(v_selected_group_ids, 1) > 0 THEN
        SELECT count(*) INTO v_group_count
        FROM unnest(v_selected_group_ids) AS g_id
        WHERE g_id = v_group_rec.id::text;
      END IF;

      v_min_select := COALESCE(v_group_rec.min_select, CASE WHEN v_group_rec.is_required THEN 1 ELSE 0 END);
      v_max_select := COALESCE(v_group_rec.max_select, 1);

      IF v_group_count < v_min_select THEN
        IF v_group_count = 0 AND (v_group_rec.is_required OR v_min_select >= 1) THEN
          RAISE EXCEPTION 'Pilihan varian wajib "%" untuk produk "%" belum dipilih.',
            v_group_rec.name, v_prod_rec.name USING ERRCODE = '22000';
        ELSE
          RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" minimal harus dipilih % opsi (dipilih: %).',
            v_group_rec.name, v_prod_rec.name, v_min_select, v_group_count USING ERRCODE = '22000';
        END IF;
      END IF;

      IF v_max_select IS NOT NULL AND v_group_count > v_max_select THEN
        IF v_max_select = 1 THEN
          RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" hanya boleh dipilih maksimal 1 opsi (dipilih: %).',
            v_group_rec.name, v_prod_rec.name, v_group_count USING ERRCODE = '22000';
        ELSE
          RAISE EXCEPTION 'Pilihan varian "%" untuk produk "%" maksimal hanya boleh dipilih % opsi (dipilih: %).',
            v_group_rec.name, v_prod_rec.name, v_max_select, v_group_count USING ERRCODE = '22000';
        END IF;
      END IF;
    END LOOP;

    -- Validate add-ons
    IF v_item->'selectedAddons' IS NOT NULL AND jsonb_typeof(v_item->'selectedAddons') = 'array' THEN
      FOR v_addon IN SELECT * FROM jsonb_array_elements(v_item->'selectedAddons')
      LOOP
        v_addon_id := trim(COALESCE(v_addon->>'addonId', ''));
        v_addon_rec := NULL;

        IF v_addon_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT id, name, price
          INTO v_addon_rec
          FROM public.addons
          WHERE id = v_addon_id::uuid
            AND is_active = true;
        ELSE
          SELECT id, name, price
          INTO v_addon_rec
          FROM public.addons
          WHERE lower(name) = lower(COALESCE(v_addon->>'addonName', v_addon_id))
            AND is_active = true
          LIMIT 1;
        END IF;

        IF v_addon_rec.id IS NULL THEN
          RAISE EXCEPTION 'Ekstra add-on "%" tidak ditemukan atau tidak tersedia.',
            COALESCE(v_addon->>'addonName', v_addon_id)
            USING ERRCODE = '22000';
        END IF;

        IF v_addon_rec.price IS NOT NULL AND v_addon_rec.price != trunc(v_addon_rec.price) THEN
          RAISE EXCEPTION 'Harga add-on "%" tidak valid: mengandung nilai desimal (%). Skema mata uang Rupiah (IDR) mengharuskan bilangan bulat.',
            v_addon_rec.name, v_addon_rec.price USING ERRCODE = '22000';
        END IF;

        IF v_addon_rec.id::text = ANY(v_seen_addon_ids) THEN
          RAISE EXCEPTION 'Ekstra add-on "%" tidak boleh dipilih lebih dari satu kali dalam item yang sama.',
            v_addon_rec.name
          USING ERRCODE = '22000';
        END IF;
        v_seen_addon_ids := array_append(v_seen_addon_ids, v_addon_rec.id::text);

        v_opt_delta_sum := v_opt_delta_sum + COALESCE(v_addon_rec.price::integer, 0);

        v_validated_options := v_validated_options || jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_type', 'addon',
          'option_name', 'Add-on',
          'option_value', v_addon_rec.name,
          'price_delta', COALESCE(v_addon_rec.price::integer, 0)
        );

        v_item_addons := v_item_addons || jsonb_build_object(
          'addonId', v_addon_rec.id,
          'addonName', v_addon_rec.name,
          'price', COALESCE(v_addon_rec.price::integer, 0)
        );
      END LOOP;
    END IF;

    v_unit_price := v_prod_rec.price::integer + v_opt_delta_sum;
    v_line_total := v_unit_price * v_qty;
    v_calculated_subtotal := v_calculated_subtotal + v_line_total;

    v_validated_items := v_validated_items || jsonb_build_object(
      'id', v_item_id,
      'order_id', v_order_id,
      'product_id', v_prod_rec.id,
      'product_name', v_prod_rec.name,
      'quantity', v_qty,
      'unit_price', v_unit_price,
      'line_total', v_line_total
    );

    v_items_snapshot := v_items_snapshot || jsonb_build_object(
      'productId', v_prod_rec.id,
      'productName', v_prod_rec.name,
      'basePrice', v_prod_rec.price::integer,
      'unitPrice', v_unit_price,
      'itemTotal', v_line_total,
      'quantity', v_qty,
      'selectedOptions', v_item_options,
      'selectedAddons', v_item_addons,
      'itemNote', COALESCE(v_item->>'itemNote', '')
    );
  END LOOP;

  -- ============================================================================
  -- EXECUTION STEP 2: CALCULATE SHIPPING FEE & TOTAL
  -- ============================================================================
  v_fulfillment_type := trim(COALESCE(p_order->>'fulfillmentType', 'delivery'));
  IF v_fulfillment_type NOT IN ('delivery', 'pickup') THEN
    v_fulfillment_type := 'delivery';
  END IF;

  IF v_fulfillment_type = 'pickup' THEN
    v_shipping_fee := 0;
    v_delivery_area := COALESCE(p_order->>'deliveryArea', 'Pickup Toko (Lhoksukon)');
  ELSE
    v_delivery_area := COALESCE(p_order->>'deliveryArea', 'Lhoksukon');
    SELECT fee, free_shipping_threshold 
    INTO v_area_fee_raw, v_free_thresh_raw
    FROM public.delivery_areas
    WHERE lower(name) = lower(v_delivery_area)
      OR lower(v_delivery_area) LIKE '%' || lower(name) || '%'
    LIMIT 1;

    IF v_area_fee_raw IS NULL THEN
      SELECT fee, free_shipping_threshold 
      INTO v_area_fee_raw, v_free_thresh_raw
      FROM public.delivery_areas
      WHERE is_active = true
      ORDER BY sort_order ASC
      LIMIT 1;
    END IF;

    IF v_area_fee_raw IS NOT NULL THEN
      IF v_area_fee_raw != trunc(v_area_fee_raw) OR (v_free_thresh_raw IS NOT NULL AND v_free_thresh_raw != trunc(v_free_thresh_raw)) THEN
        RAISE EXCEPTION 'Tarif ongkir atau ambang batas gratis ongkir mengandung nilai desimal. Skema mata uang Rupiah (IDR) mengharuskan bilangan bulat.'
          USING ERRCODE = '22000';
      END IF;

      v_area_fee := v_area_fee_raw::integer;
      v_free_thresh := v_free_thresh_raw::integer;

      IF v_free_thresh IS NOT NULL AND v_free_thresh > 0 AND v_calculated_subtotal > v_free_thresh THEN
        v_shipping_fee := 0;
      ELSE
        v_shipping_fee := v_area_fee;
      END IF;
    ELSE
      v_shipping_fee := 0;
    END IF;
  END IF;

  v_total := v_calculated_subtotal + v_shipping_fee;

  -- ============================================================================
  -- EXECUTION STEP 3: CONCURRENCY-SAFE DAILY ORDER NUMBERING AND ROW INSERTION
  -- ============================================================================
  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;
    v_order_number := public.generate_daily_order_number();

    BEGIN
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
          (v_val_item->>'order_id')::uuid,
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

      EXIT;

    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_err_constraint = CONSTRAINT_NAME;

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
        'merchantName', COALESCE(o.merchant_name, v_merchant_name)
      ) INTO v_existing_order
      FROM public.anonymous_order_tokens aot
      JOIN public.orders o ON o.id = aot.order_id
      WHERE aot.token_hash = lower(trim(p_token_hash))
        AND aot.revoked_at IS NULL
      LIMIT 1;

      IF v_existing_order IS NOT NULL THEN
        RETURN v_existing_order;
      END IF;

      IF v_err_constraint = 'orders_order_number_key'
         OR EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_order_number) THEN
        IF v_attempt < 3 THEN
          CONTINUE;
        ELSE
          RAISE EXCEPTION 'Gagal membuat pesanan: Terjadi konflik nomor pesanan berulang kali.' USING ERRCODE = '23505';
        END IF;
      END IF;

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
    'paymentMethod', 'QRIS Statis',
    'paymentDeadline', CASE WHEN v_deadline IS NOT NULL THEN to_char(timezone('utc', v_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
    'merchantName', v_merchant_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, text) TO service_role, postgres;
