-- ==============================================================================
-- Migration: Add icon column to public.categories
-- File: supabase/migrations/20261021020000_add_icon_to_categories.sql
-- Project: Nook by Jina
-- ==============================================================================

BEGIN;

-- 1. Add nullable icon column to public.categories (stores Lucide icon key, e.g. 'utensils', 'cup-soda', 'cookie')
ALTER TABLE IF EXISTS public.categories
  ADD COLUMN IF NOT EXISTS icon text DEFAULT NULL;

-- 2. Populate default icons for initial standard categories
UPDATE public.categories
SET icon = 'utensils'
WHERE slug = 'makanan' AND (icon IS NULL OR icon = '');

UPDATE public.categories
SET icon = 'cup-soda'
WHERE slug = 'minuman' AND (icon IS NULL OR icon = '');

UPDATE public.categories
SET icon = 'cookie'
WHERE slug = 'snack' AND (icon IS NULL OR icon = '');

COMMIT;
