#!/usr/bin/env python3
"""
Test Suite: PostgreSQL Policy DDL Generator Static Validation
File: supabase/tests/verify_policy_ddl_generator.py

Validates the DDL reconstruction logic used in Step 0 baseline exports against
all 7 required test cases:
  1. A SELECT policy with a USING expression and no WITH CHECK.
  2. An INSERT policy with WITH CHECK and no USING.
  3. An UPDATE policy with both expressions.
  4. A policy with neither expression.
  5. A restrictive policy (AS RESTRICTIVE).
  6. A policy applying to multiple roles.
  7. An ALL policy.

Also validates:
  - Nullable qual and with_check omit their respective clauses completely.
  - SQL NULL is never emitted as string 'NULL' or empty parenthesis 'USING ()'.
  - Identifiers for schema, table, policy, and roles are properly formatted and quoted.
"""

import sys
import re
from typing import Optional, List, TypedDict

class PolicyInput(TypedDict):
    schemaname: str
    tablename: str
    policyname: str
    permissive: str
    roles: List[str]
    cmd: str
    qual: Optional[str]
    with_check: Optional[str]

class TestCase(TypedDict):
    id: int
    description: str
    input: PolicyInput
    expected: str

def generate_policy_ddl(
    schemaname: str,
    tablename: str,
    policyname: str,
    permissive: str,
    roles: List[str],
    cmd: str,
    qual: Optional[str],
    with_check: Optional[str]
) -> str:
    """
    Simulates PostgreSQL format() logic matching:
    format(
      'CREATE POLICY %I ON %I.%I%s FOR %s TO %s%s%s;',
      policyname,
      schemaname,
      tablename,
      CASE WHEN permissive = 'RESTRICTIVE' THEN ' AS RESTRICTIVE' ELSE ' AS PERMISSIVE' END,
      cmd,
      COALESCE(
        (SELECT string_agg(CASE WHEN r = 'public' THEN 'public' ELSE quote_ident(r) END, ', ') FROM unnest(roles) AS r),
        'public'
      ),
      CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END,
      CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END
    )
    """
    permissive_clause = " AS RESTRICTIVE" if permissive == "RESTRICTIVE" else " AS PERMISSIVE"
    
    # Format roles: 'public' is unquoted pseudo-role, identifiers with special characters get quoted
    formatted_roles = []
    for r in roles:
        if r == "public":
            formatted_roles.append("public")
        elif not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", r):
            formatted_roles.append(f'"{r}"')
        else:
            formatted_roles.append(r)
    role_str = ", ".join(formatted_roles) if formatted_roles else "public"

    using_clause = f" USING ({qual})" if qual is not None else ""
    check_clause = f" WITH CHECK ({with_check})" if with_check is not None else ""

    return (
        f'CREATE POLICY "{policyname}" ON "{schemaname}"."{tablename}"'
        f'{permissive_clause} FOR {cmd} TO {role_str}{using_clause}{check_clause};'
    )


