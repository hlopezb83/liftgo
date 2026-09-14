-- =====================================================================
-- Multi-organización · Fase 5.2b (mutaciones directas de conciliación)
--
-- Estas operaciones sólo consultan y actualizan movimientos que el usuario
-- autenticado ya puede leer y editar. SECURITY INVOKER hace que el RLS
-- restrictivo por organización también proteja confirmaciones, descartes y
-- desconciliaciones.
-- =====================================================================

ALTER FUNCTION public.confirm_bank_match(uuid, uuid, uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.confirm_bank_matches(uuid[])
  SECURITY INVOKER;
ALTER FUNCTION public.ignore_bank_lines(uuid[], text)
  SECURITY INVOKER;
ALTER FUNCTION public.unmatch_bank_line(uuid)
  SECURITY INVOKER;

DO $$
DECLARE
  v_required_table text;
  v_missing text[] := ARRAY[]::text[];
  v_remaining_definers text;
BEGIN
  FOREACH v_required_table IN ARRAY ARRAY[
    'bank_statement_lines',
    'bank_accounts',
    'payments',
    'invoices',
    'supplier_payments',
    'supplier_bills'
  ] LOOP
    IF NOT has_table_privilege(
      'authenticated',
      format('public.%I', v_required_table),
      'SELECT'
    ) THEN
      v_missing := array_append(v_missing, v_required_table || ' (SELECT)');
    END IF;
  END LOOP;

  IF NOT has_table_privilege(
    'authenticated',
    'public.bank_statement_lines',
    'UPDATE'
  ) THEN
    v_missing := array_append(v_missing, 'bank_statement_lines (UPDATE)');
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'Las mutaciones de conciliación no pueden usar SECURITY INVOKER: faltan permisos para authenticated en %',
      array_to_string(v_missing, ', ');
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_remaining_definers
  FROM pg_proc p
  WHERE p.oid IN (
    'public.confirm_bank_match(uuid,uuid,uuid)'::regprocedure,
    'public.confirm_bank_matches(uuid[])'::regprocedure,
    'public.ignore_bank_lines(uuid[],text)'::regprocedure,
    'public.unmatch_bank_line(uuid)'::regprocedure
  )
    AND p.prosecdef;

  IF v_remaining_definers IS NOT NULL THEN
    RAISE EXCEPTION
      'Las mutaciones de conciliación deben ser SECURITY INVOKER; siguen definer: %',
      v_remaining_definers;
  END IF;
END;
$$;
