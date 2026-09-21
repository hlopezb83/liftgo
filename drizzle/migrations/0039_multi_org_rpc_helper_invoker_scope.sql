-- 0039_multi_org_rpc_helper_invoker_scope
--
-- Paso 3 del endurecimiento multiempresa: cerrar lecturas cross-tenant en RPC
-- y helpers autenticados.
--
-- 1) Seis funciones operativas pasan a SECURITY INVOKER: solo pueden leer las
--    filas visibles por RLS del invocante. Conservan firma, resultado,
--    volatilidad, search_path, guardas de rol y ACL.
--    Los triggers que las consumen (restore_forklift_on_damage_repaired,
--    soft_delete_damage_record, guard_forklift_rented_requires_delivery,
--    sync_forklift_status_on_maintenance, guard_forklift_status_change,
--    change_forklift_status) son SECURITY DEFINER propiedad del owner, de modo
--    que la llamada anidada conserva el rol del definidor y el comportamiento
--    del trigger no cambia.
-- 2) get_feedback_leaderboard sigue SECURITY DEFINER (agrega reportes de toda
--    la empresa) pero exige sesion autenticada y filtra por
--    current_organization_id().
-- 3) get_customer_id_for_user, current_portal_customer_id e is_internal_member
--    siguen SECURITY DEFINER (participan en policies y no deben recursar) pero
--    fallan cerrado: solo responden por auth.uid() y dentro de la organizacion
--    del contexto actual, sin LIMIT 1 arbitrario.

-- 1. SECURITY INVOKER
ALTER FUNCTION public.assert_invoice_cancellable(uuid) SECURITY INVOKER;
ALTER FUNCTION public.audit_fleet_status_consistency() SECURITY INVOKER;
ALTER FUNCTION public.damage_restore_forklift_status(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.get_my_feedback_points_total() SECURITY INVOKER;
ALTER FUNCTION public.has_active_rental(uuid) SECURITY INVOKER;
ALTER FUNCTION public.has_open_rental(uuid) SECURITY INVOKER;

-- 2. Leaderboard acotado a la organizacion del invocante
CREATE OR REPLACE FUNCTION public.get_feedback_leaderboard(_period text DEFAULT 'all'::text)
 RETURNS TABLE(reporter_id uuid, reporter_name text, total_reports bigint, accepted_reports bigint, resolved_reports bigint, total_points bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_is_customer boolean;
  v_uid uuid := (SELECT auth.uid());
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sin contexto de empresa' USING ERRCODE = '42501';
  END IF;

  v_start := CASE _period
    WHEN 'month' THEN date_trunc('month', now())
    WHEN 'year' THEN date_trunc('year', now())
    ELSE '1970-01-01'::timestamptz
  END;

  v_is_customer := has_role(v_uid, 'customer'::app_role);

  RETURN QUERY
  SELECT
    CASE WHEN v_is_customer THEN NULL::uuid ELSE fr.reporter_id END AS reporter_id,
    CASE
      WHEN v_is_customer AND fr.reporter_type <> 'customer' THEN 'Equipo LiftGo'
      ELSE COALESCE(MAX(fr.reporter_name), 'Anónimo')
    END AS reporter_name,
    COUNT(*)::bigint AS total_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('accepted','in_progress','resolved','closed'))::bigint AS accepted_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('resolved','closed'))::bigint AS resolved_reports,
    COALESCE(SUM(fr.points_awarded), 0)::bigint AS total_points
  FROM public.feedback_reports fr
  WHERE fr.created_at >= v_start
    AND fr.organization_id = v_org
  GROUP BY fr.reporter_id, fr.reporter_type, (CASE WHEN v_is_customer AND fr.reporter_type <> 'customer' THEN 'staff' ELSE 'self' END)
  HAVING COALESCE(SUM(fr.points_awarded), 0) > 0
  ORDER BY total_points DESC, resolved_reports DESC
  LIMIT 50;
END;
$function$;

-- 3. get_customer_id_for_user: solo el propio usuario y su empresa
CREATE OR REPLACE FUNCTION public.get_customer_id_for_user(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Fail closed: exactamente una cuenta activa del propio usuario dentro de la
  -- organizacion del contexto. Cero o varias coincidencias devuelven NULL.
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(a.customer_id))[1] END
  FROM public.customer_portal_accounts a
  WHERE p_user_id IS NOT NULL
    AND ((SELECT auth.uid()) IS NULL OR p_user_id = (SELECT auth.uid()))
    AND a.auth_user_id = p_user_id
    AND a.status = 'active'
    AND (
      CASE
        WHEN (SELECT auth.uid()) IS NULL THEN true
        ELSE a.organization_id = public.current_organization_id()
      END
    )
$function$;

-- 4. current_portal_customer_id: usuario + organizacion, sin LIMIT arbitrario
CREATE OR REPLACE FUNCTION public.current_portal_customer_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(a.customer_id))[1] END
  FROM public.customer_portal_accounts a
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND a.auth_user_id = (SELECT auth.uid())
    AND a.status = 'active'
    AND a.organization_id = public.current_organization_id()
$function$;

-- 5. is_internal_member: no es oraculo de membresia ajena
CREATE OR REPLACE FUNCTION public.is_internal_member(_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.auth_user_id = COALESCE(_user_id, (SELECT auth.uid()))
      AND m.member_type = 'internal'
      AND (
        _user_id IS NULL
        OR (SELECT auth.uid()) IS NULL
        OR _user_id = (SELECT auth.uid())
      )
      AND (
        CASE
          WHEN (SELECT auth.uid()) IS NULL THEN true
          ELSE m.organization_id = public.current_internal_organization_id()
        END
      )
  )
$function$;

-- 6. ACL: nada para PUBLIC ni anon
REVOKE ALL ON FUNCTION public.get_feedback_leaderboard(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_id_for_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_portal_customer_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_internal_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_invoice_cancellable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_fleet_status_consistency() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.damage_restore_forklift_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_feedback_points_total() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_rental(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_open_rental(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_feedback_leaderboard(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_id_for_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_portal_customer_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_internal_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_invoice_cancellable(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_fleet_status_consistency() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.damage_restore_forklift_status(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_feedback_points_total() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_rental(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_open_rental(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_customer_id_for_user(uuid) IS
  'Multiempresa 0039: solo resuelve el cliente del propio auth.uid() dentro de current_organization_id(); falla cerrado ante cero o multiples coincidencias.';
COMMENT ON FUNCTION public.current_portal_customer_id() IS
  'Multiempresa 0039: cliente del portal ligado a auth.uid(), cuenta activa y current_organization_id(); sin LIMIT 1 arbitrario.';
COMMENT ON FUNCTION public.is_internal_member(uuid) IS
  'Multiempresa 0039: solo responde por el propio auth.uid() y dentro de current_internal_organization_id().';
