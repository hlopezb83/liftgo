-- FIN-R2-01 / FIN-R3-02: immutable bank layouts and recoverable batch history.
ALTER TABLE public.supplier_payment_batches
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Canonical batches and snapshots are written only through the existing
-- SECURITY DEFINER RPCs. Keep their current SELECT/RLS policies unchanged.
REVOKE INSERT, UPDATE, DELETE ON public.supplier_payment_batches FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.supplier_payment_batch_items FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_supplier_payment_batch_snapshot(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid := public.current_internal_organization_id();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR NOT public.is_internal_member(v_uid)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND is_active)
     OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'administrativo'))
     OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org AND is_active) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', b.id, 'created_at', b.created_at, 'cancelled_at', b.cancelled_at,
    'payment_count', (SELECT count(*) FROM public.supplier_payments p
                       WHERE p.batch_id = b.id AND p.organization_id = v_org),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'bill_id', i.bill_id, 'supplier_name', i.supplier_name,
      'supplier_rfc', i.supplier_rfc, 'bank_name', i.bank_name, 'clabe', i.clabe,
      'account_number', i.account_number, 'account_holder', i.account_holder,
      'bill_number', i.bill_number, 'due_date', i.due_date, 'reference', i.reference,
      'concept', i.concept, 'amount', i.amount, 'currency', i.currency
    ) ORDER BY i.created_at, i.id)
      FROM public.supplier_payment_batch_items i
     WHERE i.batch_id = b.id AND i.organization_id = v_org), '[]'::jsonb)
  ) INTO v_result
  FROM public.supplier_payment_batches b
  WHERE b.id = p_batch_id AND b.organization_id = v_org;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Lote de pago no encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_supplier_payment_batch_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_payment_batch_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_supplier_payment_batches_page(
  p_page_size integer DEFAULT 20, p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid := public.current_internal_organization_id();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR NOT public.is_internal_member(v_uid)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND is_active)
     OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'administrativo'))
     OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org AND is_active) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Paginación inválida' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'total_count', (SELECT count(*) FROM public.supplier_payment_batches WHERE organization_id = v_org),
    'items', COALESCE(jsonb_agg(page.item ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
  ) INTO v_result FROM (
    SELECT b.id, b.created_at, jsonb_build_object(
      'id', b.id, 'created_at', b.created_at, 'bill_count', b.bill_count,
      'notes', b.notes, 'cancelled_at', b.cancelled_at,
      'payment_count', (SELECT count(*) FROM public.supplier_payments p
                        WHERE p.batch_id = b.id AND p.organization_id = v_org),
      'totals_by_currency', COALESCE((SELECT jsonb_agg(
        jsonb_build_object('currency', totals.currency, 'total', totals.total) ORDER BY totals.currency
      ) FROM (
        SELECT i.currency, sum(i.amount) AS total
          FROM public.supplier_payment_batch_items i
         WHERE i.batch_id = b.id AND i.organization_id = v_org GROUP BY i.currency
      ) totals), '[]'::jsonb)
    ) AS item
    FROM public.supplier_payment_batches b WHERE b.organization_id = v_org
    ORDER BY b.created_at DESC, b.id DESC LIMIT p_page_size OFFSET p_offset
  ) page;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_supplier_payment_batches_page(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_payment_batches_page(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_supplier_payment_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid := public.current_internal_organization_id();
  v_batch public.supplier_payment_batches%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR NOT public.is_internal_member(v_uid)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND is_active)
     OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'administrativo'))
     OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org AND is_active) THEN
    RAISE EXCEPTION 'No autorizado para cancelar lotes de pago' USING ERRCODE = '42501';
  END IF;

  -- Match the payment path's lock order: bills before batch. Stable ID ordering
  -- also prevents two multi-bill cancellations from locking in opposite order.
  PERFORM 1 FROM public.supplier_bills bill
   WHERE bill.organization_id = v_org
     AND bill.id IN (SELECT item.bill_id FROM public.supplier_payment_batch_items item
                     WHERE item.batch_id = p_batch_id AND item.organization_id = v_org)
   ORDER BY bill.id FOR UPDATE;
  SELECT * INTO v_batch FROM public.supplier_payment_batches
   WHERE id = p_batch_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote de pago no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_batch.cancelled_at IS NOT NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_payments
              WHERE batch_id = p_batch_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'El lote ya tiene pagos registrados; no se puede cancelar' USING ERRCODE = '23514';
  END IF;

  UPDATE public.supplier_payment_batches
     SET cancelled_at = clock_timestamp(), cancelled_by = v_uid
   WHERE id = p_batch_id AND organization_id = v_org;

  -- now() is transaction-stable: existing create RPCs write it to both the
  -- batch's created_at and the bill's reservation. A later reservation must
  -- never be cleared by cancelling an earlier, otherwise intact batch.
  UPDATE public.supplier_bills bill SET payment_in_progress_at = NULL
   WHERE bill.organization_id = v_org AND bill.payment_in_progress_at = v_batch.created_at
     AND bill.id IN (SELECT item.bill_id FROM public.supplier_payment_batch_items item
                     WHERE item.batch_id = p_batch_id AND item.organization_id = v_org)
     AND NOT EXISTS (
       SELECT 1 FROM public.supplier_payment_batch_items item
       JOIN public.supplier_payment_batches other ON other.id = item.batch_id
        WHERE item.bill_id = bill.id AND item.organization_id = v_org
          AND other.organization_id = v_org AND other.id <> p_batch_id
          AND other.cancelled_at IS NULL AND other.created_at >= v_batch.created_at
     );
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_supplier_payment_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_payment_batch(uuid) TO authenticated;

