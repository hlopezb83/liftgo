-- Baja atómica de personal interno: fija app.organization_id y borra filas
-- públicas + la cuenta Auth en UNA transacción, para que auditoría, cascadas y
-- ON DELETE SET NULL tengan contexto de empresa con 2+ empresas activas.
-- Sólo service_role (servidor). Fail-closed.
CREATE OR REPLACE FUNCTION public.discard_internal_user(
  p_caller_id uuid,
  p_user_id uuid,
  p_organization_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_caller_id IS NULL OR p_user_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos' USING ERRCODE = '22023';
  END IF;
  IF p_caller_id = p_user_id THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia cuenta' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    JOIN public.user_roles r ON r.user_id = m.auth_user_id AND r.role = 'admin'::public.app_role
    WHERE m.auth_user_id = p_caller_id AND m.organization_id = p_organization_id
      AND m.member_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'El solicitante no administra esta empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.auth_user_id = p_user_id AND m.organization_id = p_organization_id
      AND m.member_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'Usuario fuera de la empresa' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships m
             WHERE m.auth_user_id = p_user_id AND m.organization_id <> p_organization_id) THEN
    RAISE EXCEPTION 'El usuario pertenece también a otra empresa' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_operators po WHERE po.auth_user_id = p_user_id) THEN
    RAISE EXCEPTION 'No se puede eliminar a un operador de plataforma' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.organization_id', p_organization_id::text, true);

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE user_id = p_user_id;
  DELETE FROM public.organization_memberships WHERE auth_user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.discard_internal_user(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_internal_user(uuid, uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.discard_internal_user(uuid, uuid, uuid) IS
  'Baja atómica de personal interno con contexto de empresa (server-only).';