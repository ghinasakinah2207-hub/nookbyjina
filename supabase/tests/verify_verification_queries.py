#!/usr/bin/env python3
"""
Test Suite: Supabase Security Verification Queries Static Validator
File: supabase/tests/verify_verification_queries.py

Validates the read-only verification queries in supabase/verification_queries.sql:
  1. No invalid privilege checks: NEVER passes pseudo-role 'public' to
     has_table_privilege() or has_column_privilege().
  2. No brittle text matching: Zero occurrences of LIKE '=%' or LIKE '%r%' for ACLs.
  3. Proper PostgreSQL ACL parsing: Uses aclexplode() with grantee = 0 and
     privilege_type = 'SELECT'.
  4. Relation default privilege handling: Uses acldefault('r', c.relowner) with COALESCE.
  5. Distinguishes table-level vs column-level grants on PUBLIC.
  6. Evaluates effective PUBLIC exposure on 'hpp'.
  7. Strict 15-column public catalog whitelist invariance:
     Only the 15 intended columns are marked TRUE; 'hpp' and non-whitelisted columns are FALSE.
  8. Independent role evaluation: Verifies anon and authenticated independently.
  9. Strictly read-only: No DDL (CREATE, DROP, ALTER) or DML (INSERT, UPDATE, DELETE).
"""

import sys
import re
from pathlib import Path

VERIFICATION_PATH = Path("/Users/lutfi/Documents/Temu by jina/supabase/verification_queries.sql")

INTENDED_WHITELIST = {
    "id", "category_id", "name", "slug", "description", "price",
    "calories", "tags", "is_available", "is_featured", "is_archived",
    "sort_order", "created_at", "updated_at", "is_highlight"
}

