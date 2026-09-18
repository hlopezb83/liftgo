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
$$;

REVOKE ALL ON FUNCTION public.get_public_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated;