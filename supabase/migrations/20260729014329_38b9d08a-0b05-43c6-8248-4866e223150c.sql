DROP FUNCTION IF EXISTS public.confirm_bank_matches(uuid[]);

CREATE OR REPLACE FUNCTION public.confirm_bank_matches(p_line_ids uuid[])
RETURNS TABLE(confirmed integer, failed integer, failed_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_confirmed integer := 0;
  v_failed integer := 0;
  v_failed_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_line_ids IS NULL OR array_length(p_line_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0, ARRAY[]::uuid[];
    RETURN;
  END IF;

  FOR v_id IN
    SELECT bsl.id
    FROM public.bank_statement_lines bsl
    WHERE bsl.id = ANY(p_line_ids)
      AND bsl.status = 'suggested'::bank_line_status
      AND (bsl.suggested_payment_id IS NOT NULL OR bsl.suggested_supplier_payment_id IS NOT NULL)
    ORDER BY bsl.posted_date
  LOOP
    BEGIN
      PERFORM public.confirm_bank_match(
        v_id,
        (SELECT suggested_payment_id FROM public.bank_statement_lines WHERE id = v_id),
        (SELECT suggested_supplier_payment_id FROM public.bank_statement_lines WHERE id = v_id)
      );
      v_confirmed := v_confirmed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_failed_ids := array_append(v_failed_ids, v_id);
      UPDATE public.bank_statement_lines
      SET status = 'unmatched'::bank_line_status
      WHERE id = v_id;
    END;
  END LOOP;

  RETURN QUERY SELECT v_confirmed, v_failed, v_failed_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_bank_matches(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_bank_matches(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.confirm_bank_matches(uuid[]) IS
  'R23-L: confirma en bloque; las lineas cuya sugerencia quedo obsoleta se omiten y regresan a unmatched.';

CREATE OR REPLACE FUNCTION public.enforce_payment_within_invoice_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_total NUMERIC;
  inv_status TEXT;
  total_paid NUMERIC;
BEGIN
  SELECT total, status INTO inv_total, inv_status
  FROM public.invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF inv_total IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found for payment', NEW.invoice_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF inv_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en facturas canceladas'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  total_paid := total_paid + NEW.amount;

  IF total_paid > inv_total + 0.01 THEN
    RAISE EXCEPTION
      'Sobrepago rechazado: la suma de pagos (%.2f) excede el total de la factura (%.2f)',
      total_paid, inv_total
      USING ERRCODE = 'check_violation',
            HINT = 'Reduce el monto del pago o cancela pagos previos antes de registrar uno nuevo.';
  END IF;

  RETURN NEW;
END;
$$;