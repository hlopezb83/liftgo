-- Permisos específicos de plataforma. No modifica membresías ni permisos empresariales.
-- Los operadores explícitos existentes conservan su autoridad como raíz.
ALTER TABLE public.platform_operators
  ADD COLUMN access_profile text NOT NULL DEFAULT 'root'
    CHECK (access_profile IN ('root','organizations','catalogs','support','observer')),
  ADD COLUMN permission_revision bigint NOT NULL DEFAULT 1 CHECK (permission_revision > 0);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.platform_operators FROM service_role;

CREATE FUNCTION public.platform_profile_capabilities(p_profile text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_profile
    WHEN 'root' THEN ARRAY['organizations.read','organizations.details','organizations.create',
      'organizations.suspend','organizations.resume','catalogs.read','catalogs.write','catalogs.import',
      'templates.read','templates.publish','templates.assign','templates.import','audit.read',
      'operators.read','operators.manage']
    WHEN 'organizations' THEN ARRAY['organizations.read','organizations.details','organizations.create',
      'organizations.suspend','organizations.resume']
    WHEN 'catalogs' THEN ARRAY['catalogs.read','catalogs.write','catalogs.import',
      'templates.read','templates.publish','templates.assign','templates.import']
    WHEN 'support' THEN ARRAY['organizations.read','catalogs.read']
    WHEN 'observer' THEN ARRAY['organizations.read','catalogs.read','templates.read','audit.read']
    ELSE ARRAY[]::text[] END
$$;
REVOKE ALL ON FUNCTION public.platform_profile_capabilities(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_platform_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT jsonb_build_object('isOperator',true,
    'profile',po.access_profile,'revision',po.permission_revision::text,
    'capabilities',public.platform_profile_capabilities(po.access_profile))
    FROM public.platform_operators po JOIN public.profiles p ON p.user_id=po.auth_user_id
    WHERE po.auth_user_id=auth.uid() AND p.is_active),
    jsonb_build_object('isOperator',false,'profile',null,'revision',null,'capabilities','[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.get_platform_access() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_access() TO authenticated;

CREATE FUNCTION public.has_platform_capability(p_capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.platform_operators po
    JOIN public.profiles p ON p.user_id=po.auth_user_id
    WHERE po.auth_user_id=auth.uid() AND p.is_active
      AND p_capability = ANY(public.platform_profile_capabilities(po.access_profile)))
$$;
REVOKE ALL ON FUNCTION public.has_platform_capability(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.has_platform_capability(text) TO authenticated;

CREATE FUNCTION public.assert_platform_capability(p_actor uuid,p_capability text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.platform_operators po
    JOIN public.profiles p ON p.user_id=po.auth_user_id
    WHERE po.auth_user_id=p_actor AND p.is_active
      AND p_capability = ANY(public.platform_profile_capabilities(po.access_profile))) THEN
    RAISE EXCEPTION 'Forbidden: capacidad de plataforma requerida: %',p_capability USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.platform_actor',p_actor::text,true);
  IF nullif(current_setting('app.platform_request_id',true),'') IS NULL THEN
    PERFORM set_config('app.platform_request_id',gen_random_uuid()::text,true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_platform_capability(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_platform_capability(uuid,text) TO service_role;

-- Los caminos legacy no clasificados permanecen limitados al raíz.
CREATE OR REPLACE FUNCTION public.assert_platform_operator(p_actor uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'operators.manage');
END $$;

-- Una fila modificada serializa cambios de autoridad incluso en REPEATABLE READ:
-- las transacciones con snapshot anterior fallan por serialización.
CREATE TABLE public.platform_operator_guard (
  id smallint PRIMARY KEY CHECK (id=1),
  revision bigint NOT NULL DEFAULT 1
);
INSERT INTO public.platform_operator_guard(id) VALUES(1);
ALTER TABLE public.platform_operator_guard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_operator_guard FORCE ROW LEVEL SECURITY;
CREATE POLICY "platform operator guard denies clients" ON public.platform_operator_guard
  AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.platform_operator_guard FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.platform_operator_guard TO service_role;

CREATE FUNCTION public.lock_platform_operator_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='TRUNCATE' THEN
    RAISE EXCEPTION 'Los accesos de plataforma no admiten TRUNCATE' USING ERRCODE='42501';
  END IF;
  UPDATE public.platform_operator_guard SET revision=revision+1 WHERE id=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo verificar la protección del raíz' USING ERRCODE='42501'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.lock_platform_operator_changes() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER platform_operator_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
  ON public.platform_operators FOR EACH STATEMENT EXECUTE FUNCTION public.lock_platform_operator_changes();
CREATE TRIGGER platform_profile_access_lock BEFORE UPDATE OF is_active,user_id ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_platform_operator_changes();
CREATE TRIGGER platform_profile_delete_lock BEFORE DELETE OR TRUNCATE ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_platform_operator_changes();
CREATE TRIGGER platform_auth_delete_lock BEFORE DELETE OR TRUNCATE ON auth.users
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_platform_operator_changes();

CREATE FUNCTION public.protect_platform_root()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_removing boolean; v_root boolean;
BEGIN
  IF TG_TABLE_NAME='platform_operators' THEN
    IF TG_OP='INSERT' THEN
      SELECT revision INTO NEW.permission_revision FROM public.platform_operator_guard WHERE id=1;
      RETURN NEW;
    END IF;
    v_user:=OLD.auth_user_id;
    v_root:=OLD.access_profile='root' AND EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_user AND is_active);
    v_removing:=TG_OP='DELETE';
    IF TG_OP='UPDATE' THEN
      IF NEW.auth_user_id<>OLD.auth_user_id THEN RAISE EXCEPTION 'La identidad del operador no se puede cambiar' USING ERRCODE='42501'; END IF;
      v_removing:=NEW.access_profile<>'root';
      SELECT revision INTO NEW.permission_revision FROM public.platform_operator_guard WHERE id=1;
    END IF;
  ELSIF TG_TABLE_SCHEMA='auth' THEN
    -- Verificar antes de las cascadas: el orden de borrado de perfiles y
    -- asignaciones no debe permitir eludir la protección del último raíz.
    v_user:=OLD.id;
    v_root:=EXISTS(SELECT 1 FROM public.platform_operators po
      JOIN public.profiles p ON p.user_id=po.auth_user_id
      WHERE po.auth_user_id=v_user AND po.access_profile='root' AND p.is_active);
    v_removing:=true;
  ELSE
    v_user:=OLD.user_id;
    v_root:=OLD.is_active AND EXISTS(SELECT 1 FROM public.platform_operators WHERE auth_user_id=v_user AND access_profile='root');
    v_removing:=TG_OP='DELETE';
    IF TG_OP='UPDATE' THEN v_removing:=NEW.is_active IS DISTINCT FROM true OR NEW.user_id<>OLD.user_id; END IF;
  END IF;
  IF v_root AND v_removing AND NOT EXISTS(
    SELECT 1 FROM public.platform_operators po JOIN public.profiles p ON p.user_id=po.auth_user_id
    WHERE po.access_profile='root' AND p.is_active AND po.auth_user_id<>v_user
  ) THEN
    RAISE EXCEPTION 'Debe permanecer al menos un operador raíz activo' USING ERRCODE='42501';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.protect_platform_root() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER platform_operator_root_protection BEFORE INSERT OR UPDATE OR DELETE ON public.platform_operators
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_root();
CREATE TRIGGER platform_profile_root_protection BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_root();
CREATE TRIGGER platform_auth_root_protection BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_root();

-- Registra perfil y revisión, sin notas ni metadata arbitraria.
CREATE OR REPLACE FUNCTION public.platform_audit_safe_state(p_row jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
  FROM jsonb_each(coalesce(p_row,'{}'::jsonb))
  WHERE key=ANY(ARRAY['name','slug','is_active','manufacturer','model','sku','capacity_kg',
    'mast_height_m','fuel_type','definition_id','version_id','current_version_id','version',
    'checksum_sha256','document_type','part_catalog_id','equipment_model_catalog_id',
    'auth_user_id','access_profile','permission_revision'])
$$;

-- Las redefiniciones siguientes conservan cuerpo, firma y ACL de cada RPC
-- y sustituyen la autorización global por la capacidad concreta.
CREATE OR REPLACE FUNCTION public.platform_list_organizations(p_actor uuid)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  is_active boolean,
  created_at timestamptz,
  internal_members bigint,
  portal_accounts bigint,
  customers bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'organizations.read');

  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.is_active, o.created_at,
         (SELECT count(*) FROM public.organization_memberships m
           WHERE m.organization_id = o.id AND m.member_type = 'internal'),
         (SELECT count(*) FROM public.customer_portal_accounts a
           WHERE a.organization_id = o.id AND a.status = 'active'),
         (SELECT count(*) FROM public.organization_customers oc
           WHERE oc.organization_id = o.id AND oc.status <> 'archived')
  FROM public.organizations o
  ORDER BY o.created_at, o.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_get_organization_detail(p_actor uuid, p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org public.organizations%ROWTYPE; v_settings public.company_settings%ROWTYPE;
  v_settings_count integer; v_mode text; v_key_configured boolean; v_keys_count integer;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'organizations.details');
  SELECT * INTO v_org FROM public.organizations WHERE id=p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE='P0002'; END IF;
  SELECT count(*) INTO v_settings_count FROM public.company_settings WHERE organization_id=p_organization_id;
  IF v_settings_count=1 THEN
    SELECT * INTO v_settings FROM public.company_settings WHERE organization_id=p_organization_id;
  END IF;
  v_mode := v_settings.facturapi_mode;
  SELECT count(*), coalesce(bool_or(CASE v_mode
      WHEN 'test' THEN left(facturapi_test_key,8)='sk_test_' AND length(facturapi_test_key)>8
      WHEN 'live' THEN left(facturapi_live_key,8)='sk_live_' AND length(facturapi_live_key)>8
      ELSE false END),false)
    INTO v_keys_count,v_key_configured FROM public.billing_secrets WHERE organization_id=p_organization_id;
  RETURN jsonb_build_object(
    'organization', jsonb_build_object('id',v_org.id,'name',v_org.name,'slug',v_org.slug,
      'is_active',v_org.is_active,'created_at',v_org.created_at),
    'can_suspend', NOT EXISTS (SELECT 1 FROM public.organization_memberships
      WHERE auth_user_id=p_actor AND organization_id=p_organization_id),
    'settings', jsonb_build_object('records',v_settings_count,'razon_social',v_settings.razon_social,
      'rfc',v_settings.rfc,'regimen_fiscal',v_settings.regimen_fiscal,'postal_code',v_settings.lugar_expedicion,
      'maintenance_buffer_days',v_settings.maintenance_buffer_days,'updated_at',v_settings.updated_at),
    'billing', jsonb_build_object('mode',v_mode,'key_configured',(v_keys_count=1 AND v_key_configured)),
    'administrators', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',m.auth_user_id,
      'full_name',p.full_name,'email',p.email,'is_active',coalesce(p.is_active,false)) ORDER BY p.full_name,m.auth_user_id)
      FROM public.organization_memberships m JOIN public.user_roles r ON r.user_id=m.auth_user_id AND r.role='admin'
      LEFT JOIN public.profiles p ON p.user_id=m.auth_user_id
      WHERE m.organization_id=p_organization_id AND m.member_type='internal'),'[]'::jsonb),
    'catalogs', jsonb_build_object(
      'models_enabled',(SELECT count(*) FROM public.equipment_models e WHERE e.organization_id=p_organization_id AND e.is_active),
      'global_models_enabled',(SELECT count(*) FROM public.equipment_models e JOIN public.equipment_model_catalog c ON c.id=e.catalog_model_id
        WHERE e.organization_id=p_organization_id AND e.is_active AND c.is_active),
      'parts_enabled',(SELECT count(*) FROM public.parts_inventory i WHERE i.organization_id=p_organization_id AND i.is_active),
      'global_parts_enabled',(SELECT count(*) FROM public.parts_inventory i JOIN public.parts_catalog c ON c.id=i.catalog_part_id
        WHERE i.organization_id=p_organization_id AND i.is_active AND c.is_active)),
    'templates',coalesce((SELECT jsonb_agg(jsonb_build_object('definition_id',d.id,'name',d.name,
        'document_type',d.document_type,'version_id',v.id,'version',v.version,
        'is_active',a.is_active AND d.is_active,'is_current',v.id=d.current_version_id) ORDER BY d.name,d.id)
      FROM public.organization_legal_template_assignments a JOIN public.legal_template_definitions d ON d.id=a.definition_id
      JOIN public.legal_template_versions v ON v.id=a.version_id AND v.definition_id=d.id
      WHERE a.organization_id=p_organization_id),'[]'::jsonb),
    'active_bank_accounts',(SELECT count(*) FROM public.bank_accounts WHERE organization_id=p_organization_id AND is_active),
    'counters',coalesce((SELECT jsonb_agg(jsonb_build_object('document_type',document_type,'next_value',next_value::text) ORDER BY document_type)
      FROM public.organization_document_counters WHERE organization_id=p_organization_id
        AND document_type IN ('quote','contract','booking','delivery','return_inspection','supplier_bill')),'[]'::jsonb),
    'checked_at',statement_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.platform_create_organization(
  p_actor uuid,
  p_name text,
  p_slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'organizations.create');

  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'El nombre de la empresa debe tener entre 2 y 120 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN
    RAISE EXCEPTION 'El identificador (slug) sólo admite minúsculas, dígitos y guiones (2 a 63 caracteres)'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Ya existe una empresa con ese identificador'
      USING ERRCODE = '23505';
  END IF;

  -- Alta incompleta = empresa INACTIVA (pending). Sin primer administrador no
  -- opera nadie, ni por RLS ni por Storage.
  INSERT INTO public.organizations (name, slug, is_active)
  VALUES (v_name, v_slug, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_attach_first_admin(
  p_actor uuid,
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_ok boolean;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'organizations.create');

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND member_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'La empresa ya tiene administradores; usa la invitación normal de usuarios'
      USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE auth_user_id = p_user_id) THEN
    RAISE EXCEPTION 'El usuario ya pertenece a una empresa' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.organization_id', p_organization_id::text, true);

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (p_organization_id, p_user_id, 'internal');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.profiles
  SET is_active = true
  WHERE user_id = p_user_id AND is_active IS DISTINCT FROM true;

  -- Activación dentro de la MISMA transacción, y sólo después de comprobar
  -- que la membresía interna quedó escrita.
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
      AND auth_user_id = p_user_id
      AND member_type = 'internal'
  ) INTO v_membership_ok;

  IF NOT v_membership_ok THEN
    RAISE EXCEPTION 'No se pudo registrar la membresía del primer administrador'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.platform_operation', 'on', true);
  UPDATE public.organizations
  SET is_active = true, updated_at = now()
  WHERE id = p_organization_id AND is_active IS DISTINCT FROM true;
  PERFORM set_config('app.platform_operation', '', true);

  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, source, organization_id)
  SELECT 'organizations', o.id, 'INSERT',
         jsonb_build_object('name', o.name, 'slug', o.slug, 'is_active', o.is_active,
                            'first_admin', p_user_id, 'platform_actor', p_actor),
         p_actor, 'user', o.id
  FROM public.organizations o
  WHERE o.id = p_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_begin_onboarding(
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
  PERFORM public.assert_platform_capability(p_actor,'organizations.create');
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

CREATE OR REPLACE FUNCTION public.platform_get_onboarding(p_actor uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job jsonb;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'organizations.create');
  v_job := public.platform_onboarding_view(p_request_id);
  IF v_job IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'P0002'; END IF;
  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_pending_onboarding(p_actor uuid, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'organizations.create');
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Paginación inválida' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('total', (SELECT count(*) FROM public.platform_onboarding_requests WHERE completed_at IS NULL),
    'jobs', coalesce((SELECT jsonb_agg(public.platform_onboarding_view(r.request_id) ORDER BY r.created_at, r.request_id)
      FROM (SELECT request_id, created_at FROM public.platform_onboarding_requests
        WHERE completed_at IS NULL ORDER BY created_at, request_id LIMIT 20 OFFSET p_offset) r), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_finish_onboarding(p_actor uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.platform_onboarding_requests%ROWTYPE; v_completed_now boolean := false;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'organizations.create');
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
    v_completed_now := true;
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
  RETURN public.platform_onboarding_view(p_request_id) || jsonb_build_object('completed_now', v_completed_now);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_organization_active(
  p_actor uuid, p_organization_id uuid, p_active boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,CASE WHEN p_active THEN 'organizations.resume' ELSE 'organizations.suspend' END);
  PERFORM public.platform_set_organization_active_with_reason(p_actor,p_organization_id,p_active,
    'Cambio mediante integración anterior sin motivo capturado');
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_organization_active_with_reason(
  p_actor uuid, p_organization_id uuid, p_active boolean, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed boolean; v_previous_reason text := current_setting('app.platform_reason',true);
BEGIN
  PERFORM public.assert_platform_capability(p_actor,CASE WHEN p_active THEN 'organizations.resume' ELSE 'organizations.suspend' END);
  IF p_active IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500
    OR p_reason ~* 'sk_(test|live|proj)[_-][A-Za-z0-9]|sb_secret_|Bearer[[:space:]]+[^[:space:]]+|eyJ[A-Za-z0-9_-]{10,}\.' THEN
    RAISE EXCEPTION 'Indica un motivo de entre 5 y 500 caracteres' USING ERRCODE='22023';
  END IF;
  IF NOT p_active AND EXISTS (SELECT 1 FROM public.organization_memberships
    WHERE auth_user_id=p_actor AND organization_id=p_organization_id) THEN
    RAISE EXCEPTION 'No puedes suspender la empresa a la que perteneces' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.platform_operation','on',true);
  PERFORM set_config('app.organization_id',p_organization_id::text,true);
  PERFORM set_config('app.platform_reason',btrim(p_reason),true);
  UPDATE public.organizations SET is_active=p_active, updated_at=now()
    WHERE id=p_organization_id AND is_active IS DISTINCT FROM p_active;
  v_changed := FOUND;
  PERFORM set_config('app.platform_operation','',true);
  PERFORM set_config('app.platform_reason',coalesce(v_previous_reason,''),true);
  IF NOT v_changed THEN
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id=p_organization_id) THEN
      RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE='P0002';
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.audit_logs (table_name,record_id,action,new_data,user_id,source,organization_id)
  VALUES ('organizations',p_organization_id,'UPDATE',
    jsonb_build_object('is_active',p_active,'platform_actor',p_actor),p_actor,'user',p_organization_id);
END $$;

CREATE OR REPLACE FUNCTION public.platform_list_equipment_model_catalog(p_actor uuid)
RETURNS TABLE (
  id uuid,
  manufacturer text,
  model text,
  capacity_kg numeric,
  mast_height_m numeric,
  fuel_type text,
  specifications jsonb,
  image_url text,
  spec_sheet_url text,
  is_active boolean,
  organization_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.read');
  RETURN QUERY
  SELECT c.id, c.manufacturer, c.model, c.capacity_kg, c.mast_height_m,
         c.fuel_type, c.specifications, c.image_url, c.spec_sheet_url,
         c.is_active,
         (SELECT count(DISTINCT m.organization_id)
          FROM public.equipment_models m
          WHERE m.catalog_model_id = c.id AND m.is_active),
         c.created_at, c.updated_at
  FROM public.equipment_model_catalog c
  ORDER BY c.manufacturer, c.model, c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_create_equipment_model_catalog(
  p_actor uuid,
  p_manufacturer text,
  p_model text,
  p_capacity_kg numeric DEFAULT NULL,
  p_mast_height_m numeric DEFAULT NULL,
  p_fuel_type text DEFAULT NULL,
  p_specifications jsonb DEFAULT '{}'::jsonb,
  p_image_url text DEFAULT NULL,
  p_spec_sheet_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  IF nullif(btrim(p_manufacturer), '') IS NULL OR nullif(btrim(p_model), '') IS NULL THEN
    RAISE EXCEPTION 'Fabricante y modelo son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_capacity_kg IS NOT NULL AND p_capacity_kg <= 0 THEN
    RAISE EXCEPTION 'La capacidad debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;
  IF p_mast_height_m IS NOT NULL AND p_mast_height_m <= 0 THEN
    RAISE EXCEPTION 'La altura de mástil debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.equipment_model_catalog (
    manufacturer, model, capacity_kg, mast_height_m, fuel_type,
    specifications, image_url, spec_sheet_url, created_by, updated_by
  ) VALUES (
    btrim(p_manufacturer), btrim(p_model), p_capacity_kg, p_mast_height_m,
    nullif(btrim(p_fuel_type), ''), coalesce(p_specifications, '{}'::jsonb),
    nullif(btrim(p_image_url), ''), nullif(btrim(p_spec_sheet_url), ''),
    p_actor, p_actor
  ) RETURNING equipment_model_catalog.id INTO v_id;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_update_equipment_model_catalog(
  p_actor uuid,
  p_id uuid,
  p_manufacturer text,
  p_model text,
  p_capacity_kg numeric DEFAULT NULL,
  p_mast_height_m numeric DEFAULT NULL,
  p_fuel_type text DEFAULT NULL,
  p_specifications jsonb DEFAULT '{}'::jsonb,
  p_image_url text DEFAULT NULL,
  p_spec_sheet_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  IF nullif(btrim(p_manufacturer), '') IS NULL OR nullif(btrim(p_model), '') IS NULL THEN
    RAISE EXCEPTION 'Fabricante y modelo son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_capacity_kg IS NOT NULL AND p_capacity_kg <= 0 THEN
    RAISE EXCEPTION 'La capacidad debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;
  IF p_mast_height_m IS NOT NULL AND p_mast_height_m <= 0 THEN
    RAISE EXCEPTION 'La altura de mástil debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;

  UPDATE public.equipment_model_catalog
  SET manufacturer = btrim(p_manufacturer), model = btrim(p_model),
      capacity_kg = p_capacity_kg, mast_height_m = p_mast_height_m,
      fuel_type = nullif(btrim(p_fuel_type), ''),
      specifications = coalesce(p_specifications, '{}'::jsonb),
      image_url = nullif(btrim(p_image_url), ''),
      spec_sheet_url = nullif(btrim(p_spec_sheet_url), ''),
      updated_by = p_actor, updated_at = now()
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo global no encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Mantiene las columnas de compatibilidad sincronizadas. Las tarifas,
  -- alias y habilitación local no aparecen en este UPDATE.
  UPDATE public.equipment_models m
  SET manufacturer = c.manufacturer,
      model = c.model,
      default_capacity_kg = c.capacity_kg,
      default_mast_height_m = c.mast_height_m,
      default_fuel_type = coalesce(c.fuel_type, 'Diesel'),
      updated_at = now()
  FROM public.equipment_model_catalog c
  WHERE c.id = p_id AND m.catalog_model_id = c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_set_equipment_model_catalog_active(
  p_actor uuid,
  p_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Se requiere el estado deseado' USING ERRCODE = '22023';
  END IF;
  UPDATE public.equipment_model_catalog
  SET is_active = p_active, updated_by = p_actor, updated_at = now()
  WHERE id = p_id AND is_active IS DISTINCT FROM p_active;
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.equipment_model_catalog WHERE id = p_id
  ) THEN
    RAISE EXCEPTION 'Modelo global no encontrado' USING ERRCODE = 'P0002';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_list_parts_catalog(p_actor uuid)
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  description text,
  manufacturer text,
  oem_numbers text[],
  category text,
  unit_of_measure text,
  image_url text,
  is_active boolean,
  equipment_model_ids uuid[],
  organization_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.read');
  RETURN QUERY
  SELECT c.id, c.sku, c.name, c.description, c.manufacturer,
         c.oem_numbers, c.category, c.unit_of_measure, c.image_url, c.is_active,
         coalesce(array_agg(DISTINCT x.equipment_model_catalog_id)
           FILTER (WHERE x.equipment_model_catalog_id IS NOT NULL), '{}'::uuid[]),
         count(DISTINCT i.organization_id), c.created_at, c.updated_at
  FROM public.parts_catalog c
  LEFT JOIN public.parts_catalog_equipment_models x ON x.part_catalog_id = c.id
  LEFT JOIN public.parts_inventory i ON i.catalog_part_id = c.id AND i.is_active
  GROUP BY c.id
  ORDER BY c.sku, c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_create_parts_catalog(
  p_actor uuid,
  p_sku text,
  p_name text,
  p_description text DEFAULT NULL,
  p_manufacturer text DEFAULT NULL,
  p_oem_numbers text[] DEFAULT '{}'::text[],
  p_category text DEFAULT NULL,
  p_unit_of_measure text DEFAULT 'pieza',
  p_image_url text DEFAULT NULL,
  p_equipment_model_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_missing integer;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  IF nullif(btrim(p_sku), '') IS NULL OR nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'SKU y nombre son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(p_unit_of_measure), '') IS NULL THEN
    RAISE EXCEPTION 'La unidad de medida es obligatoria' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_missing
  FROM unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) model_id
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_model_catalog m WHERE m.id = model_id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Uno o más modelos compatibles no existen' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.parts_catalog (
    sku, name, description, manufacturer, oem_numbers, category,
    unit_of_measure, image_url, created_by, updated_by
  ) VALUES (
    upper(btrim(p_sku)), btrim(p_name), nullif(btrim(p_description), ''),
    nullif(btrim(p_manufacturer), ''), coalesce(p_oem_numbers, '{}'::text[]),
    nullif(btrim(p_category), ''), btrim(p_unit_of_measure),
    nullif(btrim(p_image_url), ''), p_actor, p_actor
  ) RETURNING id INTO v_id;

  INSERT INTO public.parts_catalog_equipment_models (
    part_catalog_id, equipment_model_catalog_id, created_by
  )
  SELECT v_id, model_id, p_actor
  FROM (SELECT DISTINCT unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) AS model_id) ids;

  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_update_parts_catalog(
  p_actor uuid,
  p_id uuid,
  p_sku text,
  p_name text,
  p_description text DEFAULT NULL,
  p_manufacturer text DEFAULT NULL,
  p_oem_numbers text[] DEFAULT '{}'::text[],
  p_category text DEFAULT NULL,
  p_unit_of_measure text DEFAULT 'pieza',
  p_image_url text DEFAULT NULL,
  p_equipment_model_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_missing integer;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  IF nullif(btrim(p_sku), '') IS NULL OR nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'SKU y nombre son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(p_unit_of_measure), '') IS NULL THEN
    RAISE EXCEPTION 'La unidad de medida es obligatoria' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_missing
  FROM unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) model_id
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_model_catalog m WHERE m.id = model_id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Uno o más modelos compatibles no existen' USING ERRCODE = '23503';
  END IF;

  UPDATE public.parts_catalog
  SET sku = upper(btrim(p_sku)), name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      manufacturer = nullif(btrim(p_manufacturer), ''),
      oem_numbers = coalesce(p_oem_numbers, '{}'::text[]),
      category = nullif(btrim(p_category), ''),
      unit_of_measure = btrim(p_unit_of_measure),
      image_url = nullif(btrim(p_image_url), ''),
      updated_by = p_actor, updated_at = now()
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU global no encontrado' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.parts_catalog_equipment_models WHERE part_catalog_id = p_id;
  INSERT INTO public.parts_catalog_equipment_models (
    part_catalog_id, equipment_model_catalog_id, created_by
  )
  SELECT p_id, model_id, p_actor
  FROM (SELECT DISTINCT unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) AS model_id) ids;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_set_parts_catalog_active(
  p_actor uuid,
  p_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Se requiere el estado deseado' USING ERRCODE = '22023';
  END IF;
  UPDATE public.parts_catalog
  SET is_active = p_active, updated_by = p_actor, updated_at = now()
  WHERE id = p_id AND is_active IS DISTINCT FROM p_active;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.parts_catalog WHERE id = p_id) THEN
    RAISE EXCEPTION 'SKU global no encontrado' USING ERRCODE = 'P0002';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_list_legal_templates(p_actor uuid)
RETURNS TABLE (
  id uuid, template_key text, document_type text, name text, description text,
  is_active boolean, current_version_id uuid, current_version integer,
  checksum_sha256 text, content jsonb, change_summary text,
  version_count bigint, assignment_count bigint, active_organization_count bigint,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'templates.read');
  RETURN QUERY
  SELECT d.id, d.template_key, d.document_type, d.name, d.description,
         d.is_active, v.id, v.version, v.checksum_sha256, v.content,
         v.change_summary,
         (SELECT count(*) FROM public.legal_template_versions history
           WHERE history.definition_id = d.id),
         (SELECT count(*) FROM public.organization_legal_template_assignments a
           WHERE a.definition_id = d.id AND a.is_active),
         (SELECT count(*) FROM public.organizations o WHERE o.is_active),
         d.updated_at
  FROM public.legal_template_definitions d
  LEFT JOIN public.legal_template_versions v ON v.id = d.current_version_id
  ORDER BY d.document_type, d.name, d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_legal_template_versions(
  p_actor uuid, p_definition_id uuid
)
RETURNS TABLE (
  id uuid, definition_id uuid, version integer, checksum_sha256 text,
  content jsonb, change_summary text, created_by uuid, created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'templates.read');
  IF NOT EXISTS (SELECT 1 FROM public.legal_template_definitions d WHERE d.id = p_definition_id) THEN
    RAISE EXCEPTION 'Plantilla legal no encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY
  SELECT v.id, v.definition_id, v.version, v.checksum_sha256, v.content,
         v.change_summary, v.created_by, v.created_at
  FROM public.legal_template_versions v
  WHERE v.definition_id = p_definition_id
  ORDER BY v.version DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_legal_template_assignments(
  p_actor uuid, p_definition_id uuid
)
RETURNS TABLE (
  organization_id uuid, organization_name text, organization_slug text,
  organization_is_active boolean, version_id uuid, version integer,
  checksum_sha256 text, local_overrides jsonb, assignment_is_active boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'templates.assign');
  IF NOT EXISTS (SELECT 1 FROM public.legal_template_definitions d WHERE d.id = p_definition_id) THEN
    RAISE EXCEPTION 'Plantilla legal no encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.is_active, a.version_id, v.version,
         v.checksum_sha256, coalesce(a.local_overrides, '{}'::jsonb),
         coalesce(a.is_active, false), a.updated_at
  FROM public.organizations o
  LEFT JOIN public.organization_legal_template_assignments a
    ON a.organization_id = o.id AND a.definition_id = p_definition_id
  LEFT JOIN public.legal_template_versions v ON v.id = a.version_id
  ORDER BY o.is_active DESC, o.name, o.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_publish_legal_template_version(
  p_actor uuid, p_definition_id uuid, p_content jsonb,
  p_change_summary text, p_assign_all_active boolean DEFAULT false
)
RETURNS TABLE (version_id uuid, version integer, checksum_sha256 text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_definition public.legal_template_definitions%ROWTYPE;
  v_version_id uuid;
  v_version integer;
  v_checksum text;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'templates.publish');
  IF btrim(coalesce(p_change_summary, '')) = '' OR length(p_change_summary) > 500 THEN
    RAISE EXCEPTION 'El resumen del cambio debe tener entre 1 y 500 caracteres'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM public.validate_legal_template_content(p_content);

  SELECT * INTO v_definition
  FROM public.legal_template_definitions d
  WHERE d.id = p_definition_id AND d.is_active
  FOR UPDATE;
  IF v_definition.id IS NULL THEN
    RAISE EXCEPTION 'Plantilla legal activa no encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT coalesce(max(v.version), 0) + 1 INTO v_version
  FROM public.legal_template_versions v
  WHERE v.definition_id = p_definition_id;
  v_checksum := encode(extensions.digest(p_content::text, 'sha256'), 'hex');

  INSERT INTO public.legal_template_versions (
    definition_id, version, content, checksum_sha256, change_summary, created_by
  ) VALUES (
    p_definition_id, v_version, p_content, v_checksum, btrim(p_change_summary), p_actor
  ) RETURNING id INTO v_version_id;

  UPDATE public.legal_template_definitions
  SET current_version_id = v_version_id, updated_by = p_actor
  WHERE id = p_definition_id;

  IF p_assign_all_active THEN
    PERFORM public.assert_platform_capability(p_actor,'templates.assign');
    INSERT INTO public.organization_legal_template_assignments (
      organization_id, definition_id, version_id, local_overrides,
      is_active, assigned_by
    )
    SELECT o.id, p_definition_id, v_version_id, '{}'::jsonb, true, p_actor
    FROM public.organizations o
    WHERE o.is_active
    ON CONFLICT (organization_id, definition_id) DO UPDATE
      SET version_id = EXCLUDED.version_id,
          is_active = true,
          assigned_by = EXCLUDED.assigned_by;
  END IF;

  RETURN QUERY SELECT v_version_id, v_version, v_checksum;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_assign_legal_template_version(
  p_actor uuid, p_organization_id uuid, p_definition_id uuid, p_version_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'templates.assign');
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.is_active
  ) THEN
    RAISE EXCEPTION 'Organización activa no encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.legal_template_versions v
    JOIN public.legal_template_definitions d ON d.id = v.definition_id
    WHERE v.id = p_version_id AND v.definition_id = p_definition_id AND d.is_active
  ) THEN
    RAISE EXCEPTION 'Versión legal no encontrada para la plantilla'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.organization_legal_template_assignments (
    organization_id, definition_id, version_id, local_overrides,
    is_active, assigned_by
  ) VALUES (
    p_organization_id, p_definition_id, p_version_id, '{}'::jsonb, true, p_actor
  )
  ON CONFLICT (organization_id, definition_id) DO UPDATE
    SET version_id = EXCLUDED.version_id,
        is_active = true,
        assigned_by = EXCLUDED.assigned_by;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_audit_events(p_actor uuid,p_organization_id uuid DEFAULT NULL,
  p_target_type text DEFAULT NULL,p_before_id bigint DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb; v_more boolean;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'audit.read');
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_before_id IS NOT NULL AND p_before_id<=0) THEN
    RAISE EXCEPTION 'Paginación inválida' USING ERRCODE='22023'; END IF;
  IF p_target_type IS NOT NULL AND p_target_type NOT IN ('organizations','equipment_model_catalog','parts_catalog',
    'parts_catalog_equipment_models','legal_template_definitions','legal_template_versions','organization_legal_template_assignments',
    'platform_operators','platform_catalog_imports') THEN RAISE EXCEPTION 'Tipo de evento inválido' USING ERRCODE='22023'; END IF;
  IF p_organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE='P0002'; END IF;
  WITH page AS (SELECT e.*,row_number() OVER(ORDER BY e.id DESC) AS position FROM public.platform_audit_events e
    WHERE (p_organization_id IS NULL OR e.organization_id=p_organization_id) AND (p_target_type IS NULL OR e.target_type=p_target_type)
      AND (p_before_id IS NULL OR e.id<p_before_id) ORDER BY e.id DESC LIMIT p_limit+1)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'occurred_at',occurred_at,'actor_id',actor_id,'actor_name',actor_name,
    'organization_id',organization_id,'target_type',target_type,'target_id',target_id,'action',action,'reason',reason,'request_id',request_id,
    'changed_fields',changed_fields,'old_state',old_state,'new_state',new_state,'is_legacy',legacy_audit_id IS NOT NULL)
    ORDER BY id DESC) FILTER(WHERE position<=p_limit),'[]'::jsonb),coalesce(bool_or(position>p_limit),false) INTO v_rows,v_more FROM page;
  RETURN jsonb_build_object('events',v_rows,'has_more',v_more);
