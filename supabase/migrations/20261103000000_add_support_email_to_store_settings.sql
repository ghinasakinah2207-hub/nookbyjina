-- ==============================================================================
-- Migration: Add support_email to store_settings
-- File: supabase/migrations/20261103000000_add_support_email_to_store_settings.sql
-- Project: Nook by Jina
-- ==============================================================================

BEGIN;

-- 1. Add support_email column if not exists
ALTER TABLE IF EXISTS public.store_settings
  ADD COLUMN IF NOT EXISTS support_email text DEFAULT NULL;

-- 2. Grant privileges to anon and authenticated
GRANT SELECT (support_email) ON TABLE public.store_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.store_settings TO authenticated;

COMMIT;

