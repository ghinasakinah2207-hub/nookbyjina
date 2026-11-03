-- ==============================================================================
-- Migration: Add address and maps_url to store_settings
-- File: supabase/migrations/20261103010000_add_address_and_maps_url_to_store_settings.sql
-- Project: Nook by Jina
-- ==============================================================================

BEGIN;

-- 1. Add address and maps_url columns if not exist
ALTER TABLE IF EXISTS public.store_settings
  ADD COLUMN IF NOT EXISTS address text DEFAULT '28R9+M8H, Dayah Lb, Kec. Lhoksukon, Kabupaten Aceh Utara, Aceh 24382',
  ADD COLUMN IF NOT EXISTS maps_url text DEFAULT 'https://maps.google.com/?q=28R9%2BM8H,+Dayah+Lb,+Kec.+Lhoksukon,+Kabupaten+Aceh+Utara,+Aceh+24382';

-- 2. Populate existing rows if columns are null
UPDATE public.store_settings
SET
  address = COALESCE(address, '28R9+M8H, Dayah Lb, Kec. Lhoksukon, Kabupaten Aceh Utara, Aceh 24382'),
  maps_url = COALESCE(maps_url, 'https://maps.google.com/?q=28R9%2BM8H,+Dayah+Lb,+Kec.+Lhoksukon,+Kabupaten+Aceh+Utara,+Aceh+24382')
WHERE address IS NULL OR maps_url IS NULL;

-- 3. Grant privileges to anon and authenticated
GRANT SELECT (address, maps_url) ON TABLE public.store_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.store_settings TO authenticated;

COMMIT;

