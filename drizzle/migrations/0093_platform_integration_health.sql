-- Estado técnico global: proyecciones mínimas, nunca cuerpos fiscales ni secretos en el navegador.
CREATE OR REPLACE FUNCTION public.platform_profile_capabilities(p_profile text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_profile
    WHEN 'root' THEN ARRAY['organizations.read','organizations.details','organizations.create',
      'organizations.suspend','organizations.resume','catalogs.read','catalogs.write','catalogs.import',
      'templates.read','templates.publish','templates.assign','templates.import','audit.read',
      'operators.read','operators.manage','integrations.read','integrations.check','monitoring.read']
    WHEN 'organizations' THEN ARRAY['organizations.read','organizations.details','organizations.create',
      'organizations.suspend','organizations.resume']
    WHEN 'catalogs' THEN ARRAY['catalogs.read','catalogs.write','catalogs.import',
      'templates.read','templates.publish','templates.assign','templates.import']
    WHEN 'support' THEN ARRAY['organizations.read','catalogs.read','integrations.read','integrations.check','monitoring.read']
    WHEN 'observer' THEN ARRAY['organizations.read','catalogs.read','templates.read','audit.read','integrations.read','monitoring.read']
    ELSE ARRAY[]::text[] END
$$;
-- Revalidar cachés/scope de los perfiles cuyo alcance cambió; los triggers conservan el último raíz.
UPDATE public.platform_operators SET permission_revision=permission_revision+1
WHERE access_profile IN ('root','support','observer');

CREATE TABLE public.platform_integration_checks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mode text CHECK(mode IN ('test','live')),
  key_fingerprint text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','connected','unconfigured',
    'duplicate_key','invalid_key_mode','auth_error','rate_limited','unavailable','invalid_response','config_changed')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  latency_ms integer CHECK(latency_ms BETWEEN 0 AND 60000),
  http_status integer CHECK(http_status BETWEEN 100 AND 599),
  app_version text CHECK(app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$')
);
CREATE INDEX platform_integration_checks_org_date ON public.platform_integration_checks(organization_id,started_at DESC);
ALTER TABLE public.platform_integration_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_integration_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY "integration health denies clients" ON public.platform_integration_checks
  AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.platform_integration_checks FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.platform_integration_checks TO service_role;

