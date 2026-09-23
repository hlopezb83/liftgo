-- Alta atómica de personal interno: membresía + rol + perfil en UNA transacción
-- con app.organization_id fijado, para que audit_logs y los guardas multiempresa
-- tengan contexto. Sólo service_role (servidor) puede ejecutar. Fail-closed.
CREATE OR REPLACE FUNCTION public.provision_invited_internal_user(
  p_caller_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_role public.app_role,
  p_full_name text,
  p_email text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meta_org text;
BEGIN
  IF p_caller_id IS NULL OR p_user_id IS NULL OR p_organization_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos' USING ERRCODE = '22023';
  END IF;
  IF p_role = 'customer'::public.app_role THEN
    RAISE EXCEPTION 'Rol no permitido para personal interno' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id AND o.is_active) THEN
    RAISE EXCEPTION 'Empresa inexistente o inactiva' USING ERRCODE = '23514';
  END IF;
  -- El administrador que invita debe ser admin interno de ESA empresa.
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    JOIN public.user_roles r ON r.user_id = m.auth_user_id AND r.role = 'admin'::public.app_role
    WHERE m.auth_user_id = p_caller_id AND m.organization_id = p_organization_id
      AND m.member_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'El solicitante no administra esta empresa' USING ERRCODE = '42501';
  END IF;
  -- La empresa del invitado sale sólo de app_metadata (canal server-only).
  SELECT NULLIF(btrim(coalesce(u.raw_app_meta_data->>'organization_id', '')), '')
  INTO v_meta_org FROM auth.users u WHERE u.id = p_user_id;
  IF v_meta_org IS NULL OR v_meta_org <> p_organization_id::text THEN
    RAISE EXCEPTION 'La empresa del usuario no coincide con app_metadata' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships m
             WHERE m.auth_user_id = p_user_id AND m.organization_id <> p_organization_id) THEN
    RAISE EXCEPTION 'El usuario ya pertenece a otra empresa' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.organization_id', p_organization_id::text, true);

  INSERT INTO public.organization_memberships (auth_user_id, organization_id, member_type)
  VALUES (p_user_id, p_organization_id, 'internal')
  ON CONFLICT (auth_user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (p_user_id, p_full_name, lower(p_email))
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;
END;
$function$;

-- Compensación: borra filas públicas con contexto de empresa (audit_logs lo
-- exige) para que después auth.admin.deleteUser no falle en cascada.
CREATE OR REPLACE FUNCTION public.discard_invited_internal_user(
  p_user_id uuid,
  p_organization_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id
                 AND u.raw_app_meta_data->>'organization_id' = p_organization_id::text) THEN
    RAISE EXCEPTION 'Usuario fuera de la empresa' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.organization_id', p_organization_id::text, true);
  DELETE FROM public.organization_memberships WHERE auth_user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE user_id = p_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_invited_internal_user(uuid, uuid, uuid, public.app_role, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discard_invited_internal_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_invited_internal_user(uuid, uuid, uuid, public.app_role, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.discard_invited_internal_user(uuid, uuid) TO service_role;