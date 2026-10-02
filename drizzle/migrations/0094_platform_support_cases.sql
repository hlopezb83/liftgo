-- Soporte explícitamente compartido; no amplía lectura del ERP ni Storage empresarial.
CREATE OR REPLACE FUNCTION public.platform_profile_capabilities(p_profile text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_profile
    WHEN 'root' THEN ARRAY['organizations.read','organizations.details','organizations.create',
      'organizations.suspend','organizations.resume','catalogs.read','catalogs.write','catalogs.import',
      'templates.read','templates.publish','templates.assign','templates.import','audit.read',
      'operators.read','operators.manage','integrations.read','integrations.check','monitoring.read','support.read','support.manage']
    WHEN 'organizations' THEN ARRAY['organizations.read','organizations.details','organizations.create',
      'organizations.suspend','organizations.resume']
    WHEN 'catalogs' THEN ARRAY['catalogs.read','catalogs.write','catalogs.import',
      'templates.read','templates.publish','templates.assign','templates.import']
    WHEN 'support' THEN ARRAY['organizations.read','catalogs.read','integrations.read','integrations.check','monitoring.read','support.read','support.manage']
    WHEN 'observer' THEN ARRAY['organizations.read','catalogs.read','templates.read','audit.read','integrations.read','monitoring.read']
    ELSE ARRAY[]::text[] END
$$;
UPDATE public.platform_operators SET permission_revision=permission_revision+1 WHERE access_profile IN ('root','support');

CREATE TABLE public.platform_support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid UNIQUE REFERENCES public.feedback_reports(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  folio text NOT NULL,
  title text,
  description text,
  module text,
  app_version text,
  request_id uuid,
  screenshot_path text,
  shared_until timestamptz NOT NULL DEFAULT clock_timestamp()+interval '90 days',
  withdrawn_at timestamptz,
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','waiting','resolved','closed')),
  severity text NOT NULL CHECK(severity IN ('critical','high','medium','low')),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_support_cases_date ON public.platform_support_cases(updated_at DESC,id);
CREATE INDEX platform_support_cases_org ON public.platform_support_cases(organization_id,status);
CREATE TABLE public.platform_support_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.platform_support_cases(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_name text,
  action text NOT NULL CHECK(action IN ('shared','withdrawn','expired','updated')),
  status text NOT NULL,
  severity text NOT NULL,
  assignee_id uuid,
  assignee_name text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_support_events_case ON public.platform_support_events(case_id,id DESC);
CREATE FUNCTION public.support_event_identity_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.actor_name:=(SELECT full_name FROM public.profiles WHERE user_id=NEW.actor_id);
  NEW.assignee_name:=(SELECT full_name FROM public.profiles WHERE user_id=NEW.assignee_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.support_event_identity_snapshot() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER support_event_snapshot BEFORE INSERT ON public.platform_support_events FOR EACH ROW EXECUTE FUNCTION public.support_event_identity_snapshot();
ALTER TABLE public.platform_support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_support_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_support_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_support_events FORCE ROW LEVEL SECURITY;
CREATE POLICY "support cases deny clients" ON public.platform_support_cases AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY "support events deny clients" ON public.platform_support_events AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.platform_support_cases,public.platform_support_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.platform_support_events_id_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.platform_support_cases TO service_role;
GRANT SELECT ON public.platform_support_events TO service_role;

-- Sólo proyección aprobada: nunca context_json, claves, URL/ruta del ERP, datos fiscales o DOM.
CREATE FUNCTION public.support_case_projection(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id',c.id,'organizationId',c.organization_id,'organizationName',o.name,
    'folio',c.folio,'revision',c.revision::text,'status',c.status,'severity',c.severity,
    'assigneeId',c.assignee_id,'assigneeName',p.full_name,'createdAt',c.created_at,'updatedAt',c.updated_at,
    'shared',c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp(),'sharedUntil',c.shared_until,
    'title',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.title END,
    'description',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.description END,
    'module',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.module END,
    'appVersion',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.app_version END,
    'requestId',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.request_id END,
    'hasScreenshot',c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() AND c.screenshot_path IS NOT NULL)
  FROM public.platform_support_cases c JOIN public.organizations o ON o.id=c.organization_id
  LEFT JOIN public.profiles p ON p.user_id=c.assignee_id WHERE c.id=p_id
$$;
REVOKE ALL ON FUNCTION public.support_case_projection(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.assert_own_support_report(p_report uuid)
RETURNS public.feedback_reports LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_report public.feedback_reports; v_actor uuid:=auth.uid(); v_org uuid:=public.current_internal_organization_id();
BEGIN
  IF v_actor IS NULL OR v_org IS NULL OR NOT public.is_internal_member(v_actor)
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_actor AND is_active) THEN
    RAISE EXCEPTION 'Cuenta interna no disponible' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_report FROM public.feedback_reports WHERE id=p_report AND organization_id=v_org
    AND reporter_id=v_actor AND reporter_type='internal';
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no disponible' USING ERRCODE='42501'; END IF;
  RETURN v_report;
END $$;
REVOKE ALL ON FUNCTION public.assert_own_support_report(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_my_support_case(p_report uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_own_support_report(p_report);
  RETURN public.support_case_projection((SELECT id FROM public.platform_support_cases WHERE report_id=p_report));
END $$;
REVOKE ALL ON FUNCTION public.get_my_support_case(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_support_case(uuid) TO authenticated;

-- Lock del reporte + revisión esperada: dos guardados nunca se pisan ni duplican un caso.
CREATE FUNCTION public.share_my_support_report(p_report uuid,p_revision text,p_title text,p_description text,
  p_severity text,p_request uuid DEFAULT NULL,p_screenshot boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_report public.feedback_reports; v_case public.platform_support_cases; v_path text; v_version text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_report::text,94));
  v_report:=public.assert_own_support_report(p_report);
  IF p_revision IS NULL OR p_revision !~ '^(0|[1-9][0-9]*)$' OR length(p_revision)>18
    OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 5 AND 150
    OR p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 10 AND 5000
    OR p_severity IS NULL OR p_severity NOT IN ('critical','high','medium','low') OR p_screenshot IS NULL THEN
    RAISE EXCEPTION 'Diagnóstico inválido' USING ERRCODE='22023'; END IF;
  IF (p_title||' '||p_description) ~* '(sk_(test|live|user)_|bearer[[:space:]]+[a-z0-9._-]{12}|-----BEGIN .*PRIVATE KEY)' THEN
    RAISE EXCEPTION 'Retira las credenciales del diagnóstico' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_case FROM public.platform_support_cases WHERE report_id=p_report FOR UPDATE;
  IF coalesce(v_case.revision,0)::text<>p_revision THEN RAISE EXCEPTION 'El caso cambió; actualiza antes de guardar' USING ERRCODE='40001'; END IF;
  IF p_screenshot THEN
    v_path:=v_report.screenshot_url;
    IF v_path IS NULL OR v_path !~ ('^'||v_report.organization_id::text||'/'||auth.uid()::text||'/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$') THEN
      RAISE EXCEPTION 'Captura no disponible para compartir' USING ERRCODE='22023'; END IF;
  END IF;
  v_version:=v_report.context_json->>'app_version';
  IF v_version IS NULL THEN v_version:=v_report.context_json->>'appVersion'; END IF;
  IF v_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' OR length(v_version)>30 THEN v_version:=NULL; END IF;
  IF v_case.id IS NOT NULL AND v_case.withdrawn_at IS NULL AND v_case.shared_until>clock_timestamp()
    AND v_case.title=btrim(p_title) AND v_case.description=btrim(p_description) AND v_case.severity=p_severity
    AND v_case.request_id IS NOT DISTINCT FROM p_request AND v_case.screenshot_path IS NOT DISTINCT FROM v_path THEN
    RETURN public.support_case_projection(v_case.id); END IF;
  IF v_case.shared_until<=clock_timestamp() THEN
    UPDATE public.platform_support_events SET comment=NULL WHERE case_id=v_case.id;
  END IF;
  INSERT INTO public.platform_support_cases(report_id,organization_id,reporter_id,folio,title,description,module,app_version,request_id,screenshot_path,severity)
  VALUES(p_report,v_report.organization_id,auth.uid(),v_report.folio,btrim(p_title),btrim(p_description),
    left(v_report.module,100),v_version,p_request,v_path,p_severity)
  ON CONFLICT(report_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,module=EXCLUDED.module,
    app_version=EXCLUDED.app_version,request_id=EXCLUDED.request_id,screenshot_path=EXCLUDED.screenshot_path,
    severity=EXCLUDED.severity,withdrawn_at=NULL,shared_until=clock_timestamp()+interval '90 days',
    revision=platform_support_cases.revision+1,updated_at=clock_timestamp()
  RETURNING * INTO v_case;
  INSERT INTO public.platform_support_events(case_id,actor_id,action,status,severity,assignee_id)
    VALUES(v_case.id,auth.uid(),'shared',v_case.status,v_case.severity,v_case.assignee_id);
  RETURN public.support_case_projection(v_case.id);
END $$;
REVOKE ALL ON FUNCTION public.share_my_support_report(uuid,text,text,text,text,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.share_my_support_report(uuid,text,text,text,text,uuid,boolean) TO authenticated;

CREATE FUNCTION public.withdraw_my_support_report(p_report uuid,p_revision text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.platform_support_cases;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_report::text,94));
  PERFORM public.assert_own_support_report(p_report);
  SELECT * INTO v_case FROM public.platform_support_cases WHERE report_id=p_report FOR UPDATE;
  IF v_case.id IS NULL THEN RETURN NULL; END IF;
  IF v_case.revision::text IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'El caso cambió; actualiza antes de guardar' USING ERRCODE='40001'; END IF;
  IF v_case.withdrawn_at IS NOT NULL THEN RETURN public.support_case_projection(v_case.id); END IF;
  UPDATE public.platform_support_cases SET title=NULL,description=NULL,module=NULL,app_version=NULL,request_id=NULL,screenshot_path=NULL,
    withdrawn_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() WHERE id=v_case.id;
  UPDATE public.platform_support_events SET comment=NULL WHERE case_id=v_case.id;
  INSERT INTO public.platform_support_events(case_id,actor_id,action,status,severity,assignee_id)
    VALUES(v_case.id,auth.uid(),'withdrawn',v_case.status,v_case.severity,v_case.assignee_id);
  RETURN public.support_case_projection(v_case.id);
END $$;
REVOKE ALL ON FUNCTION public.withdraw_my_support_report(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_my_support_report(uuid,text) TO authenticated;

CREATE FUNCTION public.platform_support_assert(p_actor uuid,p_session uuid,p_write boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,CASE WHEN p_write THEN 'support.manage' ELSE 'support.read' END);
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión no disponible' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.platform_support_assert(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_list_support(p_actor uuid,p_session uuid,p_search text DEFAULT '',p_org uuid DEFAULT NULL,
  p_status text DEFAULT NULL,p_severity text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb; v_total bigint;
BEGIN
  PERFORM public.platform_support_assert(p_actor,p_session);
  IF p_search IS NULL OR length(p_search)>100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
    OR (p_status IS NOT NULL AND p_status NOT IN ('new','in_progress','waiting','resolved','closed'))
    OR (p_severity IS NOT NULL AND p_severity NOT IN ('critical','high','medium','low')) THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023'; END IF;
  WITH matches AS (
    SELECT c.id,c.updated_at FROM public.platform_support_cases c JOIN public.organizations o ON o.id=c.organization_id
    WHERE (p_org IS NULL OR c.organization_id=p_org) AND (p_status IS NULL OR c.status=p_status)
      AND (p_severity IS NULL OR c.severity=p_severity) AND (p_search='' OR strpos(lower(o.name||' '||c.folio),lower(p_search))>0
        OR (c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() AND strpos(lower(coalesce(c.title,'')||' '||coalesce(c.module,'')),lower(p_search))>0))
  ), page AS (SELECT * FROM matches ORDER BY updated_at DESC,id LIMIT 25 OFFSET p_offset)
  SELECT (SELECT count(*) FROM matches),coalesce(jsonb_agg(public.support_case_projection(id)-'description' ORDER BY updated_at DESC,id),'[]')
    INTO v_total,v_rows FROM page;
  RETURN jsonb_build_object('rows',v_rows,'total',v_total,'observedAt',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.platform_list_support(uuid,uuid,text,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_support(uuid,uuid,text,uuid,text,text,integer) TO service_role;

CREATE FUNCTION public.platform_get_support(p_actor uuid,p_session uuid,p_case uuid,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.platform_support_cases; v_events jsonb; v_next text;
BEGIN
  PERFORM public.platform_support_assert(p_actor,p_session);
  SELECT * INTO v_case FROM public.platform_support_cases WHERE id=p_case;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caso no disponible' USING ERRCODE='22023'; END IF;
  IF p_before IS NOT NULL AND p_before<=0 THEN RAISE EXCEPTION 'Cursor inválido' USING ERRCODE='22023'; END IF;
  WITH page AS (SELECT e.* FROM public.platform_support_events e
    WHERE case_id=p_case AND (p_before IS NULL OR e.id<p_before) ORDER BY e.id DESC LIMIT 50)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'actorName',actor_name,'action',action,'status',status,'severity',severity,
    'assigneeId',assignee_id,'assigneeName',assignee_name,'comment',CASE WHEN v_case.withdrawn_at IS NULL AND v_case.shared_until>statement_timestamp() THEN comment END,
    'createdAt',created_at) ORDER BY id DESC),'[]'),min(id)::text INTO v_events,v_next FROM page;
  IF NOT EXISTS(SELECT 1 FROM public.platform_support_events WHERE case_id=p_case AND id<v_next::bigint) THEN v_next:=NULL; END IF;
  RETURN jsonb_build_object('case',public.support_case_projection(p_case),'events',v_events,'nextCursor',v_next,
    'assignees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',po.auth_user_id,'name',p.full_name) ORDER BY p.full_name),'[]')
      FROM public.platform_operators po JOIN public.profiles p ON p.user_id=po.auth_user_id
      WHERE 'support.manage'=ANY(public.platform_profile_capabilities(po.access_profile)) AND public.platform_account_eligible(po.auth_user_id)));
END $$;
REVOKE ALL ON FUNCTION public.platform_get_support(uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_support(uuid,uuid,uuid,bigint) TO service_role;

CREATE FUNCTION public.platform_update_support(p_actor uuid,p_session uuid,p_case uuid,p_revision text,
  p_status text,p_severity text,p_assignee uuid,p_comment text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.platform_support_cases;
BEGIN
  PERFORM public.platform_support_assert(p_actor,p_session,true);
  IF p_status IS NULL OR p_status NOT IN ('new','in_progress','waiting','resolved','closed')
    OR p_severity IS NULL OR p_severity NOT IN ('critical','high','medium','low') OR p_comment IS NULL OR length(btrim(p_comment))>2000 THEN
    RAISE EXCEPTION 'Seguimiento inválido' USING ERRCODE='22023'; END IF;
  IF p_comment ~* '(sk_(test|live|user)_|bearer[[:space:]]+[a-z0-9._-]{12}|-----BEGIN .*PRIVATE KEY)' THEN
    RAISE EXCEPTION 'Retira las credenciales del comentario' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_case FROM public.platform_support_cases WHERE id=p_case FOR UPDATE;
  IF NOT FOUND OR v_case.withdrawn_at IS NOT NULL OR v_case.shared_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'El diagnóstico no está compartido' USING ERRCODE='42501'; END IF;
  IF v_case.revision::text IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'El caso cambió; actualiza antes de guardar' USING ERRCODE='40001'; END IF;
  IF p_assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.platform_operators WHERE auth_user_id=p_assignee
    AND 'support.manage'=ANY(public.platform_profile_capabilities(access_profile)) AND public.platform_account_eligible(auth_user_id)) THEN
    RAISE EXCEPTION 'Responsable no disponible' USING ERRCODE='22023'; END IF;
  IF v_case.status=p_status AND v_case.severity=p_severity AND v_case.assignee_id IS NOT DISTINCT FROM p_assignee AND btrim(p_comment)='' THEN
    RETURN public.support_case_projection(p_case); END IF;
  UPDATE public.platform_support_cases SET status=p_status,severity=p_severity,assignee_id=p_assignee,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_case;
  INSERT INTO public.platform_support_events(case_id,actor_id,action,status,severity,assignee_id,comment)
    VALUES(p_case,p_actor,'updated',p_status,p_severity,p_assignee,nullif(btrim(p_comment),''));
  RETURN public.support_case_projection(p_case);
END $$;
REVOKE ALL ON FUNCTION public.platform_update_support(uuid,uuid,uuid,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_support(uuid,uuid,uuid,text,text,text,uuid,text) TO service_role;

CREATE FUNCTION public.platform_support_screenshot(p_actor uuid,p_session uuid,p_case uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_support_assert(p_actor,p_session);
  RETURN (SELECT screenshot_path FROM public.platform_support_cases WHERE id=p_case AND withdrawn_at IS NULL AND shared_until>clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.platform_support_screenshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_screenshot(uuid,uuid,uuid) TO service_role;

-- Retención del diagnóstico compartido (90 días); el reporte original sigue bajo su empresa.
CREATE FUNCTION public.purge_expired_support_diagnostics()
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count bigint; v_case public.platform_support_cases;
BEGIN
  v_count:=0;
  FOR v_case IN SELECT * FROM public.platform_support_cases WHERE withdrawn_at IS NULL AND shared_until<=clock_timestamp() FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.platform_support_cases SET title=NULL,description=NULL,module=NULL,app_version=NULL,request_id=NULL,screenshot_path=NULL,
      withdrawn_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() WHERE id=v_case.id;
    UPDATE public.platform_support_events SET comment=NULL WHERE case_id=v_case.id;
    INSERT INTO public.platform_support_events(case_id,action,status,severity,assignee_id) VALUES(v_case.id,'expired',v_case.status,v_case.severity,v_case.assignee_id);
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.purge_expired_support_diagnostics() FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.schedule('purge-platform-support-diagnostics','17 3 * * *','SELECT public.purge_expired_support_diagnostics()');
  END IF;
END $$;
