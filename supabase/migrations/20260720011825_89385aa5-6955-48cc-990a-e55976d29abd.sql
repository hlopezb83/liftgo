
-- Crear secuencias con START WITH = MAX + 1 (excluyendo folios de pruebas)
DO $$
DECLARE
  v_booking_max int;
  v_quote_max int;
  v_delivery_max int;
  v_inspection_max int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(booking_number, '[^0-9]', '', 'g'), '')::int), 0)
    INTO v_booking_max
  FROM public.bookings
  WHERE coalesce(is_e2e, false) = false AND booking_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(quote_number, '[^0-9]', '', 'g'), '')::int), 0)
    INTO v_quote_max
  FROM public.quotes
  WHERE coalesce(is_e2e, false) = false AND quote_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(delivery_number, '[^0-9]', '', 'g'), '')::int), 0)
    INTO v_delivery_max
  FROM public.deliveries;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(inspection_number, '[^0-9]', '', 'g'), '')::int), 0)
    INTO v_inspection_max
  FROM public.return_inspections;

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.booking_number_seq START WITH %s', v_booking_max + 1);
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START WITH %s', v_quote_max + 1);
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.delivery_number_seq START WITH %s', v_delivery_max + 1);
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.inspection_number_seq START WITH %s', v_inspection_max + 1);

  -- setval en caso de que la secuencia ya existiera (idempotencia)
  PERFORM setval('public.booking_number_seq',    GREATEST(v_booking_max, 1), true);
  PERFORM setval('public.quote_number_seq',      GREATEST(v_quote_max, 1), true);
  PERFORM setval('public.delivery_number_seq',   GREATEST(v_delivery_max, 1), true);
  PERFORM setval('public.inspection_number_seq', GREATEST(v_inspection_max, 1), true);
END $$;

GRANT USAGE, SELECT ON SEQUENCE public.booking_number_seq, public.quote_number_seq, public.delivery_number_seq, public.inspection_number_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.next_booking_number()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'RSV-' || lpad(nextval('public.booking_number_seq')::text, 4, '0');
$function$;

CREATE OR REPLACE FUNCTION public.next_quote_number()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'COT-' || lpad(nextval('public.quote_number_seq')::text, 4, '0');
$function$;

CREATE OR REPLACE FUNCTION public.next_delivery_number()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'ENT-' || lpad(nextval('public.delivery_number_seq')::text, 4, '0');
$function$;

CREATE OR REPLACE FUNCTION public.next_inspection_number()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'DEV-' || lpad(nextval('public.inspection_number_seq')::text, 4, '0');
$function$;
