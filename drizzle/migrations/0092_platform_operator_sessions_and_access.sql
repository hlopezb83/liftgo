-- Operadores internos: sesión propia y administración de cuentas existentes.
-- No crea cuentas, no cambia membresías y no modifica la configuración de Auth.
CREATE FUNCTION public.platform_session_exists(p_actor uuid,p_session uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
    WHERE s.id=p_session AND s.user_id=p_actor
      AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
      AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL
      AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp()))
$$;
REVOKE ALL ON FUNCTION public.platform_session_exists(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_platform_session()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid; v_claim text:=auth.jwt()->>'session_id';
BEGIN
  IF v_claim IS NULL OR v_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT public.is_platform_operator() THEN RETURN NULL; END IF;
  v_session:=v_claim::uuid;
  IF NOT public.platform_session_exists(auth.uid(),v_session) THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('id',s.id,'startedAt',s.created_at,'expiresAt',s.not_after)
    FROM auth.sessions s WHERE s.id=v_session AND s.user_id=auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.get_platform_session() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_session() TO authenticated;

CREATE FUNCTION public.platform_account_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id
    WHERE u.id=p_user_id AND p.is_active AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp())
      AND (EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role<>'customer')
        OR EXISTS(SELECT 1 FROM public.platform_operators po WHERE po.auth_user_id=u.id)))
$$;
REVOKE ALL ON FUNCTION public.platform_account_eligible(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_list_operator_accounts(
  p_actor uuid,p_session uuid,p_search text DEFAULT '',p_scope text DEFAULT 'operators',p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb; v_more boolean;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'operators.read');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN
    RAISE EXCEPTION 'La sesión ya no está activa' USING ERRCODE='42501'; END IF;
  IF p_search IS NULL OR length(p_search)>100 OR p_scope NOT IN ('operators','eligible')
    OR p_scope IS NULL OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023'; END IF;
  WITH accounts AS (
    SELECT u.id,coalesce(p.full_name,'') AS name,coalesce(u.email,'') AS email,
      po.access_profile AS profile,po.permission_revision::text AS revision,
      public.platform_account_eligible(u.id) AS eligible
    FROM auth.users u JOIN public.profiles p ON p.user_id=u.id
      LEFT JOIN public.platform_operators po ON po.auth_user_id=u.id
    WHERE ((p_scope='operators' AND po.auth_user_id IS NOT NULL)
      OR (p_scope='eligible' AND public.platform_account_eligible(u.id)))
      AND (p_search='' OR position(lower(p_search) IN lower(coalesce(p.full_name,'')||' '||coalesce(u.email,'')))>0)
    ORDER BY lower(coalesce(p.full_name,'')),u.id LIMIT 26 OFFSET p_offset
  ), numbered AS (SELECT a.*,row_number() OVER(ORDER BY lower(name),id) AS n FROM accounts a)
  SELECT coalesce(jsonb_agg(to_jsonb(a)-'n' ORDER BY n) FILTER(WHERE n<=25),'[]'::jsonb),
    count(*)>25 INTO v_rows,v_more FROM numbered a;
  RETURN jsonb_build_object('rows',v_rows,'hasMore',v_more);
END $$;
REVOKE ALL ON FUNCTION public.platform_list_operator_accounts(uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_operator_accounts(uuid,uuid,text,text,integer) TO service_role;

CREATE FUNCTION public.platform_set_operator_profile(
  p_actor uuid,p_session uuid,p_user_id uuid,p_profile text,p_expected_revision text,p_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing public.platform_operators%ROWTYPE; v_found boolean;
  v_previous_reason text:=current_setting('app.platform_reason',true);
BEGIN
  -- Se serializa antes de leer autoridad/revisión; conserva la protección de 0091.
  UPDATE public.platform_operator_guard SET revision=revision+1 WHERE id=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Protección de operadores no disponible' USING ERRCODE='42501'; END IF;
  PERFORM public.assert_platform_capability(p_actor,'operators.manage');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN
    RAISE EXCEPTION 'La sesión ya no está activa' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR (p_profile IS NOT NULL AND p_profile NOT IN ('root','organizations','catalogs','support','observer'))
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500
    OR p_reason ~* 'sk_(test|live|proj)[_-][A-Za-z0-9]|sb_secret_|Bearer[[:space:]]+[^[:space:]]+|eyJ[A-Za-z0-9_-]{10,}\.' THEN
    RAISE EXCEPTION 'Perfil o motivo inválido' USING ERRCODE='22023'; END IF;
  IF p_actor=p_user_id THEN
    RAISE EXCEPTION 'Tu acceso lo administra otro operador raíz' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_existing FROM public.platform_operators WHERE auth_user_id=p_user_id;
  v_found:=FOUND;
  IF (CASE WHEN v_found THEN v_existing.permission_revision::text END) IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'El acceso cambió; actualiza el listado' USING ERRCODE='40001'; END IF;
  IF p_profile IS NOT NULL AND NOT public.platform_account_eligible(p_user_id) THEN
    RAISE EXCEPTION 'La cuenta debe ser interna, activa y verificada' USING ERRCODE='22023'; END IF;
  IF (v_found AND v_existing.access_profile=p_profile) OR (NOT v_found AND p_profile IS NULL) THEN RETURN false; END IF;
  PERFORM set_config('app.platform_reason',btrim(p_reason),true);
  IF p_profile IS NULL THEN
    DELETE FROM public.platform_operators WHERE auth_user_id=p_user_id;
  ELSIF v_found THEN
    UPDATE public.platform_operators SET access_profile=p_profile WHERE auth_user_id=p_user_id;
  ELSE
    INSERT INTO public.platform_operators(auth_user_id,access_profile) VALUES(p_user_id,p_profile);
  END IF;
  PERFORM set_config('app.platform_reason',coalesce(v_previous_reason,''),true);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.platform_set_operator_profile(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_operator_profile(uuid,uuid,uuid,text,text,text) TO service_role;

-- El motivo del cambio de acceso se conserva en la bitácora transaccional existente.
CREATE OR REPLACE FUNCTION public.record_platform_audit_event()
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
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN RETURN NEW; END IF;
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
    CASE WHEN TG_TABLE_NAME IN ('organizations','platform_operators') THEN nullif(current_setting('app.platform_reason', true),'') END,
    v_request, v_fields,
    CASE WHEN v_old IS NOT NULL THEN public.platform_audit_safe_state(v_old) END,
    CASE WHEN v_new IS NOT NULL THEN public.platform_audit_safe_state(v_new) END);
  RETURN coalesce(NEW, OLD);
END $$;
