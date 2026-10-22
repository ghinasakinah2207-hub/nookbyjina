-- ==============================================================================
-- Migration: Create store-assets Storage Bucket & Policies for QRIS & Assets
-- File: supabase/migrations/20261021010000_create_qris_storage_bucket.sql
-- Project: Nook by Jina
-- ==============================================================================

BEGIN;

-- 1. Create public storage bucket for store assets if not already existing
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-assets',
  'store-assets',
  true,
  5242880, -- 5 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public read access to store-assets
DROP POLICY IF EXISTS "Public Read Store Assets" ON storage.objects;
CREATE POLICY "Public Read Store Assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-assets');

-- 3. Allow authenticated store admins to upload store assets
DROP POLICY IF EXISTS "Admin Upload Store Assets" ON storage.objects;
CREATE POLICY "Admin Upload Store Assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'store-assets'
    AND public.is_admin()
  );

-- 4. Allow authenticated store admins to update store assets
DROP POLICY IF EXISTS "Admin Update Store Assets" ON storage.objects;
CREATE POLICY "Admin Update Store Assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'store-assets'
    AND public.is_admin()
  );

-- 5. Allow authenticated store admins to delete store assets
DROP POLICY IF EXISTS "Admin Delete Store Assets" ON storage.objects;
CREATE POLICY "Admin Delete Store Assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND public.is_admin()
  );

COMMIT;
