CREATE OR REPLACE FUNCTION public.next_quote_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT 'COT-' || lpad(GREATEST(
    nextval('public.quote_number_seq'),
    COALESCE((
      SELECT MAX(NULLIF(regexp_replace(q.quote_number, '[^0-9]', '', 'g'), '')::bigint)
        FROM public.quotes q
       WHERE COALESCE(q.is_e2e, false) = false
         AND q.quote_number NOT LIKE 'E2E-%'
    ), 0) + 1
  )::text, 4, '0');
$function$;

CREATE OR REPLACE FUNCTION public.next_booking_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT 'RSV-' || lpad(GREATEST(
    nextval('public.booking_number_seq'),
    COALESCE((
      SELECT MAX(NULLIF(regexp_replace(b.booking_number, '[^0-9]', '', 'g'), '')::bigint)
        FROM public.bookings b
       WHERE COALESCE(b.is_e2e, false) = false
         AND b.booking_number NOT LIKE 'E2E-%'
    ), 0) + 1
  )::text, 4, '0');
$function$;

CREATE OR REPLACE FUNCTION public.next_delivery_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT 'ENT-' || lpad(GREATEST(
    nextval('public.delivery_number_seq'),
    COALESCE((
      SELECT MAX(NULLIF(regexp_replace(d.delivery_number, '[^0-9]', '', 'g'), '')::bigint)
        FROM public.deliveries d
       WHERE d.delivery_number NOT LIKE 'E2E-%'
    ), 0) + 1
  )::text, 4, '0');
$function$;

CREATE OR REPLACE FUNCTION public.next_credit_note_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT 'NC-' || lpad(GREATEST(
    nextval('public.credit_note_number_seq'),
    COALESCE((
      SELECT MAX(NULLIF(regexp_replace(cn.credit_note_number, '[^0-9]', '', 'g'), '')::bigint)
        FROM public.credit_notes cn
    ), 0) + 1
  )::text, 4, '0');
$function$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT 'FAC-' || lpad(GREATEST(
    nextval('public.invoice_number_seq'),
    COALESCE((
      SELECT MAX(NULLIF(regexp_replace(i.invoice_number, '[^0-9]', '', 'g'), '')::bigint)
        FROM public.invoices i
       WHERE COALESCE(i.is_e2e, false) = false
         AND i.invoice_number NOT LIKE 'E2E-%'
    ), 0) + 1,
    COALESCE((SELECT s.min_next_number FROM public.invoice_number_settings s LIMIT 1), 1)
  )::text, 4, '0');
$function$;

DO $$
DECLARE
  v_quote_max    bigint;
  v_booking_max  bigint;
  v_delivery_max bigint;
  v_invoice_max  bigint;
  v_nc_max       bigint;
  v_contract_max bigint;
  v_bill_max     bigint;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(quote_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_quote_max FROM public.quotes
   WHERE COALESCE(is_e2e, false) = false AND quote_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(booking_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_booking_max FROM public.bookings
   WHERE COALESCE(is_e2e, false) = false AND booking_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(delivery_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_delivery_max FROM public.deliveries
   WHERE delivery_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_invoice_max FROM public.invoices
   WHERE COALESCE(is_e2e, false) = false AND invoice_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(credit_note_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_nc_max FROM public.credit_notes;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(contract_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_contract_max FROM public.contracts;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(bill_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_bill_max FROM public.supplier_bills;

  PERFORM setval('public.quote_number_seq',
    GREATEST(v_quote_max, (SELECT last_value FROM public.quote_number_seq), 1), true);
  PERFORM setval('public.booking_number_seq',
    GREATEST(v_booking_max, (SELECT last_value FROM public.booking_number_seq), 1), true);
  PERFORM setval('public.delivery_number_seq',
    GREATEST(v_delivery_max, (SELECT last_value FROM public.delivery_number_seq), 1), true);
  PERFORM setval('public.invoice_number_seq',
    GREATEST(v_invoice_max, (SELECT last_value FROM public.invoice_number_seq), 1), true);
  PERFORM setval('public.credit_note_number_seq',
    GREATEST(v_nc_max, (SELECT last_value FROM public.credit_note_number_seq), 1), true);
  PERFORM setval('public.contract_number_seq',
    GREATEST(v_contract_max, (SELECT last_value FROM public.contract_number_seq), 1), true);
  PERFORM setval('public.supplier_bill_number_seq',
    GREATEST(v_bill_max, (SELECT last_value FROM public.supplier_bill_number_seq), 1), true);
END $$;