END $$;

CREATE OR REPLACE FUNCTION public.platform_list_catalog_import_candidates(p_actor uuid,p_kind text,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,CASE WHEN p_kind='template' THEN 'templates.import' ELSE 'catalogs.import' END);
  IF p_kind IS NULL OR p_kind NOT IN ('model','part','template') OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Tipo o paginación inválidos' USING ERRCODE='22023'; END IF;
  WITH ids AS (
    SELECT id FROM public.equipment_models WHERE p_kind='model' AND organization_id=(SELECT source_organization_id FROM public.platform_catalog_import_source) AND NOT is_e2e
    UNION ALL SELECT id FROM public.parts_inventory WHERE p_kind='part' AND organization_id=(SELECT source_organization_id FROM public.platform_catalog_import_source)
    UNION ALL SELECT id FROM public.contract_templates WHERE p_kind='template' AND organization_id=(SELECT source_organization_id FROM public.platform_catalog_import_source)
  ), candidates AS MATERIALIZED (SELECT public.platform_catalog_import_candidate(p_kind,id) AS item FROM ids),
  page AS (SELECT item FROM candidates ORDER BY item->>'title',item->>'source_id' LIMIT 20 OFFSET p_offset)
  SELECT jsonb_build_object('source_organization',(SELECT jsonb_build_object('id',o.id,'name',o.name,'is_active',o.is_active)
      FROM public.platform_catalog_import_source s JOIN public.organizations o ON o.id=s.source_organization_id),
    'total',(SELECT count(*) FROM candidates),
    'pending',(SELECT count(*) FROM candidates WHERE item->>'status' IN ('new','duplicate')),
    'items',coalesce((SELECT jsonb_agg(item-'source'-'match'-'source_checksum'-'fingerprint' ORDER BY item->>'title',item->>'source_id') FROM page),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.platform_get_catalog_import_preview(p_actor uuid,p_kind text,p_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,CASE WHEN p_kind='template' THEN 'templates.import' ELSE 'catalogs.import' END);
  RETURN public.platform_catalog_import_candidate(p_kind,p_source_id);
END $$;

CREATE OR REPLACE FUNCTION public.platform_import_catalog_candidate(p_actor uuid,p_request_id uuid,p_kind text,p_source_id uuid,
  p_fingerprint text,p_resolution text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := (SELECT source_organization_id FROM public.platform_catalog_import_source);
  v_receipt public.platform_catalog_imports%ROWTYPE;
  v_candidate jsonb; v_source jsonb; v_target uuid; v_version uuid; v_locked uuid;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,CASE WHEN p_kind='template' THEN 'templates.import' ELSE 'catalogs.import' END);
  IF p_request_id IS NULL OR p_source_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('model','part','template')
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_resolution IS NULL OR p_resolution NOT IN ('create','reuse')
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500
    OR p_reason ~* 'sk_(test|live|proj)[_-][A-Za-z0-9]|sb_secret_|Bearer[[:space:]]+[^[:space:]]+|eyJ[A-Za-z0-9_-]{10,}\.' THEN
    RAISE EXCEPTION 'Revisión o motivo inválidos' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,90));
  SELECT * INTO v_receipt FROM public.platform_catalog_imports WHERE id=p_request_id;
  IF FOUND THEN
    IF (v_receipt.kind,v_receipt.source_record_id,v_receipt.review_fingerprint,v_receipt.resolution,v_receipt.reason)
      IS DISTINCT FROM (p_kind,p_source_id,p_fingerprint,p_resolution,btrim(p_reason)) THEN
      RAISE EXCEPTION 'La solicitud ya se registró con otra revisión' USING ERRCODE='23505'; END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(p_kind||p_source_id::text,90));
    IF p_kind='model' THEN SELECT id INTO v_locked FROM public.equipment_models WHERE id=p_source_id AND organization_id=v_org AND NOT is_e2e FOR UPDATE;
    ELSIF p_kind='part' THEN SELECT id INTO v_locked FROM public.parts_inventory WHERE id=p_source_id AND organization_id=v_org FOR UPDATE;
    ELSE SELECT id INTO v_locked FROM public.contract_templates WHERE id=p_source_id AND organization_id=v_org FOR UPDATE; END IF;
    IF v_locked IS NULL THEN RAISE EXCEPTION 'Origen no encontrado en Org 1' USING ERRCODE='P0002'; END IF;
    v_candidate := public.platform_catalog_import_candidate(p_kind,p_source_id);
    -- Importaciones distintas con la misma identidad se serializan también.
    -- Los índices únicos siguen protegiendo frente a escritores externos.
    IF p_kind='model' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('model',lower(v_candidate#>>'{source,manufacturer}'),lower(v_candidate#>>'{source,model}'))::text,91));
    ELSIF p_kind='part' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('part'||coalesce(v_candidate#>>'{source,sku}',''),91));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended('template'||lower(v_candidate#>>'{source,name}'),91));
      PERFORM pg_advisory_xact_lock(hashtextextended((v_candidate#>'{source,content}')::text,92));
    END IF;
    v_candidate := public.platform_catalog_import_candidate(p_kind,p_source_id);
    v_target := (v_candidate#>>'{match,id}')::uuid;
    IF v_target IS NOT NULL THEN
      IF p_kind='model' THEN PERFORM 1 FROM public.equipment_model_catalog WHERE id=v_target FOR UPDATE;
      ELSIF p_kind='part' THEN PERFORM 1 FROM public.parts_catalog WHERE id=v_target FOR UPDATE;
      ELSE PERFORM 1 FROM public.legal_template_definitions WHERE id=v_target FOR UPDATE; END IF;
      v_candidate := public.platform_catalog_import_candidate(p_kind,p_source_id);
    END IF;
    IF v_candidate->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN
      RAISE EXCEPTION 'Los datos cambiaron desde la revisión. Actualiza la vista previa.' USING ERRCODE='23505'; END IF;
    IF (p_resolution='create' AND v_candidate->>'status'<>'new') OR (p_resolution='reuse' AND v_candidate->>'status'<>'duplicate') THEN
      RAISE EXCEPTION 'El estado del maestro requiere otra revisión' USING ERRCODE='23505'; END IF;
    PERFORM public.assert_platform_capability(p_actor,CASE WHEN p_kind='template' THEN 'templates.import' ELSE 'catalogs.import' END);
    PERFORM set_config('app.platform_request_id',p_request_id::text,true);
    v_source := v_candidate->'source';
    IF p_resolution='create' THEN
      IF p_kind='model' THEN
        INSERT INTO public.equipment_model_catalog (manufacturer,model,capacity_kg,mast_height_m,fuel_type,source_organization_id,source_record_id,created_by,updated_by)
        VALUES(v_source->>'manufacturer',v_source->>'model',(v_source->>'capacity_kg')::numeric,(v_source->>'mast_height_m')::numeric,
          v_source->>'fuel_type',v_org,p_source_id,p_actor,p_actor) RETURNING id INTO v_target;
      ELSIF p_kind='part' THEN
        INSERT INTO public.parts_catalog (sku,name,category,unit_of_measure,source_organization_id,source_record_id,created_by,updated_by)
        VALUES(v_source->>'sku',v_source->>'name',v_source->>'category','pieza',v_org,p_source_id,p_actor,p_actor) RETURNING id INTO v_target;
      ELSE
        INSERT INTO public.legal_template_definitions (template_key,document_type,name,description,source_organization_id,source_record_id,created_by,updated_by)
        VALUES('rental_contract_'||replace(p_source_id::text,'-',''),'rental_contract',v_source->>'name','Incorporación revisada desde Org 1',v_org,p_source_id,p_actor,p_actor) RETURNING id INTO v_target;
        SELECT version_id INTO v_version FROM public.platform_publish_legal_template_version(p_actor,v_target,v_source->'content',btrim(p_reason),false);
      END IF;
    ELSE v_version := (v_candidate#>>'{match,version_id}')::uuid; END IF;
    INSERT INTO public.platform_catalog_imports (id,kind,source_organization_id,source_record_id,name,target_catalog_id,target_version_id,
      resolution,source_checksum,review_fingerprint,reason,created_by)
    VALUES(p_request_id,p_kind,v_org,p_source_id,v_candidate->>'title',v_target,v_version,p_resolution,
      v_candidate->>'source_checksum',p_fingerprint,btrim(p_reason),p_actor) RETURNING * INTO v_receipt;
  END IF;
  RETURN jsonb_build_object('id',v_receipt.id,'kind',v_receipt.kind,'source_id',v_receipt.source_record_id,
    'target_id',v_receipt.target_catalog_id,'version_id',v_receipt.target_version_id,'resolution',v_receipt.resolution);
END $$;

ALTER POLICY brand_assets_read ON public.brand_assets
  USING (
    (SELECT public.has_platform_capability('operators.manage'))
    OR (is_active AND (SELECT public.is_internal_member((SELECT auth.uid()))))
  );

ALTER POLICY brand_assets_platform_insert ON public.brand_assets
  WITH CHECK ((SELECT public.has_platform_capability('operators.manage')));

ALTER POLICY brand_assets_platform_update ON public.brand_assets
  USING ((SELECT public.has_platform_capability('operators.manage')))
  WITH CHECK ((SELECT public.has_platform_capability('operators.manage')));

ALTER POLICY equipment_model_catalog_read ON public.equipment_model_catalog
  USING (
    (SELECT public.has_platform_capability('catalogs.read'))
    OR (is_active AND (SELECT public.is_internal_member((SELECT auth.uid()))))
  );

ALTER POLICY equipment_model_catalog_platform_insert ON public.equipment_model_catalog
  WITH CHECK ((SELECT public.has_platform_capability('catalogs.write')));

ALTER POLICY equipment_model_catalog_platform_update ON public.equipment_model_catalog
  USING ((SELECT public.has_platform_capability('catalogs.write')))
  WITH CHECK ((SELECT public.has_platform_capability('catalogs.write')));

ALTER POLICY parts_catalog_read ON public.parts_catalog
  USING (
    (SELECT public.has_platform_capability('catalogs.read'))
    OR (is_active AND (SELECT public.is_internal_member((SELECT auth.uid()))))
  );

ALTER POLICY parts_catalog_platform_insert ON public.parts_catalog
  WITH CHECK ((SELECT public.has_platform_capability('catalogs.write')));

ALTER POLICY parts_catalog_platform_update ON public.parts_catalog
  USING ((SELECT public.has_platform_capability('catalogs.write')))
  WITH CHECK ((SELECT public.has_platform_capability('catalogs.write')));

ALTER POLICY parts_catalog_models_read ON public.parts_catalog_equipment_models
  USING (
    (SELECT public.has_platform_capability('catalogs.read'))
    OR (SELECT public.is_internal_member((SELECT auth.uid())))
  );

ALTER POLICY parts_catalog_models_platform_insert ON public.parts_catalog_equipment_models
  WITH CHECK ((SELECT public.has_platform_capability('catalogs.write')));

ALTER POLICY parts_catalog_models_platform_update ON public.parts_catalog_equipment_models
  USING ((SELECT public.has_platform_capability('catalogs.write')))
  WITH CHECK ((SELECT public.has_platform_capability('catalogs.write')));

ALTER POLICY legal_template_definitions_read ON public.legal_template_definitions
  USING (
    (SELECT public.has_platform_capability('templates.read'))
    OR (is_active AND (SELECT public.is_internal_member((SELECT auth.uid()))))
  );

ALTER POLICY legal_template_definitions_platform_insert ON public.legal_template_definitions
  WITH CHECK ((SELECT public.has_platform_capability('templates.publish')));

ALTER POLICY legal_template_definitions_platform_update ON public.legal_template_definitions
  USING ((SELECT public.has_platform_capability('templates.publish')))
  WITH CHECK ((SELECT public.has_platform_capability('templates.publish')));

ALTER POLICY legal_template_versions_read ON public.legal_template_versions
  USING (
    (SELECT public.has_platform_capability('templates.read'))
    OR (
      (SELECT public.is_internal_member((SELECT auth.uid())))
      AND EXISTS (
        SELECT 1
        FROM public.legal_template_definitions d
        WHERE d.id = definition_id AND d.is_active
      )
    )
  );

ALTER POLICY legal_template_versions_platform_insert ON public.legal_template_versions
  WITH CHECK ((SELECT public.has_platform_capability('templates.publish')));
