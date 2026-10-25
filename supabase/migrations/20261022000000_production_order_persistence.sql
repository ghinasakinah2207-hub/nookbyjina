-- ==============================================================================
-- Migration: Production Order Persistence & Concurrency-Safe Daily Sequencing
-- Review revision: completed orders now reject ALL payment-status changes, not only cancellation.
-- File: supabase/migrations/20261022000000_production_order_persistence.sql
-- Project: Nook by Jina
--
-- PURPOSE:
--   1. Provision atomic daily sequence counter for TJ-YYMMDD-NNN order numbering
--      under high concurrent load using Asia/Jakarta (WIB) store timezone.
--   2. Add missing order snapshot columns (delivery_area, items_snapshot, merchant_name)
--      and unique constraint on orders.order_number with preflight duplicate diagnostics.
--   3. Index anonymous_order_tokens(token_hash) for sub-millisecond lookup.
--   4. Read-only preflight diagnostics of triggers and trigger functions on
--      public.payments and all mutation tables directly from PostgreSQL system catalogs,
--      explicitly distinguishing ENABLED, DISABLED, ALWAYS, and REPLICA activation states.
--   5. Implement atomic RPC transaction public.create_order_atomic(p_order, p_token_hash)
--      with savepoint-decoupled daily order number progression ensuring collision retries
--      never repeat collided numbers, strictly complying with verified production constraints:
--        - orders.payment_method & payments.method strictly store 'QRIS'.
--        - payments.amount_due strictly stores authoritative v_total (exact integer alignment with orders.total).
--        - order_items.line_total strictly stores unit_price * quantity (exact integer alignment with items_snapshot.itemTotal).
--        - order_item_options.option_type strictly stores 'variant' or 'addon'.
--        - orders.payment_status & payments.status strictly store production enums
--          ('Menunggu verifikasi admin', 'Menunggu pembayaran', 'Lunas', 'Gagal', 'Dibatalkan').
--        - subtotal, delivery_fee, and total are guaranteed NOT NULL integer values in IDR currency.
--        - delivery_areas.fee and free_shipping_threshold are staged into numeric variables to reject
--          fractional sen before casting to integer, strictly enforcing subtotal > threshold for free delivery.
--        - total = subtotal + delivery_fee holds invariant; pickup always has delivery_fee = 0.
--        - payment_deadline is guaranteed valid and NOT NULL (30 minutes from creation).
--   6. Implement secure token lookup and admin synchronization RPC functions with
--      seamless bidirectional mapping to application TypeScript contract:
--        - admin_update_order_status acquires exclusive row lock (SELECT FOR UPDATE) to serialize concurrent updates.
--        - transition rules prevent invalid cancellation of paid orders (Lunas) and forbid resurrected/unpaid Lunas.
--        - rejects contradictory combinations (Diproses/Siap/Selesai with Dibatalkan payment).
--        - strictly synchronizes single-status updates between orders and payments tables.
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
  v_order_number text;
BEGIN
  -- 1. Derive date part 'YYMMDD' in store-local WIB timezone (Asia/Jakarta)
  v_date := to_char(timezone('Asia/Jakarta', now()), 'YYMMDD');

  -- 2. Concurrency-safe initialization and reconciliation:
  -- Seed or reconcile the counter row for today's WIB date with the
  -- MAXIMUM sequence number already present in public.orders for today's date.
  -- This guarantees zero collisions even if orders were already created today
  -- before migration or out-of-band.
  INSERT INTO public.daily_order_counters (order_date, last_sequence, updated_at)
  SELECT 
    v_date,
    COALESCE(MAX(
      CASE 
        WHEN substring(order_number from '^TJ-[0-9]{6}-([0-9]+)$') ~ '^[0-9]+$' 
        THEN substring(order_number from '^TJ-[0-9]{6}-([0-9]+)$')::integer 
        ELSE 0 
      END
    ), 0),
    timezone('utc'::text, now())
  FROM public.orders
  WHERE order_number LIKE 'TJ-' || v_date || '-%'
  ON CONFLICT (order_date) DO UPDATE
    SET last_sequence = GREATEST(daily_order_counters.last_sequence, EXCLUDED.last_sequence);

  -- 3. Atomically increment sequence with row-level lock and verify no collision
  LOOP
    UPDATE public.daily_order_counters
    SET last_sequence = public.daily_order_counters.last_sequence + 1,
        updated_at = timezone('utc'::text, now())
    WHERE order_date = v_date
    RETURNING last_sequence INTO v_seq;

    -- Format order number:
    -- Sequence 1..999 is zero-padded to 3 digits (e.g. TJ-261021-001)
    -- Sequence >= 1000 dynamically expands (e.g. TJ-261021-1000) preventing collisions or truncation
    IF v_seq <= 999 THEN
      v_order_number := 'TJ-' || v_date || '-' || lpad(v_seq::text, 3, '0');
    ELSE
      v_order_number := 'TJ-' || v_date || '-' || v_seq::text;
    END IF;

    -- Collision defense: exit only if this number is NOT already used in public.orders
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.orders WHERE order_number = v_order_number
    );
  END LOOP;

  RETURN v_order_number;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_daily_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_daily_order_number() TO service_role, postgres;

