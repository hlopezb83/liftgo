DO $do$
DECLARE
  v_oid regprocedure;
  v_def text;
BEGIN
  FOREACH v_oid IN ARRAY ARRAY[
    'public.match_bank_statement_lines(uuid)'::regprocedure,
    'public.get_bank_match_candidates(uuid,text,integer,numeric)'::regprocedure,
    'public.confirm_bank_match(uuid,uuid,uuid)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_oid) INTO v_def;
    v_def := replace(v_def, 'sp.is_e2e IS NOT TRUE AND ', '');
    v_def := replace(v_def, 'sp.is_e2e IS NOT TRUE
          AND ', '');
    v_def := replace(v_def, 'sp.is_e2e IS NOT TRUE
      AND ', '');
    v_def := replace(v_def, 'WHERE sp.is_e2e IS NOT TRUE
', '');
    v_def := replace(v_def, ' AND sp.is_e2e IS NOT TRUE;', ';');
    v_def := replace(v_def, 'WHERE sp.id = p_supplier_payment_id AND sp.is_e2e IS NOT TRUE;', 'WHERE sp.id = p_supplier_payment_id;');
    EXECUTE v_def;
  END LOOP;
END
$do$;