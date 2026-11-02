-- ==============================================================================
-- TEMU BY JINA — ADD PRODUCT TYPE TO PRODUCTS
-- Migration: 20261102000000_add_product_type_to_products.sql
-- Description: Introduces 'product_type' column with 'ready' and 'preorder' options.
--              Existing products strictly default to 'preorder' to preserve historical model.
-- ==============================================================================

BEGIN;

-- 1. Add product_type column with CHECK constraint and default 'preorder'
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'preorder'
  CHECK (product_type IN ('ready', 'preorder'));

-- 2. Backfill existing records ensuring no NULL values
UPDATE public.products
SET product_type = 'preorder'
WHERE product_type IS NULL;

-- 3. Create index for fast filtering by product type
CREATE INDEX IF NOT EXISTS idx_products_product_type ON public.products (product_type);

-- 4. Grant SELECT on product_type to storefront customer roles (anon & authenticated)
GRANT SELECT (product_type) ON TABLE public.products TO anon, authenticated;

COMMIT;

