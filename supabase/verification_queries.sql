-- ==============================================================================
-- File: supabase/verification_queries.sql
-- Project: Temu by Jina
-- Purpose: Read-Only Verification Queries for Pre-Flight, Step 0 Baseline, and Post-Migration Security
--
-- STRICT OPERATIONAL RULE:
-- ALL QUERIES IN THIS FILE ARE READ-ONLY (SELECT STATEMENTS).
-- THEY DO NOT MUTATE TABLES, POLICIES, OR DATA IN THE DATABASE.
-- RUN THESE QUERIES IN SUPABASE SQL EDITOR TO AUDIT AND VERIFY SECURITY.
--
-- IMPORTANT POSTGRESQL ARCHITECTURE NOTE:
-- In PostgreSQL, 'PUBLIC' is a special pseudo-role / grantee representing all roles.
-- It is NOT an ordinary role in pg_authid. Calling has_table_privilege('public', ...)
-- or has_column_privilege('public', ...) will fail with "role 'public' does not exist".
-- Instead:
--   1. has_table_privilege() and has_column_privilege() are called for real database
--      roles ('anon', 'authenticated'). PostgreSQL automatically evaluates any privileges
--      inherited from PUBLIC during these calls.
--   2. Direct grants to PUBLIC are inspected directly via PostgreSQL system catalog ACLs
--      using aclexplode() where grantee = 0 represents PUBLIC, and checking exact
--      privilege_type = 'SELECT', handling NULL ACLs via acldefault('r', c.relowner).
-- ==============================================================================

-- ==============================================================================
-- 1. PRE-FLIGHT LIVE AUDIT: INSPECT CURRENT RLS POLICIES & NAMES
-- Purpose: Verify actual existing policy names before executing any DROP statements.
-- ==============================================================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'categories', 'products', 'product_images', 'product_option_groups',
    'product_option_values', 'addons', 'product_addons', 'home_banners',
    'store_settings', 'delivery_areas', 'orders', 'order_items',
    'order_item_options', 'payments', 'anonymous_order_tokens',
    'admin_read_state', 'admin_users'
  )
ORDER BY tablename, cmd, policyname;

-- ==============================================================================
-- 2. STEP 0 BASELINE CAPTURE: RECORD SNAPSHOT PRIOR TO MIGRATION
-- Run these queries and SAVE the output text locally before applying any migration!
-- ==============================================================================

-- 2.1. Capture Table-Level Privileges (Direct Grants, including PUBLIC)
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

-- 2.2. Capture Column-Level Privileges (Direct Grants, including PUBLIC)
SELECT grantee, table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, column_name, grantee;

-- 2.3. Capture Verifiable Policy DDL Snapshot (Handles NULLs, Roles, Restrictive/Permissive)
-- CRITICAL ROLLBACK ARCHITECTURE NOTE:
-- Restoring 'ddl_to_restore' recreates RLS policies ONLY.
-- Table privileges (Query 2.1), column privileges (Query 2.2), function ownership & search_paths (Query 2.4),
-- and sequences (Query 2.5) MUST be restored separately as captured in their respective snapshots.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  format(
    'CREATE POLICY %I ON %I.%I%s FOR %s TO %s%s%s;',
    policyname,
    schemaname,
    tablename,
    CASE WHEN permissive = 'RESTRICTIVE' THEN ' AS RESTRICTIVE' ELSE ' AS PERMISSIVE' END,
    cmd,
    COALESCE(
      (
        SELECT string_agg(
          CASE WHEN r = 'public' THEN 'public' ELSE quote_ident(r) END,
          ', '
        )
        FROM unnest(roles) AS r
      ),
      'public'
    ),
    CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END,
    CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END
  ) AS ddl_to_restore
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 2.4. Capture Function Ownership & Grants
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS is_security_definer,
  p.proconfig AS search_path_config,
  p.proacl AS function_acl
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin', 'get_admin_products');

-- 2.5. Capture Sequences
SELECT sequence_schema, sequence_name
FROM information_schema.sequences
WHERE sequence_schema = 'public';

-- ==============================================================================
-- 3. POST-MIGRATION EVIDENCE-BASED VERIFICATION
-- Run these queries after applying the migration to prove security enforcement.
-- ==============================================================================

