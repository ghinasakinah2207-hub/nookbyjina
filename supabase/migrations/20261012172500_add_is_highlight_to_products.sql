-- ==============================================================================
-- Migration: Add is_highlight column to public.products
-- File: supabase/migrations/20261012172500_add_is_highlight_to_products.sql
-- Description: Adds is_highlight boolean column to public.products with default false.
-- ==============================================================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_highlight BOOLEAN NOT NULL DEFAULT false;
