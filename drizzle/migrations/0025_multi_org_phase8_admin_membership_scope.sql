-- =====================================================================
-- Multi-organizacion . Fase 8 (tramo 5): administracion, roles y funciones
-- privilegiadas acotadas a la organizacion verificada.
--
-- Hallazgos que corrige:
--  1. `profiles` y `user_roles` solo se filtraban por rol: un admin de A veia
--     y editaba miembros de B en cuanto exista una segunda organizacion.
--  2. `current_organization_id()` tomaba la primera membresia con LIMIT 1.
--  3. `is_ops_staff()` no exigia membresia interna: una cuenta de portal con
--     rol operativo residual pasaba los filtros internos.
--  4. `update_user_role_safe` y `assert_not_last_admin` contaban admins
--     globalmente y no verificaban que el objetivo fuera de la organizacion
--     del llamante.
--
-- No se agregan columnas nuevas ni se rompe el esquema: la organizacion de un
-- usuario se deriva de `organization_memberships` (UNIQUE auth_user_id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Helpers de contexto (fail-closed, search_path fijo)
-- ---------------------------------------------------------------------

-- Sin membresia unica no hay organizacion: NULL en vez de "la primera".
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN count(*) = 1 THEN (array_agg(m.organization_id))[1]
    ELSE NULL
  END
  FROM public.organization_memberships m
  WHERE m.auth_user_id = (SELECT auth.uid())
$$;

COMMENT ON FUNCTION public.current_organization_id() IS
  'Organizacion de la sesion derivada de organization_memberships. NULL si no hay exactamente una membresia (nunca una arbitraria).';

CREATE OR REPLACE FUNCTION public.is_internal_member(_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.auth_user_id = COALESCE(_user_id, (SELECT auth.uid()))
      AND m.member_type = 'internal'
  )
$$;

COMMENT ON FUNCTION public.is_internal_member(uuid) IS
  'True solo si el usuario tiene membresia interna. Una cuenta de portal nunca alcanza superficies internas.';

CREATE OR REPLACE FUNCTION public.user_in_current_organization(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND public.current_organization_id() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.organization_memberships m
       WHERE m.auth_user_id = _user_id
         AND m.organization_id = public.current_organization_id()
     )
$$;

COMMENT ON FUNCTION public.user_in_current_organization(uuid) IS
  'Fail-closed: el usuario objetivo comparte la organizacion de la sesion. Base de las policies de profiles y user_roles.';

CREATE OR REPLACE FUNCTION public.is_ops_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_internal_member((SELECT auth.uid()))
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = (SELECT auth.uid())
         AND ur.role = ANY (ARRAY['admin', 'administrativo', 'dispatcher', 'mechanic']::public.app_role[])
     )
$$;

REVOKE ALL ON FUNCTION public.is_internal_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_in_current_organization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_internal_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_in_current_organization(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. RLS de `profiles`: propio perfil o miembro de la misma organizacion
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;
CREATE POLICY "Staff can view org profiles" ON public.profiles
FOR SELECT TO authenticated
USING (public.is_ops_staff() AND public.user_in_current_organization(user_id));

DROP POLICY IF EXISTS "Auditor read profiles" ON public.profiles;
CREATE POLICY "Auditor read org profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'auditor'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
);

DROP POLICY IF EXISTS "Ventas read profiles" ON public.profiles;
CREATE POLICY "Ventas read org profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'ventas'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
);

DROP POLICY IF EXISTS "Admins update any profile" ON public.profiles;
CREATE POLICY "Admins update org profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
);

DROP POLICY IF EXISTS "Administrativo update any profile" ON public.profiles;
CREATE POLICY "Administrativo update org profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'administrativo'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'administrativo'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
);

-- El propio perfil sigue siendo legible y editable por su dueno
-- ("Users can view own profile" / "Users can update own profile" intactas).

-- ---------------------------------------------------------------------
-- 3. RLS de `user_roles`: administracion solo dentro de la organizacion
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

DROP POLICY IF EXISTS "Only admins can modify roles" ON public.user_roles;
CREATE POLICY "Admins insert org roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
);

DROP POLICY IF EXISTS "Only admins can update roles" ON public.user_roles;
CREATE POLICY "Admins update org roles" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
);

DROP POLICY IF EXISTS "Only admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins delete org roles" ON public.user_roles
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
);

