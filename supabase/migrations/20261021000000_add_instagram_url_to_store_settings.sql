-- ==============================================================================
-- Migration: Add instagram_url to store_settings
-- File: supabase/migrations/20261021000000_add_instagram_url_to_store_settings.sql
-- Project: Nook by Jina
-- ==============================================================================

BEGIN;

-- 1. Add instagram_url column if not exists
ALTER TABLE IF EXISTS public.store_settings
  ADD COLUMN IF NOT EXISTS instagram_url text DEFAULT NULL;

-- 2. Grant SELECT privilege to anon
GRANT SELECT (instagram_url) ON TABLE public.store_settings TO anon;

COMMIT;
