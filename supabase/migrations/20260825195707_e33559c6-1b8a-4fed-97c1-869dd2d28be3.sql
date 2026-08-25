CREATE OR REPLACE FUNCTION public.enforce_credit_note_max()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_total numeric;
  v_already_credited numeric;
  v_rep_backed numeric;
  v_max_creditable numeric;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT total INTO v_invoice_total FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_invoice_total IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_already_credited
    FROM credit_notes
   WHERE invoice_id = NEW.invoice_id
     AND status <> 'cancelled'
     AND cancellation_status <> 'accepted'
     AND id <> NEW.id;

  -- H-5 (opción A refinada): sólo topan los pagos con REP timbrado y vigente.
  -- Un REP declara ante el SAT un importe pagado contra la factura; dejar el
  -- neto por debajo de esa suma deja el CFDI inconsistente. La secuencia
  -- correcta es cancelar el REP (hasta 72 h en el SAT) y luego emitir la NC.
  -- Pagos PUE/sin timbrar o con REP cancelado NO topan (generan saldo a favor).
  SELECT COALESCE(SUM(amount), 0) INTO v_rep_backed
    FROM payments
   WHERE invoice_id = NEW.invoice_id
     AND rep_cfdi_status = 'stamped'
     AND rep_cancelled_at IS NULL;

  v_max_creditable := round(v_invoice_total - v_rep_backed, 2);

  IF round(v_already_credited + NEW.total, 2) > v_invoice_total THEN
    RAISE EXCEPTION 'La suma de notas de credito (% + % = %) excede el total de la factura (%). Cancela o reduce alguna NC existente.',
      v_already_credited, NEW.total, v_already_credited + NEW.total, v_invoice_total USING ERRCODE = 'P0001';
  END IF;

  IF v_rep_backed > 0 AND round(v_already_credited + NEW.total, 2) > v_max_creditable THEN
    RAISE EXCEPTION 'La nota de credito (% + % = %) excede el maximo acreditable (%): el total de la factura es % y % ya estan declarados en complementos de pago (REP) timbrados. Cancela los REP ante el SAT antes de emitir esta NC.',
      v_already_credited, NEW.total, round(v_already_credited + NEW.total, 2), v_max_creditable,
      v_invoice_total, v_rep_backed USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;