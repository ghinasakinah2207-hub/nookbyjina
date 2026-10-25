-- ==============================================================================
-- Migration: Fix Store Settings Permissions and Missing Columns
-- File: supabase/migrations/20261017010000_fix_store_settings_permissions_and_columns.sql
-- Project: Nook by Jina
--
-- STATUS: PROPOSED MIGRATION
-- DO NOT EXECUTE DIRECTLY ON LIVE DATABASE UNTIL EXPLICITLY APPROVED AND REVIEWED.
--
-- Root Cause Analysis of Original Blocker:
--   1. Permission Blocker:
--      In 20261012181500_harden_rls_and_admin_security.sql (lines 220-221), privileges on
--      public.store_settings were revoked from anon and PUBLIC, and only SELECT and UPDATE
--      were granted to authenticated. INSERT was NOT granted to authenticated.
--      Because public.store_settings currently contains 0 rows in the live database,
--      an UPDATE query matches 0 rows and fails silently, while an INSERT query fails with
--      PostgreSQL error 42501 (permission denied for table store_settings).
--
--   2. Schema Column Mismatch:
--      The live public.store_settings table only contains:
--        (id, store_name, is_open, whatsapp_number, qris_image_url, updated_at).
--      Fields configured in the dashboard (location, operating_hours_text, qris_merchant_name,
--      qris_nmid, tagline, instagram_url, payment_methods) have no database columns.
--      Similarly, public.delivery_areas lacks free_shipping_threshold.
--
-- Proposed Minimal Safe Remediation:
--   1. Add missing optional columns to public.store_settings and public.delivery_areas.
--   2. Grant INSERT and UPDATE privileges on public.store_settings to authenticated.
--   3. Seed a baseline row in public.store_settings if table is empty.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ADD MISSING COLUMNS (SAFE, IDEMPOTENT)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_settings
  ADD COLUMN IF NOT EXISTS location text DEFAULT 'Lhoksukon, Aceh Utara',
  ADD COLUMN IF NOT EXISTS operating_hours_text text DEFAULT 'Setiap Hari: 09:00 – 17:00 WIB',
  ADD COLUMN IF NOT EXISTS qris_merchant_name text DEFAULT 'Nook by Jina',
  ADD COLUMN IF NOT EXISTS qris_nmid text DEFAULT 'ID1020038829101',
  ADD COLUMN IF NOT EXISTS tagline text DEFAULT 'Makanan homemade dibuat dengan penuh rasa dan kehangatan.',
  ADD COLUMN IF NOT EXISTS instagram_url text DEFAULT 'https://www.instagram.com/nookbyjina/',
  ADD COLUMN IF NOT EXISTS payment_methods jsonb DEFAULT '{"qris": true, "cash": false}'::jsonb;

ALTER TABLE IF EXISTS public.delivery_areas
  ADD COLUMN IF NOT EXISTS free_shipping_threshold numeric DEFAULT 50000;

-- ------------------------------------------------------------------------------
-- 2. GRANT INSERT PRIVILEGE TO AUTHENTICATED ADMINS (GOVERNED BY RLS public.is_admin())
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON TABLE public.store_settings TO authenticated;
GRANT SELECT (
  id,
  store_name,
  is_open,
  whatsapp_number,
  qris_image_url,
  location,
  operating_hours_text,
  qris_merchant_name,
  qris_nmid,
  tagline,
  instagram_url,
  payment_methods,
  updated_at
) ON TABLE public.store_settings TO anon;

-- ------------------------------------------------------------------------------
-- 3. SEED BASELINE ROW IF TABLE IS EMPTY (PREVENTS COMPETING ROWS IF DIFFERENT ID EXISTS)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.store_settings LIMIT 1) THEN
    INSERT INTO public.store_settings (
      id,
      store_name,
      tagline,
      location,
      is_open,
      operating_hours_text,
      whatsapp_number,
      qris_merchant_name,
      qris_nmid,
      qris_image_url,
      instagram_url,
      payment_methods
    )
    VALUES (
      'a0000001-0000-4000-8000-000000000001',
      'Nook by Jina',
      'Makanan homemade dibuat dengan penuh rasa dan kehangatan.',
      'Lhoksukon, Aceh Utara',
      true,
      'Setiap Hari: 09:00 – 17:00 WIB',
      '6282273180000',
      'Nook by Jina',
      'ID1020038829101',
      '',
      'https://www.instagram.com/nookbyjina/',
      '{"qris": true, "cash": false}'::jsonb
    );
  END IF;

  -- Seed default delivery area only if table is completely empty
  IF NOT EXISTS (SELECT 1 FROM public.delivery_areas LIMIT 1) THEN
    INSERT INTO public.delivery_areas (
      id,
      name,
      fee,
      free_shipping_threshold,
      is_active,
      sort_order
    )
    VALUES (
      'd0000001-0000-4000-8000-000000000001',
      'Lhoksukon',
      3000,
      50000,
      true,
      1
    );
  END IF;
END $$;

COMMIT;