-- Privado: la huella permite invalidar comprobaciones tras rotar llave o cambiar ambiente.
CREATE FUNCTION public.platform_facturapi_fingerprint(p_mode text,p_key text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_mode IN ('test','live') AND nullif(btrim(p_key),'') IS NOT NULL
    THEN encode(sha256(convert_to(p_mode||':'||p_key,'UTF8')),'hex') END
$$;
REVOKE ALL ON FUNCTION public.platform_facturapi_fingerprint(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_get_integrations(p_actor uuid,p_session uuid,p_search text DEFAULT '',p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'integrations.read');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  IF p_offset IS NULL OR p_offset<0 OR p_offset>100000 OR p_search IS NULL OR length(p_search)>100 THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023'; END IF;
  WITH orgs AS (
    SELECT o.id,o.name,o.is_active FROM public.organizations o
    WHERE position(lower(btrim(p_search)) in lower(o.name||' '||o.slug))>0 OR btrim(p_search)=''
  ), page AS (SELECT * FROM orgs ORDER BY name,id LIMIT 25 OFFSET p_offset), rows AS (
    SELECT o.*,CASE WHEN cs.facturapi_mode IN ('test','live') THEN cs.facturapi_mode END AS mode,
      nullif(btrim(CASE cs.facturapi_mode WHEN 'test' THEN bs.facturapi_test_key WHEN 'live' THEN bs.facturapi_live_key END),'') IS NOT NULL AS key_configured,
      (SELECT jsonb_build_object('status',c.status,'startedAt',c.started_at,'completedAt',c.completed_at,
        'latencyMs',c.latency_ms,'httpStatus',c.http_status,'version',c.app_version)
       FROM public.platform_integration_checks c
       WHERE c.organization_id=o.id AND c.mode IS NOT DISTINCT FROM cs.facturapi_mode
         AND c.key_fingerprint IS NOT DISTINCT FROM public.platform_facturapi_fingerprint(cs.facturapi_mode,
           CASE cs.facturapi_mode WHEN 'test' THEN bs.facturapi_test_key WHEN 'live' THEN bs.facturapi_live_key END)
       ORDER BY c.started_at DESC,c.id DESC LIMIT 1) AS last_check,
      (SELECT count(*) FROM public.cfdi_retry_queue q WHERE q.organization_id=o.id AND q.status IN ('pending','processing')) AS queued_jobs,
      (SELECT count(*) FROM public.cfdi_retry_queue q WHERE q.organization_id=o.id AND q.status='exhausted') AS exhausted_jobs
    FROM page o LEFT JOIN public.company_settings cs ON cs.organization_id=o.id
      LEFT JOIN public.billing_secrets bs ON bs.organization_id=o.id
  )
  SELECT jsonb_build_object('observedAt',clock_timestamp(),'total',(SELECT count(*) FROM orgs),
    'rows',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',is_active,'mode',mode,
      'keyConfigured',key_configured,'lastCheck',last_check,'queuedJobs',queued_jobs,'exhaustedJobs',exhausted_jobs)
      ORDER BY name,id),'[]'::jsonb)) INTO v_result FROM rows;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.platform_get_integrations(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_integrations(uuid,uuid,text,integer) TO service_role;

-- Reserva durable antes de consultar al proveedor. La llave sólo se entrega a este RPC de servidor.
CREATE FUNCTION public.platform_begin_integration_check(p_actor uuid,p_session uuid,p_org uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mode text; v_key text; v_check public.platform_integration_checks; v_preflight text:='ready';
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'integrations.check');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  IF p_request IS NULL OR p_org IS NULL THEN RAISE EXCEPTION 'Identificador inválido' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text,93));
  IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org AND is_active) THEN
    RAISE EXCEPTION 'Empresa no disponible' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_check FROM public.platform_integration_checks WHERE id=p_request;
  IF FOUND THEN
    IF v_check.organization_id<>p_org OR v_check.actor_id IS DISTINCT FROM p_actor THEN
      RAISE EXCEPTION 'Solicitud ajena' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('started',false,'status',v_check.status);
  END IF;
  IF EXISTS(SELECT 1 FROM public.platform_integration_checks WHERE organization_id=p_org
    AND started_at>clock_timestamp()-interval '1 minute') THEN
    RAISE EXCEPTION 'Espera un minuto antes de comprobar de nuevo' USING ERRCODE='P0001'; END IF;
  UPDATE public.platform_integration_checks SET status='unavailable',completed_at=clock_timestamp()
    WHERE organization_id=p_org AND status='pending' AND started_at<clock_timestamp()-interval '1 minute';
  SELECT cs.facturapi_mode,CASE cs.facturapi_mode WHEN 'test' THEN bs.facturapi_test_key WHEN 'live' THEN bs.facturapi_live_key END
    INTO v_mode,v_key FROM public.company_settings cs LEFT JOIN public.billing_secrets bs ON bs.organization_id=cs.organization_id
    WHERE cs.organization_id=p_org;
  IF v_mode IS NULL OR v_mode NOT IN ('test','live') OR nullif(btrim(v_key),'') IS NULL THEN
    v_preflight:='unconfigured'; v_key:=NULL;
  ELSIF left(v_key,8)<>(CASE v_mode WHEN 'test' THEN 'sk_test_' ELSE 'sk_live_' END) THEN
    v_preflight:='invalid_key_mode'; v_key:=NULL;
  ELSIF EXISTS(SELECT 1 FROM public.billing_secrets WHERE organization_id<>p_org
    AND (facturapi_test_key=v_key OR facturapi_live_key=v_key)) THEN
    v_preflight:='duplicate_key'; v_key:=NULL;
  END IF;
  INSERT INTO public.platform_integration_checks(id,organization_id,actor_id,mode,key_fingerprint)
    VALUES(p_request,p_org,p_actor,CASE WHEN v_mode IN ('test','live') THEN v_mode END,
      public.platform_facturapi_fingerprint(v_mode,(SELECT CASE v_mode WHEN 'test' THEN facturapi_test_key
        WHEN 'live' THEN facturapi_live_key END FROM public.billing_secrets WHERE organization_id=p_org)));
  RETURN jsonb_build_object('started',true,'mode',v_mode,'apiKey',v_key,'preflight',v_preflight);
