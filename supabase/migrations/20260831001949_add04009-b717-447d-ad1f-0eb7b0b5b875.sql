-- A5-03: una factura timbrada PUE debe liquidarse en un solo pago completo
DO $mig$
DECLARE d text; o text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='enforce_payment_within_invoice_total';
  o := d;
  d := replace(d,
    E'  inv_total NUMERIC;\n  inv_status TEXT;',
    E'  inv_total NUMERIC;\n  inv_status TEXT;\n  inv_metodo TEXT;\n  inv_cfdi TEXT;');
  d := replace(d,
    E'  SELECT total, status, moneda, tipo_cambio\n    INTO inv_total, inv_status, inv_moneda, inv_tc',
    E'  SELECT total, status, moneda, tipo_cambio, metodo_pago, cfdi_status\n    INTO inv_total, inv_status, inv_moneda, inv_tc, inv_metodo, inv_cfdi');
  d := replace(d,
    E'  RETURN NEW;\nEND;',
    E'  IF upper(COALESCE(inv_metodo, '''')) = ''PUE''\n     AND COALESCE(inv_cfdi, '''') = ''stamped''\n     AND round(total_paid, 2) < round(payable, 2) - 0.01 THEN\n    RAISE EXCEPTION\n      ''Pago parcial rechazado: la factura esta timbrada como PUE (pago en una sola exhibicion) y debe liquidarse completa (saldo facturable: %)'',\n      round(payable, 2)\n      USING ERRCODE = ''check_violation'',\n            HINT = ''Registra el pago por el saldo total o retimbra la factura como PPD.'';\n  END IF;\n\n  RETURN NEW;\nEND;');
  IF d = o OR position('PUE' in d) = 0 THEN
    RAISE EXCEPTION 'enforce_payment_within_invoice_total: parche PUE incompleto';
  END IF;
  EXECUTE d;
END
$mig$;