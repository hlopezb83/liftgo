-- Centro de Plataforma: lecturas administrativas acotadas y bitácora global.
-- No amplía RLS empresarial, no devuelve secretos ni modifica filas de negocio.
-- Los nuevos eventos se escriben en la misma transacción que la operación.

CREATE TABLE public.platform_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid,
  actor_name text,
  organization_id uuid,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  reason text CHECK (reason IS NULL OR length(reason) BETWEEN 5 AND 500),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  changed_fields text[] NOT NULL DEFAULT '{}',
  old_state jsonb,
  new_state jsonb,
  legacy_audit_id uuid UNIQUE,
  CHECK (target_type IN ('organizations', 'equipment_model_catalog', 'parts_catalog',
    'parts_catalog_equipment_models', 'legal_template_definitions',
    'legal_template_versions', 'organization_legal_template_assignments', 'platform_operators'))
);
-- Identidades históricas sin FK: borrar un usuario no reescribe su rastro.
ALTER TABLE public.platform_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY "platform audit denies client access" ON public.platform_audit_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON public.platform_audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.platform_audit_events TO service_role;
REVOKE ALL ON SEQUENCE public.platform_audit_events_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.platform_audit_events_id_seq TO service_role;
CREATE INDEX platform_audit_events_organization_cursor
  ON public.platform_audit_events (organization_id, id DESC);
CREATE INDEX platform_audit_events_target_cursor
  ON public.platform_audit_events (target_type, id DESC);

CREATE FUNCTION public.prevent_platform_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de plataforma no admite modificaciones'
    USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.prevent_platform_audit_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER platform_audit_immutable
  BEFORE UPDATE OR DELETE ON public.platform_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_audit_mutation();
CREATE TRIGGER platform_audit_no_truncate
  BEFORE TRUNCATE ON public.platform_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_platform_audit_mutation();