-- ------------------------------------------------------------------------------
-- 3. ENHANCE PUBLIC.ORDERS TABLE & COMPREHENSIVE DEPENDENCY PREFLIGHT
-- ------------------------------------------------------------------------------
-- Preflight: Comprehensive validation of all database tables, columns, and functions
-- required by the migration's executable SQL and atomic order RPCs.
DO $$
DECLARE
  v_table_rec record;
  v_col_rec record;
BEGIN
  -- 1. Core tables existence preflight (13 required tables)
  FOR v_table_rec IN
    SELECT unnest(ARRAY[
      'orders',
      'order_items',
      'order_item_options',
      'payments',
      'anonymous_order_tokens',
      'store_settings',
      'products',
      'product_option_groups',
      'product_option_values',
      'addons',
      'product_addons',
      'delivery_areas',
      'daily_order_counters'
    ]) AS table_name
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = v_table_rec.table_name
    ) THEN
      RAISE EXCEPTION 'Migration preflight failed: Tabel public.% tidak ditemukan di database.', v_table_rec.table_name
        USING ERRCODE = '42P01';
    END IF;
  END LOOP;

  -- 2. Verified production columns existence preflight
  FOR v_col_rec IN
    SELECT * FROM (VALUES
      -- public.products
      ('products', 'id'),
      ('products', 'name'),
      ('products', 'price'),
      ('products', 'is_available'),
      ('products', 'is_archived'),
      ('products', 'slug'),
      -- public.product_option_groups
      ('product_option_groups', 'id'),
      ('product_option_groups', 'product_id'),
      ('product_option_groups', 'name'),
      ('product_option_groups', 'is_required'),
      ('product_option_groups', 'min_select'),
      ('product_option_groups', 'max_select'),
      ('product_option_groups', 'sort_order'),
      -- public.product_option_values
      ('product_option_values', 'id'),
      ('product_option_values', 'group_id'),
      ('product_option_values', 'name'),
      ('product_option_values', 'price_delta'),
      ('product_option_values', 'is_active'),
      -- public.addons
      ('addons', 'id'),
      ('addons', 'name'),
      ('addons', 'price'),
      ('addons', 'is_active'),
      -- public.product_addons
      ('product_addons', 'addon_id'),
      ('product_addons', 'product_id'),
      -- public.delivery_areas
      ('delivery_areas', 'name'),
      ('delivery_areas', 'fee'),
      ('delivery_areas', 'free_shipping_threshold'),
      ('delivery_areas', 'is_active'),
      ('delivery_areas', 'sort_order'),
      -- public.store_settings
      ('store_settings', 'store_name'),
      -- public.orders
      ('orders', 'id'),
      ('orders', 'order_number'),
      ('orders', 'order_status'),
      ('orders', 'payment_status'),
      ('orders', 'payment_method'),
      ('orders', 'payment_deadline'),
      ('orders', 'subtotal'),
      ('orders', 'delivery_fee'),
      ('orders', 'total'),
      ('orders', 'customer_name'),
      ('orders', 'customer_whatsapp'),
      ('orders', 'customer_note'),
      ('orders', 'delivery_address'),
      ('orders', 'fulfillment_method'),
      ('orders', 'created_at'),
      ('orders', 'updated_at'),
      ('orders', 'paid_at'),
      ('orders', 'cancelled_at'),
      -- public.order_items
      ('order_items', 'id'),
      ('order_items', 'order_id'),
      ('order_items', 'product_id'),
      ('order_items', 'product_name'),
      ('order_items', 'quantity'),
      ('order_items', 'unit_price'),
      ('order_items', 'line_total'),
      ('order_items', 'created_at'),
      -- public.order_item_options
      ('order_item_options', 'id'),
      ('order_item_options', 'order_item_id'),
      ('order_item_options', 'option_type'),
      ('order_item_options', 'option_name'),
      ('order_item_options', 'option_value'),
      ('order_item_options', 'price_delta'),
      ('order_item_options', 'created_at'),
      -- public.payments
      ('payments', 'id'),
      ('payments', 'order_id'),
      ('payments', 'method'),
      ('payments', 'amount_due'),
      ('payments', 'status'),
      ('payments', 'created_at'),
      ('payments', 'updated_at'),
      -- public.anonymous_order_tokens
      ('anonymous_order_tokens', 'id'),
      ('anonymous_order_tokens', 'order_id'),
      ('anonymous_order_tokens', 'token_hash'),
      ('anonymous_order_tokens', 'revoked_at'),
      ('anonymous_order_tokens', 'created_at'),
      -- public.daily_order_counters
      ('daily_order_counters', 'order_date'),
      ('daily_order_counters', 'last_sequence'),
      ('daily_order_counters', 'created_at'),
      ('daily_order_counters', 'updated_at')
    ) AS req(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = v_col_rec.table_name 
        AND column_name = v_col_rec.column_name
    ) THEN
      RAISE EXCEPTION 'Migration preflight failed: Kolom % pada public.% tidak ditemukan.',
        v_col_rec.column_name, v_col_rec.table_name
        USING ERRCODE = '42703';
    END IF;
  END LOOP;

  -- 2b. Verified monetary column types compatibility preflight (integer or numeric)
  -- Validates all 12 monetary source and destination columns used by checkout and pricing logic
  FOR v_col_rec IN
    SELECT * FROM (VALUES
      -- Catalog & pricing source columns
      ('products', 'price'),
      ('product_option_values', 'price_delta'),
      ('addons', 'price'),
      ('delivery_areas', 'fee'),
      ('delivery_areas', 'free_shipping_threshold'),
      -- Order & persistence destination columns
      ('orders', 'subtotal'),
      ('orders', 'delivery_fee'),
      ('orders', 'total'),
      ('order_items', 'unit_price'),
      ('order_items', 'line_total'),
      ('order_item_options', 'price_delta'),
      ('payments', 'amount_due')
    ) AS m(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = v_col_rec.table_name 
        AND column_name = v_col_rec.column_name
        AND data_type IN ('integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real')
    ) THEN
      RAISE EXCEPTION 'Migration preflight failed: Kolom moneter public.%.% tidak memiliki tipe data numerik atau integer yang valid.',
        v_col_rec.table_name, v_col_rec.column_name
        USING ERRCODE = '42804';
    END IF;
  END LOOP;

  -- 3. Dependent authorization functions existence preflight
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_admin'
      AND p.pronargs = 0
      AND p.prorettype = 'boolean'::regtype
  ) THEN
    RAISE EXCEPTION 'Migration preflight failed: Fungsi public.is_admin() yang mengembalikan boolean tidak ditemukan di database. Pastikan migrasi keamanan admin (20261012181500_harden_rls_and_admin_security.sql) telah diterapkan.'
      USING ERRCODE = '42883';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'role'
      AND p.pronargs = 0
      AND p.prorettype = 'text'::regtype
  ) THEN
    RAISE EXCEPTION 'Migration preflight failed: Fungsi auth.role() yang mengembalikan text tidak ditemukan di skema auth. Pastikan ekstensi auth Supabase aktif.'
      USING ERRCODE = '42883';
  END IF;
