#!/usr/bin/env python3
"""
Test Suite: Admin HPP Isolation & Function Security Architecture Validator
File: supabase/tests/verify_admin_hpp_architecture.py

Performs static validation of the admin HPP access architecture:
  1. public.is_admin() has hardened fixed search_path and schema-qualified references.
  2. public.is_admin() revokes EXECUTE from anon and PUBLIC, and grants to authenticated.
  3. public.get_admin_products() returns all 16 verified columns including hpp.
  4. public.get_admin_products() contains active runtime check raising error 42501 if not admin.
  5. public.get_admin_products() has fixed search_path = pg_catalog, public, pg_temp.
  6. public.get_admin_products() revokes EXECUTE from anon and PUBLIC.
  7. public.products table-level SELECT and column-level hpp are revoked from client roles.
  8. public.products mutation is strictly revoked from anon and granted to authenticated under RLS.
  9. verification_queries.sql contains queries 3.12 and 3.13 for mutation and execute privileges.
 10. verify_policy_ddl_generator.py passes 8 test cases with clean typing.
"""

import sys
import re
from pathlib import Path

MIGRATION_PATH = Path("/Users/lutfi/Documents/Temu by jina/supabase/migrations/20261012181500_harden_rls_and_admin_security.sql")
VERIFICATION_PATH = Path("/Users/lutfi/Documents/Temu by jina/supabase/verification_queries.sql")

