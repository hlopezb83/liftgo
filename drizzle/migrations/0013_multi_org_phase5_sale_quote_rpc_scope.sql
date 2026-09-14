-- =====================================================================
-- Multi-organización · Fase 5.2e (cotizaciones de venta)
--
-- Las asignaciones y mutaciones de cotizaciones de venta sólo usan tablas
-- operativas expuestas a authenticated. SECURITY INVOKER aplica el RLS
-- restrictivo de organización a cada lectura y escritura de estas RPC.
-- =====================================================================

ALTER FUNCTION public.assign_forklift_to_sale_quote(uuid, uuid[], integer[])
  SECURITY INVOKER;
ALTER FUNCTION public.unassign_forklift_from_sale_quote(uuid, uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.delete_quote_with_unassign(uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.reassign_quote_customer(uuid, uuid, text)
  SECURITY INVOKER;

DO $$
DECLARE
  v_table text;
  v_missing text[] := ARRAY[]::text[];
  v_remaining_definers text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'quotes',
    'quote_assigned_forklifts',
    'forklifts',
    'status_logs',
    'bookings',
    'invoices'
  ] LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT') THEN
      v_missing := array_append(v_missing, v_table || ' (SELECT)');
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'quotes',
    'quote_assigned_forklifts',
    'forklifts',
    'status_logs'
  ] LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT, UPDATE, DELETE') THEN
      v_missing := array_append(v_missing, v_table || ' (mutación)');
    END IF;
  END LOOP;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'Las RPC de cotizaciones de venta no pueden usar SECURITY INVOKER: faltan permisos para authenticated en %',
      array_to_string(v_missing, ', ');
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_remaining_definers
  FROM pg_proc p
  WHERE p.oid IN (
    'public.assign_forklift_to_sale_quote(uuid,uuid[],integer[])'::regprocedure,
    'public.unassign_forklift_from_sale_quote(uuid,uuid)'::regprocedure,
    'public.delete_quote_with_unassign(uuid)'::regprocedure,
    'public.reassign_quote_customer(uuid,uuid,text)'::regprocedure
  )
    AND p.prosecdef;

  IF v_remaining_definers IS NOT NULL THEN
    RAISE EXCEPTION
      'Las RPC de cotizaciones de venta deben ser SECURITY INVOKER; siguen definer: %',
      v_remaining_definers;
  END IF;
END;
$$;
