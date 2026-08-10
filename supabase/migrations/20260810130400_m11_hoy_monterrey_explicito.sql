-- M11: "hoy" del negocio = America/Monterrey, explícito en el código fuente.
-- Verificado en runtime: guard_quote_acceptance, create_booking, cancel_booking,
-- convert_quote_to_bookings y validate_delivery_not_in_past YA usan
-- public.today_mty() (sin CURRENT_DATE). Esta migración deja
-- guard_quote_acceptance explícita en el historial de migraciones y aplica un
-- barrido idempotente de respaldo (no-op hoy, protege contra regresiones
-- futuras si alguna de estas funciones se redefine desde un archivo viejo).
CREATE OR REPLACE FUNCTION public.guard_quote_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    IF NEW.valid_until IS NOT NULL AND NEW.valid_until < public.today_mty() THEN
      RAISE EXCEPTION 'No se puede aceptar una cotizacion vencida (valid_until=%)', NEW.valid_until
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.valid_until IS NOT NULL AND OLD.valid_until < public.today_mty() THEN
      RAISE EXCEPTION 'No se puede aceptar una cotizacion cuya vigencia ya vencio (valid_until=%). Extiende la vigencia y reenviala primero.', OLD.valid_until
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $do$
DECLARE
  r record;
  new_def text;
  targets text[] := ARRAY[
    'guard_quote_acceptance','validate_delivery_not_in_past',
    'create_booking','cancel_booking','convert_quote_to_bookings'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY(targets)
      AND pg_get_functiondef(p.oid) ~* '\mCURRENT_DATE\M'
  LOOP
    new_def := regexp_replace(r.def, '\mCURRENT_DATE\M', 'public.today_mty()', 'gi');
    EXECUTE new_def;
  END LOOP;
END
$do$;
