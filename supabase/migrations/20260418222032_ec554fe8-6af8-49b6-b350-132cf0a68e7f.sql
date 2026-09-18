CREATE OR REPLACE FUNCTION public.get_insurance_alerts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH base AS (
    SELECT id, name, insurance_expiry, insurance_provider,
      CASE WHEN insurance_expiry IS NOT NULL
        THEN (insurance_expiry - CURRENT_DATE)::int
        ELSE NULL
      END AS days_left
    FROM public.forklifts
    WHERE status NOT IN ('sold','retired')
  ),
  expiring AS (
    SELECT id, name, insurance_expiry, insurance_provider, days_left
    FROM base
    WHERE insurance_expiry IS NOT NULL AND days_left <= 30
    ORDER BY days_left ASC
  ),
  no_ins AS (
    SELECT count(*)::int AS c FROM base WHERE insurance_expiry IS NULL
  )
  SELECT jsonb_build_object(
    'expiring', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'insurance_expiry', insurance_expiry,
      'insurance_provider', insurance_provider, 'days_left', days_left
    )) FROM expiring), '[]'::jsonb),
    'no_insurance_count', (SELECT c FROM no_ins)
  )
  INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_insurance_alerts() TO authenticated;