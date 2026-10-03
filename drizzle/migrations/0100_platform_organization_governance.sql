-- Ficha administrativa de Plataforma; no cambia datos fiscales, bancos ni operaciones.
-- Aplicar después de cerrar el despliegue fiscal 0099 y activar su capability pendiente.
CREATE OR REPLACE FUNCTION public.platform_profile_capabilities(p_profile text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_profile
    WHEN 'root' THEN ARRAY['organizations.read','organizations.details','organizations.create','organizations.configure',
      'organizations.suspend','organizations.resume','catalogs.read','catalogs.write','catalogs.import',
      'templates.read','templates.publish','templates.assign','templates.import','audit.read',
      'operators.read','operators.manage','integrations.read','integrations.check','integrations.retry',
      'monitoring.read','support.read','support.manage']
    WHEN 'organizations' THEN ARRAY['organizations.read','organizations.details','organizations.create','organizations.configure','organizations.suspend','organizations.resume']
    WHEN 'catalogs' THEN ARRAY['catalogs.read','catalogs.write','catalogs.import','templates.read','templates.publish','templates.assign','templates.import']
    WHEN 'support' THEN ARRAY['organizations.read','catalogs.read','integrations.read','integrations.check','integrations.retry','monitoring.read','support.read','support.manage']
    WHEN 'observer' THEN ARRAY['organizations.read','catalogs.read','templates.read','audit.read','integrations.read','monitoring.read']
    ELSE ARRAY[]::text[] END
$$;
UPDATE public.platform_operators SET permission_revision=permission_revision+1 WHERE access_profile IN ('root','organizations');


CREATE TABLE public.platform_organization_governance (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
  classification text NOT NULL CHECK(classification IN ('unclassified','live','test')),
  city text CHECK(length(city)<=100),
  territory text CHECK(length(territory)<=120),
  contact_name text CHECK(length(contact_name)<=120),
  contact_email text CHECK(length(contact_email)<=254),
  contact_phone text CHECK(length(contact_phone)<=40),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid NOT NULL
);
ALTER TABLE public.platform_organization_governance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_organization_governance FORCE ROW LEVEL SECURITY;
CREATE POLICY "organization governance deny clients" ON public.platform_organization_governance
  AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.platform_organization_governance FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.platform_organization_governance TO service_role;

CREATE FUNCTION public.platform_governance_assert(p_actor uuid,p_session uuid,p_capability text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,p_capability);
  IF NOT public.platform_session_exists(p_actor,p_session) THEN
    RAISE EXCEPTION 'Sesión de plataforma inválida' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.platform_governance_assert(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_governance_projection(p_organization_id uuid,p_contact boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('organizationId',o.id,'classification',coalesce(g.classification,'unclassified'),
    'city',g.city,'territory',g.territory,'revision',coalesce(g.revision,0)::text,'updatedAt',g.updated_at)
    || CASE WHEN p_contact THEN jsonb_build_object('contactName',g.contact_name,
      'contactEmail',g.contact_email,'contactPhone',g.contact_phone) ELSE '{}'::jsonb END
  FROM public.organizations o LEFT JOIN public.platform_organization_governance g ON g.organization_id=o.id
  WHERE o.id=p_organization_id
$$;
REVOKE ALL ON FUNCTION public.platform_governance_projection(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_list_organization_governance(p_actor uuid,p_session uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.platform_governance_assert(p_actor,p_session,'organizations.read');
  SELECT coalesce(jsonb_agg(public.platform_governance_projection(o.id,false) ORDER BY o.name,o.id),'[]'::jsonb)
    INTO v_result FROM public.organizations o;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.platform_list_organization_governance(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_organization_governance(uuid,uuid) TO service_role;

CREATE FUNCTION public.platform_get_organization_governance(p_actor uuid,p_session uuid,p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.platform_governance_assert(p_actor,p_session,'organizations.details');
  v_result:=public.platform_governance_projection(p_organization_id,true);
  IF v_result IS NULL THEN RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE='P0002'; END IF;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.platform_get_organization_governance(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_organization_governance(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.platform_set_organization_governance(p_actor uuid,p_session uuid,p_organization_id uuid,
  p_revision text,p_classification text,p_city text,p_territory text,p_contact_name text,p_contact_email text,
  p_contact_phone text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_name text; v_before jsonb; v_after jsonb; v_revision bigint; v_fields text[];
BEGIN
  -- Autoridad estable durante la escritura; una revocación se serializa con este cambio.
  PERFORM 1 FROM public.platform_operators WHERE auth_user_id=p_actor FOR SHARE;
  PERFORM 1 FROM public.profiles WHERE user_id=p_actor FOR SHARE;
  PERFORM public.platform_governance_assert(p_actor,p_session,'organizations.configure');
  IF p_revision IS NULL OR p_revision!~'^(0|[1-9][0-9]{0,18})
    RAISE EXCEPTION 'Revisión inválida' USING ERRCODE='22023';
  END IF;
  p_city:=nullif(btrim(p_city),''); p_territory:=nullif(btrim(p_territory),'');
  p_contact_name:=nullif(btrim(p_contact_name),''); p_contact_email:=nullif(btrim(p_contact_email),'');
  p_contact_phone:=nullif(btrim(p_contact_phone),''); p_reason:=btrim(p_reason);
  IF p_classification IS NULL OR p_classification NOT IN ('unclassified','live','test')
    OR length(p_city)>100 OR length(p_territory)>120 OR length(p_contact_name)>120
    OR length(p_contact_email)>254 OR length(p_contact_phone)>40
    OR (p_contact_email IS NOT NULL AND p_contact_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
    OR (p_contact_phone IS NOT NULL AND p_contact_phone!~'^[+()0-9. -]{3,40}$')
    OR p_reason IS NULL OR length(p_reason) NOT BETWEEN 5 AND 500
    OR p_reason~*'sk_(test|live|user)_|sb_secret_|Bearer[[:space:]]+[^[:space:]]+|-----BEGIN .*PRIVATE KEY' THEN
    RAISE EXCEPTION 'Datos administrativos o motivo inválidos' USING ERRCODE='22023';
  END IF;
  -- Bloquear el padre también serializa dos creaciones cuando aún no existe la ficha.
  SELECT name INTO v_name FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE='P0002'; END IF;
  v_before:=public.platform_governance_projection(p_organization_id,true);
  v_revision:=(v_before->>'revision')::bigint;
  IF v_revision<>p_revision::bigint THEN
    RAISE EXCEPTION 'Los datos cambiaron; revisa la ficha antes de guardar' USING ERRCODE='40001';
  END IF;
  v_after:=jsonb_build_object('classification',p_classification,'city',p_city,'territory',p_territory,
    'contactName',p_contact_name,'contactEmail',p_contact_email,'contactPhone',p_contact_phone);
  SELECT coalesce(array_agg(key ORDER BY key),'{}'::text[]) INTO v_fields
    FROM jsonb_each(v_after) WHERE v_before->key IS DISTINCT FROM value;
  IF cardinality(v_fields)=0 THEN
    RETURN jsonb_build_object('changed',false,'governance',v_before);
  END IF;
  IF v_revision=9223372036854775807 THEN RAISE EXCEPTION 'Revisión agotada' USING ERRCODE='22023'; END IF;
  INSERT INTO public.platform_organization_governance
    (organization_id,classification,city,territory,contact_name,contact_email,contact_phone,revision,updated_at,updated_by)
  VALUES (p_organization_id,p_classification,p_city,p_territory,p_contact_name,p_contact_email,p_contact_phone,
    v_revision+1,clock_timestamp(),p_actor)
  ON CONFLICT(organization_id) DO UPDATE SET classification=EXCLUDED.classification,city=EXCLUDED.city,
    territory=EXCLUDED.territory,contact_name=EXCLUDED.contact_name,contact_email=EXCLUDED.contact_email,
    contact_phone=EXCLUDED.contact_phone,revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by;
  v_after:=public.platform_governance_projection(p_organization_id,true);
  -- Los valores del contacto no se copian a la bitácora consultable por Observador.
  INSERT INTO public.platform_audit_events(actor_id,actor_name,organization_id,target_type,target_id,action,
    reason,request_id,changed_fields,old_state,new_state)
  VALUES (p_actor,(SELECT left(full_name,200) FROM public.profiles WHERE user_id=p_actor),p_organization_id,
    'organizations',p_organization_id,'UPDATE',p_reason,gen_random_uuid(),v_fields,
    jsonb_build_object('name',v_name,'classification',v_before->'classification','city',v_before->'city','territory',v_before->'territory'),
    jsonb_build_object('name',v_name,'classification',v_after->'classification','city',v_after->'city','territory',v_after->'territory'));
  RETURN jsonb_build_object('changed',true,'governance',v_after);
END $$;
REVOKE ALL ON FUNCTION public.platform_set_organization_governance(uuid,uuid,uuid,text,text,text,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_organization_governance(uuid,uuid,uuid,text,text,text,text,text,text,text,text) TO service_role;
 THEN
    RAISE EXCEPTION 'Revisión inválida' USING ERRCODE='22023';
  END IF;
  IF p_revision::numeric>9223372036854775807 THEN
    RAISE EXCEPTION 'Revisión inválida' USING ERRCODE='22023';
  END IF;
  p_city:=nullif(btrim(p_city),''); p_territory:=nullif(btrim(p_territory),'');
  p_contact_name:=nullif(btrim(p_contact_name),''); p_contact_email:=nullif(btrim(p_contact_email),'');
  p_contact_phone:=nullif(btrim(p_contact_phone),''); p_reason:=btrim(p_reason);
  IF p_classification IS NULL OR p_classification NOT IN ('unclassified','live','test')
    OR length(p_city)>100 OR length(p_territory)>120 OR length(p_contact_name)>120
    OR length(p_contact_email)>254 OR length(p_contact_phone)>40
    OR (p_contact_email IS NOT NULL AND p_contact_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
    OR (p_contact_phone IS NOT NULL AND p_contact_phone!~'^[+()0-9. -]{3,40}$')
    OR p_reason IS NULL OR length(p_reason) NOT BETWEEN 5 AND 500
    OR p_reason~*'sk_(test|live|user)_|sb_secret_|Bearer[[:space:]]+[^[:space:]]+|-----BEGIN .*PRIVATE KEY' THEN
    RAISE EXCEPTION 'Datos administrativos o motivo inválidos' USING ERRCODE='22023';
  END IF;
  -- Bloquear el padre también serializa dos creaciones cuando aún no existe la ficha.
  SELECT name INTO v_name FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE='P0002'; END IF;
  v_before:=public.platform_governance_projection(p_organization_id,true);
  v_revision:=(v_before->>'revision')::bigint;
  IF v_revision<>p_revision::bigint THEN
    RAISE EXCEPTION 'Los datos cambiaron; revisa la ficha antes de guardar' USING ERRCODE='40001';
  END IF;
  v_after:=jsonb_build_object('classification',p_classification,'city',p_city,'territory',p_territory,
    'contactName',p_contact_name,'contactEmail',p_contact_email,'contactPhone',p_contact_phone);
  SELECT coalesce(array_agg(key ORDER BY key),'{}'::text[]) INTO v_fields
    FROM jsonb_each(v_after) WHERE v_before->key IS DISTINCT FROM value;
  IF cardinality(v_fields)=0 THEN
    RETURN jsonb_build_object('changed',false,'governance',v_before);
  END IF;
  IF v_revision=9223372036854775807 THEN RAISE EXCEPTION 'Revisión agotada' USING ERRCODE='22023'; END IF;
  INSERT INTO public.platform_organization_governance
    (organization_id,classification,city,territory,contact_name,contact_email,contact_phone,revision,updated_at,updated_by)
  VALUES (p_organization_id,p_classification,p_city,p_territory,p_contact_name,p_contact_email,p_contact_phone,
    v_revision+1,clock_timestamp(),p_actor)
  ON CONFLICT(organization_id) DO UPDATE SET classification=EXCLUDED.classification,city=EXCLUDED.city,
    territory=EXCLUDED.territory,contact_name=EXCLUDED.contact_name,contact_email=EXCLUDED.contact_email,
    contact_phone=EXCLUDED.contact_phone,revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by;
  v_after:=public.platform_governance_projection(p_organization_id,true);
  -- Los valores del contacto no se copian a la bitácora consultable por Observador.
  INSERT INTO public.platform_audit_events(actor_id,actor_name,organization_id,target_type,target_id,action,
    reason,request_id,changed_fields,old_state,new_state)
  VALUES (p_actor,(SELECT left(full_name,200) FROM public.profiles WHERE user_id=p_actor),p_organization_id,
    'organizations',p_organization_id,'UPDATE',p_reason,gen_random_uuid(),v_fields,
    jsonb_build_object('name',v_name,'classification',v_before->'classification','city',v_before->'city','territory',v_before->'territory'),
    jsonb_build_object('name',v_name,'classification',v_after->'classification','city',v_after->'city','territory',v_after->'territory'));
  RETURN jsonb_build_object('changed',true,'governance',v_after);
END $$;
REVOKE ALL ON FUNCTION public.platform_set_organization_governance(uuid,uuid,uuid,text,text,text,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_organization_governance(uuid,uuid,uuid,text,text,text,text,text,text,text,text) TO service_role;