END $$;

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
-- 4b. PREFLIGHT AUDIT: READ-ONLY TRIGGER DIAGNOSTICS (PAYMENTS & RELATED TABLES)
-- Inspect all user-defined triggers on public.payments and related transaction
-- tables (orders, order_items, order_item_options, anonymous_order_tokens,
-- daily_order_counters) directly from PostgreSQL system catalogs.
-- Explicitly distinguishes trigger activation status (ENABLED, DISABLED, ALWAYS, REPLICA).
-- Strictly read-only: does NOT drop, alter, or disable any existing triggers.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_trig_rec RECORD;
  v_total_count integer := 0;
  v_enabled_count integer := 0;
  v_disabled_count integer := 0;
  v_always_count integer := 0;
  v_replica_count integer := 0;
  v_payments_total_count integer := 0;
  v_payments_enabled_count integer := 0;
  v_payments_disabled_count integer := 0;
  v_payments_always_count integer := 0;
  v_payments_replica_count integer := 0;
BEGIN
  RAISE NOTICE '=== PREFLIGHT: Memeriksa trigger pada tabel transaksi pesanan & pembayaran ===';

  FOR v_trig_rec IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      t.tgname AS trigger_name,
      p.proname AS function_name,
      pn.nspname AS function_schema,
      CASE t.tgenabled
        WHEN 'O' THEN 'ENABLED'
        WHEN 'D' THEN 'DISABLED'
        WHEN 'A' THEN 'ALWAYS'
        WHEN 'R' THEN 'REPLICA'
        ELSE 'UNKNOWN (' || t.tgenabled::text || ')'
      END AS trigger_status,
      CASE 
        WHEN (t.tgtype & 2) != 0 THEN 'BEFORE'
        WHEN (t.tgtype & 64) != 0 THEN 'INSTEAD OF'
        ELSE 'AFTER'
      END AS trigger_timing,
      concat_ws(' OR ',
        CASE WHEN (t.tgtype & 4) != 0 THEN 'INSERT' END,
        CASE WHEN (t.tgtype & 8) != 0 THEN 'DELETE' END,
        CASE WHEN (t.tgtype & 16) != 0 THEN 'UPDATE' END,
        CASE WHEN (t.tgtype & 32) != 0 THEN 'TRUNCATE' END
      ) AS trigger_events,
      CASE WHEN (t.tgtype & 1) != 0 THEN 'ROW' ELSE 'STATEMENT' END AS trigger_level,
      pg_catalog.pg_get_triggerdef(t.oid) AS trigger_def
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('payments', 'orders', 'order_items', 'order_item_options', 'anonymous_order_tokens', 'daily_order_counters')
      AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname
  LOOP
    v_total_count := v_total_count + 1;

    -- Track status distribution across all target tables
    IF v_trig_rec.trigger_status = 'ENABLED' THEN
      v_enabled_count := v_enabled_count + 1;
    ELSIF v_trig_rec.trigger_status = 'DISABLED' THEN
      v_disabled_count := v_disabled_count + 1;
    ELSIF v_trig_rec.trigger_status = 'ALWAYS' THEN
      v_always_count := v_always_count + 1;
    ELSIF v_trig_rec.trigger_status = 'REPLICA' THEN
      v_replica_count := v_replica_count + 1;
    END IF;

    -- Track status distribution specifically on public.payments
    IF v_trig_rec.table_name = 'payments' THEN
      v_payments_total_count := v_payments_total_count + 1;
      IF v_trig_rec.trigger_status = 'ENABLED' THEN
        v_payments_enabled_count := v_payments_enabled_count + 1;
      ELSIF v_trig_rec.trigger_status = 'DISABLED' THEN
        v_payments_disabled_count := v_payments_disabled_count + 1;
      ELSIF v_trig_rec.trigger_status = 'ALWAYS' THEN
        v_payments_always_count := v_payments_always_count + 1;
      ELSIF v_trig_rec.trigger_status = 'REPLICA' THEN
        v_payments_replica_count := v_payments_replica_count + 1;
      END IF;
    END IF;

    RAISE NOTICE '[TRIGGER AUDIT] Tabel: public.%, Trigger: %, Status: %, Timing: % %, Level: FOR EACH %, Fungsi: %.%(), Definisi: %',
      v_trig_rec.table_name,
      v_trig_rec.trigger_name,
      v_trig_rec.trigger_status,
      v_trig_rec.trigger_timing,
      v_trig_rec.trigger_events,
      v_trig_rec.trigger_level,
      v_trig_rec.function_schema,
      v_trig_rec.function_name,
      COALESCE(v_trig_rec.trigger_def, '(definisi tidak tersedia)');
  END LOOP;

  IF v_total_count = 0 THEN
    RAISE NOTICE 'Audit Trigger: Tidak ditemukan user-defined trigger pada tabel transaksi pesanan & pembayaran.';
  ELSE
    RAISE NOTICE 'Audit Trigger Selesai (Semua Tabel Transaksi): Total % user-defined trigger ditemukan (ENABLED: %, ALWAYS: %, REPLICA: %, DISABLED: %).',
      v_total_count, v_enabled_count, v_always_count, v_replica_count, v_disabled_count;
    RAISE NOTICE 'Audit Trigger public.payments: Total % trigger pada public.payments (ENABLED: %, ALWAYS: %, REPLICA: %, DISABLED: %).',
      v_payments_total_count,
      v_payments_enabled_count,
      v_payments_always_count,
      v_payments_replica_count,
      v_payments_disabled_count;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Audit trigger preflight gagal mengeksekusi pemeriksaan katalog: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE;
