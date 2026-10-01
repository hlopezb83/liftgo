-- A member needs the same display identity in every ERP role. Return only
-- the name; company_settings and fiscal secrets retain their existing RLS.
CREATE OR REPLACE FUNCTION public.get_organization_display_name()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid;
  v_name text;
BEGIN
  v_org := public.current_internal_organization_id();
  IF v_uid IS NULL OR v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(nullif(btrim(cs.razon_social), ''), nullif(btrim(o.name), ''), 'Empresa')
    INTO v_name
    FROM public.organizations o
    LEFT JOIN public.company_settings cs ON cs.organization_id = o.id
   WHERE o.id = v_org AND o.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN v_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_organization_display_name() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_display_name() TO authenticated;
