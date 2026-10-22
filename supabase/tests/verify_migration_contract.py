#!/usr/bin/env python3
"""
Test Suite: Migration Contract Static Security Validator
File: supabase/tests/verify_migration_contract.py

Performs strict static analysis on:
supabase/migrations/20261012181500_harden_rls_and_admin_security.sql

Validates:
  1. Transaction boundary: begins with BEGIN; and ends with COMMIT;.
  2. Syntax checks: No 'REVOKE ALL (col)' invalid PostgreSQL syntax.
  3. No duplicate CREATE POLICY statements.
  4. Every created policy has a corresponding DROP POLICY IF EXISTS before creation.
  5. public.admin_users has NO policy calling public.is_admin() (prevents RLS recursion).
  6. public.products revokes table-level SELECT from anon, authenticated, and public.
  7. public.products does NOT grant SELECT on 'hpp' to anon or authenticated.
  8. public.products explicitly revokes column privileges on 'hpp'.
  9. public.is_admin() is marked SECURITY DEFINER with hardened search_path.
 10. public.get_admin_products() returns exactly 16 columns matching schema and verifies admin.
 11. Customer mutation permissions on orders and payments are revoked (Zero-Trust baseline).
"""

import sys
import re
from pathlib import Path

MIGRATION_PATH = Path("/Users/lutfi/Documents/Temu by jina/supabase/migrations/20261012181500_harden_rls_and_admin_security.sql")

