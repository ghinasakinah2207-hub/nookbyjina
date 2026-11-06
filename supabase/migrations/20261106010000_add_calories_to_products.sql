-- ==============================================================================
-- NOOK BY JINA — ADD CALORIES TO PRODUCTS
-- Migration: 20261106010000_add_calories_to_products.sql
-- Description: Introduces nullable integer column 'calories' to public.products.
--              Existing products remain NULL ("Belum diisi") without altering data.
-- ==============================================================================

BEGIN;

-- 1. Add calories column with positive/zero integer check constraint
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS calories integer DEFAULT NULL
  CHECK (calories IS NULL OR calories >= 0);

-- 2. Grant SELECT on calories column to storefront customer roles (anon & authenticated)
GRANT SELECT (calories) ON TABLE public.products TO anon, authenticated;

-- 3. Grant ALL on calories column to service_role for admin DML
GRANT ALL (calories) ON TABLE public.products TO service_role;

COMMIT;

