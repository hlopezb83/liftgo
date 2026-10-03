-- Historial técnico mínimo. No timbra, cancela ni reprograma documentos.
-- Los registros anteriores reciben una instantánea; no se inventan sus intentos previos.
CREATE TABLE public.platform_fiscal_jobs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  organization_name text NOT NULL,
  document_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN ('stamp','cancel','cancel_nc','cancel_rep')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  mode_at_enqueue text CHECK(mode_at_enqueue IN ('test','live')),
  key_fingerprint text,
  created_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed boolean NOT NULL DEFAULT false,
  state jsonb NOT NULL
);
CREATE TABLE public.platform_fiscal_job_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  revision bigint NOT NULL,
  kind text NOT NULL CHECK(kind IN ('snapshot','queued','changed','removed')),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  changed_fields text[] NOT NULL DEFAULT '{}',
  state jsonb NOT NULL,
  UNIQUE(job_id,revision)
);
CREATE INDEX platform_fiscal_jobs_org_date ON public.platform_fiscal_jobs(organization_id,observed_at DESC,id);
CREATE INDEX platform_fiscal_job_events_cursor ON public.platform_fiscal_job_events(job_id,id DESC);
ALTER TABLE public.platform_fiscal_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fiscal_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fiscal_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fiscal_job_events FORCE ROW LEVEL SECURITY;
CREATE POLICY "fiscal job metadata denies clients" ON public.platform_fiscal_jobs
  AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY "fiscal job history denies clients" ON public.platform_fiscal_job_events
  AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.platform_fiscal_jobs,public.platform_fiscal_job_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.platform_fiscal_jobs TO service_role;
GRANT SELECT ON public.platform_fiscal_job_events TO service_role;
REVOKE ALL ON SEQUENCE public.platform_fiscal_job_events_id_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER platform_fiscal_job_events_immutable BEFORE UPDATE OR DELETE ON public.platform_fiscal_job_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_audit_mutation();
CREATE TRIGGER platform_fiscal_job_events_no_truncate BEFORE TRUNCATE ON public.platform_fiscal_job_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_platform_audit_mutation();

