-- ==============================================================================
-- ROLLBACK PATCH: Restores baseline admin_update_order_status from 20261022000000
-- File: supabase/rollback_20261023000000.sql
--
-- Use ONLY if 20261023000000 must be reverted on staging / production.
-- ==============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_id text,
  p_order_status text,
  p_payment_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_existing_order_status text;
  v_existing_payment_status text;
  v_res jsonb;
BEGIN
  -- Authorization check
  IF (auth.role() IS DISTINCT FROM 'service_role') AND (public.is_admin() IS NOT TRUE) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya admin toko terotorisasi yang dapat memperbarui status pesanan.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate requested statuses against allowed enums
  IF p_order_status IS NOT NULL AND p_order_status NOT IN ('Pesanan baru', 'Diproses', 'Siap', 'Selesai', 'Dibatalkan') THEN
    RAISE EXCEPTION 'Status pesanan "%" tidak valid.', p_order_status USING ERRCODE = '22000';
  END IF;

  IF p_payment_status IS NOT NULL AND p_payment_status NOT IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Lunas', 'Dibatalkan') THEN
    RAISE EXCEPTION 'Status pembayaran "%" tidak valid.', p_payment_status USING ERRCODE = '22000';
  END IF;

  SELECT id, order_status, payment_status
  INTO v_existing_id, v_existing_order_status, v_existing_payment_status
  FROM public.orders
  WHERE order_number = p_order_id OR id::text = p_order_id;

  IF v_existing_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Baseline transition checks:
  IF v_existing_order_status = 'Dibatalkan' AND p_order_status IS NOT NULL AND p_order_status != 'Dibatalkan' THEN
    RAISE EXCEPTION 'Pesanan yang telah dibatalkan tidak dapat diaktifkan kembali.' USING ERRCODE = '22000';
  END IF;

  IF (v_existing_order_status = 'Dibatalkan' OR v_existing_payment_status = 'Dibatalkan')
     AND p_payment_status = 'Lunas' THEN
    RAISE EXCEPTION 'Pesanan yang telah dibatalkan tidak dapat diubah status pembayarannya menjadi Lunas.'
      USING ERRCODE = '22000';
  END IF;

  IF v_existing_order_status = 'Selesai' AND p_order_status IS NOT NULL AND p_order_status NOT IN ('Selesai', 'Dibatalkan') THEN
    RAISE EXCEPTION 'Pesanan yang telah selesai tidak dapat dikembalikan ke status persiapan.' USING ERRCODE = '22000';
  END IF;

  IF (p_order_status = 'Selesai' OR (p_order_status IS NULL AND v_existing_order_status = 'Selesai'))
     AND (p_payment_status = 'Dibatalkan' OR (p_payment_status IS NULL AND v_existing_payment_status = 'Dibatalkan')) THEN
    RAISE EXCEPTION 'Pesanan dengan status pembayaran "Dibatalkan" tidak dapat diselesaikan.' USING ERRCODE = '22000';
  END IF;

  IF p_order_status = 'Dibatalkan' AND p_payment_status IS NULL AND v_existing_payment_status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi') THEN
    p_payment_status := 'Dibatalkan';
  END IF;

  IF p_payment_status = 'Dibatalkan' AND p_order_status IS NULL AND v_existing_order_status IN ('Pesanan baru', 'Diproses', 'Siap') THEN
    p_order_status := 'Dibatalkan';
  END IF;

  UPDATE public.orders
  SET
    order_status = COALESCE(p_order_status, order_status),
    payment_status = COALESCE(p_payment_status, payment_status),
    paid_at = CASE WHEN p_payment_status = 'Lunas' THEN now() ELSE paid_at END,
    cancelled_at = CASE WHEN p_order_status = 'Dibatalkan' OR p_payment_status = 'Dibatalkan' THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = v_existing_id;

  IF p_payment_status IS NOT NULL THEN
    UPDATE public.payments
    SET status = p_payment_status, updated_at = now()
    WHERE order_id = v_existing_id;
  END IF;

  SELECT jsonb_build_object(
    'id', o.order_number,
    'uuid', o.id,
    'orderNumber', o.order_number,
    'createdAt', to_char(timezone('utc', o.created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'customerName', o.customer_name,
    'customerWhatsapp', o.customer_whatsapp,
    'fulfillmentType', COALESCE(o.fulfillment_method, 'delivery'),
    'deliveryArea', COALESCE(o.delivery_area, 'Lhoksukon'),
    'orderNote', COALESCE(o.customer_note, ''),
    'items', COALESCE(o.items_snapshot, '[]'::jsonb),
    'subtotal', o.subtotal,
    'shippingFee', o.delivery_fee,
    'total', o.total,
    'orderStatus', o.order_status,
    'paymentStatus', o.payment_status,
    'paymentMethod', COALESCE(o.payment_method, 'QRIS Statis'),
    'paymentDeadline', CASE WHEN o.payment_deadline IS NOT NULL THEN to_char(timezone('utc', o.payment_deadline), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE '' END,
    'merchantName', COALESCE(o.merchant_name, 'Nook by Jina')
  ) INTO v_res
  FROM public.orders o
  WHERE o.id = v_existing_id;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(text, text, text) TO service_role, postgres;

COMMIT;
