-- Multiempresa · paso 6: contrato de catálogo de las diez RPC SECURITY DEFINER
-- de bloqueos de pago, estado de secretos de facturación y folios internos
-- (migración Drizzle 0043).
--
-- Comprueba, sin escribir datos:
--   1) Las diez firmas exactas existen y siguen SECURITY DEFINER.
--   2) search_path fijo y seguro ('public').
--   3) El canal authenticated exige current_internal_organization_id() e
--      is_internal_member().
--   4) anon y PUBLIC sin EXECUTE; authenticated con EXECUTE.
BEGIN;

DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_def text;
  v_cfg text[];
  v_fallas text[] := '{}';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.count_releasable_payment_locks(integer)',
    'public.get_billing_secrets_status()',
    'public.next_contract_number()',
    'public.next_draft_credit_note_number()',
    'public.next_draft_invoice_number()',
    'public.next_quote_number()',
    'public.next_supplier_bill_number()',
    'public.peek_next_draft_credit_note_number()',
    'public.peek_next_draft_invoice_number()',
    'public.peek_next_invoice_number()'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_fallas := array_append(v_fallas, format('falta la función %s', v_sig));
      CONTINUE;
    END IF;
    v_oid := to_regprocedure(v_sig)::oid;

    SELECT p.proconfig, pg_get_functiondef(p.oid)
      INTO v_cfg, v_def
      FROM pg_proc p WHERE p.oid = v_oid;

    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) THEN
      v_fallas := array_append(v_fallas, format('%s no es SECURITY DEFINER', v_sig));
    END IF;

    IF v_cfg IS NULL OR position('search_path=public' in array_to_string(v_cfg, ',')) = 0 THEN
      v_fallas := array_append(v_fallas, format('%s sin search_path=public fijo', v_sig));
    END IF;

    IF position('current_internal_organization_id' in v_def) = 0 THEN
      v_fallas := array_append(v_fallas, format('%s no usa current_internal_organization_id', v_sig));
    END IF;

    IF position('is_internal_member' in v_def) = 0 THEN
      v_fallas := array_append(v_fallas, format('%s no usa is_internal_member', v_sig));
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      v_fallas := array_append(v_fallas, format('%s ejecutable por anon', v_sig));
    END IF;

    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      v_fallas := array_append(v_fallas, format('%s sin EXECUTE para authenticated', v_sig));
    END IF;
  END LOOP;

  -- count_releasable_payment_locks no debe delegar en el helper global sin
  -- filtro de organización.
  SELECT pg_get_functiondef(to_regprocedure('public.count_releasable_payment_locks(integer)')::oid)
    INTO v_def;
  IF position('releasable_payment_locks(p_older_than_hours)' in v_def) > 0 THEN
    v_fallas := array_append(v_fallas, 'count_releasable_payment_locks sigue usando el helper global');
  END IF;
  IF position('organization_id = v_org' in v_def) = 0 THEN
    v_fallas := array_append(v_fallas, 'count_releasable_payment_locks no filtra por organization_id');
  END IF;

  SELECT pg_get_functiondef(to_regprocedure('public.get_billing_secrets_status()')::oid)
    INTO v_def;
  IF position('bs.organization_id = public.current_internal_organization_id()' in v_def) = 0 THEN
    v_fallas := array_append(v_fallas, 'get_billing_secrets_status no acota billing_secrets a la organización interna');
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'CONTRATO 0043 FALLIDO: %', array_to_string(v_fallas, ' | ');
  END IF;

  RAISE NOTICE 'OK: contrato 0043 (10 firmas)';
END $$;

ROLLBACK;
