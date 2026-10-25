-- ==============================================================================
-- TEMU BY JINA — PRODUCTION SCHEMA & FUNCTION PREFLIGHT CHECK
-- File: supabase/production_schema_preflight.sql
--
-- STRICT SAFETY GUARANTEE:
-- 100% READ-ONLY (SELECT STATEMENTS ONLY).
-- DOES NOT MUTATE SCHEMA, POLICIES, PERMISSIONS, OR APPLICATION DATA.
--
-- Instructions:
-- 1. Open Supabase Dashboard -> SQL Editor (or connect via read-only psql).
-- 2. Paste and run this script.
-- 3. Review the result tables to determine exact compatibility.
-- ==============================================================================

-- ==============================================================================
-- 1. MIGRATION HISTORY TABLE STATUS
-- Check if supabase_migrations.schema_migrations exists and what versions it records
-- ==============================================================================
SELECT
  '1. Migration History Table' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) AS history_table_exists,
  COALESCE(
    (SELECT string_agg(version, ', ' ORDER BY version) FROM supabase_migrations.schema_migrations),
    'EMPTY OR NON-EXISTENT'
  ) AS recorded_versions;

-- ==============================================================================
-- 2. CRITICAL PRODUCTION RPC FUNCTIONS & SECURITY DEFINITIONS
-- Checks existence, owner, security definer flag, search_path, and argument types
-- ==============================================================================
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS argument_signature,
  pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS is_security_definer,
  array_to_string(p.proconfig, ', ') AS search_path_config,
  CASE 
    WHEN array_to_string(p.proconfig, ', ') ILIKE '%search_path=pg_catalog, public, pg_temp%' THEN 'SAFE'
    ELSE 'FLAGGED: Insecure search_path'
  END AS search_path_safety,
  -- Check whether admin_update_order_status includes the immutable completed order check (20261023000000)
  CASE
    WHEN p.proname = 'admin_update_order_status' AND p.prosrc ILIKE '%Pesanan yang telah selesai tidak dapat diubah%'
      THEN 'VERSION 20261023000000 (Immutable completed orders applied)'
    WHEN p.proname = 'admin_update_order_status'
      THEN 'VERSION 20261022000000 (Earlier transition rules without completed immutability)'
    WHEN p.proname = 'create_order_atomic' AND p.prosrc ILIKE '%pg_advisory_xact_lock%'
      THEN 'VERSION 20261022000000 (Advisory lock & atomic order insert present)'
    ELSE 'ACTIVE'
  END AS implementation_version
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_order_atomic',
    'generate_daily_order_number',
    'admin_update_order_status',
    'get_admin_orders',
    'lookup_order_by_token_hash',
    'lookup_orders_by_token_hashes',
    'get_admin_products',
    'is_admin'
  )
ORDER BY p.proname;

-- ==============================================================================
-- 3. RPC FUNCTION EXECUTE PERMISSIONS
-- Must be REVOKED from 'anon' and granted only to authorized roles ('service_role', 'authenticated', 'postgres')
-- ==============================================================================
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
    'create_order_atomic',
    'generate_daily_order_number',
    'admin_update_order_status',
    'get_admin_orders',
    'lookup_order_by_token_hash',
    'lookup_orders_by_token_hashes'
  )
ORDER BY routine_name, grantee;

-- ==============================================================================
-- 4. REQUIRED TABLES & ROW LEVEL SECURITY (RLS) STATUS
-- ==============================================================================
SELECT
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS table_owner,
  c.rowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'orders',
    'order_items',
    'order_item_options',
    'payments',
    'daily_order_counters',
    'anonymous_order_tokens',
    'delivery_areas',
    'store_settings',
    'admin_users',
    'admin_read_state',
    'homepage_sections',
    'homepage_section_products'
  )
ORDER BY c.relname;

-- ==============================================================================
-- 5. ORDERS TABLE COLUMNS & NULLABILITY AUDIT
-- Verifies required monetary, status, and fulfillment columns expected by application code
-- ==============================================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
ORDER BY ordinal_position;

-- ==============================================================================
-- 6. ORDER ITEMS & PAYMENTS COLUMNS & NULLABILITY AUDIT
-- ==============================================================================
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('order_items', 'order_item_options', 'payments', 'daily_order_counters', 'anonymous_order_tokens')
ORDER BY table_name, ordinal_position;

-- ==============================================================================
-- 7. REQUIRED CONSTRAINTS & CRITICAL INDEXES
-- Verifies unique active token index, order sequence counter PK, and order foreign keys
-- ==============================================================================
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'anonymous_order_tokens', 'daily_order_counters', 'payments', 'order_items')
ORDER BY tablename, indexname;

-- ==============================================================================
-- 8. CLIENT ROLE DIRECT TABLE MUTATION AUDIT
-- Verifies that 'anon' and 'authenticated' CANNOT directly mutate orders or payments
-- ==============================================================================
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_items', 'order_item_options', 'payments', 'daily_order_counters', 'anonymous_order_tokens')
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY table_name, grantee, privilege_type;
