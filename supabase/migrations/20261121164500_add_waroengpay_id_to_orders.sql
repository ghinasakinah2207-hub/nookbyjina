-- Migration: 20261121164500_add_waroengpay_id_to_orders.sql
-- Description:
-- 1. Safely ensures all required WaroengPay columns exist on public.payments
--    (gateway_provider, payment_url, gateway_status, raw_response,
--     waroengpay_invoice_id, qris_payload, unique_code, expires_at)
--    using ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- 2. Safely adds waroengpay_id column (stores WRG-... invoice ID) to public.orders.
-- 3. Adds unique partial indexes on payments(waroengpay_invoice_id) and orders(waroengpay_id).
-- 4. Backfills payments WaroengPay columns from raw_response, then backfills orders.waroengpay_id.
-- 5. Fully idempotent and safe to run regardless of prior migration state.

BEGIN;

-- 1. Ensure all WaroengPay columns exist on public.payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS gateway_provider text NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_url text NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS gateway_status text NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS raw_response jsonb NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS waroengpay_invoice_id text NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS qris_payload text NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS unique_code integer NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

-- 2. Ensure waroengpay_id exists on public.orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS waroengpay_id text NULL;

-- 3. Create unique partial indexes for fast & idempotent webhook resolution
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_waroengpay_invoice_id
ON public.payments (waroengpay_invoice_id)
WHERE waroengpay_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_waroengpay_id
ON public.orders (waroengpay_id)
WHERE waroengpay_id IS NOT NULL;

-- 4. Backfill public.payments WaroengPay metadata columns from raw_response where missing
UPDATE public.payments
SET
  waroengpay_invoice_id = COALESCE(
    NULLIF(TRIM(waroengpay_invoice_id), ''),
    NULLIF(TRIM(raw_response->>'id'), '')
  ),
  qris_payload = COALESCE(
    NULLIF(TRIM(qris_payload), ''),
    NULLIF(TRIM(raw_response->>'qris'), '')
  ),
  unique_code = COALESCE(
    unique_code,
    CASE
      WHEN (raw_response->>'unique_code') ~ '^[0-9]+$'
      THEN (raw_response->>'unique_code')::integer
      ELSE NULL
    END
  ),
  expires_at = COALESCE(
    expires_at,
    CASE
      WHEN NULLIF(TRIM(raw_response->>'expires_at'), '') IS NOT NULL
      THEN (raw_response->>'expires_at')::timestamptz
      ELSE NULL
    END
  )
WHERE gateway_provider = 'waroengpay'
  AND raw_response IS NOT NULL
  AND (
    waroengpay_invoice_id IS NULL
    OR qris_payload IS NULL
    OR unique_code IS NULL
    OR expires_at IS NULL
  );

-- 5. Backfill public.orders.waroengpay_id from public.payments where missing
UPDATE public.orders o
SET waroengpay_id = COALESCE(
  NULLIF(TRIM(p.waroengpay_invoice_id), ''),
  NULLIF(TRIM(p.raw_response->>'id'), '')
)
FROM public.payments p
WHERE p.order_id = o.id
  AND o.waroengpay_id IS NULL
  AND p.gateway_provider = 'waroengpay'
  AND COALESCE(
    NULLIF(TRIM(p.waroengpay_invoice_id), ''),
    NULLIF(TRIM(p.raw_response->>'id'), '')
  ) IS NOT NULL;

COMMIT;