-- 3.1. Verify Effective Permissions on public.products (has_table_privilege & has_column_privilege)
-- NOTE: Tested for actual roles 'anon' and 'authenticated'. PostgreSQL automatically includes
-- any inherited permissions and grants to PUBLIC in these functions.
-- EXPECTED RESULT:
--   anon:          has_table_select=false, can_read_hpp=false, storefront catalog columns=true
--   authenticated: has_table_select=false, can_read_hpp=false, storefront catalog columns=true
SELECT
  role_name,
  has_table_privilege(role_name, 'public.products', 'SELECT') AS has_table_select,
  has_column_privilege(role_name, 'public.products', 'hpp', 'SELECT') AS can_read_hpp,
  has_column_privilege(role_name, 'public.products', 'id', 'SELECT') AS can_read_id,
  has_column_privilege(role_name, 'public.products', 'category_id', 'SELECT') AS can_read_category_id,
  has_column_privilege(role_name, 'public.products', 'name', 'SELECT') AS can_read_name,
  has_column_privilege(role_name, 'public.products', 'slug', 'SELECT') AS can_read_slug,
  has_column_privilege(role_name, 'public.products', 'description', 'SELECT') AS can_read_description,
  has_column_privilege(role_name, 'public.products', 'price', 'SELECT') AS can_read_price,
  has_column_privilege(role_name, 'public.products', 'calories', 'SELECT') AS can_read_calories,
  has_column_privilege(role_name, 'public.products', 'tags', 'SELECT') AS can_read_tags,
  has_column_privilege(role_name, 'public.products', 'is_available', 'SELECT') AS can_read_is_available,
  has_column_privilege(role_name, 'public.products', 'is_featured', 'SELECT') AS can_read_is_featured,
  has_column_privilege(role_name, 'public.products', 'is_archived', 'SELECT') AS can_read_is_archived,
  has_column_privilege(role_name, 'public.products', 'sort_order', 'SELECT') AS can_read_sort_order,
  has_column_privilege(role_name, 'public.products', 'created_at', 'SELECT') AS can_read_created_at,
  has_column_privilege(role_name, 'public.products', 'updated_at', 'SELECT') AS can_read_updated_at,
  has_column_privilege(role_name, 'public.products', 'is_highlight', 'SELECT') AS can_read_is_highlight
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name);

-- 3.2. Strict Whitelist Column Audit on public.products
-- SECURITY INVARIANT:
-- Only the 15 explicitly whitelisted storefront columns may be readable by client roles.
-- Column 'hpp' and ANY other non-whitelisted/sensitive column MUST BE FALSE.
-- Also verifies that PUBLIC has NO direct column-level grant on any column.
SELECT
  a.attname AS column_name,
  has_column_privilege('anon', 'public.products', a.attname, 'SELECT') AS anon_can_select,
  has_column_privilege('authenticated', 'public.products', a.attname, 'SELECT') AS authenticated_can_select,
  (
    a.attacl IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM aclexplode(a.attacl) col_acl
      WHERE col_acl.grantee = 0
        AND col_acl.privilege_type = 'SELECT'
    )
  ) AS public_has_column_select_grant,
  CASE
    WHEN a.attname IN (
      'id', 'category_id', 'name', 'slug', 'description', 'price',
      'calories', 'tags', 'is_available', 'is_featured', 'is_archived',
      'sort_order', 'created_at', 'updated_at', 'is_highlight'
    ) THEN 'MUST BE TRUE (Whitelisted Public Catalog Column)'
    WHEN a.attname = 'hpp' THEN 'MUST BE FALSE (Explicit Sensitive Cost Price)'
    ELSE 'MUST BE FALSE (Non-Whitelisted / Internal Column)'
  END AS expected_status,
  CASE
    WHEN a.attname IN (
      'id', 'category_id', 'name', 'slug', 'description', 'price',
      'calories', 'tags', 'is_available', 'is_featured', 'is_archived',
      'sort_order', 'created_at', 'updated_at', 'is_highlight'
    ) THEN (
      has_column_privilege('anon', 'public.products', a.attname, 'SELECT') = true
      AND has_column_privilege('authenticated', 'public.products', a.attname, 'SELECT') = true
    )
    ELSE (
      has_column_privilege('anon', 'public.products', a.attname, 'SELECT') = false
      AND has_column_privilege('authenticated', 'public.products', a.attname, 'SELECT') = false
    )
  END AS invariant_passed
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'products'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;