-- Misma autoridad que 0030. VOLATILE porque añade contexto LOCAL de auditoría.
-- No se confía en created_by/updated_by antiguos para atribuir una nueva acción.
CREATE OR REPLACE FUNCTION public.assert_platform_operator(p_actor uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_operators po
    JOIN public.profiles p ON p.user_id = po.auth_user_id
    WHERE po.auth_user_id = p_actor AND p.is_active
  ) THEN
    RAISE EXCEPTION 'Forbidden: se requiere un operador de plataforma activo'
      USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.platform_actor', p_actor::text, true);
  IF nullif(current_setting('app.platform_request_id', true), '') IS NULL THEN
    PERFORM set_config('app.platform_request_id', gen_random_uuid()::text, true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_platform_operator(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_platform_operator(uuid) TO service_role;

-- Lista de valores permitidos; nunca copia contenido, metadata arbitraria,
-- URLs, credenciales, enlaces de acceso, tarifas, existencias ni datos bancarios.
CREATE FUNCTION public.platform_audit_safe_state(p_row jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each(coalesce(p_row, '{}'::jsonb))
  WHERE key = ANY (ARRAY['name', 'slug', 'is_active', 'manufacturer', 'model',
    'sku', 'capacity_kg', 'mast_height_m', 'fuel_type', 'definition_id',
    'version_id', 'current_version_id', 'version', 'checksum_sha256',
    'document_type', 'part_catalog_id', 'equipment_model_catalog_id', 'auth_user_id']);
$$;
REVOKE ALL ON FUNCTION public.platform_audit_safe_state(jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.record_platform_audit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('app.platform_actor', true), '')::uuid);
  v_request uuid := coalesce(nullif(current_setting('app.platform_request_id', true), '')::uuid, gen_random_uuid());
  v_org uuid;
  v_target uuid;
  v_fields text[];
BEGIN
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN
    RETURN NEW;
  END IF;
  -- Las asignaciones hechas por un admin empresarial pertenecen a su bitácora.
  IF TG_TABLE_NAME = 'organization_legal_template_assignments' AND NOT EXISTS (
    SELECT 1 FROM public.platform_operators po JOIN public.profiles p ON p.user_id=po.auth_user_id
    WHERE po.auth_user_id=v_actor AND p.is_active
  ) THEN RETURN coalesce(NEW, OLD); END IF;
  IF v_actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.platform_operators po JOIN public.profiles p ON p.user_id=po.auth_user_id
    WHERE po.auth_user_id=v_actor AND p.is_active
  ) THEN v_actor := NULL; END IF;
  v_org := CASE WHEN TG_TABLE_NAME='organizations' THEN (v_row->>'id')::uuid
    WHEN TG_TABLE_NAME='organization_legal_template_assignments' THEN (v_row->>'organization_id')::uuid END;
  v_target := coalesce((v_row->>'id')::uuid, (v_row->>'definition_id')::uuid,
    (v_row->>'auth_user_id')::uuid, (v_row->>'part_catalog_id')::uuid);
  SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_fields
  FROM (SELECT key AS k FROM jsonb_object_keys(coalesce(v_new, v_old)) AS key
    WHERE key NOT IN ('updated_at', 'created_at')
      AND (TG_OP <> 'UPDATE' OR v_old->key IS DISTINCT FROM v_new->key)) f;
  INSERT INTO public.platform_audit_events
    (actor_id, actor_name, organization_id, target_type, target_id, action,
     reason, request_id, changed_fields, old_state, new_state)
  VALUES (v_actor, (SELECT left(full_name,200) FROM public.profiles WHERE user_id=v_actor),
    v_org, TG_TABLE_NAME, v_target, TG_OP,
    CASE WHEN TG_TABLE_NAME='organizations' THEN nullif(current_setting('app.platform_reason', true),'') END,
    v_request, v_fields,
    CASE WHEN v_old IS NOT NULL THEN public.platform_audit_safe_state(v_old) END,
    CASE WHEN v_new IS NOT NULL THEN public.platform_audit_safe_state(v_new) END);
  RETURN coalesce(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.record_platform_audit_event() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['organizations', 'equipment_model_catalog',
    'parts_catalog', 'parts_catalog_equipment_models', 'legal_template_definitions',
    'legal_template_versions', 'organization_legal_template_assignments', 'platform_operators']
  LOOP
    EXECUTE format('CREATE TRIGGER platform_audit_record AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_platform_audit_event()', v_table);
  END LOOP;
END $$;

-- Recupera sólo eventos de plataforma que ya existían; conserva fecha/actor.
-- No reconstruye ni inventa historial de catálogos anterior a esta migración.
INSERT INTO public.platform_audit_events
  (occurred_at, actor_id, actor_name, organization_id, target_type, target_id,
   action, changed_fields, old_state, new_state, legacy_audit_id)
SELECT a.created_at, a.user_id, left(p.full_name,200), a.organization_id,
  'organizations', a.record_id, a.action, coalesce(a.changed_fields, '{}'),
  CASE WHEN a.old_data IS NOT NULL THEN public.platform_audit_safe_state(a.old_data) END,
  CASE WHEN a.new_data IS NOT NULL THEN public.platform_audit_safe_state(a.new_data) END, a.id
FROM public.audit_logs a LEFT JOIN public.profiles p ON p.user_id=a.user_id
WHERE a.table_name='organizations' AND a.action IN ('INSERT','UPDATE','DELETE')
  AND a.new_data ? 'platform_actor'
ORDER BY a.created_at, a.id;

CREATE FUNCTION public.platform_set_organization_active_with_reason(
  p_actor uuid, p_organization_id uuid, p_active boolean, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed boolean; v_previous_reason text := current_setting('app.platform_reason',true);
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
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
REVOKE ALL ON FUNCTION public.platform_set_organization_active_with_reason(uuid,uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_organization_active_with_reason(uuid,uuid,boolean,text) TO service_role;

-- Compatibilidad con servidores ya publicados mientras se actualiza el frontend.
CREATE OR REPLACE FUNCTION public.platform_set_organization_active(
  p_actor uuid, p_organization_id uuid, p_active boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_set_organization_active_with_reason(p_actor,p_organization_id,p_active,
    'Cambio mediante integración anterior sin motivo capturado');
END $$;
REVOKE ALL ON FUNCTION public.platform_set_organization_active(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_organization_active(uuid,uuid,boolean) TO service_role;

CREATE FUNCTION public.platform_get_organization_detail(p_actor uuid, p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org public.organizations%ROWTYPE; v_settings public.company_settings%ROWTYPE;
  v_settings_count integer; v_mode text; v_key_configured boolean; v_keys_count integer;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
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
REVOKE ALL ON FUNCTION public.platform_get_organization_detail(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_organization_detail(uuid,uuid) TO service_role;

CREATE FUNCTION public.platform_list_audit_events(
  p_actor uuid, p_organization_id uuid DEFAULT NULL, p_target_type text DEFAULT NULL,
  p_before_id bigint DEFAULT NULL, p_limit integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb; v_more boolean;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_before_id IS NOT NULL AND p_before_id<1) THEN
    RAISE EXCEPTION 'Paginación inválida' USING ERRCODE='22023';
  END IF;
  IF p_target_type IS NOT NULL AND p_target_type NOT IN ('organizations','equipment_model_catalog','parts_catalog',
    'parts_catalog_equipment_models','legal_template_definitions','legal_template_versions',
    'organization_legal_template_assignments','platform_operators') THEN
    RAISE EXCEPTION 'Tipo de evento inválido' USING ERRCODE='22023';
  END IF;
  IF p_organization_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id=p_organization_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE='P0002';
  END IF;
  WITH page AS (
    SELECT e.*,row_number() OVER (ORDER BY e.id DESC) AS position
    FROM public.platform_audit_events e
    WHERE (p_organization_id IS NULL OR e.organization_id=p_organization_id)
      AND (p_target_type IS NULL OR e.target_type=p_target_type)
      AND (p_before_id IS NULL OR e.id<p_before_id)
    ORDER BY e.id DESC LIMIT p_limit+1
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'occurred_at',occurred_at,
      'actor_id',actor_id,'actor_name',actor_name,'organization_id',organization_id,
      'target_type',target_type,'target_id',target_id,'action',action,'reason',reason,
      'request_id',request_id,'changed_fields',changed_fields,'old_state',old_state,'new_state',new_state,
      'is_legacy',legacy_audit_id IS NOT NULL) ORDER BY id DESC) FILTER (WHERE position<=p_limit),'[]'::jsonb),
    coalesce(bool_or(position>p_limit),false) INTO v_rows,v_more FROM page;
  RETURN jsonb_build_object('events',v_rows,'has_more',v_more);
END $$;
REVOKE ALL ON FUNCTION public.platform_list_audit_events(uuid,uuid,text,bigint,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_audit_events(uuid,uuid,text,bigint,integer) TO service_role;