END $$;
REVOKE ALL ON FUNCTION public.platform_begin_integration_check(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_begin_integration_check(uuid,uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.platform_complete_integration_check(p_actor uuid,p_session uuid,p_request uuid,
  p_status text,p_latency integer,p_http_status integer,p_version text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_check public.platform_integration_checks; v_mode text; v_key text; v_fingerprint text; v_status text:=p_status;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'integrations.check');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('connected','unconfigured','duplicate_key','invalid_key_mode','auth_error','rate_limited','unavailable','invalid_response')
    OR (p_latency IS NOT NULL AND (p_latency<0 OR p_latency>60000))
    OR (p_http_status IS NOT NULL AND (p_http_status<100 OR p_http_status>599))
    OR p_version IS NULL OR p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' THEN
    RAISE EXCEPTION 'Resultado inválido' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_check FROM public.platform_integration_checks WHERE id=p_request FOR UPDATE;
  IF NOT FOUND OR v_check.actor_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Solicitud ajena' USING ERRCODE='42501'; END IF;
  IF v_check.status<>'pending' THEN RETURN v_check.status; END IF;
  SELECT cs.facturapi_mode,CASE cs.facturapi_mode WHEN 'test' THEN bs.facturapi_test_key WHEN 'live' THEN bs.facturapi_live_key END
    INTO v_mode,v_key FROM public.company_settings cs LEFT JOIN public.billing_secrets bs ON bs.organization_id=cs.organization_id
    WHERE cs.organization_id=v_check.organization_id;
  v_fingerprint:=public.platform_facturapi_fingerprint(v_mode,v_key);
  IF v_check.mode IS DISTINCT FROM v_mode OR v_check.key_fingerprint IS DISTINCT FROM v_fingerprint
    OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_check.organization_id AND is_active) THEN v_status:='config_changed'; END IF;
  IF v_status='connected' AND EXISTS(SELECT 1 FROM public.billing_secrets WHERE organization_id<>v_check.organization_id
    AND (facturapi_test_key=v_key OR facturapi_live_key=v_key)) THEN v_status:='duplicate_key'; END IF;
  UPDATE public.platform_integration_checks SET status=v_status,completed_at=clock_timestamp(),
    latency_ms=p_latency,http_status=p_http_status,app_version=p_version WHERE id=p_request;
  RETURN v_status;
END $$;
REVOKE ALL ON FUNCTION public.platform_complete_integration_check(uuid,uuid,uuid,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_complete_integration_check(uuid,uuid,uuid,text,integer,integer,text) TO service_role;

CREATE FUNCTION public.platform_get_monitoring(p_actor uuid,p_session uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'monitoring.read');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('observedAt',clock_timestamp(),
    'pendingOnboarding',(SELECT count(*) FROM public.platform_onboarding_requests WHERE completed_at IS NULL),
    'incompleteBilling',(SELECT count(*) FROM public.organizations o LEFT JOIN public.company_settings cs ON cs.organization_id=o.id
      LEFT JOIN public.billing_secrets bs ON bs.organization_id=o.id WHERE o.is_active AND
      (cs.facturapi_mode IS NULL OR cs.facturapi_mode NOT IN ('test','live') OR
       nullif(btrim(cs.rfc),'') IS NULL OR nullif(btrim(cs.razon_social),'') IS NULL OR
       nullif(btrim(cs.regimen_fiscal),'') IS NULL OR nullif(btrim(cs.lugar_expedicion),'') IS NULL OR
       nullif(btrim(CASE cs.facturapi_mode WHEN 'test' THEN bs.facturapi_test_key WHEN 'live' THEN bs.facturapi_live_key END),'') IS NULL)),
    'queuedJobs',(SELECT count(*) FROM public.cfdi_retry_queue WHERE status IN ('pending','processing')),
    'exhaustedJobs',(SELECT count(*) FROM public.cfdi_retry_queue WHERE status='exhausted'),
    'openReports',(SELECT count(*) FROM public.feedback_reports WHERE status IN ('new','triage','accepted','in_progress')),
    'lastCheckAt',(SELECT max(completed_at) FROM public.platform_integration_checks));
END $$;
REVOKE ALL ON FUNCTION public.platform_get_monitoring(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_monitoring(uuid,uuid) TO service_role;
