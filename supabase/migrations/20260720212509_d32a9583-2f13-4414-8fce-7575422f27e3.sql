-- Helper para que las edge functions internas lean el CRON_SECRET desde vault
-- sin exponerlo a usuarios normales. Solo service_role puede ejecutarla.
CREATE OR REPLACE FUNCTION public.internal_get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  LIMIT 1;
$$;DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.internal_get_cron_secret()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.internal_get_cron_secret() FROM PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.internal_get_cron_secret()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.internal_get_cron_secret() FROM anon';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.internal_get_cron_secret()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.internal_get_cron_secret() FROM authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.internal_get_cron_secret()') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.internal_get_cron_secret() TO service_role';
  END IF;
END $lgp_guard$;


COMMENT ON FUNCTION public.internal_get_cron_secret() IS
  'NC-2: expone vault.CRON_SECRET únicamente a service_role. Consumido por process-cfdi-retry-queue y reconcile-stamping-invoices para validar que la llamada viene de pg_cron.';