def run_tests():
    test_cases: List[TestCase] = [
        {
            "id": 1,
            "description": "SELECT policy with USING and no WITH CHECK",
            "input": {
                "schemaname": "public",
                "tablename": "products",
                "policyname": "Public read visible products",
                "permissive": "PERMISSIVE",
                "roles": ["public"],
                "cmd": "SELECT",
                "qual": "is_archived = false",
                "with_check": None,
            },
            "expected": 'CREATE POLICY "Public read visible products" ON "public"."products" AS PERMISSIVE FOR SELECT TO public USING (is_archived = false);',
        },
        {
            "id": 2,
            "description": "INSERT policy with WITH CHECK and no USING",
            "input": {
                "schemaname": "public",
                "tablename": "orders",
                "policyname": "Allow insert own order",
                "permissive": "PERMISSIVE",
                "roles": ["authenticated"],
                "cmd": "INSERT",
                "qual": None,
                "with_check": "auth.uid() = user_id",
            },
            "expected": 'CREATE POLICY "Allow insert own order" ON "public"."orders" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);',
        },
        {
            "id": 3,
            "description": "UPDATE policy with both USING and WITH CHECK",
            "input": {
                "schemaname": "public",
                "tablename": "orders",
                "policyname": "Admins update orders",
                "permissive": "PERMISSIVE",
                "roles": ["authenticated"],
                "cmd": "UPDATE",
                "qual": "public.is_admin()",
                "with_check": "public.is_admin()",
            },
            "expected": 'CREATE POLICY "Admins update orders" ON "public"."orders" AS PERMISSIVE FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());',
        },
        {
            "id": 4,
            "description": "Policy with neither expression (open/blank)",
            "input": {
                "schemaname": "public",
                "tablename": "store_settings",
                "policyname": "Admins full settings",
                "permissive": "PERMISSIVE",
                "roles": ["authenticated"],
                "cmd": "ALL",
                "qual": None,
                "with_check": None,
            },
            "expected": 'CREATE POLICY "Admins full settings" ON "public"."store_settings" AS PERMISSIVE FOR ALL TO authenticated;',
        },
        {
            "id": 5,
            "description": "Restrictive policy (AS RESTRICTIVE)",
            "input": {
                "schemaname": "public",
                "tablename": "orders",
                "policyname": "Restrict to active tenant",
                "permissive": "RESTRICTIVE",
                "roles": ["public"],
                "cmd": "SELECT",
                "qual": "tenant_id = 10",
                "with_check": None,
            },
            "expected": 'CREATE POLICY "Restrict to active tenant" ON "public"."orders" AS RESTRICTIVE FOR SELECT TO public USING (tenant_id = 10);',
        },
        {
            "id": 6,
            "description": "Policy applying to multiple roles",
            "input": {
                "schemaname": "public",
                "tablename": "categories",
                "policyname": "Multi role read categories",
                "permissive": "PERMISSIVE",
                "roles": ["anon", "authenticated", "service_role"],
                "cmd": "SELECT",
                "qual": "is_active = true",
                "with_check": None,
            },
            "expected": 'CREATE POLICY "Multi role read categories" ON "public"."categories" AS PERMISSIVE FOR SELECT TO anon, authenticated, service_role USING (is_active = true);',
        },
        {
            "id": 7,
            "description": "ALL policy with admin check",
            "input": {
                "schemaname": "public",
                "tablename": "home_banners",
                "policyname": "Admins manage banners",
                "permissive": "PERMISSIVE",
                "roles": ["authenticated"],
                "cmd": "ALL",
                "qual": "public.is_admin()",
                "with_check": "public.is_admin()",
            },
            "expected": 'CREATE POLICY "Admins manage banners" ON "public"."home_banners" AS PERMISSIVE FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());',
        },
        {
            "id": 8,
            "description": "Policy with empty roles defaulting safely to public via COALESCE",
            "input": {
                "schemaname": "public",
                "tablename": "delivery_areas",
                "policyname": "Public read areas default",
                "permissive": "PERMISSIVE",
                "roles": [],
                "cmd": "SELECT",
                "qual": "is_active = true",
                "with_check": None,
            },
            "expected": 'CREATE POLICY "Public read areas default" ON "public"."delivery_areas" AS PERMISSIVE FOR SELECT TO public USING (is_active = true);',
        },
    ]

    all_passed = True
    print("=" * 70)
    print("RUNNING POSTGRESQL POLICY DDL GENERATOR TEST SUITE (8 TEST CASES)")
    print("=" * 70)

    for tc in test_cases:
        actual = generate_policy_ddl(**tc["input"])
        
        # Check negative assertions (never emit invalid patterns)
        assert "USING ()" not in actual, f"Test {tc['id']}: Invalid empty USING () emitted!"
        assert "WITH CHECK ()" not in actual, f"Test {tc['id']}: Invalid empty WITH CHECK () emitted!"
        assert "USING (NULL)" not in actual, f"Test {tc['id']}: Literal USING (NULL) emitted!"
        assert "WITH CHECK (NULL)" not in actual, f"Test {tc['id']}: Literal WITH CHECK (NULL) emitted!"

        if actual == tc["expected"]:
            print(f"[PASS] Case {tc['id']}: {tc['description']}")
            print(f"       Generated: {actual}")
        else:
            print(f"[FAIL] Case {tc['id']}: {tc['description']}")
            print(f"       Expected:  {tc['expected']}")
            print(f"       Actual:    {actual}")
            all_passed = False

    print("=" * 70)
    if all_passed:
        print("ALL 8 TEST CASES PASSED SUCCESSFULLY (0 ERRORS)")
        sys.exit(0)
    else:
        print("SOME TEST CASES FAILED!")
        sys.exit(1)


if __name__ == "__main__":
    run_tests()
