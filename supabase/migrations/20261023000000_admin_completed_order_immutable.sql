-- Targeted follow-up migration: make completed orders and payment status immutable.
-- Apply only after reviewing the target project and ensuring this migration version is unused.
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
  v_db_payment_status text;
  v_res jsonb;
BEGIN
  -- Security Guard: Fail-closed authorization check
  -- Permitted ONLY if caller is explicitly service_role OR public.is_admin() returns TRUE
  IF (auth.role() IS DISTINCT FROM 'service_role') AND (public.is_admin() IS NOT TRUE) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya admin toko terotorisasi yang dapat memperbarui status pesanan.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate requested statuses against canonical OrderStatus & PaymentStatus enums
  IF p_order_status IS NOT NULL AND p_order_status NOT IN ('Pesanan baru', 'Diproses', 'Siap', 'Selesai', 'Dibatalkan') THEN
    RAISE EXCEPTION 'Status pesanan "%" tidak valid.', p_order_status USING ERRCODE = '22000';
  END IF;

  -- Normalize & validate payment status against production schema & application contract
  IF p_payment_status IS NOT NULL THEN
    IF p_payment_status IN ('Menunggu Verifikasi', 'Menunggu verifikasi admin') THEN
      v_db_payment_status := 'Menunggu verifikasi admin';
    ELSIF p_payment_status IN ('Menunggu Pembayaran', 'Menunggu pembayaran') THEN
      v_db_payment_status := 'Menunggu pembayaran';
    ELSIF p_payment_status = 'Lunas' THEN
      v_db_payment_status := 'Lunas';
    ELSIF p_payment_status IN ('Dibatalkan', 'Gagal') THEN
      v_db_payment_status := 'Dibatalkan';
    ELSE
      RAISE EXCEPTION 'Status pembayaran "%" tidak valid.', p_payment_status USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Concurrency-Safe Row Locking:
  -- Acquire exclusive row lock on target order row with FOR UPDATE before evaluating any transition rules.
  -- This serializes concurrent updates for the same order and ensures evaluation uses the latest committed state,
  -- preventing race conditions or stale-read state bypasses.
  SELECT id, order_status, payment_status
  INTO v_existing_id, v_existing_order_status, v_existing_payment_status
  FROM public.orders
  WHERE order_number = p_order_id OR id::text = p_order_id
  FOR UPDATE;

  IF v_existing_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Transition Rule 1: Paid Orders Cannot Be Cancelled (No refunds without business rule)
  -- Reject cancelling an order whose existing payment status is 'Lunas'
  IF v_existing_payment_status = 'Lunas' THEN
    IF p_order_status = 'Dibatalkan' THEN
      RAISE EXCEPTION 'Pesanan yang telah berstatus Lunas tidak dapat dibatalkan.' USING ERRCODE = '22000';
    END IF;
    IF v_db_payment_status = 'Dibatalkan' THEN
      RAISE EXCEPTION 'Pembayaran yang telah berstatus Lunas tidak dapat dibatalkan.' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Transition Rule 2: Cancelled Orders Cannot Be Resurrected
  -- An order already marked 'Dibatalkan' cannot transition back to active order states
  IF v_existing_order_status = 'Dibatalkan' AND p_order_status IS NOT NULL AND p_order_status != 'Dibatalkan' THEN
    RAISE EXCEPTION 'Pesanan yang telah dibatalkan tidak dapat diaktifkan kembali.' USING ERRCODE = '22000';
  END IF;

  -- Transition Rule 3: Cancelled Orders or Payments Cannot Receive Payment
  -- Reject changing a cancelled payment or cancelled order to 'Lunas'
  IF v_db_payment_status = 'Lunas' THEN
    IF p_order_status = 'Dibatalkan' OR v_existing_order_status = 'Dibatalkan' THEN
      RAISE EXCEPTION 'Pesanan yang dibatalkan tidak dapat menerima status pembayaran Lunas.' USING ERRCODE = '22000';
    END IF;
    IF v_existing_payment_status IN ('Dibatalkan', 'Gagal') THEN
      RAISE EXCEPTION 'Pembayaran yang telah dibatalkan tidak dapat diubah statusnya menjadi Lunas.' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Transition Rule 4: Completed Orders and Their Payment Status Are Immutable
  -- Once an order is completed, its order status must remain 'Selesai' and its
  -- payment status cannot be changed to any other value (including pending,
  -- failed, or cancelled). Passing the same order status is allowed; omitting
  -- either status is allowed and leaves that field unchanged.
  IF v_existing_order_status = 'Selesai' THEN
    IF p_order_status IS NOT NULL AND p_order_status != 'Selesai' THEN
      RAISE EXCEPTION 'Pesanan yang telah selesai tidak dapat diubah statusnya.' USING ERRCODE = '22000';
    END IF;
    IF v_db_payment_status IS NOT NULL AND v_db_payment_status IS DISTINCT FROM v_existing_payment_status THEN
      RAISE EXCEPTION 'Status pembayaran pesanan yang telah selesai tidak dapat diubah.' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Transition Rule 5: Reject Contradictory Active and Cancelled Status Combinations
  -- 5a. A cancelled payment cannot coexist with active order statuses ('Pesanan baru', 'Diproses', 'Siap', 'Selesai')
  IF (v_db_payment_status = 'Dibatalkan' OR (v_db_payment_status IS NULL AND v_existing_payment_status IN ('Dibatalkan', 'Gagal'))) THEN
    IF p_order_status IS NOT NULL AND p_order_status != 'Dibatalkan' THEN
      RAISE EXCEPTION 'Status pesanan "%" tidak dapat digabungkan dengan status pembayaran "Dibatalkan". Pesanan dengan pembayaran dibatalkan harus berstatus "Dibatalkan".',
        p_order_status
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 5b. A cancelled order cannot coexist with active payment statuses ('Menunggu verifikasi admin', 'Menunggu pembayaran', 'Lunas')
  IF (p_order_status = 'Dibatalkan' OR (p_order_status IS NULL AND v_existing_order_status = 'Dibatalkan')) THEN
    IF v_db_payment_status IS NOT NULL AND v_db_payment_status != 'Dibatalkan' THEN
      RAISE EXCEPTION 'Status pesanan "Dibatalkan" tidak dapat digabungkan dengan status pembayaran aktif ("%").',
        v_db_payment_status
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Transition Rule 6: Single-Status Synchronization Policy
  -- When only one status is provided, synchronize the counterpart to prevent orphaned or contradictory states:
  -- 6a. If caller supplies ONLY order_status = 'Dibatalkan', automatically synchronize payment to 'Dibatalkan'
  IF p_order_status = 'Dibatalkan' AND v_db_payment_status IS NULL THEN
    v_db_payment_status := 'Dibatalkan';
  END IF;

  -- 6b. If caller supplies ONLY payment_status = 'Dibatalkan', automatically synchronize order to 'Dibatalkan'
  --     for preliminary and ready orders ('Pesanan baru', 'Diproses', 'Siap')
  IF v_db_payment_status = 'Dibatalkan' AND p_order_status IS NULL AND v_existing_order_status IN ('Pesanan baru', 'Diproses', 'Siap') THEN
    p_order_status := 'Dibatalkan';
  END IF;

  UPDATE public.orders
  SET
    order_status = COALESCE(p_order_status, order_status),
    payment_status = COALESCE(v_db_payment_status, payment_status),
    paid_at = CASE WHEN v_db_payment_status = 'Lunas' THEN COALESCE(paid_at, now()) ELSE paid_at END,
    cancelled_at = CASE WHEN p_order_status = 'Dibatalkan' OR v_db_payment_status = 'Dibatalkan' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
    updated_at = now()
  WHERE id = v_existing_id;

  -- Synchronize payments table
  IF v_db_payment_status IS NOT NULL THEN
    UPDATE public.payments
    SET status = v_db_payment_status, updated_at = now()
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
    'paymentStatus', CASE 
      WHEN o.payment_status = 'Menunggu verifikasi admin' THEN 'Menunggu Verifikasi'
      WHEN o.payment_status = 'Menunggu pembayaran' THEN 'Menunggu Pembayaran'
      WHEN o.payment_status = 'Gagal' THEN 'Dibatalkan'
      ELSE o.payment_status 
    END,
    'paymentMethod', CASE 
      WHEN o.payment_method = 'QRIS' THEN 'QRIS Statis' 
      ELSE COALESCE(o.payment_method, 'QRIS Statis') 
    END,
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
