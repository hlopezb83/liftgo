-- =====================================================================
-- Multiempresa - Tramo 8.1: endurecimiento del asignador de folio REP.
--
-- COPIA DE DOCUMENTACION. La migracion real y aplicable vive en
--   drizzle/migrations/0026_rep_number_org_scoped_assignment.sql
-- y este archivo es identico a ella a partir de la seccion 1.
--
-- ORDEN DE ROLLOUT OBLIGATORIO
--   1. Aplicar la migracion.
--   2. Verificar en CI con base limpia: lint de migraciones, RLS DB
--      (incluida supabase/tests/rls/rep_folio_org_scope.sql), smoke SQL,
--      Deno, Vitest, cobertura, calidad y secretos.
--   3. Recien entonces desplegar los Edge Functions
--      (stamp-payment-complement, reconcile-stamping-invoices).
--
-- NO se tocan indices: payments_rep_number_uidx (unico global) se conserva;
-- el Lote 2 de unicidad por organizacion es un cambio posterior.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Firma estricta (tres parametros)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_stamped_rep_number(
  p_payment_id uuid,
  p_folio text,
  -- Sin DEFAULT: un valor por omision volveria ambigua la llamada de dos
  -- argumentos (42725) mientras el wrapper de compatibilidad exista.
  p_organization_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_new_number text;
  v_payment_org uuid;
  v_existing text;
  v_found boolean;
  v_rows int;
BEGIN
  -- Autorizacion ANTES de cualquier lectura privilegiada.
  -- v_uid NULL = proceso interno (service_role / cron), igual que el resto de
  -- las funciones fiscales SECURITY DEFINER del proyecto.
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'CP-' || lpad(p_folio, 4, '0');

  SELECT true, organization_id, rep_number
    INTO v_found, v_payment_org, v_existing
  FROM public.payments
  WHERE id = p_payment_id;

  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;

  IF v_payment_org IS NULL THEN
    RAISE EXCEPTION 'payment % has no organization; cannot assign REP folio',
      p_payment_id USING ERRCODE = '42501';
  END IF;

  -- El parametro no manda: se contrasta contra la organizacion del pago.
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_payment_org THEN
    RAISE EXCEPTION 'payment % belongs to another organization', p_payment_id
      USING ERRCODE = '42501';
  END IF;

  -- Idempotencia explicita para recuperacion/reintento.
  IF v_existing IS NOT NULL THEN
    IF v_existing = v_new_number THEN
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION
      'rep_number % already assigned to payment % (requested %)',
      v_existing, p_payment_id, v_new_number
      USING ERRCODE = 'unique_violation';
  END IF;

  BEGIN
    UPDATE public.payments
       SET rep_number = v_new_number,
           rep_folio = p_folio
     WHERE id = p_payment_id
       AND organization_id = v_payment_org;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'payment % not found in its organization', p_payment_id
        USING ERRCODE = 'P0002';
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'rep_number % already assigned (concurrent stamp)', v_new_number
      USING ERRCODE = 'unique_violation';
  END;

  RETURN v_new_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) IS
  'Asigna el folio REP (CP-####) al pago. La organizacion se valida contra la fila en base; el parametro solo sirve para rechazar cruces. Idempotente ante el mismo folio.';

-- ---------------------------------------------------------------------
-- 2. Wrapper de compatibilidad (dos parametros). NO se dropea la firma vieja:
--    los callers ya desplegados seguirian funcionando. Delega en la estricta
--    SIN argumento de organizacion, asi que la organizacion siempre se lee de
--    public.payments dentro de la funcion estricta.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_stamped_rep_number(
  p_payment_id uuid,
  p_folio text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN public.assign_stamped_rep_number(p_payment_id, p_folio, NULL::uuid);
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_stamped_rep_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text) TO service_role;

COMMENT ON FUNCTION public.assign_stamped_rep_number(uuid, text) IS
  'Wrapper de compatibilidad del tramo 8.1: delega en assign_stamped_rep_number(uuid, text, uuid) sin argumento de organizacion. Retirable una vez desplegados los Edge Functions nuevos.';

-- ---------------------------------------------------------------------
-- Rollback (solo si fuera necesario revertir el tramo 8.1):
--   DROP FUNCTION IF EXISTS public.assign_stamped_rep_number(uuid, text, uuid);
--   -- y recrear la version historica de dos parametros
--   -- (ver supabase/migrations/20260811210858_*.sql).
-- ---------------------------------------------------------------------