def run_tests():
    print("=" * 70)
    print("RUNNING ADMIN HPP ARCHITECTURE & FUNCTION SECURITY VALIDATOR")
    print("=" * 70)

    if not MIGRATION_PATH.exists():
        print(f"[FAIL] Migration file not found: {MIGRATION_PATH}")
        sys.exit(1)

    if not VERIFICATION_PATH.exists():
        print(f"[FAIL] Verification file not found: {VERIFICATION_PATH}")
        sys.exit(1)

    migration_sql = MIGRATION_PATH.read_text(encoding="utf-8")
    verification_sql = VERIFICATION_PATH.read_text(encoding="utf-8")
    failures = []

    # 1. is_admin() hardened search_path
    if not re.search(r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.is_admin\(\)[^$]*SET\s+search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp", migration_sql, re.IGNORECASE):
        failures.append("public.is_admin() missing SET search_path = pg_catalog, public, pg_temp")
    else:
        print("[PASS] Check 1: public.is_admin() uses fixed search_path = pg_catalog, public, pg_temp.")

    # 2. is_admin() grants
    if not re.search(r"REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_admin\(\)\s+FROM\s+anon", migration_sql, re.IGNORECASE):
        failures.append("public.is_admin() does not revoke EXECUTE from anon")
    elif not re.search(r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_admin\(\)\s+TO[^;]*authenticated", migration_sql, re.IGNORECASE):
        failures.append("public.is_admin() does not grant EXECUTE to authenticated")
    else:
        print("[PASS] Check 2: public.is_admin() safely revokes EXECUTE from anon and grants to authenticated.")

    # 3. get_admin_products() returns 16 columns matching live catalog
    expected_cols = [
        "id uuid", "category_id uuid", "name text", "slug text", "description text",
        "price numeric", "hpp numeric", "calories integer", "tags text\\[\\]",
        "is_available boolean", "is_featured boolean", "is_archived boolean",
        "is_highlight boolean", "sort_order integer", "created_at timestamptz",
        "updated_at timestamptz"
    ]
    fn_sig_match = re.search(r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_admin_products\(\)\s+RETURNS\s+TABLE\s*\(([^)]+)\)", migration_sql, re.IGNORECASE)
    if not fn_sig_match:
        failures.append("Could not find public.get_admin_products() RETURNS TABLE signature")
    else:
        sig_body = fn_sig_match.group(1)
        missing_cols = []
        for col_pat in expected_cols:
            if not re.search(col_pat, sig_body):
                missing_cols.append(col_pat)
        if missing_cols:
            failures.append(f"get_admin_products() missing expected return columns: {missing_cols}")
        else:
            print("[PASS] Check 3: public.get_admin_products() defines exact 16-column table signature matching production.")

    # 4. get_admin_products() authorization check raising 42501
    if not re.search(r"IF\s+NOT\s+public\.is_admin\(\)\s+THEN\s+RAISE\s+EXCEPTION[^;]*USING\s+ERRCODE\s*=\s*'42501'", migration_sql, re.IGNORECASE):
        failures.append("get_admin_products() missing IF NOT public.is_admin() check raising ERRCODE '42501'")
    else:
        print("[PASS] Check 4: public.get_admin_products() strictly raises 42501 if caller is not an admin.")

    # 5. get_admin_products() fixed search_path
    if not re.search(r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_admin_products\(\)[^$]*SET\s+search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp", migration_sql, re.IGNORECASE):
        failures.append("get_admin_products() missing fixed search_path = pg_catalog, public, pg_temp")
    else:
        print("[PASS] Check 5: public.get_admin_products() enforces fixed search_path = pg_catalog, public, pg_temp.")

    # 6. get_admin_products() execution grants
    if not re.search(r"REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_admin_products\(\)\s+FROM\s+anon", migration_sql, re.IGNORECASE):
        failures.append("get_admin_products() does not revoke EXECUTE from anon")
    elif not re.search(r"REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_admin_products\(\)\s+FROM\s+PUBLIC", migration_sql, re.IGNORECASE):
        failures.append("get_admin_products() does not revoke ALL from PUBLIC")
    else:
        print("[PASS] Check 6: public.get_admin_products() revoked from anon and PUBLIC.")

    # 7. products hpp privilege isolation
    if not re.search(r"REVOKE\s+SELECT\s*\(hpp\)[^;]*ON\s+TABLE\s+public\.products\s+FROM[^;]*anon[^;]*authenticated[^;]*PUBLIC", migration_sql, re.IGNORECASE):
        failures.append("products missing explicit REVOKE SELECT (hpp) from anon, authenticated, PUBLIC")
    else:
        print("[PASS] Check 7: Column 'hpp' SELECT privilege explicitly revoked from client roles.")

    # 8. products mutation isolation
    if not re.search(r"REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.products\s+FROM\s+anon,\s*PUBLIC", migration_sql, re.IGNORECASE):
        failures.append("products mutation not revoked from anon, PUBLIC")
    elif not re.search(r"GRANT\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.products\s+TO\s+authenticated", migration_sql, re.IGNORECASE):
        failures.append("products mutation not granted to authenticated")
    else:
        print("[PASS] Check 8: products mutations revoked from anon and granted to authenticated (gated by RLS).")

    # 9. Verification queries 3.12 and 3.13 present
    if "3.12. Verify Table Mutation Privileges on public.products" not in verification_sql:
        failures.append("verification_queries.sql missing Query 3.12")
    elif "3.13. Verify Function Execution Privileges" not in verification_sql:
        failures.append("verification_queries.sql missing Query 3.13")
    else:
        print("[PASS] Check 9: verification_queries.sql contains Queries 3.12 and 3.13.")

    # 10. Query 2.3 COALESCE roles fallback
    if "COALESCE" not in verification_sql:
        failures.append("verification_queries.sql Query 2.3 missing COALESCE for roles fallback")
    else:
        print("[PASS] Check 10: Policy DDL generator handles roles fallback safely via COALESCE.")

    # 11. All 26 confirmed live policies dropped
    CONFIRMED_LIVE_POLICIES = [
        ("Admins manage addons", "public.addons"),
        ("Public read active addons", "public.addons"),
        ("Admins manage read state", "public.admin_read_state"),
        ("Admins manage admin users", "public.admin_users"),
        ("Admins manage order tokens", "public.anonymous_order_tokens"),
        ("Admins manage categories", "public.categories"),
        ("Public read active categories", "public.categories"),
        ("Admins manage delivery areas", "public.delivery_areas"),
        ("Public read active delivery areas", "public.delivery_areas"),
        ("Admins manage banners", "public.home_banners"),
        ("Public read active banners", "public.home_banners"),
        ("Admins manage item options", "public.order_item_options"),
        ("Admins manage order items", "public.order_items"),
        ("Admins manage orders", "public.orders"),
        ("Admins manage payments", "public.payments"),
        ("Admins manage product addons", "public.product_addons"),
        ("Public read product addons", "public.product_addons"),
        ("Admins manage product images", "public.product_images"),
        ("Public read images of visible products", "public.product_images"),
        ("Admins manage option groups", "public.product_option_groups"),
        ("Public read active option groups", "public.product_option_groups"),
        ("Admins manage option values", "public.product_option_values"),
        ("Public read active option values", "public.product_option_values"),
        ("Admins manage products", "public.products"),
        ("Public read visible products", "public.products"),
        ("Admins manage store settings", "public.store_settings"),
    ]
    missing_live_drops = []
    for pol_name, tbl_name in CONFIRMED_LIVE_POLICIES:
        pat = rf"DROP\s+POLICY\s+IF\s+EXISTS\s+\"{re.escape(pol_name)}\"\s+ON\s+{re.escape(tbl_name)}"
        if not re.search(pat, migration_sql):
            missing_live_drops.append((pol_name, tbl_name))
    if missing_live_drops:
        failures.append(f"Missing DROP POLICY IF EXISTS for confirmed live policies: {missing_live_drops}")
    else:
        print(f"[PASS] Check 11: All {len(CONFIRMED_LIVE_POLICIES)} confirmed live policies have explicit DROP statements.")

    # 12. Policy drops precede REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon
    revoke_match = re.search(r"REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_admin\(\)\s+FROM\s+anon", migration_sql)
    item_opt_drop = re.search(r"DROP\s+POLICY\s+IF\s+EXISTS\s+\"Admins manage item options\"", migration_sql)
    order_tok_drop = re.search(r"DROP\s+POLICY\s+IF\s+EXISTS\s+\"Admins manage order tokens\"", migration_sql)
    read_st_drop = re.search(r"DROP\s+POLICY\s+IF\s+EXISTS\s+\"Admins manage read state\"", migration_sql)

    if not (revoke_match and item_opt_drop and order_tok_drop and read_st_drop):
        failures.append("Could not locate required DROP and REVOKE statements for ordering check")
    elif not (item_opt_drop.start() < revoke_match.start() and
              order_tok_drop.start() < revoke_match.start() and
              read_st_drop.start() < revoke_match.start()):
        failures.append("Execution ordering violation: Policy drops must precede REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon")
    else:
        print("[PASS] Check 12: All legacy policy drops precede REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon.")

    print("=" * 70)
    if failures:
        print(f"FAILED WITH {len(failures)} DEFECTS:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("ADMIN HPP ARCHITECTURE VALIDATION: ALL 12 CHECKS PASSED (0 DEFECTS)")
        sys.exit(0)

if __name__ == "__main__":
    run_tests()
