-- Incorporación durable. Identidad Auth preasignada: los reintentos nunca
-- adoptan usuarios por correo ni eliminan recursos tras resultados inciertos.
CREATE TABLE public.platform_onboarding_requests (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id),
  admin_user_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  admin_email text NOT NULL UNIQUE CHECK (length(admin_email) BETWEEN 3 AND 254),
  admin_full_name text NOT NULL CHECK (length(admin_full_name) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.platform_onboarding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_onboarding_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY "platform onboarding denies client access"
  ON public.platform_onboarding_requests AS RESTRICTIVE FOR ALL
  TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON public.platform_onboarding_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.platform_onboarding_requests TO service_role;

CREATE FUNCTION public.platform_onboarding_view(p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'request_id', r.request_id, 'organization_id', r.organization_id,
    'admin_user_id', r.admin_user_id, 'name', r.name, 'slug', r.slug,
    'admin_email', r.admin_email, 'admin_full_name', r.admin_full_name,
    'created_at', r.created_at,
    'stage', CASE WHEN r.completed_at IS NOT NULL THEN 'complete'
      WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.admin_user_id
        AND u.raw_app_meta_data->>'platform_onboarding_request_id' = r.request_id::text
        AND u.raw_app_meta_data->>'organization_id' = r.organization_id::text
        AND lower(u.email) = r.admin_email) THEN 'admin_pending'
      ELSE 'auth_pending' END)
  FROM public.platform_onboarding_requests r WHERE r.request_id = p_request_id
$$;
REVOKE ALL ON FUNCTION public.platform_onboarding_view(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.platform_begin_onboarding(
  p_actor uuid, p_request_id uuid, p_name text, p_slug text,
  p_admin_email text, p_admin_full_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.platform_onboarding_requests%ROWTYPE;
  v_name text := btrim(p_name);
  v_slug text := lower(btrim(p_slug));
  v_email text := lower(btrim(p_admin_email));
  v_full_name text := btrim(p_admin_full_name);
  v_org uuid;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF p_request_id IS NULL OR v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 120
    OR v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    OR v_email IS NULL OR length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR v_full_name IS NULL OR length(v_full_name) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Datos de incorporación inválidos' USING ERRCODE = '22023';
  END IF;
  -- Serializa la misma clave sin mantener locks durante la llamada a Auth.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 89));
  SELECT * INTO v_row FROM public.platform_onboarding_requests WHERE request_id = p_request_id;
  IF FOUND THEN
    IF (v_row.name, v_row.slug, v_row.admin_email, v_row.admin_full_name)
      IS DISTINCT FROM (v_name, v_slug, v_email, v_full_name) THEN
      RAISE EXCEPTION 'La solicitud ya está registrada con otros datos' USING ERRCODE = '23505';
    END IF;
    RETURN public.platform_onboarding_view(p_request_id);
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Ya existe un usuario con ese correo' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_onboarding_requests WHERE admin_email = v_email) THEN
    RAISE EXCEPTION 'Ya existe un alta pendiente con ese correo; reanúdala' USING ERRCODE = '23505';
  END IF;
  PERFORM set_config('app.platform_request_id', p_request_id::text, true);
  v_org := public.platform_create_organization(p_actor, v_name, v_slug);
  INSERT INTO public.platform_onboarding_requests
    (request_id, organization_id, created_by, name, slug, admin_email, admin_full_name)
  VALUES (p_request_id, v_org, p_actor, v_name, v_slug, v_email, v_full_name);
  RETURN public.platform_onboarding_view(p_request_id);
END;
$$;

CREATE FUNCTION public.platform_get_onboarding(p_actor uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job jsonb;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  v_job := public.platform_onboarding_view(p_request_id);
  IF v_job IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'P0002'; END IF;
  RETURN v_job;
END;
$$;

CREATE FUNCTION public.platform_list_pending_onboarding(p_actor uuid, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Paginación inválida' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('total', (SELECT count(*) FROM public.platform_onboarding_requests WHERE completed_at IS NULL),
    'jobs', coalesce((SELECT jsonb_agg(public.platform_onboarding_view(r.request_id) ORDER BY r.created_at, r.request_id)
      FROM (SELECT request_id, created_at FROM public.platform_onboarding_requests
        WHERE completed_at IS NULL ORDER BY created_at, request_id LIMIT 20 OFFSET p_offset) r), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.platform_finish_onboarding(p_actor uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.platform_onboarding_requests%ROWTYPE;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  SELECT * INTO v_row FROM public.platform_onboarding_requests WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'P0002'; END IF;
  -- La base vuelve a comprobar identidad y metadata controlada por el servidor.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_row.admin_user_id
    AND lower(u.email) = v_row.admin_email AND u.deleted_at IS NULL
    AND u.raw_app_meta_data->>'organization_id' = v_row.organization_id::text
    AND u.raw_app_meta_data->>'platform_onboarding_request_id' = v_row.request_id::text) THEN
    RAISE EXCEPTION 'La identidad del administrador no coincide con el alta' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.platform_request_id', p_request_id::text, true);
  IF v_row.completed_at IS NULL THEN
    PERFORM set_config('app.platform_onboarding_finalize', p_request_id::text, true);
    PERFORM public.platform_attach_first_admin(p_actor, v_row.organization_id, v_row.admin_user_id);
    UPDATE public.profiles SET full_name = v_row.admin_full_name, email = v_row.admin_email
      WHERE user_id = v_row.admin_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Falta el perfil del administrador' USING ERRCODE = '23514'; END IF;
    UPDATE public.platform_onboarding_requests SET completed_at = now() WHERE request_id = p_request_id;
    PERFORM set_config('app.platform_onboarding_finalize', '', true);
  END IF;
  -- Un replay no reactiva una empresa suspendida ni restaura un rol revocado.
  IF NOT EXISTS (SELECT 1 FROM public.organizations o
    JOIN public.organization_memberships m ON m.organization_id = o.id
    JOIN public.user_roles ur ON ur.user_id = m.auth_user_id
    JOIN public.profiles p ON p.user_id = m.auth_user_id
    WHERE o.id = v_row.organization_id AND o.is_active AND m.auth_user_id = v_row.admin_user_id
      AND m.member_type = 'internal' AND ur.role = 'admin' AND p.is_active) THEN
    RAISE EXCEPTION 'El acceso del administrador requiere revisión' USING ERRCODE = '42501';
  END IF;
  RETURN public.platform_onboarding_view(p_request_id);
END;
$$;

CREATE FUNCTION public.guard_pending_platform_onboarding_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_request uuid;
BEGIN
  IF NEW.is_active AND NOT OLD.is_active THEN
    SELECT request_id INTO v_request FROM public.platform_onboarding_requests
      WHERE organization_id = NEW.id AND completed_at IS NULL;
    IF FOUND AND current_setting('app.platform_onboarding_finalize', true) IS DISTINCT FROM v_request::text THEN
      RAISE EXCEPTION 'Completa el alta pendiente antes de activar la empresa' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_pending_platform_onboarding_activation BEFORE UPDATE OF is_active ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.guard_pending_platform_onboarding_activation();
REVOKE ALL ON FUNCTION public.guard_pending_platform_onboarding_activation() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_begin_onboarding(uuid, uuid, text, text, text, text),
  public.platform_get_onboarding(uuid, uuid), public.platform_list_pending_onboarding(uuid, integer),
  public.platform_finish_onboarding(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_begin_onboarding(uuid, uuid, text, text, text, text),
  public.platform_get_onboarding(uuid, uuid), public.platform_list_pending_onboarding(uuid, integer),
  public.platform_finish_onboarding(uuid, uuid) TO service_role;
