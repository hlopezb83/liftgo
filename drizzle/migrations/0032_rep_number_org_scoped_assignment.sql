-- =====================================================================
-- Multiempresa - Tramo 8.1: endurecimiento del asignador de folio REP.
--
-- Migracion real (carril Drizzle, el que CI aplica sobre la base efimera
-- despues del historial Supabase).
--
-- ORDEN DE ROLLOUT OBLIGATORIO
--   1. Aplicar esta migracion (crea la firma estricta de 3 parametros y
--      conserva la de 2 parametros como wrapper seguro, sin DROP).
--   2. Verificar en CI con base limpia: lint de migraciones, RLS DB
--      (incluida supabase/tests/rls/rep_folio_org_scope.sql), smoke SQL,
--      Deno, Vitest, cobertura, calidad y secretos.
--   3. Recien entonces desplegar los Edge Functions
--      (stamp-payment-complement, reconcile-stamping-invoices).
--
--   El wrapper de 2 parametros evita la ventana de fallo en cualquier orden.
--   El fallback del helper de Edge Functions es solo defensa de emergencia:
--   la prueba RLS falla si esta migracion no esta aplicada.
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

  -- Aislamiento multiempresa para cualquier caller autenticado: el rol no
  -- basta. Un admin de la organizacion A no puede folear un pago de B, ni
  -- pasando NULL en p_organization_id. Fail-closed ANTES del UPDATE.
  -- v_uid NULL = canal interno (service_role / cron), sin contexto de sesion,
  -- ya restringido por GRANT.
  IF v_uid IS NOT NULL THEN
    IF public.current_organization_id() IS DISTINCT FROM v_payment_org
       OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'payment % belongs to another organization', p_payment_id
        USING ERRCODE = '42501';
    END IF;
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

-- Nota de ACL: en Supabase existe
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, ...
-- por lo que una funcion NUEVA nace con EXECUTE concedido DIRECTAMENTE a anon
-- (no via PUBLIC). El REVOKE ... FROM PUBLIC no lo quita: hace falta el REVOKE
-- explicito a anon.
REVOKE ALL ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) IS
  'Asigna el folio REP (CP-####) al pago. La organizacion se lee de la fila en base; el parametro solo sirve para rechazar cruces. Un caller autenticado ademas debe ser miembro interno de esa misma organizacion (current_organization_id). Idempotente ante el mismo folio.';

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

-- Decision de aislamiento: el wrapper NO se concede a authenticated. Se
-- revisaron todos los callers del repositorio y el unico que lo invoca es el
-- canal interno con service client (stamp-payment-complement y la
-- reconciliacion, esta ultima solo como defensa de emergencia). Ningun caller
-- de navegador lo usa, asi que dejarlo abierto a authenticated solo ofreceria
-- una via de delegacion con NULL.
REVOKE ALL ON FUNCTION public.assign_stamped_rep_number(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_stamped_rep_number(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text) TO service_role;

COMMENT ON FUNCTION public.assign_stamped_rep_number(uuid, text) IS
  'Wrapper de compatibilidad del tramo 8.1: delega en assign_stamped_rep_number(uuid, text, uuid) sin argumento de organizacion. Solo service_role (canal interno); authenticated no lo ejecuta. Retirable una vez desplegado el codigo nuevo.';

-- ---------------------------------------------------------------------
-- Rollback (solo si fuera necesario revertir el tramo 8.1):
--   DROP FUNCTION IF EXISTS public.assign_stamped_rep_number(uuid, text, uuid);
--   -- y recrear la version historica de dos parametros
--   -- (ver supabase/migrations/20260811210858_*.sql).
-- ---------------------------------------------------------------------