def run_tests():
    print("=" * 70)
    print("RUNNING VERIFICATION QUERIES CONTRACT VALIDATOR")
    print(f"Target: {VERIFICATION_PATH.name}")
    print("=" * 70)

    if not VERIFICATION_PATH.exists():
        print(f"[FAIL] Verification file not found: {VERIFICATION_PATH}")
        sys.exit(1)

    content = VERIFICATION_PATH.read_text(encoding="utf-8")
    failures = []

    # Strip SQL comments for code inspection
    sql_lines = []
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped.startswith("--"):
            sql_lines.append(line)
    code_only = "\n".join(sql_lines)

    # Check 1: No has_table_privilege('public', ...) or has_column_privilege('public', ...)
    if re.search(r"has_(table|column)_privilege\s*\(\s*['\"]public['\"]", code_only, re.IGNORECASE):
        failures.append("Found invalid call passing pseudo-role 'public' to has_table/column_privilege!")
    else:
        print("[PASS] Check 1: No pseudo-role 'public' passed to privilege functions (prevents 42704 error).")

    # Check 2: No brittle text matching (LIKE '=%' or LIKE '%r%')
    if re.search(r"LIKE\s+['\"][^'\"]*%r%[^'\"]*['\"]", code_only, re.IGNORECASE) or \
       re.search(r"LIKE\s+['\"][^'\"]*=%[^'\"]*['\"]", code_only, re.IGNORECASE):
        failures.append("Found brittle ACL text matching LIKE '=%' or LIKE '%r%'!")
    else:
        print("[PASS] Check 2: No brittle ACL text matching (LIKE '=%' / LIKE '%r%').")

    # Check 3: aclexplode() used with grantee = 0 and privilege_type = 'SELECT'
    if not re.search(r"aclexplode\s*\(", code_only, re.IGNORECASE):
        failures.append("Missing aclexplode() catalog function invocation!")
    elif not re.search(r"grantee\s*=\s*0\b", code_only, re.IGNORECASE):
        failures.append("Missing check for grantee = 0 (PostgreSQL OID representing PUBLIC)!")
    elif not re.search(r"privilege_type\s*=\s*'SELECT'", code_only, re.IGNORECASE):
        failures.append("Missing exact check for privilege_type = 'SELECT'!")
    else:
        print("[PASS] Check 3: Robust aclexplode() parsing verifies grantee = 0 AND privilege_type = 'SELECT'.")

    # Check 4: acldefault('r', c.relowner) handles NULL relation ACLs
    if not re.search(r"acldefault\s*\(\s*'r'\s*,\s*c\.relowner\s*\)", code_only, re.IGNORECASE):
        failures.append("Missing acldefault('r', c.relowner) for relation default privileges!")
    else:
        print("[PASS] Check 4: Correct PostgreSQL default privilege handling via acldefault('r', c.relowner).")

    # Check 5: Distinguishes table-level grants from column-level grants
    has_table_level_check = "public_has_table_select_grant" in code_only
    has_column_level_check = "public_has_hpp_column_select_grant" in code_only
    has_effective_check = "public_effective_can_read_hpp" in code_only

    if not (has_table_level_check and has_column_level_check and has_effective_check):
        failures.append("Query 3.3 does not properly distinguish table-level vs column-level vs effective grants!")
    else:
        print("[PASS] Check 5: Clear distinction between table-level grant, column-level grant, and effective exposure.")

    # Check 6: Strict 15-column whitelist invariant in Query 3.2
    whitelist_matches = re.findall(
        r"WHEN\s+a\.attname\s+IN\s*\(([^)]+)\)\s+THEN\s+'MUST BE TRUE",
        code_only,
        re.IGNORECASE
    )
    if not whitelist_matches:
        failures.append("Could not find 15-column whitelist matching clause in Query 3.2!")
    else:
        parsed_cols = set(re.findall(r"'([a-zA-Z0-9_]+)'", whitelist_matches[0]))
        if parsed_cols != INTENDED_WHITELIST:
            diff_missing = INTENDED_WHITELIST - parsed_cols
            diff_extra = parsed_cols - INTENDED_WHITELIST
            failures.append(f"Whitelist mismatch! Missing: {diff_missing}, Extra: {diff_extra}")
        else:
            print(f"[PASS] Check 6: Query 3.2 strictly enforces the exact 15-column catalog whitelist.")

    # Check 7: Column 'hpp' explicitly targeted and marked FALSE
    if not re.search(r"WHEN\s+a\.attname\s*=\s*'hpp'\s+THEN\s+'MUST BE FALSE", code_only, re.IGNORECASE):
        failures.append("Missing explicit WHEN a.attname = 'hpp' THEN 'MUST BE FALSE' check!")
    else:
        print("[PASS] Check 7: Column 'hpp' explicitly verified as MUST BE FALSE.")

    # Check 8: Independent role checks for 'anon' and 'authenticated'
    if not re.search(r"VALUES\s*\(\s*'anon'\s*\)\s*,\s*\(\s*'authenticated'\s*\)", code_only, re.IGNORECASE):
        failures.append("Query 3.1 does not test 'anon' and 'authenticated' independently!")
    else:
        print("[PASS] Check 8: 'anon' and 'authenticated' evaluated independently as distinct client roles.")

    # Check 9: Invariant fallback dynamically flags any unwhitelisted column
    invariant_fallback = re.search(
        r"ELSE\s*\(\s*has_column_privilege\('anon'[^)]+\)\s*=\s*false\s+AND\s+has_column_privilege\('authenticated'[^)]+\)\s*=\s*false\s*\)",
        code_only,
        re.IGNORECASE
    )
    if not invariant_fallback:
        failures.append("Query 3.2 missing fallback in invariant_passed requiring anon=false AND authenticated=false for non-whitelisted columns!")
    else:
        print("[PASS] Check 9: Dynamic fallback in Query 3.2 ensures any unexpected column is flagged as failure if readable.")

    # Check 10: Owner privileges not confused with PUBLIC (grantee strictly filtered as 0, not relowner)
    if re.search(r"acl\.grantee\s*=\s*c\.relowner", code_only, re.IGNORECASE):
        failures.append("Defect: Query matches relowner as PUBLIC!")
    else:
        print("[PASS] Check 10: Table ACL audit strictly filters grantee = 0 and does not confuse owner permissions with PUBLIC.")

    # Check 11: Strictly read-only statements (every statement must start with SELECT)
    # Parse statements by semicolon respecting single-quoted string literals
    statements = []
    current = []
    in_str = False
    i = 0
    while i < len(code_only):
        c = code_only[i]
        if c == "'":
            # Check for escaped quote ''
            if in_str and i + 1 < len(code_only) and code_only[i + 1] == "'":
                current.append("''")
                i += 2
                continue
            in_str = not in_str
            current.append(c)
        elif c == ";" and not in_str:
            stmt = "".join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
        else:
            current.append(c)
        i += 1
    if "".join(current).strip():
        statements.append("".join(current).strip())

    non_select_stmts = []
    for stmt in statements:
        first_word = stmt.strip().split()[0].upper() if stmt.strip().split() else ""
        if first_word not in ("SELECT", "WITH"):
            non_select_stmts.append((first_word, stmt[:60]))

    if non_select_stmts:
        failures.append(f"Found non-SELECT queries in verification file: {non_select_stmts}")
    else:
        print(f"[PASS] Check 11: All {len(statements)} executable verification queries are strictly read-only (SELECT).")

    print("=" * 70)
    if failures:
        print(f"FAILED WITH {len(failures)} DEFECTS:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("VERIFICATION QUERIES VALIDATION: ALL 11 CHECKS PASSED (0 DEFECTS)")
        sys.exit(0)

if __name__ == "__main__":
    run_tests()
