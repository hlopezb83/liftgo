DROP VIEW IF EXISTS public.public_branding;

CREATE OR REPLACE FUNCTION public.get_public_branding()
RETURNS TABLE(logo_url text, razon_social text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT logo_url, razon_social
  FROM public.company_settings
  LIMIT 1;
$$;DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.get_public_branding()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_public_branding() FROM PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.get_public_branding()') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated';
  END IF;
END $lgp_guard$;
