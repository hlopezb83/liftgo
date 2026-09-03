-- Hallazgo 1: get_insurance_alerts contaba equipos E2E (misma semántica de
-- exclusión que el resto del dashboard: COALESCE(is_e2e,false)=false).
CREATE OR REPLACE FUNCTION public.get_insurance_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH base AS (
    SELECT id, name, insurance_expiry, insurance_provider,
      CASE WHEN insurance_expiry IS NOT NULL THEN (insurance_expiry - public.today_mty())::int ELSE NULL END AS days_left
    FROM public.forklifts
    WHERE status NOT IN ('sold','retired')
      AND deleted_at IS NULL
      AND COALESCE(is_e2e, false) = false
  ),
  expiring AS (
    SELECT id, name, insurance_expiry, insurance_provider, days_left FROM base
    WHERE insurance_expiry IS NOT NULL AND days_left <= 30 ORDER BY days_left ASC
  ),
  no_ins AS (SELECT count(*)::int AS c FROM base WHERE insurance_expiry IS NULL)
  SELECT jsonb_build_object(
    'expiring', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'insurance_expiry', insurance_expiry,
      'insurance_provider', insurance_provider, 'days_left', days_left
    )) FROM expiring), '[]'::jsonb),
    'no_insurance_count', (SELECT c FROM no_ins)
  ) INTO result;
  RETURN result;
END;
$function$;

-- Hallazgo 7: impedir dos contratos no cancelados para la misma reserva.
-- Los duplicados históricos (CTR-0002/CTR-0003, misma booking_id) se conservan:
-- si existen duplicados previos, el índice sólo aplica a registros nuevos
-- mediante una condición estable por fecha de creación.
DO $do$
DECLARE
  v_has_dupes boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts
    WHERE booking_id IS NOT NULL AND status <> 'cancelled'
    GROUP BY booking_id
    HAVING count(*) > 1
  ) INTO v_has_dupes;

  IF v_has_dupes THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS contracts_one_active_per_booking
      ON public.contracts (booking_id)
      WHERE booking_id IS NOT NULL AND status <> ''cancelled''
        AND created_at >= ''2026-09-03 00:00:00+00''::timestamptz';
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS contracts_one_active_per_booking
      ON public.contracts (booking_id)
      WHERE booking_id IS NOT NULL AND status <> ''cancelled''';
  END IF;
END
$do$;