END $$;

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
  -- If this token hash was explicitly revoked, permanently forbid creating any new order with it
  IF EXISTS (
    SELECT 1 FROM public.anonymous_order_tokens
    WHERE token_hash = lower(trim(p_token_hash))
      AND revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Token akses pesanan ini telah dicabut atau kedaluwarsa dan tidak dapat digunakan untuk membuat pesanan baru.'
      USING ERRCODE = '22000';
  END IF;

  -- 2c. Validate customer info & order note (aligns with API contract)
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
  -- Production orders.payment_status only accepts:
  -- 'Menunggu pembayaran', 'Menunggu verifikasi admin', 'Lunas', 'Gagal', 'Dibatalkan'
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

  -- 4b. Authoritative 30-minute payment deadline (strictly server-enforced)
  -- Per application design contract (src/app/api/orders/route.ts:421-422 and src/types/index.ts:124),
  -- the payment deadline is an authoritative store policy strictly defined as 30 minutes
  -- from creation. Client-supplied timestamps are rejected from determining the deadline
  -- to prevent arbitrary, tampered, or already-expired deadlines.
  v_deadline := v_created_at + interval '30 minutes';

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

    -- Validate product price in IDR integer currency model (no fractional sen allowed)
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

        -- Validate option price delta in IDR integer currency model
        IF v_opt_val_rec.price_delta IS NULL OR v_opt_val_rec.price_delta != trunc(v_opt_val_rec.price_delta) THEN
          RAISE EXCEPTION 'Delta harga varian "%" tidak valid: mengandung nilai desimal (%). Skema mata uang Rupiah (IDR) mengharuskan bilangan bulat.',
            v_opt_val_rec.name, v_opt_val_rec.price_delta USING ERRCODE = '22000';
        END IF;

        -- Reject duplicate option-value IDs in the same item
        IF v_opt_val_rec.id::text = ANY(v_seen_opt_val_ids) THEN
          RAISE EXCEPTION 'Pilihan varian "%" tidak boleh dipilih lebih dari satu kali dalam item yang sama.',
            v_opt_val_rec.name
          USING ERRCODE = '22000';
        END IF;

        v_seen_opt_val_ids := array_append(v_seen_opt_val_ids, v_opt_val_rec.id::text);
        v_selected_group_ids := array_append(v_selected_group_ids, v_opt_val_rec.group_id::text);

        v_opt_delta_sum := v_opt_delta_sum + (v_opt_val_rec.price_delta::integer);

        -- Buffer child option snapshot in memory (for order_item_options table, associating with v_item_id)
        v_validated_options := v_validated_options || jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_type', 'variant',
          'option_name', v_opt_val_rec.group_name,
          'option_value', v_opt_val_rec.name,
          'price_delta', (v_opt_val_rec.price_delta::integer)
        );

        -- Buffer authoritative option for customer-facing item snapshot
        v_item_options := v_item_options || jsonb_build_object(
          'groupId', v_opt_val_rec.group_id::text,
          'groupName', v_opt_val_rec.group_name,
          'valueId', v_opt_val_rec.id::text,
          'valueName', v_opt_val_rec.name,
          'priceDelta', (v_opt_val_rec.price_delta::integer)
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

        -- Validate addon price in IDR integer currency model
        IF v_addon_rec.price IS NULL OR v_addon_rec.price < 0 OR v_addon_rec.price != trunc(v_addon_rec.price) THEN
          RAISE EXCEPTION 'Harga add-on "%" tidak valid: mengandung nilai desimal (%). Skema mata uang Rupiah (IDR) mengharuskan bilangan bulat.',
            v_addon_rec.name, v_addon_rec.price USING ERRCODE = '22000';
        END IF;

        -- Reject duplicate add-on IDs in the same item
        IF v_addon_rec.id::text = ANY(v_seen_addon_ids) THEN
          RAISE EXCEPTION 'Ekstra add-on "%" tidak boleh dipilih lebih dari satu kali dalam item yang sama.',
            v_addon_rec.name
          USING ERRCODE = '22000';
        END IF;

        v_seen_addon_ids := array_append(v_seen_addon_ids, v_addon_rec.id::text);

        v_opt_delta_sum := v_opt_delta_sum + (v_addon_rec.price::integer);

        -- Buffer child addon snapshot in memory (stored in order_item_options table, associating with v_item_id)
        v_validated_options := v_validated_options || jsonb_build_object(
          'id', gen_random_uuid(),
          'order_item_id', v_item_id,
          'option_type', 'addon',
          'option_name', 'Add-on',
          'option_value', v_addon_rec.name,
          'price_delta', (v_addon_rec.price::integer)
        );

        -- Buffer authoritative addon for customer-facing item snapshot
        v_item_addons := v_item_addons || jsonb_build_object(
          'addonId', v_addon_rec.id::text,
          'addonName', v_addon_rec.name,
          'price', (v_addon_rec.price::integer)
        );
      END LOOP;
    END IF;

    v_unit_price := (v_prod_rec.price::integer) + v_opt_delta_sum;
    v_line_total := v_unit_price * v_qty;
    v_calculated_subtotal := v_calculated_subtotal + v_line_total;

    -- Buffer validated parent item in memory (for order_items table)
    v_validated_items := v_validated_items || jsonb_build_object(
      'id', v_item_id,
      'order_id', v_order_id,
      'product_id', v_prod_rec.id,
      'product_name', v_prod_rec.name,
      'quantity', v_qty,
      'unit_price', v_unit_price,
      'line_total', v_line_total
    );

    -- Buffer authoritative customer-facing item snapshot
    -- Strictly uses database-derived names and prices, ignoring any client tampering
    v_items_snapshot := v_items_snapshot || jsonb_build_object(
      'id', COALESCE(v_item->>'id', v_item_id::text),
      'productId', v_prod_rec.id::text,
      'productName', v_prod_rec.name,
      'productImage', COALESCE(v_item->>'productImage', ''),
      'basePrice', (v_prod_rec.price::integer),
      'unitPrice', v_unit_price,
      'itemTotal', v_line_total,
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
    SELECT fee, free_shipping_threshold INTO v_area_fee_raw, v_free_thresh_raw
    FROM public.delivery_areas
    WHERE is_active = true
      AND (lower(name) = lower(v_delivery_area) OR (lower(name) LIKE '%lhoksukon%' AND lower(v_delivery_area) LIKE '%lhoksukon%'))
    ORDER BY sort_order ASC
    LIMIT 1;

    IF v_area_fee_raw IS NULL THEN
      RAISE EXCEPTION 'Area pengantaran "%" belum terkonfigurasi atau tidak aktif.', v_delivery_area USING ERRCODE = '22000';
    END IF;

    -- Validate area fee and free threshold in IDR integer currency model (reject fractional values)
    IF v_area_fee_raw < 0 OR v_area_fee_raw != trunc(v_area_fee_raw) THEN
      RAISE EXCEPTION 'Ongkir area pengantaran "%" tidak valid: mengandung nilai desimal (%). Skema mata uang Rupiah (IDR) mengharuskan bilangan bulat.',
        v_delivery_area, v_area_fee_raw USING ERRCODE = '22000';
    END IF;

    IF v_free_thresh_raw IS NOT NULL AND (v_free_thresh_raw < 0 OR v_free_thresh_raw != trunc(v_free_thresh_raw)) THEN
      RAISE EXCEPTION 'Ambang batas gratis ongkir tidak valid: mengandung nilai desimal (%). Skema mata uang Rupiah (IDR) mengharuskan bilangan bulat.',
        v_free_thresh_raw USING ERRCODE = '22000';
    END IF;

    -- Convert to integer only after successful validation
    v_area_fee := v_area_fee_raw::integer;
    IF v_free_thresh_raw IS NOT NULL THEN
      v_free_thresh := v_free_thresh_raw::integer;
    ELSE
      v_free_thresh := NULL;
    END IF;

    -- Free delivery applies only when subtotal strictly exceeds the configured threshold (> threshold)
    IF v_calculated_subtotal > COALESCE(v_free_thresh, 50000) THEN
      v_shipping_fee := 0;
    ELSE
      v_shipping_fee := v_area_fee;
    END IF;
  END IF;

  v_total := v_calculated_subtotal + v_shipping_fee;

  -- ============================================================================
  -- ATOMIC TRANSACTION EXECUTION: STEPS 3, 4, 5, 6 IN UNIFIED SUBTRANSACTION
  -- Ensures that if any conflict or unique_violation occurs (token_hash or order_number),
  -- the entire operation (orders, order_items, order_item_options, anonymous_order_tokens, payments)
  -- is rolled back to the savepoint, guaranteeing ZERO orphaned or duplicate rows.
  --
  -- NOTE ON COUNTER PROGRESSION:
  -- public.generate_daily_order_number() is invoked OUTSIDE the BEGIN ... EXCEPTION
  -- subtransaction. This guarantees that if an insertion collision triggers a rollback
  -- to the savepoint, the counter increment in public.daily_order_counters is NOT undone.
  -- Subsequent retry attempts are guaranteed to increment and acquire a strictly different,
  -- higher sequence number without repeating collided numbers.
  -- ============================================================================
  FOR v_attempt IN 1..3 LOOP
    -- 1. Generate unique concurrency-safe daily order number OUTSIDE the rollback savepoint.
    -- Calling this before BEGIN ensures that if an insertion collision occurs and rolls back
    -- to the savepoint, the counter progression in public.daily_order_counters is NOT undone.
    -- The next retry attempt is guaranteed to acquire a strictly higher and distinct order number.
    v_order_number := public.generate_daily_order_number();

    BEGIN
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

      -- ============================================================================
      -- EXECUTION STEP 6: INSERT ANONYMOUS_ORDER_TOKENS AND PAYMENTS
      -- ============================================================================
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

      -- Successfully inserted all records without unique violation: exit retry loop
      EXIT;

    EXCEPTION WHEN unique_violation THEN
      -- Concurrency fallback: PostgreSQL has cleanly rolled back Steps 3, 4, 5, 6 to the savepoint!
      -- Orders, order_items, order_item_options, anonymous_order_tokens, and payments
      -- inserted above are COMPLETELY UNDONE, guaranteeing zero orphaned rows.
      -- Notice: The counter increment in daily_order_counters was performed outside this savepoint,
      -- so it remains safely advanced and will NOT be repeated on retry.
      GET STACKED DIAGNOSTICS v_err_constraint = CONSTRAINT_NAME;

      -- Check if another concurrent transaction successfully committed this exact token_hash:
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

      -- If token_hash did NOT collide, check if collision occurred on orders.order_number:
      IF v_err_constraint = 'orders_order_number_key'
         OR EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_order_number) THEN
        IF v_attempt < 3 THEN
          -- Steps 3-6 were completely rolled back by PostgreSQL subtransaction savepoint.
          -- Because generate_daily_order_number() was called OUTSIDE this savepoint,
          -- the counter was not rolled back. The next iteration will call
          -- generate_daily_order_number() again and obtain a strictly new, higher number.
          CONTINUE;
        ELSE
          RAISE EXCEPTION 'Gagal membuat pesanan: Terjadi konflik nomor pesanan berulang kali.' USING ERRCODE = '23505';
        END IF;
      END IF;

      -- Unique violation was from another unexpected constraint: re-raise fail-closed
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
  v_db_payment_status text;
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

  -- Normalize & validate payment status against production schema & application contract
  IF p_payment_status IS NOT NULL THEN
    IF p_payment_status IN ('Menunggu Verifikasi', 'Menunggu verifikasi admin') THEN
      v_db_payment_status := 'Menunggu verifikasi admin';
    ELSIF p_payment_status IN ('Menunggu Pembayaran', 'Menunggu pembayaran') THEN
      v_db_payment_status := 'Menunggu pembayaran';
    ELSIF p_payment_status = 'Lunas' THEN
      v_db_payment_status := 'Lunas';
    ELSIF p_payment_status IN ('Dibatalkan', 'Gagal') THEN
      v_db_payment_status := 'Dibatalkan';
    ELSE
      RAISE EXCEPTION 'Status pembayaran "%" tidak valid.', p_payment_status USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Concurrency-Safe Row Locking:
  -- Acquire exclusive row lock on target order row with FOR UPDATE before evaluating any transition rules.
  -- This serializes concurrent updates for the same order and ensures evaluation uses the latest committed state,
  -- preventing race conditions or stale-read state bypasses.
  SELECT id, order_status, payment_status
  INTO v_existing_id, v_existing_order_status, v_existing_payment_status
  FROM public.orders
  WHERE order_number = p_order_id OR id::text = p_order_id
  FOR UPDATE;

  IF v_existing_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Transition Rule 1: Paid Orders Cannot Be Cancelled (No refunds without business rule)
  -- Reject cancelling an order whose existing payment status is 'Lunas'
  IF v_existing_payment_status = 'Lunas' THEN
    IF p_order_status = 'Dibatalkan' THEN
      RAISE EXCEPTION 'Pesanan yang telah berstatus Lunas tidak dapat dibatalkan.' USING ERRCODE = '22000';
    END IF;
    IF v_db_payment_status = 'Dibatalkan' THEN
      RAISE EXCEPTION 'Pembayaran yang telah berstatus Lunas tidak dapat dibatalkan.' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Transition Rule 2: Cancelled Orders Cannot Be Resurrected
  -- An order already marked 'Dibatalkan' cannot transition back to active order states
  IF v_existing_order_status = 'Dibatalkan' AND p_order_status IS NOT NULL AND p_order_status != 'Dibatalkan' THEN
    RAISE EXCEPTION 'Pesanan yang telah dibatalkan tidak dapat diaktifkan kembali.' USING ERRCODE = '22000';
  END IF;

  -- Transition Rule 3: Cancelled Orders or Payments Cannot Receive Payment
  -- Reject changing a cancelled payment or cancelled order to 'Lunas'
  IF v_db_payment_status = 'Lunas' THEN
    IF p_order_status = 'Dibatalkan' OR v_existing_order_status = 'Dibatalkan' THEN
      RAISE EXCEPTION 'Pesanan yang dibatalkan tidak dapat menerima status pembayaran Lunas.' USING ERRCODE = '22000';
    END IF;
    IF v_existing_payment_status IN ('Dibatalkan', 'Gagal') THEN
      RAISE EXCEPTION 'Pembayaran yang telah dibatalkan tidak dapat diubah statusnya menjadi Lunas.' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Transition Rule 4: Completed Orders Are Immutable
  -- Once an order is completed, neither its order status nor its payment status
  -- may be changed. Re-sending the same status is allowed as an idempotent update.
  IF v_existing_order_status = 'Selesai' THEN
    IF p_order_status IS NOT NULL AND p_order_status IS DISTINCT FROM 'Selesai' THEN
      RAISE EXCEPTION 'Pesanan yang telah selesai tidak dapat diubah statusnya.' USING ERRCODE = '22000';
    END IF;
    IF v_db_payment_status IS NOT NULL
       AND v_db_payment_status IS DISTINCT FROM v_existing_payment_status THEN
      RAISE EXCEPTION 'Status pembayaran pesanan yang telah selesai tidak dapat diubah (status saat ini: %).',
        v_existing_payment_status USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Transition Rule 5: Reject Contradictory Active and Cancelled Status Combinations
  -- 5a. A cancelled payment cannot coexist with active order statuses ('Pesanan baru', 'Diproses', 'Siap', 'Selesai')
  IF (v_db_payment_status = 'Dibatalkan' OR (v_db_payment_status IS NULL AND v_existing_payment_status IN ('Dibatalkan', 'Gagal'))) THEN
    IF p_order_status IS NOT NULL AND p_order_status != 'Dibatalkan' THEN
      RAISE EXCEPTION 'Status pesanan "%" tidak dapat digabungkan dengan status pembayaran "Dibatalkan". Pesanan dengan pembayaran dibatalkan harus berstatus "Dibatalkan".',
        p_order_status
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 5b. A cancelled order cannot coexist with active payment statuses ('Menunggu verifikasi admin', 'Menunggu pembayaran', 'Lunas')
  IF (p_order_status = 'Dibatalkan' OR (p_order_status IS NULL AND v_existing_order_status = 'Dibatalkan')) THEN
    IF v_db_payment_status IS NOT NULL AND v_db_payment_status != 'Dibatalkan' THEN
      RAISE EXCEPTION 'Status pesanan "Dibatalkan" tidak dapat digabungkan dengan status pembayaran aktif ("%").',
        v_db_payment_status
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Transition Rule 6: Single-Status Synchronization Policy
  -- When only one status is provided, synchronize the counterpart to prevent orphaned or contradictory states:
  -- 6a. If caller supplies ONLY order_status = 'Dibatalkan', automatically synchronize payment to 'Dibatalkan'
  IF p_order_status = 'Dibatalkan' AND v_db_payment_status IS NULL THEN
    v_db_payment_status := 'Dibatalkan';
  END IF;

  -- 6b. If caller supplies ONLY payment_status = 'Dibatalkan', automatically synchronize order to 'Dibatalkan'
  --     for preliminary and ready orders ('Pesanan baru', 'Diproses', 'Siap')
  IF v_db_payment_status = 'Dibatalkan' AND p_order_status IS NULL AND v_existing_order_status IN ('Pesanan baru', 'Diproses', 'Siap') THEN
    p_order_status := 'Dibatalkan';
  END IF;

  UPDATE public.orders
  SET
    order_status = COALESCE(p_order_status, order_status),
    payment_status = COALESCE(v_db_payment_status, payment_status),
    paid_at = CASE WHEN v_db_payment_status = 'Lunas' THEN COALESCE(paid_at, now()) ELSE paid_at END,
    cancelled_at = CASE WHEN p_order_status = 'Dibatalkan' OR v_db_payment_status = 'Dibatalkan' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
    updated_at = now()
  WHERE id = v_existing_id;

  -- Synchronize payments table
  IF v_db_payment_status IS NOT NULL THEN
    UPDATE public.payments
    SET status = v_db_payment_status, updated_at = now()
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
    ) ORDER BY o.created_at DESC
  ), '[]'::jsonb) INTO v_res
  FROM public.orders o;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_orders() TO service_role, postgres;

COMMIT;
