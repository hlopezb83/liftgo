-- FIX-1 (ronda 2): el tope REP debe sumar los pagos convertidos a la moneda
-- de la factura, con el mismo CASE canónico de sync_invoice_status.
-- Si hay un REP vigente en moneda distinta SIN tipo de cambio, se rechaza la
-- NC (fail-closed) en vez de sumar el monto crudo 1:1.
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
  v_inv_moneda text;
  v_inv_tc numeric;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT total, upper(COALESCE(moneda, 'MXN')), tipo_cambio
    INTO v_invoice_total, v_inv_moneda, v_inv_tc
    FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_invoice_total IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_already_credited
    FROM credit_notes
   WHERE invoice_id = NEW.invoice_id
     AND status <> 'cancelled'
     AND cancellation_status <> 'accepted'
     AND id <> NEW.id;

  -- Fail-closed: sin tipo de cambio no se puede calcular el tope.
  IF EXISTS (
    SELECT 1 FROM payments p
     WHERE p.invoice_id = NEW.invoice_id
       AND p.rep_cfdi_status = 'stamped'
       AND p.rep_cancelled_at IS NULL
       AND upper(COALESCE(p.currency, v_inv_moneda)) <> v_inv_moneda
       AND COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_inv_tc, 0)) IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay pagos con REP timbrado en moneda distinta sin tipo de cambio; captura el tipo de cambio antes de emitir la nota de credito.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- H-5 (opción A refinada): sólo topan los pagos con REP timbrado y vigente.
  -- FIX-1 (ronda 2): convertidos a la moneda de la factura.
  SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, v_inv_moneda)) = v_inv_moneda THEN p.amount
        WHEN upper(COALESCE(p.currency, v_inv_moneda)) = 'MXN'
          THEN p.amount / COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_inv_tc, 0))
        ELSE p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_inv_tc, 0))
      END
    ), 0) INTO v_rep_backed
    FROM payments p
   WHERE p.invoice_id = NEW.invoice_id
     AND p.rep_cfdi_status = 'stamped'
     AND p.rep_cancelled_at IS NULL;

  v_rep_backed := round(COALESCE(v_rep_backed, 0), 2);
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