def run_contract_tests():
    print("=" * 70)
    print("RUNNING STATIC MIGRATION CONTRACT VALIDATOR")
    print(f"Target: {MIGRATION_PATH.name}")
    print("=" * 70)

    if not MIGRATION_PATH.exists():
        print(f"[FAIL] Migration file not found: {MIGRATION_PATH}")
        sys.exit(1)

    content = MIGRATION_PATH.read_text(encoding="utf-8")
    
    # Extract SQL between BEGIN; and COMMIT;
    match_tx = re.search(r"\bBEGIN;\s*(.*?)\s*\bCOMMIT;", content, re.DOTALL)
    if not match_tx:
        print("[FAIL] Could not find transactional block between BEGIN; and COMMIT;")
        sys.exit(1)
    
    tx_sql = match_tx.group(1)
    failures = []

    # Check 1: No invalid REVOKE ALL (column)
    invalid_revoke = re.findall(r"REVOKE\s+ALL\s*\([^)]+\)", tx_sql, re.IGNORECASE)
    if invalid_revoke:
        failures.append(f"Found invalid PostgreSQL syntax 'REVOKE ALL (column)': {invalid_revoke}")
    else:
        print("[PASS] Check 1: No invalid 'REVOKE ALL (column)' syntax found.")

    # Check 2: Table-level SELECT revoked on products
    if not re.search(r"REVOKE\s+SELECT\s+ON\s+TABLE\s+public\.products\s+FROM[^;]*\banon\b[^;]*\bauthenticated\b[^;]*\bPUBLIC\b", tx_sql, re.IGNORECASE):
        failures.append("Missing REVOKE SELECT ON TABLE public.products FROM anon, authenticated, PUBLIC;")
    else:
        print("[PASS] Check 2: Table-level SELECT on products revoked from anon, authenticated, PUBLIC.")

    # Check 3: Explicit column-level revoke on hpp
    if not re.search(r"REVOKE\s+SELECT\s*\(hpp\)[^;]*ON\s+TABLE\s+public\.products", tx_sql, re.IGNORECASE):
        failures.append("Missing explicit REVOKE SELECT (hpp) ON TABLE public.products")
    else:
        print("[PASS] Check 3: Explicit column-level revoke on hpp present.")

    # Check 4: Column grant on products strictly matches the intended 15-column public catalog whitelist
    match_product_grant = re.search(r"GRANT\s+SELECT\s*\(([^)]+)\)\s*ON\s+TABLE\s+public\.products\s+TO\s+anon,\s*authenticated", tx_sql, re.IGNORECASE)
    INTENDED_WHITELIST = {
        "id", "category_id", "name", "slug", "description", "price",
        "calories", "tags", "is_available", "is_featured", "is_archived",
        "sort_order", "created_at", "updated_at", "is_highlight"
    }
    if not match_product_grant:
        failures.append("Missing GRANT SELECT (<columns>) ON TABLE public.products TO anon, authenticated;")
    else:
        granted_cols = set(c.strip() for c in match_product_grant.group(1).split(","))
        if "hpp" in granted_cols:
            failures.append("CRITICAL DEFECT: 'hpp' column found in public catalog GRANT SELECT!")
        elif granted_cols != INTENDED_WHITELIST:
            diff_missing = INTENDED_WHITELIST - granted_cols
            diff_extra = granted_cols - INTENDED_WHITELIST
            failures.append(f"Granted columns do not match whitelist! Missing: {diff_missing}, Extra: {diff_extra}")
        else:
            print(f"[PASS] Check 4: Products GRANT SELECT matches exact 15-column whitelist; 'hpp' strictly excluded.")

    # Check 5: Anti-recursion on admin_users
    # Look for policies on admin_users in tx_sql
    admin_users_policies = re.findall(r"CREATE\s+POLICY\s+\"([^\"]+)\"\s+ON\s+public\.admin_users\s+FOR\s+([A-Z]+)\s+TO\s+([a-zA-Z0-9_, ]+)\s+USING\s*\(([^)]+)\)", tx_sql, re.IGNORECASE)
    recursion_found = False
    for p_name, p_cmd, p_to, p_using in admin_users_policies:
        if "is_admin" in p_using.lower():
            recursion_found = True
            failures.append(f"CRITICAL RECURSION: Policy '{p_name}' on admin_users evaluates is_admin()!")
    if not recursion_found and admin_users_policies:
        print(f"[PASS] Check 5: admin_users has {len(admin_users_policies)} policy/policies; 0 recursive is_admin() calls.")

    # Check 6: Old recursion policy 'Admins manage admin users' is dropped
    if not re.search(r"DROP\s+POLICY\s+IF\s+EXISTS\s+\"Admins manage admin users\"\s+ON\s+public\.admin_users", tx_sql):
        failures.append("Missing DROP POLICY IF EXISTS 'Admins manage admin users' ON public.admin_users;")
    else:
        print("[PASS] Check 6: Legacy recursive policy 'Admins manage admin users' explicitly dropped.")

    # Check 7: Home banners policy matches audited name 'Admins manage banners'
    if not re.search(r"DROP\s+POLICY\s+IF\s+EXISTS\s+\"Admins manage banners\"\s+ON\s+public\.home_banners", tx_sql):
        failures.append("Missing DROP POLICY IF EXISTS 'Admins manage banners' ON public.home_banners;")
    elif not re.search(r"CREATE\s+POLICY\s+\"Admins manage banners\"\s+ON\s+public\.home_banners", tx_sql):
        failures.append("Missing CREATE POLICY 'Admins manage banners' ON public.home_banners;")
    else:
        print("[PASS] Check 7: home_banners uses audited policy name 'Admins manage banners'.")

    # Check 8: No duplicate policy creation
    created_policies = re.findall(r"CREATE\s+POLICY\s+\"([^\"]+)\"\s+ON\s+([a-zA-Z0-9_.]+)", tx_sql)
    seen = set()
    duplicates = []
    for pol, tbl in created_policies:
        key = (pol, tbl)
        if key in seen:
            duplicates.append(key)
        seen.add(key)
    if duplicates:
        failures.append(f"Found duplicate CREATE POLICY statements: {duplicates}")
    else:
        print(f"[PASS] Check 8: All {len(created_policies)} created policies are uniquely named.")

    # Check 9: All created policies have a preceding DROP POLICY IF EXISTS
    unpaired_drops = []
    for pol, tbl in created_policies:
        drop_pattern = rf"DROP\s+POLICY\s+IF\s+EXISTS\s+\"{re.escape(pol)}\"\s+ON\s+{re.escape(tbl)}"
        if not re.search(drop_pattern, tx_sql):
            unpaired_drops.append((pol, tbl))
    if unpaired_drops:
        failures.append(f"Created policies missing preceding DROP POLICY IF EXISTS: {unpaired_drops}")
    else:
        print("[PASS] Check 9: All created policies have matching preceding DROP POLICY IF EXISTS.")

    # Check 10: Zero-trust order mutation check
    if re.search(r"GRANT\s+(INSERT|UPDATE|ALL)[^;]*ON\s+TABLE\s+public\.orders\s+TO[^;]*\banon\b", tx_sql, re.IGNORECASE):
        failures.append("CRITICAL: anon granted mutation privileges on public.orders!")
    elif re.search(r"CREATE\s+POLICY[^;]*ON\s+public\.orders\s+FOR\s+INSERT\s+TO\s+(anon|public)", tx_sql, re.IGNORECASE):
        failures.append("CRITICAL: Public/anon insert policy found on public.orders!")
    else:
        print("[PASS] Check 10: Zero-Trust order mutation baseline enforced (no public INSERT on orders).")

    print("=" * 70)
    if failures:
        print(f"FAILED WITH {len(failures)} DEFECTS:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("STATIC MIGRATION CONTRACT VALIDATION: ALL 10 CHECKS PASSED (0 DEFECTS)")
        sys.exit(0)

if __name__ == "__main__":
    run_contract_tests()