-- 3.3. Verify Direct Grants on PUBLIC via aclexplode() and acldefault()
-- Requirements:
--   - Correctly identifies PUBLIC using grantee = 0 (PostgreSQL internal OID for PUBLIC in aclexplode).
--   - Checks exact privilege_type = 'SELECT', preventing false positives from arbitrary text matching (e.g. '%r%').
--   - Handles NULL relacl correctly via acldefault('r', c.relowner) for table default privileges.
--   - Distinguishes table-level grants from column-level grants.
--   - Correctly inspects attacl for column-level grants on 'hpp'.
--   - Computes effective PUBLIC exposure on 'hpp' (table-level OR column-level).
SELECT
  c.relname AS table_name,
  -- 1. Table-level SELECT granted to PUBLIC:
  EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'SELECT'
  ) AS public_has_table_select_grant,

  -- 2. Column-level SELECT granted to PUBLIC specifically on column 'hpp':
  -- Note: attacl is NULL if no column-level grant exists.
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    CROSS JOIN LATERAL aclexplode(a.attacl) col_acl
    WHERE a.attrelid = c.oid
      AND a.attname = 'hpp'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND col_acl.grantee = 0
      AND col_acl.privilege_type = 'SELECT'
  ) AS public_has_hpp_column_select_grant,

  -- 3. Effective exposure of 'hpp' to PUBLIC (table-level OR column-level grant):
  (
    EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'SELECT'
    )
    OR
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) col_acl
      WHERE a.attrelid = c.oid
        AND a.attname = 'hpp'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND col_acl.grantee = 0
        AND col_acl.privilege_type = 'SELECT'
    )
  ) AS public_effective_can_read_hpp,

  -- 4. Raw ACLs for audit transparency:
  c.relacl AS raw_table_acl,
  (
    SELECT a.attacl
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = c.oid
      AND a.attname = 'hpp'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) AS raw_hpp_column_acl
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'products';
-- EXPECTED RESULT:
--   public_has_table_select_grant = false
--   public_has_hpp_column_select_grant = false
--   public_effective_can_read_hpp = false

-- 3.4. Detailed Audit of ALL Column Grants Assigned to PUBLIC on public.products
-- Uses aclexplode() across all column ACLs. If the migration was applied properly, this returns 0 rows.
SELECT
  a.attname AS column_name,
  col_acl.privilege_type,
  col_acl.is_grantable
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
CROSS JOIN LATERAL aclexplode(a.attacl) col_acl
WHERE n.nspname = 'public'
  AND c.relname = 'products'
  AND col_acl.grantee = 0 -- 0 represents PUBLIC
  AND a.attnum > 0
  AND NOT a.attisdropped;
-- EXPECTED RESULT: 0 rows (PUBLIC has no column privileges on any column of public.products)

-- 3.5. Verify Direct Table and Column Grants from information_schema (including PUBLIC)
SELECT grantee, table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name = 'hpp'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');
-- EXPECTED RESULT: 0 rows (No direct grant on hpp to client roles or PUBLIC)

-- 3.6. Verify public.is_admin() Security & Configuration
-- EXPECTED: owner='postgres', prosecdef=true, search_path_config={pg_catalog, public, pg_temp}
SELECT
  p.proname,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS is_security_definer,
  p.proconfig AS search_path_config,
  p.proacl AS function_acl
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

-- 3.7. Verify public.admin_users RLS Policies (Anti-Recursion Check)
-- EXPECTED: Exactly 1 policy 'Allow authenticated user to verify own admin record' with qual='(auth.uid() = user_id)'
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND tablename = 'admin_users';

-- 3.8. Verify No Client Mutation Privileges on public.admin_users
-- EXPECTED: 0 rows (No client can INSERT, UPDATE, DELETE, or TRUNCATE admin_users)
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'admin_users'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

-- 3.9. Verify public.get_admin_products() RPC
-- EXPECTED: owner='postgres', returns 16 columns including hpp
SELECT
  p.proname,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef,
  pg_get_function_result(p.oid) AS return_signature,
  p.proacl
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_admin_products';

-- 3.10. Verify Home Banners Policy Name (Must be 'Admins manage banners')
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND tablename = 'home_banners';

-- 3.11. Verify Customer Order Isolation (Zero-Trust Baseline)
-- EXPECTED: 0 rows where grantee is anon or PUBLIC for orders, order_items, payments mutations
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_items', 'order_item_options', 'payments', 'anonymous_order_tokens')
  AND grantee IN ('anon', 'PUBLIC')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');

-- 3.12. Verify Table Mutation Privileges on public.products
-- EXPECTED:
--   anon, PUBLIC: 0 rows (no direct INSERT, UPDATE, DELETE privileges)
--   authenticated: INSERT, UPDATE, DELETE present (strictly gated by RLS policy 'Admins manage products')
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY grantee, privilege_type;

-- 3.13. Verify Function Execution Privileges (is_admin and get_admin_products)
-- EXPECTED: 0 rows (Neither anon nor PUBLIC has direct EXECUTE on is_admin or get_admin_products)
SELECT
  p.proname AS function_name,
  col_acl.grantee,
  col_acl.privilege_type
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(p.proacl) col_acl
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin', 'get_admin_products')
  AND (col_acl.grantee = 0 OR col_acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon'))
  AND col_acl.privilege_type = 'EXECUTE';

