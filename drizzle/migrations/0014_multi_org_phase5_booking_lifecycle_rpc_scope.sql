-- =====================================================================
-- Multi-organización · Fase 5.2f (reservas y entregas)
--
-- Estas RPCs operan únicamente sobre tablas expuestas a authenticated.
-- SECURITY INVOKER fuerza que toda lectura y mutación respete las policies
-- RESTRICTIVE de organización, sin eliminar sus validaciones de rol, locks ni
-- guards de negocio existentes.
-- =====================================================================

ALTER FUNCTION public.create_booking(uuid, uuid, text, text, date, date, boolean, uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.convert_quote_to_bookings(uuid, jsonb, boolean)
  SECURITY INVOKER;
ALTER FUNCTION public.delete_booking(uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.cancel_booking(uuid, text)
  SECURITY INVOKER;
ALTER FUNCTION public.extend_booking(uuid, date, text)
  SECURITY INVOKER;
ALTER FUNCTION public.complete_delivery(uuid, text, numeric, text)
  SECURITY INVOKER;

DO $$
DECLARE
  v_table text;
  v_missing text[] := ARRAY[]::text[];
  v_remaining_definers text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'bookings',
    'forklifts',
    'quotes',
    'customers',
    'deliveries',
    'invoices',
    'invoice_bookings',
    'contracts',
    'return_inspections',
    'damage_records',
    'maintenance_logs',
    'booking_extensions',
    'status_logs'
  ] LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT') THEN
      v_missing := array_append(v_missing, v_table || ' (SELECT)');
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'bookings',
    'forklifts',
    'quotes',
    'deliveries',
    'booking_extensions',
    'status_logs'
  ] LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT, UPDATE, DELETE') THEN
      v_missing := array_append(v_missing, v_table || ' (mutación)');
    END IF;
  END LOOP;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'Las RPC de reservas y entregas no pueden usar SECURITY INVOKER: faltan permisos para authenticated en %',
      array_to_string(v_missing, ', ');
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_remaining_definers
  FROM pg_proc p
  WHERE p.oid IN (
    'public.create_booking(uuid,uuid,text,text,date,date,boolean,uuid)'::regprocedure,
    'public.convert_quote_to_bookings(uuid,jsonb,boolean)'::regprocedure,
    'public.delete_booking(uuid)'::regprocedure,
    'public.cancel_booking(uuid,text)'::regprocedure,
    'public.extend_booking(uuid,date,text)'::regprocedure,
    'public.complete_delivery(uuid,text,numeric,text)'::regprocedure
  )
    AND p.prosecdef;

  IF v_remaining_definers IS NOT NULL THEN
    RAISE EXCEPTION
      'Las RPC de reservas y entregas deben ser SECURITY INVOKER; siguen definer: %',
      v_remaining_definers;
  END IF;
END;
$$;