-- Serializes a new payment with cancellation, including direct inserts.
-- This SHARE lock conflicts with cancellation's row update. Bills are locked
-- first in the canonical RPC; cancellation follows the same ordering.
CREATE OR REPLACE FUNCTION public.guard_supplier_payment_active_batch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
DECLARE v_cancelled_at timestamptz;
BEGIN
  IF NEW.batch_id IS NULL THEN RETURN NEW; END IF;
  SELECT cancelled_at INTO v_cancelled_at FROM public.supplier_payment_batches
   WHERE id = NEW.batch_id AND organization_id = NEW.organization_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote de pago no encontrado' USING ERRCODE = '23514'; END IF;
  IF v_cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'El lote está cancelado; no se pueden registrar pagos en él' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_payment_batch_items
                 WHERE batch_id = NEW.batch_id AND bill_id = NEW.bill_id
                   AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'La factura no pertenece al lote de pago' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_supplier_payment_active_batch() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_guard_supplier_payment_active_batch ON public.supplier_payments;
CREATE TRIGGER zz_guard_supplier_payment_active_batch
  BEFORE INSERT OR UPDATE OF batch_id, bill_id ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_payment_active_batch();

-- FIN-R3-01: preserve bank statement currency and serialize concurrent imports.
CREATE OR REPLACE FUNCTION public.guard_bank_account_currency_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency AND EXISTS (
    SELECT 1 FROM public.bank_statement_lines
     WHERE bank_account_id = OLD.id AND organization_id = OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'La moneda no se puede cambiar porque la cuenta tiene movimientos importados.'
      USING ERRCODE = '23514', CONSTRAINT = 'bank_account_currency_history';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_bank_account_currency_history() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_bank_account_currency_history ON public.bank_accounts;
CREATE TRIGGER trg_guard_bank_account_currency_history
  BEFORE UPDATE OF currency ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_bank_account_currency_history();

CREATE OR REPLACE FUNCTION public.lock_bank_statement_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
BEGIN
  PERFORM 1 FROM public.bank_accounts
   WHERE id = NEW.bank_account_id AND organization_id = NEW.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta bancaria no encontrada' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.lock_bank_statement_account() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_lock_bank_statement_account ON public.bank_statement_lines;
CREATE TRIGGER zz_lock_bank_statement_account
  BEFORE INSERT OR UPDATE OF bank_account_id ON public.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.lock_bank_statement_account();

-- Both existing payment overloads ignore cancelled historical batches.
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT today_mty(), p_payment_method text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
  v_batch_id UUID;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND is_active) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status, approval_status INTO v_balance, v_status, v_approval
    FROM public.supplier_bills
   WHERE id = p_bill_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'No se puede pagar una factura en borrador';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval NOT IN ('approved', 'not_required') THEN
    RAISE EXCEPTION 'La factura no está aprobada para pago (estado de aprobación: %)', v_approval;
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  SELECT i.batch_id INTO v_batch_id
    FROM public.supplier_payment_batch_items i
    JOIN public.supplier_payment_batches b ON b.id = i.batch_id
   WHERE i.bill_id = p_bill_id
     AND COALESCE(i.organization_id, v_org) = v_org
     AND COALESCE(b.organization_id, v_org) = v_org
       AND b.cancelled_at IS NULL
   ORDER BY b.created_at DESC
   LIMIT 1;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by, batch_id, organization_id
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, v_uid, v_batch_id, v_org
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT today_mty(), p_payment_method text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_batch_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
  v_batch_id UUID;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND is_active) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status, approval_status INTO v_balance, v_status, v_approval
    FROM public.supplier_bills
   WHERE id = p_bill_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'No se puede pagar una factura en borrador';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval NOT IN ('approved', 'not_required') THEN
    RAISE EXCEPTION 'La factura no está aprobada para pago (estado de aprobación: %)', v_approval;
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  IF p_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.supplier_payment_batch_items i
      JOIN public.supplier_payment_batches b ON b.id = i.batch_id
     WHERE i.batch_id = p_batch_id
       AND i.bill_id = p_bill_id
       AND COALESCE(i.organization_id, v_org) = v_org
       AND COALESCE(b.organization_id, v_org) = v_org
       AND b.cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El lote % no contiene la factura %', p_batch_id, p_bill_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- A NULL batch is an intentional manual payment, never an inferred batch payment.
  v_batch_id := p_batch_id;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by, batch_id, organization_id
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, v_uid, v_batch_id, v_org
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $function$;
