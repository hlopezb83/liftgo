-- A2-4 / A2-8 / A2-3 / A6-2 / A2-7
DO $mig$
DECLARE d text; o text;
BEGIN
  -- A2-4: migrar guards utiles del trigger legado al canonico
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='enforce_payment_within_invoice_total';
  o := d;
  d := replace(d,
    E'BEGIN\n  SELECT total, status, moneda, tipo_cambio',
    E'BEGIN\n  PERFORM pg_advisory_xact_lock(hashtext(''invoice_payment:'' || NEW.invoice_id::text));\n  SELECT total, status, moneda, tipo_cambio');
  d := replace(d,
    E'  inv_moneda := upper(COALESCE(inv_moneda, ''MXN''));',
    E'  IF inv_status = ''draft'' THEN\n    RAISE EXCEPTION ''No se pueden registrar pagos en facturas en borrador. Envia la factura primero.''\n      USING ERRCODE = ''check_violation'';\n  END IF;\n\n  inv_moneda := upper(COALESCE(inv_moneda, ''MXN''));');
  IF d = o OR position('pg_advisory_xact_lock' in d) = 0 OR position('en borrador' in d) = 0 THEN
    RAISE EXCEPTION 'enforce_payment_within_invoice_total: parche incompleto';
  END IF;
  EXECUTE d;

  -- A2-8: sin tolerancia de sobrepago en lotes
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_supplier_payment_batch';
  o := d;
  d := replace(d,
    E'    IF v_bill.balance < v_amount - 0.01 THEN',
    E'    IF round(v_amount, 2) > round(v_bill.balance, 2) THEN');
  IF d = o THEN RAISE EXCEPTION 'create_supplier_payment_batch: patron no encontrado'; END IF;
  EXECUTE d;

  -- A2-7: MRR excluye rentas en moneda extranjera sin tipo de cambio
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_financial_kpis';
  o := d;
  d := replace(d, E'  v_overdue_fx_missing INT := 0;', E'  v_overdue_fx_missing INT := 0;\n  v_mrr_fx_missing INT := 0;');
  d := replace(d, E'THEN 1 ELSE COALESCE(NULLIF(b.tipo_cambio, 0), 1) END', E'THEN 1 ELSE NULLIF(b.tipo_cambio, 0) END');
  d := replace(d, E'  RETURN jsonb_build_object(\n    ''mrr'', v_mrr,',
    E'  SELECT COUNT(*) INTO v_mrr_fx_missing\n    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id\n   WHERE b.recurring_billing = true AND b.status = ''confirmed''\n     AND b.start_date <= v_today\n     AND (b.end_date IS NULL OR b.end_date >= v_today)\n     AND b.is_e2e IS NOT TRUE\n     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE\n     AND upper(COALESCE(b.currency, ''MXN'')) <> ''MXN''\n     AND COALESCE(b.tipo_cambio, 0) <= 0;\n\n  RETURN jsonb_build_object(\n    ''mrr_fx_missing_count'', v_mrr_fx_missing,\n    ''mrr'', v_mrr,');
  IF d = o OR position('v_mrr_fx_missing' in d) = 0 THEN
    RAISE EXCEPTION 'get_financial_kpis: parche incompleto';
  END IF;
  EXECUTE d;
END
$mig$;

-- A2-4: retirar trigger legado (la funcion se conserva sin uso)
DROP TRIGGER IF EXISTS enforce_payment_balance_trg ON public.payments;

-- A2-3: permitir cancelar un lote de pago liberando las facturas
CREATE OR REPLACE FUNCTION public.cancel_supplier_payment_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := (select auth.uid());
BEGIN
  IF NOT (public.has_role(v_user, 'admin'::app_role) OR public.has_role(v_user, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado para cancelar lotes de pago' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.supplier_payment_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de pago no encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.supplier_payment_batch_items i
    JOIN public.supplier_payments sp ON sp.bill_id = i.bill_id
    WHERE i.batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'El lote ya tiene pagos registrados; no se puede cancelar'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.supplier_bills
     SET payment_in_progress_at = NULL
   WHERE id IN (SELECT bill_id FROM public.supplier_payment_batch_items WHERE batch_id = p_batch_id);

  DELETE FROM public.supplier_payment_batch_items WHERE batch_id = p_batch_id;
  DELETE FROM public.supplier_payment_batches WHERE id = p_batch_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cancel_supplier_payment_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_payment_batch(uuid) TO authenticated;

-- A6-2: una linea bancaria sin pago asociado no puede seguir conciliada
CREATE OR REPLACE FUNCTION public.reset_orphan_matched_bank_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status = 'matched'
     AND NEW.matched_payment_id IS NULL
     AND NEW.matched_supplier_payment_id IS NULL THEN
    NEW.status := 'unmatched';
    NEW.matched_at := NULL;
    NEW.matched_by := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.reset_orphan_matched_bank_line() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_reset_orphan_matched_bank_line ON public.bank_statement_lines;
CREATE TRIGGER trg_reset_orphan_matched_bank_line
  BEFORE UPDATE OF matched_payment_id, matched_supplier_payment_id ON public.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.reset_orphan_matched_bank_line();