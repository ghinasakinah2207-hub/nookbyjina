-- ==============================================================================
-- Migration: Create Homepage Sections and Product Assignments
-- File: supabase/migrations/20261017000000_create_homepage_sections.sql
-- Project: Temu by Jina
--
-- STATUS: PROPOSED MIGRATION (MINIMAL SCHEMA)
-- DO NOT EXECUTE DIRECTLY ON LIVE DATABASE UNTIL EXPLICITLY APPROVED AND REVIEWED.
--
-- Summary of Proposed Schema:
--   1. public.homepage_sections:
--      - id (uuid, primary key)
--      - title (text, mandatory section heading)
--      - subtitle (text, optional descriptive subheading)
--      - is_active (boolean, default true; controls public visibility)
--      - sort_order (integer, default 1; order of sections on homepage)
--      - max_products (integer, optional limit of products rendered)
--      - view_all_url (text, optional href for 'Lihat Semua' button, default '/menu')
--      - created_at, updated_at (timestamptz)
--
--   2. public.homepage_section_products:
--      - id (uuid, primary key)
--      - section_id (uuid, foreign key referencing homepage_sections(id) ON DELETE CASCADE)
--      - product_id (uuid, foreign key referencing products(id) ON DELETE CASCADE)
--      - sort_order (integer, explicit product order within section)
--      - created_at (timestamptz)
--      - CONSTRAINT uq_section_product UNIQUE (section_id, product_id)
--        (Prevents duplicate product assignments within the same section)
--
--   3. Hardened RLS Security:
--      - Public read-only access strictly for active sections and their product references.
--      - Public users cannot access inactive sections.
--      - All mutations (INSERT, UPDATE, DELETE) restricted to verified admins via public.is_admin().
--      - HPP and sensitive product columns remain completely protected and are not exposed.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABLE: public.homepage_sections
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1,
  max_products integer,
  view_all_url text DEFAULT '/menu',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for ordering active sections on public homepage
CREATE INDEX IF NOT EXISTS idx_homepage_sections_active_order
  ON public.homepage_sections (is_active, sort_order ASC);

-- ------------------------------------------------------------------------------
-- 2. TABLE: public.homepage_section_products
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homepage_section_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.homepage_sections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_section_product UNIQUE (section_id, product_id)
);

-- Indexes for fast join queries and ordering
CREATE INDEX IF NOT EXISTS idx_homepage_section_products_section_order
  ON public.homepage_section_products (section_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_homepage_section_products_product
  ON public.homepage_section_products (product_id);

-- ------------------------------------------------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_section_products ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 4. RLS POLICIES FOR CUSTOMER STOREFRONT (PUBLIC / ANON READ)
-- Public can ONLY read active sections, and only assignments for active sections.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read active homepage sections" ON public.homepage_sections;
CREATE POLICY "Public read active homepage sections"
  ON public.homepage_sections
  FOR SELECT
  TO public
  USING (is_active = true);

DROP POLICY IF EXISTS "Public read active homepage section products" ON public.homepage_section_products;
CREATE POLICY "Public read active homepage section products"
  ON public.homepage_section_products
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.homepage_sections hs
      WHERE hs.id = homepage_section_products.section_id
        AND hs.is_active = true
    )
  );

-- ------------------------------------------------------------------------------
-- 5. RLS POLICIES FOR ADMIN MANAGEMENT (ZERO-TRUST, VERIFIED VIA is_admin())
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage homepage sections" ON public.homepage_sections;
CREATE POLICY "Admins manage homepage sections"
  ON public.homepage_sections
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage homepage section products" ON public.homepage_section_products;
CREATE POLICY "Admins manage homepage section products"
  ON public.homepage_section_products
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. PRIVILEGES GRANTS AND REVOKES
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.homepage_sections, public.homepage_section_products FROM anon, PUBLIC;

-- Public/anon can only SELECT
GRANT SELECT ON TABLE public.homepage_sections, public.homepage_section_products TO anon;
GRANT SELECT ON TABLE public.homepage_sections, public.homepage_section_products TO authenticated;

-- Authenticated admins can mutate (strictly enforced by RLS public.is_admin())
GRANT INSERT, UPDATE, DELETE ON TABLE public.homepage_sections, public.homepage_section_products TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. OPTIONAL SEED DATA: INITIAL HOMEPAGE SECTIONS
-- Seed section definitions only. Product IDs are project-specific and must not be
-- hard-coded into a migration; admins can assign existing products from the dashboard.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.homepage_sections LIMIT 1) THEN
    INSERT INTO public.homepage_sections
      (id, title, subtitle, is_active, sort_order, max_products, view_all_url)
    VALUES
      ('c0000001-0000-4000-8000-000000000001', 'Menu Pilihan Pelanggan', 'Menu favorit dari Nook by Jina', true, 1, 6, '/menu'),
      ('c0000001-0000-4000-8000-000000000002', 'Makanan Utama', 'Olahan homemade gurih & mengenyangkan', true, 2, 6, '/menu'),
      ('c0000001-0000-4000-8000-000000000003', 'Snack & Camilan', 'Camilan untuk teman santai', true, 3, 6, '/menu'),
      ('c0000001-0000-4000-8000-000000000004', 'Minuman Segar', 'Minuman segar pelepas dahaga', true, 4, 6, '/menu')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

COMMIT;
