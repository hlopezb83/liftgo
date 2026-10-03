-- Consulta de un solo documento antes de reprogramar. Nunca llama al PAC desde SQL.
-- La configuración observada anteriormente no acredita la llave usada en el PAC.
-- Cuatro dígitos son el mínimo visual; nunca se recorta el folio que asignó Facturapi.
CREATE OR REPLACE FUNCTION public.assign_stamped_invoice_number(p_invoice_id uuid, p_serie text, p_folio text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_new_number text;
  v_rows int;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;

    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'FAC-' || lpad(p_folio, greatest(length(p_folio), 4), '0');

  BEGIN
    UPDATE public.invoices
       SET invoice_number = v_new_number,
           serie = COALESCE(p_serie, serie),
           folio = p_folio
     WHERE id = p_invoice_id
       AND (v_org IS NULL OR organization_id = v_org);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'invoice % not found', p_invoice_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'invoice_number % already assigned (concurrent stamp)', v_new_number
      USING ERRCODE = 'unique_violation';
  END;

  RETURN v_new_number;
END;
$function$;

ALTER TABLE public.platform_fiscal_jobs ADD COLUMN config_source text NOT NULL DEFAULT 'observed'
  CHECK(config_source IN ('observed','attempt'));

-- Incluso processing→processing necesita un token distinto dentro de la misma transacción.
CREATE FUNCTION public.advance_fiscal_queue_token() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.advance_fiscal_queue_token() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER cfdi_retry_queue_set_updated_at ON public.cfdi_retry_queue;
CREATE TRIGGER cfdi_retry_queue_set_updated_at BEFORE UPDATE ON public.cfdi_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.advance_fiscal_queue_token();

CREATE OR REPLACE FUNCTION public.record_platform_fiscal_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_state jsonb; v_meta public.platform_fiscal_jobs; v_mode text; v_key text; v_name text; v_fields text[];
  v_fingerprint text; v_source text:='observed';
BEGIN
  v_state:=public.platform_fiscal_queue_state(v_row);
  IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'El ID del trabajo fiscal es inmutable' USING ERRCODE='22023'; END IF;
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
    IF TG_OP='INSERT' AND v_row->'payload'->'_fiscal_context'->>'mode' IN ('test','live')
      AND v_row->'payload'->'_fiscal_context'->>'fingerprint' ~ '^[0-9a-f]{64}$' THEN
      v_mode:=v_row->'payload'->'_fiscal_context'->>'mode';
      v_fingerprint:=v_row->'payload'->'_fiscal_context'->>'fingerprint';
      v_source:='attempt';
    END IF;
    INSERT INTO public.platform_fiscal_jobs(id,organization_id,organization_name,document_id,operation,
      mode_at_enqueue,key_fingerprint,config_source,created_at,removed,state)
      VALUES((v_row->>'id')::uuid,(v_row->>'organization_id')::uuid,coalesce(v_name,'Empresa no disponible'),
        (v_row->>'invoice_id')::uuid,v_row->>'operation',
        CASE WHEN TG_OP='INSERT' AND v_mode IN ('test','live') THEN v_mode END,
        CASE WHEN TG_OP='INSERT' THEN
          CASE WHEN v_source='attempt' THEN v_fingerprint ELSE public.platform_facturapi_fingerprint(v_mode,v_key) END END,
        v_source,(v_row->>'created_at')::timestamptz,TG_OP='DELETE',v_state) RETURNING * INTO v_meta;
  ELSE
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

CREATE OR REPLACE FUNCTION public.platform_fiscal_job_projection(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id',j.id,'organizationId',j.organization_id,
    'organizationName',coalesce(nullif(btrim(cs.razon_social),''),o.name,j.organization_name),
    'documentId',j.document_id,'folio',d.folio,'documentStatus',d.status,
    'hasUuid',coalesce(d.has_uuid,false),'hasProviderId',coalesce(d.has_provider_id,false),
    'documentAvailable',d.id IS NOT NULL,'operation',j.operation,'revision',j.revision::text,
    'configurationVerified',j.config_source='attempt','modeAtEnqueue',j.mode_at_enqueue,'currentMode',CASE WHEN cs.facturapi_mode IN ('test','live') THEN cs.facturapi_mode END,
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
CREATE OR REPLACE FUNCTION public.platform_profile_capabilities(p_profile text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_profile
    WHEN 'root' THEN ARRAY['organizations.read','organizations.details','organizations.create',
      'organizations.suspend','organizations.resume','catalogs.read','catalogs.write','catalogs.import',
      'templates.read','templates.publish','templates.assign','templates.import','audit.read',
      'operators.read','operators.manage','integrations.read','integrations.check','integrations.retry',
      'monitoring.read','support.read','support.manage']
    WHEN 'organizations' THEN ARRAY['organizations.read','organizations.details','organizations.create','organizations.suspend','organizations.resume']
    WHEN 'catalogs' THEN ARRAY['catalogs.read','catalogs.write','catalogs.import','templates.read','templates.publish','templates.assign','templates.import']
    WHEN 'support' THEN ARRAY['organizations.read','catalogs.read','integrations.read','integrations.check','integrations.retry','monitoring.read','support.read','support.manage']
    WHEN 'observer' THEN ARRAY['organizations.read','catalogs.read','templates.read','audit.read','integrations.read','monitoring.read']
    ELSE ARRAY[]::text[] END
$$;
UPDATE public.platform_operators SET permission_revision=permission_revision+1 WHERE access_profile IN ('root','support');

CREATE TABLE public.platform_fiscal_actions (
  id uuid PRIMARY KEY, job_id uuid NOT NULL, organization_id uuid NOT NULL,
  actor_id uuid NOT NULL, session_id uuid NOT NULL,
  intent text NOT NULL CHECK(intent IN ('reconcile','retry')),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 300),
  expected_revision bigint NOT NULL, reserved_revision bigint NOT NULL, queue_token timestamptz NOT NULL,
  previous_state jsonb NOT NULL, document_snapshot jsonb NOT NULL,
  mode text NOT NULL CHECK(mode IN ('test','live')), key_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','recovered','pac_pending','missing',
    'retry_scheduled','cancelled','cancellation_pending','provider_failed','inconclusive','config_changed',
    'document_changed','expired','budget_exhausted')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 minutes'
);
CREATE INDEX platform_fiscal_actions_job_date ON public.platform_fiscal_actions(job_id,started_at DESC,id);
CREATE UNIQUE INDEX platform_fiscal_action_pending ON public.platform_fiscal_actions(job_id) WHERE status='pending';
ALTER TABLE public.platform_fiscal_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fiscal_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY "fiscal actions deny clients" ON public.platform_fiscal_actions AS RESTRICTIVE
  FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.platform_fiscal_actions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.platform_fiscal_actions TO service_role;
CREATE FUNCTION public.guard_platform_fiscal_action_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Historial inmutable' USING ERRCODE='42501'; END IF;
  IF OLD.status<>'pending' OR NEW.status='pending' OR NEW.completed_at IS NULL
    OR (to_jsonb(OLD)-ARRAY['status','completed_at'])<>(to_jsonb(NEW)-ARRAY['status','completed_at']) THEN
    RAISE EXCEPTION 'Sólo se permite completar la reserva' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_platform_fiscal_action_history() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER platform_fiscal_actions_history BEFORE UPDATE OR DELETE ON public.platform_fiscal_actions
  FOR EACH ROW EXECUTE FUNCTION public.guard_platform_fiscal_action_history();
CREATE TRIGGER platform_fiscal_actions_no_truncate BEFORE TRUNCATE ON public.platform_fiscal_actions
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_platform_audit_mutation();

-- Sólo campos necesarios para detectar cambios concurrentes; sin importes, clientes o payloads.
CREATE FUNCTION public.platform_fiscal_document_snapshot(p_job public.platform_fiscal_jobs,p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF p_job.operation IN ('stamp','cancel') THEN
    IF p_lock THEN PERFORM 1 FROM public.invoices WHERE id=p_job.document_id AND organization_id=p_job.organization_id FOR UPDATE; END IF;
    SELECT jsonb_build_object('status',cfdi_status,'providerId',facturapi_invoice_id,'uuid',cfdi_uuid,
      'cancellationStatus',cancellation_status,'requestedAt',cancellation_requested_at,'updatedAt',updated_at,'environment',facturapi_env,'invoiceNumber',invoice_number,
      'rowHash',encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex'))
      INTO v FROM public.invoices i WHERE id=p_job.document_id AND organization_id=p_job.organization_id;
  ELSIF p_job.operation='cancel_nc' THEN
    IF p_lock THEN PERFORM 1 FROM public.credit_notes WHERE id=p_job.document_id AND organization_id=p_job.organization_id FOR UPDATE; END IF;
    SELECT jsonb_build_object('status',cfdi_status,'providerId',facturapi_invoice_id,'uuid',cfdi_uuid,
      'cancellationStatus',cancellation_status,'requestedAt',cancellation_requested_at,'updatedAt',updated_at,
      'rowHash',encode(sha256(convert_to(to_jsonb(n)::text,'UTF8')),'hex'))
      INTO v FROM public.credit_notes n WHERE id=p_job.document_id AND organization_id=p_job.organization_id;
  ELSE
    IF p_lock THEN PERFORM 1 FROM public.payments WHERE id=p_job.document_id AND organization_id=p_job.organization_id FOR UPDATE; END IF;
    SELECT jsonb_build_object('status',rep_cfdi_status,'providerId',rep_facturapi_id,'uuid',rep_cfdi_uuid,
      'cancellationStatus',rep_cancellation_status,'requestedAt',rep_cancellation_requested_at,
      'rowHash',encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex'))
      INTO v FROM public.payments p WHERE id=p_job.document_id AND organization_id=p_job.organization_id;
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.platform_fiscal_document_snapshot(public.platform_fiscal_jobs,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_begin_fiscal_action(p_actor uuid,p_session uuid,p_job uuid,p_request uuid,
  p_revision text,p_intent text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.cfdi_retry_queue; j public.platform_fiscal_jobs; a public.platform_fiscal_actions;
  v_doc jsonb; v_mode text; v_key text; v_fingerprint text; v_old public.platform_fiscal_actions; v_token timestamptz;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'integrations.retry');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  IF p_job IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_revision !~ '^[1-9][0-9]{0,18}$'
    OR p_revision::numeric>9223372036854775807 OR p_intent IS NULL OR p_intent NOT IN ('reconcile','retry')
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 300 THEN
    RAISE EXCEPTION 'Solicitud inválida' USING ERRCODE='22023'; END IF;
  -- Orden de bloqueo igual al trigger de historial: cola, metadata, acción, documento.
  SELECT * INTO q FROM public.cfdi_retry_queue WHERE id=p_job FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trabajo retirado' USING ERRCODE='22023'; END IF;
  SELECT * INTO j FROM public.platform_fiscal_jobs WHERE id=p_job FOR UPDATE;
  IF NOT FOUND OR j.removed THEN RAISE EXCEPTION 'Trabajo no disponible' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM public.platform_fiscal_actions WHERE id=p_request FOR UPDATE;
  IF FOUND THEN
    IF a.job_id<>p_job OR a.actor_id<>p_actor OR a.intent<>p_intent OR a.reason<>btrim(p_reason)
      OR a.expected_revision<>p_revision::bigint THEN RAISE EXCEPTION 'Solicitud ajena o distinta' USING ERRCODE='42501'; END IF;
    IF a.status='pending' AND a.expires_at<=clock_timestamp() THEN
      IF j.revision=a.reserved_revision AND q.status='processing' AND q.updated_at=a.queue_token THEN
        UPDATE public.cfdi_retry_queue SET status=a.previous_state->>'status',updated_at=clock_timestamp() WHERE id=q.id;
      END IF;
      UPDATE public.platform_fiscal_actions SET status='expired',completed_at=clock_timestamp() WHERE id=a.id;
      RETURN jsonb_build_object('started',false,'status','expired');
    END IF;
    RETURN jsonb_build_object('started',false,'status',a.status);
  END IF;
  SELECT * INTO v_old FROM public.platform_fiscal_actions WHERE job_id=p_job AND status='pending' FOR UPDATE;
  IF FOUND THEN
    IF v_old.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'Consulta en proceso' USING ERRCODE='P0001'; END IF;
    IF j.revision=v_old.reserved_revision AND q.status='processing' AND q.updated_at=v_old.queue_token THEN
      UPDATE public.cfdi_retry_queue SET status=v_old.previous_state->>'status',updated_at=clock_timestamp() WHERE id=q.id;
    END IF;
    UPDATE public.platform_fiscal_actions SET status='expired',completed_at=clock_timestamp() WHERE id=v_old.id;
    -- El cliente debe refrescar la revisión después de liberar una reserva vencida.
    RETURN jsonb_build_object('started',false,'status','expired');
  END IF;
  IF j.revision<>p_revision::bigint THEN RAISE EXCEPTION 'Revisión cambió' USING ERRCODE='40001'; END IF;
  IF q.status='processing' THEN RAISE EXCEPTION 'El procesador tiene el trabajo' USING ERRCODE='P0001'; END IF;
  IF q.organization_id<>j.organization_id OR q.invoice_id<>j.document_id OR q.operation<>j.operation
    OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=j.organization_id AND is_active) THEN
    RAISE EXCEPTION 'Identidad o empresa no disponible' USING ERRCODE='22023'; END IF;
  v_doc:=public.platform_fiscal_document_snapshot(j,true);
  IF v_doc IS NULL THEN RAISE EXCEPTION 'Documento no disponible en la empresa' USING ERRCODE='22023'; END IF;
  SELECT cs.facturapi_mode,CASE cs.facturapi_mode WHEN 'test' THEN bs.facturapi_test_key WHEN 'live' THEN bs.facturapi_live_key END
    INTO v_mode,v_key FROM public.company_settings cs LEFT JOIN public.billing_secrets bs ON bs.organization_id=cs.organization_id
    WHERE cs.organization_id=j.organization_id;
  v_fingerprint:=public.platform_facturapi_fingerprint(v_mode,v_key);
  IF j.config_source<>'attempt' OR j.mode_at_enqueue IS NULL OR j.key_fingerprint IS NULL OR j.mode_at_enqueue IS DISTINCT FROM v_mode
    OR (v_doc->>'environment' IS NOT NULL AND v_doc->>'environment'<>v_mode)
    OR j.key_fingerprint IS DISTINCT FROM v_fingerprint OR length(coalesce(v_key,''))<=8
    OR left(v_key,8)<>(CASE v_mode WHEN 'test' THEN 'sk_test_' ELSE 'sk_live_' END)
    OR EXISTS(SELECT 1 FROM public.billing_secrets WHERE organization_id<>j.organization_id
      AND (facturapi_test_key=v_key OR facturapi_live_key=v_key)) THEN
    RAISE EXCEPTION 'Configuración histórica desconocida o cambiada' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.platform_fiscal_actions WHERE job_id=p_job AND started_at>clock_timestamp()-interval '1 minute') THEN
    RAISE EXCEPTION 'Espera un minuto' USING ERRCODE='P0001'; END IF;
  UPDATE public.cfdi_retry_queue SET status='processing',updated_at=clock_timestamp() WHERE id=q.id RETURNING updated_at INTO v_token;
  SELECT * INTO j FROM public.platform_fiscal_jobs WHERE id=p_job;
  INSERT INTO public.platform_fiscal_actions(id,job_id,organization_id,actor_id,session_id,intent,reason,
    expected_revision,reserved_revision,queue_token,previous_state,document_snapshot,mode,key_fingerprint)
    VALUES(p_request,p_job,j.organization_id,p_actor,p_session,p_intent,btrim(p_reason),p_revision::bigint,j.revision,v_token,
      public.platform_fiscal_queue_state(to_jsonb(q)),v_doc,v_mode,v_fingerprint);
  RETURN jsonb_build_object('started',true,'apiKey',v_key,'mode',v_mode,'documentId',j.document_id,'knownId',v_doc->>'providerId');
END $$;
REVOKE ALL ON FUNCTION public.platform_begin_fiscal_action(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_begin_fiscal_action(uuid,uuid,uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.platform_complete_fiscal_action(p_actor uuid,p_session uuid,p_request uuid,
  p_outcome text,p_provider_id text DEFAULT NULL,p_uuid text DEFAULT NULL,p_cancellation text DEFAULT NULL,
  p_folio text DEFAULT NULL,p_series text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.cfdi_retry_queue; j public.platform_fiscal_jobs; a public.platform_fiscal_actions;
  v_doc jsonb; v_mode text; v_key text; v_status text:=p_outcome; v_queue text;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'integrations.retry');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('valid','pending','failed','cancelled','missing','inconclusive')
    OR (p_provider_id IS NOT NULL AND p_provider_id !~ '^[a-zA-Z0-9_-]{1,128}$')
    OR (p_uuid IS NOT NULL AND p_uuid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR (p_cancellation IS NOT NULL AND p_cancellation NOT IN ('none','pending','accepted','rejected','expired'))
    OR (p_outcome IN ('valid','cancelled') AND (p_provider_id IS NULL OR p_uuid IS NULL))
    OR (p_outcome IN ('pending','failed') AND (p_provider_id IS NULL OR p_uuid IS NOT NULL))
    OR (p_outcome IN ('valid','cancelled') AND (p_folio IS NULL OR p_folio !~ '^[1-9][0-9]{0,15}$'))
    OR (p_series IS NOT NULL AND length(p_series)>25) THEN
    RAISE EXCEPTION 'Resultado inválido' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM public.platform_fiscal_actions WHERE id=p_request;
  IF NOT FOUND OR a.actor_id<>p_actor OR a.session_id<>p_session THEN RAISE EXCEPTION 'Solicitud ajena' USING ERRCODE='42501'; END IF;
  SELECT * INTO q FROM public.cfdi_retry_queue WHERE id=a.job_id FOR UPDATE;
  SELECT * INTO j FROM public.platform_fiscal_jobs WHERE id=a.job_id FOR UPDATE;
  SELECT * INTO a FROM public.platform_fiscal_actions WHERE id=p_request FOR UPDATE;
  IF a.status<>'pending' THEN RETURN a.status; END IF;
  v_queue:=a.previous_state->>'status';
  v_doc:=public.platform_fiscal_document_snapshot(j,true);
  SELECT cs.facturapi_mode,CASE cs.facturapi_mode WHEN 'test' THEN bs.facturapi_test_key WHEN 'live' THEN bs.facturapi_live_key END
    INTO v_mode,v_key FROM public.company_settings cs LEFT JOIN public.billing_secrets bs ON bs.organization_id=cs.organization_id
    WHERE cs.organization_id=a.organization_id;
  IF q.id IS NULL OR j.removed OR j.revision<>a.reserved_revision OR q.status<>'processing'
    OR q.updated_at IS DISTINCT FROM a.queue_token THEN v_status:='document_changed';
  ELSIF a.expires_at<=clock_timestamp() THEN v_status:='expired';
  ELSIF v_doc IS DISTINCT FROM a.document_snapshot THEN v_status:='document_changed';
  ELSIF a.mode IS DISTINCT FROM v_mode OR a.key_fingerprint IS DISTINCT FROM public.platform_facturapi_fingerprint(v_mode,v_key)
    OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=a.organization_id AND is_active)
    OR EXISTS(SELECT 1 FROM public.billing_secrets WHERE organization_id<>a.organization_id AND (facturapi_test_key=v_key OR facturapi_live_key=v_key)) THEN v_status:='config_changed';
  ELSIF (a.document_snapshot->>'providerId' IS NOT NULL AND p_provider_id IS DISTINCT FROM a.document_snapshot->>'providerId' AND p_outcome<>'inconclusive')
    OR (a.document_snapshot->>'uuid' IS NOT NULL AND p_uuid IS DISTINCT FROM a.document_snapshot->>'uuid' AND p_outcome NOT IN ('pending','failed','inconclusive')) THEN v_status:='inconclusive';
  ELSE
    PERFORM set_config('app.organization_id',a.organization_id::text,true);
    IF j.operation='stamp' AND p_outcome IN ('valid','pending') AND coalesce(p_cancellation,'none')<>'accepted' THEN
      IF v_doc->>'status' IN ('pending','error','stamping') AND v_doc->>'uuid' IS NULL THEN
        UPDATE public.invoices SET facturapi_invoice_id=p_provider_id,cfdi_uuid=p_uuid,cfdi_status='stamping',
          facturapi_env=a.mode,folio=coalesce(p_folio,folio),serie=coalesce(p_series,serie),cfdi_error_message=NULL,updated_at=clock_timestamp()
          WHERE id=j.document_id AND organization_id=j.organization_id;
        IF p_outcome='valid' AND v_doc->>'invoiceNumber' LIKE 'BORRADOR-%' THEN
          PERFORM public.assign_stamped_invoice_number(j.document_id,p_series,p_folio);
        END IF;
      END IF;
      v_status:=CASE p_outcome WHEN 'valid' THEN 'recovered' ELSE 'pac_pending' END; v_queue:='succeeded';
    ELSIF p_outcome='cancelled' OR (p_outcome='valid' AND p_cancellation='accepted') THEN
      IF j.operation='stamp' THEN
        -- Un CFDI encontrado ya cancelado conserva su identidad y folio del PAC.
        -- SQL no descarga archivos: el XML faltante sigue visible y se recupera al descargar.
        UPDATE public.invoices SET facturapi_invoice_id=p_provider_id,cfdi_uuid=p_uuid,facturapi_env=a.mode,
          folio=p_folio,serie=coalesce(p_series,serie),cancellation_status='accepted',cfdi_status='cancelled',status='cancelled',
          cancelled_at=coalesce(cancelled_at,clock_timestamp()),cfdi_error_message=NULL,
          cfdi_xml_pending=(nullif(cfdi_xml,'') IS NULL AND nullif(cfdi_xml_url,'') IS NULL),updated_at=clock_timestamp()
          WHERE id=j.document_id AND organization_id=j.organization_id;
        IF v_doc->>'invoiceNumber' LIKE 'BORRADOR-%' THEN
          PERFORM public.assign_stamped_invoice_number(j.document_id,p_series,p_folio);
        END IF;
      ELSIF j.operation='cancel_rep' THEN
        UPDATE public.payments SET rep_cancellation_status='accepted',rep_cfdi_status='cancelled',rep_cancelled_at=coalesce(rep_cancelled_at,clock_timestamp())
          WHERE id=j.document_id AND organization_id=j.organization_id;
      ELSIF j.operation='cancel_nc' THEN
        UPDATE public.credit_notes SET cancellation_status='accepted',cfdi_status='cancelled',status='cancelled',cancelled_at=coalesce(cancelled_at,clock_timestamp())
          WHERE id=j.document_id AND organization_id=j.organization_id;
      ELSE
        UPDATE public.invoices SET cancellation_status='accepted',cfdi_status='cancelled',status='cancelled',cancelled_at=coalesce(cancelled_at,clock_timestamp())
          WHERE id=j.document_id AND organization_id=j.organization_id;
      END IF;
      v_status:='cancelled'; v_queue:='succeeded';
    ELSIF p_outcome='pending' OR p_cancellation='pending' THEN v_status:='cancellation_pending';
    ELSIF p_outcome='failed' THEN v_status:='provider_failed';
    ELSIF a.intent='retry' AND ((j.operation='stamp' AND p_outcome='missing' AND v_doc->>'providerId' IS NULL
      AND v_doc->>'uuid' IS NULL AND v_doc->>'status' IN ('pending','error')) OR
      (j.operation<>'stamp' AND p_outcome='valid' AND p_cancellation IN ('none','rejected','expired')
        AND v_doc->>'cancellationStatus' IN ('none','rejected','expired') AND v_doc->>'status'='stamped')) THEN
      IF q.attempts>=20 OR (SELECT count(*) FROM public.platform_fiscal_actions WHERE job_id=q.id AND status='retry_scheduled')>=5 THEN
        v_status:='budget_exhausted';
      ELSE
        UPDATE public.cfdi_retry_queue SET status='pending',max_attempts=greatest(max_attempts,attempts+1),
          next_retry_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=q.id;
        v_status:='retry_scheduled'; v_queue:='pending';
      END IF;
    ELSIF p_outcome='missing' THEN v_status:='missing';
    ELSE v_status:='inconclusive'; END IF;
  END IF;
  -- Si cambió la revisión durante la consulta, no toca el trabajo del otro proceso.
  IF v_status='config_changed' AND v_queue='pending' THEN v_queue:='exhausted'; END IF;
  IF q.id IS NOT NULL AND NOT j.removed AND j.revision=a.reserved_revision AND q.status='processing' AND q.updated_at=a.queue_token THEN
    UPDATE public.cfdi_retry_queue SET status=v_queue,updated_at=clock_timestamp() WHERE id=q.id;
  END IF;
  UPDATE public.platform_fiscal_actions SET status=v_status,completed_at=clock_timestamp() WHERE id=a.id;
  RETURN v_status;
END $$;
REVOKE ALL ON FUNCTION public.platform_complete_fiscal_action(uuid,uuid,uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_complete_fiscal_action(uuid,uuid,uuid,text,text,text,text,text,text) TO service_role;

CREATE FUNCTION public.platform_list_fiscal_actions(p_actor uuid,p_session uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'integrations.read');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'actorId',actor_id,
    'actorName',coalesce((SELECT nullif(btrim(full_name),'') FROM public.profiles WHERE user_id=a.actor_id),'Cuenta no disponible'),'intent',intent,'reason',reason,
    'status',status,'startedAt',started_at,'completedAt',completed_at,'expiresAt',expires_at,'expectedRevision',expected_revision::text)
    ORDER BY started_at DESC,id DESC),'[]'::jsonb) FROM (SELECT * FROM public.platform_fiscal_actions WHERE job_id=p_job
      ORDER BY started_at DESC,id DESC LIMIT 50) a);
END $$;
REVOKE ALL ON FUNCTION public.platform_list_fiscal_actions(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_fiscal_actions(uuid,uuid,uuid) TO service_role;
