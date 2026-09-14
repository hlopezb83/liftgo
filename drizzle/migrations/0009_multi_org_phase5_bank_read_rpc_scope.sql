-- =====================================================================
-- Multi-organización · Fase 5.2a (lecturas de conciliación bancaria)
--
-- Estas RPC sólo consultan tablas con RLS restrictivo por organización. Al
-- ejecutarse como invoker dejan de poder cruzar ese límite mediante el rol
-- propietario de las funciones.
-- =====================================================================

ALTER FUNCTION public.get_bank_match_candidates(uuid, text, integer, numeric)
  SECURITY INVOKER;
ALTER FUNCTION public.get_bank_reconciliation_kpis(uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.get_bank_statement_lines_page(uuid, text, text, integer, integer)
  SECURITY INVOKER;

-- La transición sólo es válida mientras authenticated pueda leer las tablas
-- involucradas: los permisos y RLS deben aplicarse conjuntamente.
DO $$
DECLARE
  v_table text;
  v_missing text[] := ARRAY[]::text[];
  v_remaining_definers text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'bank_accounts',
    'bank_statement_lines',
    'payments',
    'invoices',
    'supplier_payments',
    'supplier_bills',
    'suppliers'
  ] LOOP
    IF NOT has_table_privilege(
      'authenticated',
      format('public.%I', v_table),
      'SELECT'
    ) THEN
      v_missing := array_append(v_missing, v_table);
    END IF;
  END LOOP;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'Las RPC de conciliación no pueden usar SECURITY INVOKER: faltan permisos SELECT para authenticated en %',
      array_to_string(v_missing, ', ');
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_remaining_definers
  FROM pg_proc p
  WHERE p.oid IN (
    'public.get_bank_match_candidates(uuid,text,integer,numeric)'::regprocedure,
    'public.get_bank_reconciliation_kpis(uuid)'::regprocedure,
    'public.get_bank_statement_lines_page(uuid,text,text,integer,integer)'::regprocedure
  )
    AND p.prosecdef;

  IF v_remaining_definers IS NOT NULL THEN
    RAISE EXCEPTION
      'Las lecturas de conciliación deben ser SECURITY INVOKER; siguen definer: %',
      v_remaining_definers;
  END IF;
END;
$$;
