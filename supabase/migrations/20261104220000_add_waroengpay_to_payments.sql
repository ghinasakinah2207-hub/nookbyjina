-- Migration: 20261104220000_add_waroengpay_to_payments.sql
-- Description:
-- 1. Adds WaroengPay metadata columns (waroengpay_invoice_id, qris_payload, unique_code, expires_at) to public.payments.
-- 2. Preserves all existing columns, historical records (including Duitku and legacy static QRIS).
-- 3. Adds unique partial index on waroengpay_invoice_id for idempotency and fast webhook resolution.
-- 4. Safe and idempotent execution.

BEGIN;

DO $$
BEGIN
  -- 1. Add waroengpay_invoice_id to public.payments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'waroengpay_invoice_id'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN waroengpay_invoice_id text NULL;
  END IF;

  -- 2. Add qris_payload to public.payments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'qris_payload'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN qris_payload text NULL;
  END IF;

  -- 3. Add unique_code to public.payments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'unique_code'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN unique_code integer NULL;
  END IF;

  -- 4. Add expires_at to public.payments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN expires_at timestamptz NULL;
  END IF;
END $$;

-- 5. Add partial unique index on waroengpay_invoice_id to guarantee idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_waroengpay_invoice_id
ON public.payments (waroengpay_invoice_id)
WHERE waroengpay_invoice_id IS NOT NULL;

COMMIT;