DROP POLICY IF EXISTS "Admins read org roles" ON public.user_roles;
CREATE POLICY "Admins read org roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  public.is_ops_staff()
  AND public.user_in_current_organization(user_id)
);

DROP POLICY IF EXISTS "Auditor read user_roles" ON public.user_roles;
CREATE POLICY "Auditor read org user_roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'auditor'::app_role)
  AND public.is_internal_member((SELECT auth.uid()))
  AND public.user_in_current_organization(user_id)
);

-- "Users can view own roles" se conserva: cada quien lee su propio rol.

-- ---------------------------------------------------------------------
-- 4. Funciones privilegiadas de roles acotadas a la organizacion
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_not_last_admin(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org uuid;
  v_is_admin boolean;
  v_admin_count integer;
BEGIN
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id_required';
  END IF;

  SELECT m.organization_id INTO v_org
    FROM public.organization_memberships m
   WHERE m.auth_user_id = _target_user_id;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
    FROM public.user_roles ur
    JOIN public.organization_memberships m ON m.auth_user_id = ur.user_id
   WHERE ur.role = 'admin'::app_role
     AND m.organization_id = v_org
   FOR UPDATE OF ur;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _target_user_id
       AND role = 'admin'::app_role
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_admin_count
    FROM public.user_roles ur
    JOIN public.organization_memberships m ON m.auth_user_id = ur.user_id
   WHERE ur.role = 'admin'::app_role
     AND m.organization_id = v_org;

  IF v_admin_count <= 1 THEN
    RAISE EXCEPTION 'LAST_ADMIN_CANNOT_BE_DELETED'
      USING HINT = 'no puedes eliminar al ultimo administrador de la empresa.';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_role_safe(_target_user_id uuid, _new_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_org uuid;
  v_target_org uuid;
  v_was_admin boolean;
  v_admin_count integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _target_user_id IS NULL THEN RAISE EXCEPTION 'target_user_id_required'; END IF;

  -- Autorizacion ANTES de cualquier lectura de datos del objetivo.
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: solo administradores pueden cambiar roles';
  END IF;
  IF NOT public.is_internal_member(v_caller) THEN
    RAISE EXCEPTION 'forbidden: solo personal interno puede cambiar roles';
  END IF;

  SELECT m.organization_id INTO v_org
    FROM public.organization_memberships m
   WHERE m.auth_user_id = v_caller
     AND m.member_type = 'internal';

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'forbidden: sin organizacion verificada';
  END IF;

  SELECT m.organization_id INTO v_target_org
    FROM public.organization_memberships m
   WHERE m.auth_user_id = _target_user_id;

  -- Ausencia y pertenencia ajena comparten mensaje: no se filtra si existe.
  IF v_target_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'not_found: el usuario no pertenece a tu empresa';
  END IF;

  PERFORM 1
    FROM public.user_roles ur
    JOIN public.organization_memberships m ON m.auth_user_id = ur.user_id
   WHERE ur.role = 'admin'::app_role
     AND m.organization_id = v_org
   FOR UPDATE OF ur;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _target_user_id AND role = 'admin'::app_role
  ) INTO v_was_admin;

  IF v_was_admin AND _new_role <> 'admin'::app_role THEN
    SELECT count(*)::int INTO v_admin_count
      FROM public.user_roles ur
      JOIN public.organization_memberships m ON m.auth_user_id = ur.user_id
     WHERE ur.role = 'admin'::app_role
       AND m.organization_id = v_org;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN_CANNOT_BE_DEMOTED'
        USING HINT = 'no puedes degradar al ultimo administrador de la empresa.';
    END IF;
  END IF;

  UPDATE public.user_roles SET role = _new_role WHERE user_id = _target_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, _new_role);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_user_role_safe(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_role_safe(uuid, app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_not_last_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_not_last_admin(uuid) TO service_role;

COMMENT ON FUNCTION public.update_user_role_safe(uuid, app_role) IS
  'Cambia el rol solo si el llamante es admin interno y el objetivo pertenece a su organizacion. El invariante del ultimo admin se evalua por organizacion.';
COMMENT ON FUNCTION public.assert_not_last_admin(uuid) IS
  'Invariante del ultimo administrador evaluado dentro de la organizacion del usuario objetivo.';
