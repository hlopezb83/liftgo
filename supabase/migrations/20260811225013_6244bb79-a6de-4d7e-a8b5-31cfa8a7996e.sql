-- Fix: v7.294.0 revoked EXECUTE on folio functions from `authenticated`, but
-- three call paths still run as the end user:
--   1) client RPCs: next_supplier_bill_number / next_contract_number / next_quote_number
--   2) non-SECURITY DEFINER triggers: set_supplier_bill_number / set_delivery_number / set_inspection_number
-- Rollback: re-run the previous definitions (triggers without SECURITY DEFINER,
-- folio functions as plain SQL) and REVOKE EXECUTE ... FROM authenticated.

-- 1. Trigger functions → SECURITY DEFINER (owner postgres) + search_path fijo.
CREATE OR REPLACE FUNCTION public.set_supplier_bill_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.bill_number IS NULL OR length(trim(NEW.bill_number)) = 0 THEN
    NEW.bill_number := public.next_supplier_bill_number();
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.set_delivery_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.delivery_number IS NULL THEN
    NEW.delivery_number := public.next_delivery_number();
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.set_inspection_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.inspection_number IS NULL THEN
    NEW.inspection_number := public.next_inspection_number();
  END IF;
  RETURN NEW;
END $function$;

-- 2. Folio functions llamadas directamente por la app: guard de rol + EXECUTE
--    solo para `authenticated` (nunca `anon`). auth.uid() IS NULL = proceso
--    interno (service_role / migraciones / cron).
CREATE OR REPLACE FUNCTION public.next_supplier_bill_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (select auth.uid()) IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
  END IF;
  RETURN 'CXP-' || lpad(nextval('public.supplier_bill_number_seq')::text, 4, '0');
END $function$;

CREATE OR REPLACE FUNCTION public.next_contract_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (select auth.uid()) IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
  END IF;
  RETURN 'CTR-' || lpad(nextval('public.contract_number_seq')::text, 4, '0');
END $function$;

CREATE OR REPLACE FUNCTION public.next_quote_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (select auth.uid()) IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
  END IF;
  RETURN 'COT-' || lpad(GREATEST(
    nextval('public.quote_number_seq'),
    COALESCE((
      SELECT MAX(NULLIF(regexp_replace(q.quote_number, '[^0-9]', '', 'g'), '')::bigint)
        FROM public.quotes q
       WHERE COALESCE(q.is_e2e, false) = false
         AND q.quote_number NOT LIKE 'E2E-%'
    ), 0) + 1
  )::text, 4, '0');
END $function$;

REVOKE ALL ON FUNCTION public.next_supplier_bill_number() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_contract_number() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_quote_number() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.next_supplier_bill_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_contract_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_quote_number() TO authenticated, service_role;