CREATE FUNCTION public.platform_fiscal_queue_state(p_row jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object('status',p_row->>'status','attempts',(p_row->>'attempts')::integer,
    'maxAttempts',(p_row->>'max_attempts')::integer,'deferrals',(p_row->>'deferrals')::integer,
    'nextRetryAt',p_row->>'next_retry_at','hasError',nullif(btrim(p_row->>'last_error'),'') IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION public.platform_fiscal_queue_state(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Sólo configuración observada al encolar; no acredita el ambiente de un CFDI existente.
CREATE FUNCTION public.record_platform_fiscal_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_state jsonb; v_meta public.platform_fiscal_jobs; v_mode text; v_key text; v_name text; v_fields text[];
BEGIN
  v_state:=public.platform_fiscal_queue_state(v_row);
  IF TG_OP='UPDATE' AND v_state=public.platform_fiscal_queue_state(to_jsonb(OLD))
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.invoice_id=OLD.invoice_id AND NEW.operation=OLD.operation THEN RETURN NEW; END IF;
  SELECT * INTO v_meta FROM public.platform_fiscal_jobs WHERE id=(v_row->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN
    SELECT coalesce(nullif(btrim(cs.razon_social),''),o.name),cs.facturapi_mode,
      CASE cs.facturapi_mode WHEN 'test' THEN bs.facturapi_test_key WHEN 'live' THEN bs.facturapi_live_key END
      INTO v_name,v_mode,v_key FROM public.organizations o
      LEFT JOIN public.company_settings cs ON cs.organization_id=o.id
      LEFT JOIN public.billing_secrets bs ON bs.organization_id=o.id WHERE o.id=(v_row->>'organization_id')::uuid;
    INSERT INTO public.platform_fiscal_jobs(id,organization_id,organization_name,document_id,operation,
      mode_at_enqueue,key_fingerprint,created_at,removed,state)
      VALUES((v_row->>'id')::uuid,(v_row->>'organization_id')::uuid,coalesce(v_name,'Empresa no disponible'),
        (v_row->>'invoice_id')::uuid,v_row->>'operation',
        CASE WHEN TG_OP='INSERT' AND v_mode IN ('test','live') THEN v_mode END,
        CASE WHEN TG_OP='INSERT' THEN public.platform_facturapi_fingerprint(v_mode,v_key) END,
        (v_row->>'created_at')::timestamptz,TG_OP='DELETE',v_state) RETURNING * INTO v_meta;
  ELSE
    -- Identidad inmutable: el historial nunca se adopta desde otro documento/empresa.
    IF v_meta.organization_id IS DISTINCT FROM (v_row->>'organization_id')::uuid
      OR v_meta.document_id<>(v_row->>'invoice_id')::uuid OR v_meta.operation<>v_row->>'operation' THEN
      RAISE EXCEPTION 'La identidad del trabajo fiscal es inmutable' USING ERRCODE='22023'; END IF;
    SELECT coalesce(array_agg(key ORDER BY key),'{}') INTO v_fields FROM jsonb_each(v_state)
      WHERE value IS DISTINCT FROM v_meta.state->key;
    UPDATE public.platform_fiscal_jobs SET revision=revision+1,observed_at=clock_timestamp(),
      removed=TG_OP='DELETE',state=v_state WHERE id=v_meta.id RETURNING * INTO v_meta;
  END IF;
  INSERT INTO public.platform_fiscal_job_events(job_id,organization_id,revision,kind,changed_fields,state)
    VALUES(v_meta.id,v_meta.organization_id,v_meta.revision,
      CASE TG_OP WHEN 'INSERT' THEN 'queued' WHEN 'DELETE' THEN 'removed' ELSE 'changed' END,
      coalesce(v_fields,'{}'),v_state);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_platform_fiscal_job() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_platform_fiscal_history AFTER INSERT OR UPDATE OR DELETE ON public.cfdi_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.record_platform_fiscal_job();

CREATE FUNCTION public.record_platform_fiscal_truncate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH removed AS (UPDATE public.platform_fiscal_jobs SET removed=true,revision=revision+1,
    observed_at=clock_timestamp() WHERE NOT removed RETURNING *)
  INSERT INTO public.platform_fiscal_job_events(job_id,organization_id,revision,kind,state)
    SELECT id,organization_id,revision,'removed',state FROM removed;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.record_platform_fiscal_truncate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_platform_fiscal_truncate AFTER TRUNCATE ON public.cfdi_retry_queue
  FOR EACH STATEMENT EXECUTE FUNCTION public.record_platform_fiscal_truncate();

-- Snapshot actual, con fecha observada y ambiente histórico desconocido.
INSERT INTO public.platform_fiscal_jobs(id,organization_id,organization_name,document_id,operation,created_at,state)
SELECT q.id,q.organization_id,coalesce(nullif(btrim(cs.razon_social),''),o.name,'Empresa no disponible'),
  q.invoice_id,q.operation,q.created_at,public.platform_fiscal_queue_state(to_jsonb(q))
FROM public.cfdi_retry_queue q LEFT JOIN public.organizations o ON o.id=q.organization_id
LEFT JOIN public.company_settings cs ON cs.organization_id=q.organization_id;
INSERT INTO public.platform_fiscal_job_events(job_id,organization_id,revision,kind,state)
SELECT id,organization_id,revision,'snapshot',state FROM public.platform_fiscal_jobs;

CREATE FUNCTION public.platform_fiscal_job_projection(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id',j.id,'organizationId',j.organization_id,
    'organizationName',coalesce(nullif(btrim(cs.razon_social),''),o.name,j.organization_name),
    'documentId',j.document_id,'folio',d.folio,'documentStatus',d.status,
    'hasUuid',coalesce(d.has_uuid,false),'hasProviderId',coalesce(d.has_provider_id,false),
    'documentAvailable',d.id IS NOT NULL,'operation',j.operation,'revision',j.revision::text,
    'modeAtEnqueue',j.mode_at_enqueue,'currentMode',CASE WHEN cs.facturapi_mode IN ('test','live') THEN cs.facturapi_mode END,
    'createdAt',j.created_at,'observedAt',j.observed_at,'removed',j.removed,'state',j.state)
  FROM public.platform_fiscal_jobs j LEFT JOIN public.organizations o ON o.id=j.organization_id
  LEFT JOIN public.company_settings cs ON cs.organization_id=j.organization_id
  LEFT JOIN LATERAL (
    SELECT i.id,i.invoice_number AS folio,i.cfdi_status AS status,i.cfdi_uuid IS NOT NULL AS has_uuid,
      i.facturapi_invoice_id IS NOT NULL AS has_provider_id FROM public.invoices i
      WHERE j.operation IN ('stamp','cancel') AND i.id=j.document_id AND i.organization_id=j.organization_id
    UNION ALL SELECT n.id,n.credit_note_number,n.cfdi_status,n.cfdi_uuid IS NOT NULL,n.facturapi_invoice_id IS NOT NULL
      FROM public.credit_notes n WHERE j.operation='cancel_nc' AND n.id=j.document_id AND n.organization_id=j.organization_id
    UNION ALL SELECT p.id,coalesce(p.rep_number,p.rep_folio),p.rep_cfdi_status,p.rep_cfdi_uuid IS NOT NULL,p.rep_facturapi_id IS NOT NULL
      FROM public.payments p WHERE j.operation='cancel_rep' AND p.id=j.document_id AND p.organization_id=j.organization_id
  ) d ON true WHERE j.id=p_id
$$;
REVOKE ALL ON FUNCTION public.platform_fiscal_job_projection(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_list_fiscal_jobs(p_actor uuid,p_session uuid,p_search text DEFAULT '',
  p_org uuid DEFAULT NULL,p_status text DEFAULT NULL,p_operation text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'integrations.read');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  IF p_search IS NULL OR length(p_search)>100 OR p_offset IS NULL OR p_offset<0 OR p_offset>100000
    OR (p_status IS NOT NULL AND p_status NOT IN ('pending','processing','succeeded','exhausted','removed'))
    OR (p_operation IS NOT NULL AND p_operation NOT IN ('stamp','cancel','cancel_nc','cancel_rep')) THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023'; END IF;
  WITH jobs AS (
    SELECT j.id,j.observed_at,public.platform_fiscal_job_projection(j.id) AS row FROM public.platform_fiscal_jobs j
    WHERE (p_org IS NULL OR j.organization_id=p_org) AND (p_operation IS NULL OR j.operation=p_operation)
      AND (p_status IS NULL OR (p_status='removed' AND j.removed) OR (NOT j.removed AND j.state->>'status'=p_status))
  ), filtered AS (SELECT * FROM jobs WHERE btrim(p_search)='' OR position(lower(btrim(p_search)) IN
    lower(concat_ws(' ',row->>'organizationName',row->>'folio',row->>'documentId',id::text,
      (SELECT name FROM public.organizations WHERE id=(row->>'organizationId')::uuid))))>0),
  page AS (SELECT * FROM filtered ORDER BY observed_at DESC,id DESC LIMIT 25 OFFSET p_offset)
  SELECT jsonb_build_object('observedAt',clock_timestamp(),'total',(SELECT count(*) FROM filtered),
    'rows',coalesce(jsonb_agg(row ORDER BY observed_at DESC,id DESC),'[]'::jsonb)) INTO v_result FROM page;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.platform_list_fiscal_jobs(uuid,uuid,text,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_fiscal_jobs(uuid,uuid,text,uuid,text,text,integer) TO service_role;

CREATE FUNCTION public.platform_get_fiscal_job(p_actor uuid,p_session uuid,p_job uuid,p_before text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'integrations.read');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  IF p_job IS NULL OR (p_before IS NOT NULL AND p_before !~ '^[1-9][0-9]{0,18}$') THEN
    RAISE EXCEPTION 'Trabajo o cursor inválido' USING ERRCODE='22023'; END IF;
  IF p_before IS NOT NULL AND p_before::numeric>9223372036854775807 THEN
    RAISE EXCEPTION 'Cursor fuera de rango' USING ERRCODE='22023'; END IF;
  WITH page AS (SELECT * FROM public.platform_fiscal_job_events WHERE job_id=p_job
    AND (p_before IS NULL OR id<p_before::bigint) ORDER BY id DESC LIMIT 50), history AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'revision',revision::text,'kind',kind,
      'observedAt',observed_at,'changedFields',changed_fields,'state',state) ORDER BY id DESC),'[]'::jsonb) AS events,
      CASE WHEN count(*)=50 AND EXISTS(SELECT 1 FROM public.platform_fiscal_job_events
        WHERE job_id=p_job AND id<(SELECT min(id) FROM page)) THEN min(id) END AS cursor FROM page)
  SELECT jsonb_build_object('job',public.platform_fiscal_job_projection(p_job),'events',events,'nextCursor',cursor::text)
    INTO v_result FROM history;
  IF v_result->'job'='null'::jsonb THEN RAISE EXCEPTION 'Trabajo no disponible' USING ERRCODE='22023'; END IF;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.platform_get_fiscal_job(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_fiscal_job(uuid,uuid,uuid,text) TO service_role;
