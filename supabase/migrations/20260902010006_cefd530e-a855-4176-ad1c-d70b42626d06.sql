DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.match_bank_statement_lines(uuid)'::regprocedure) INTO v_def;
  IF position('sp.is_e2e IS NOT TRUE' IN v_def) = 0 THEN
    v_def := replace(v_def,
      'FROM public.supplier_payments sp
        JOIN public.supplier_bills sb ON sb.id = sp.bill_id
        WHERE public.bank_amount_in_account_currency',
      'FROM public.supplier_payments sp
        JOIN public.supplier_bills sb ON sb.id = sp.bill_id
        WHERE sp.is_e2e IS NOT TRUE
          AND public.bank_amount_in_account_currency');
  END IF;
  IF position('p.is_e2e IS NOT TRUE' IN v_def) = 0 THEN
    v_def := replace(v_def,
      'FROM public.payments p
        LEFT JOIN public.invoices i ON i.id = p.invoice_id
        WHERE public.bank_amount_in_account_currency',
      'FROM public.payments p
        LEFT JOIN public.invoices i ON i.id = p.invoice_id
        WHERE p.is_e2e IS NOT TRUE
          AND public.bank_amount_in_account_currency');
  END IF;
  IF position('sp.is_e2e IS NOT TRUE' IN v_def) = 0 OR position('p.is_e2e IS NOT TRUE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'R10-05: no se pudieron instalar ambos filtros E2E en match_bank_statement_lines';
  END IF;
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.get_bank_match_candidates(uuid,text,integer,numeric)'::regprocedure) INTO v_def;
  IF position('sp.is_e2e IS NOT TRUE' IN v_def) = 0 THEN
    v_def := replace(v_def,
      'FROM public.supplier_payments sp
      LEFT JOIN public.supplier_bills sb ON sb.id = sp.bill_id
    )',
      'FROM public.supplier_payments sp
      LEFT JOIN public.supplier_bills sb ON sb.id = sp.bill_id
      WHERE sp.is_e2e IS NOT TRUE
    )');
  END IF;
  IF position('p.is_e2e IS NOT TRUE' IN v_def) = 0 THEN
    v_def := replace(v_def,
      'FROM public.payments p
      LEFT JOIN public.invoices i ON i.id = p.invoice_id
    )',
      'FROM public.payments p
      LEFT JOIN public.invoices i ON i.id = p.invoice_id
      WHERE p.is_e2e IS NOT TRUE
    )');
  END IF;
  IF position('sp.is_e2e IS NOT TRUE' IN v_def) = 0 OR position('p.is_e2e IS NOT TRUE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'R10-05: no se pudieron instalar ambos filtros E2E en get_bank_match_candidates';
  END IF;
  EXECUTE v_def;
END
$do$;