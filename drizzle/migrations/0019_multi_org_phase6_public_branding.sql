-- =====================================================================
-- Multi-organización · Fase 6.4 (marca pública de plataforma)
--
-- Antes de autenticarse no existe contexto de organización. La marca pública
-- es LiftGo, mientras que cada S.A. territorial se muestra únicamente tras
-- resolver la membresía/sesión de la persona usuaria.
-- =====================================================================

CREATE OR REPLACE VIEW public.public_branding
WITH (security_invoker = false) AS
SELECT
  NULL::text AS logo_url,
  'LiftGo'::text AS razon_social;

CREATE OR REPLACE FUNCTION public.get_public_branding()
RETURNS TABLE(logo_url text, razon_social text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NULL::text AS logo_url, 'LiftGo'::text AS razon_social;
$function$;

REVOKE ALL ON FUNCTION public.get_public_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated;

DO $phase6_public_branding_assertions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.get_public_branding()'::regprocedure)
  INTO v_definition;

  IF v_definition ILIKE '%company_settings%' THEN
    RAISE EXCEPTION
      'La marca pública no debe leer company_settings sin contexto de organización';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_public_branding()
    WHERE logo_url IS NULL
      AND razon_social = 'LiftGo'
  ) THEN
    RAISE EXCEPTION
      'La marca pública de plataforma debe ser LiftGo sin logo territorial';
  END IF;
END;
$phase6_public_branding_assertions$;
