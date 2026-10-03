-- Fixtures sólo PostgreSQL efímero; ningún PAC ni dato productivo. ROLLBACK al cerrar.
BEGIN;
SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at)
SELECT ('96000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fiscal-history-ci-'||n||'@example.com',now(),now(),now() FROM generate_series(1,4) n;
INSERT INTO public.profiles(user_id,full_name,is_active)
SELECT ('96000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Fiscal CI '||n,true FROM generate_series(1,4) n
ON CONFLICT(user_id) DO UPDATE SET is_active=true;
INSERT INTO public.platform_operators(auth_user_id,access_profile) VALUES
('96000000-0000-4000-8000-000000000001','support'),('96000000-0000-4000-8000-000000000002','catalogs');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after)
SELECT ('96960000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('96000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
now(),now(),now()+interval '1 hour' FROM generate_series(1,4) n;
INSERT INTO public.organizations(id,name,slug,is_active) VALUES
('96000000-0000-4000-8000-000000000011','Fiscal CI A','fiscal-ci-a-0098',true),
('96000000-0000-4000-8000-000000000012','Fiscal CI B','fiscal-ci-b-0098',true);
INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES
('96000000-0000-4000-8000-000000000011','96000000-0000-4000-8000-000000000003','internal'),
('96000000-0000-4000-8000-000000000012','96000000-0000-4000-8000-000000000004','internal');
INSERT INTO public.user_roles(user_id,role) VALUES('96000000-0000-4000-8000-000000000003','admin')
ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
SELECT set_config('app.organization_id','96000000-0000-4000-8000-000000000012',true);
INSERT INTO public.invoices(id,invoice_number,customer_name,subtotal,tax_amount,total,cfdi_status,facturapi_invoice_id)
VALUES('96000000-0000-4000-8000-000000000031','B-FOLIO-0042','Contenido privado del cliente B',100,16,116,'stamping','provider-private-id');
INSERT INTO public.cfdi_retry_queue(id,operation,invoice_id,payload,last_error)
VALUES('96000000-0000-4000-8000-000000000022','stamp','96000000-0000-4000-8000-000000000031',
  '{"credential":"private-no-share","rfc":"AAA010101AAA"}','private-diagnostic-message');
SELECT set_config('app.organization_id','96000000-0000-4000-8000-000000000011',true);
INSERT INTO public.company_settings(organization_id,razon_social,rfc,regimen_fiscal,lugar_expedicion,facturapi_mode)
VALUES('96000000-0000-4000-8000-000000000011','  Empresa legal fiscal A  ','AAA010101AAA','601','64000','test');
-- La cola puede contener una referencia inválida: nunca permite leer el documento B como A.
INSERT INTO public.cfdi_retry_queue(id,operation,invoice_id,payload,last_error)
VALUES('96000000-0000-4000-8000-000000000021','stamp','96000000-0000-4000-8000-000000000031',
  '{"credential":"private-no-share"}','private-diagnostic-message');

DO $$ DECLARE v jsonb; v_count integer; BEGIN
  v:=public.platform_list_fiscal_jobs('96000000-0000-4000-8000-000000000001','96960000-0000-4000-8000-000000000001','',
    '96000000-0000-4000-8000-000000000011');
  IF v->>'total'<>'1' OR v->'rows'->0->>'organizationName'<>'Empresa legal fiscal A' THEN RAISE EXCEPTION 'ORG: identidad/filtro incorrectos'; END IF;
  IF v::text LIKE '%private%' OR v::text LIKE '%AAA010101AAA%' OR v::text LIKE '%key_fingerprint%'
    OR v::text LIKE '%B-FOLIO%' OR (v->'rows'->0->>'documentAvailable')::boolean THEN RAISE EXCEPTION 'PROJECTION: filtró secretos o documento ajeno'; END IF;
  v:=public.platform_get_fiscal_job('96000000-0000-4000-8000-000000000001','96960000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000022');
  IF v->'job'->>'folio'<>'B-FOLIO-0042' OR NOT (v->'job'->>'hasProviderId')::boolean
    OR (v->'job'->>'hasUuid')::boolean THEN RAISE EXCEPTION 'DOC: referencia propia no disponible o UUID ficticio'; END IF;
  IF v::text LIKE '%provider-private-id%' OR v::text LIKE '%Contenido privado%' THEN RAISE EXCEPTION 'DOC: proyección excesiva'; END IF;
  v:=public.platform_get_fiscal_job('96000000-0000-4000-8000-000000000001','96960000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000021');
  IF jsonb_array_length(v->'events')<>1 OR v->'events'->0->>'kind'<>'queued' THEN RAISE EXCEPTION 'HISTORY: inventó intentos'; END IF;
  SELECT count(*) INTO v_count FROM public.platform_fiscal_job_events WHERE job_id='96000000-0000-4000-8000-000000000021';
  UPDATE public.cfdi_retry_queue SET updated_at=clock_timestamp() WHERE id='96000000-0000-4000-8000-000000000021';
  IF (SELECT count(*) FROM public.platform_fiscal_job_events WHERE job_id='96000000-0000-4000-8000-000000000021')<>v_count THEN
    RAISE EXCEPTION 'NOOP: registró heartbeat como intento'; END IF;
  BEGIN
    UPDATE public.cfdi_retry_queue SET deferrals=1 WHERE id='96000000-0000-4000-8000-000000000021';
    RAISE EXCEPTION 'Rollback de prueba';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF (SELECT count(*) FROM public.platform_fiscal_job_events WHERE job_id='96000000-0000-4000-8000-000000000021')<>v_count THEN
    RAISE EXCEPTION 'TX: persistió un evento revertido'; END IF;
  BEGIN
    UPDATE public.cfdi_retry_queue SET invoice_id='96000000-0000-4000-8000-000000000099' WHERE id='96000000-0000-4000-8000-000000000021';
    RAISE EXCEPTION 'IDENTITY: cambió documento de historial'; EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN PERFORM public.platform_list_fiscal_jobs('96000000-0000-4000-8000-000000000002','96960000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'CAP: catálogos accedió a fiscal'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_list_fiscal_jobs('96000000-0000-4000-8000-000000000003','96960000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'CAP: admin empresarial obtuvo fiscal global'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_list_fiscal_jobs('96000000-0000-4000-8000-000000000001','96960000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'SESSION: sesión ajena'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_get_fiscal_job('96000000-0000-4000-8000-000000000001','96960000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000021','9223372036854775808');
    RAISE EXCEPTION 'CURSOR: fuera de rango'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"96000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"96960000-0000-4000-8000-000000000003"}';
DO $$ BEGIN
  BEGIN PERFORM * FROM public.platform_fiscal_jobs; RAISE EXCEPTION 'ACL: leyó metadata'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.platform_fiscal_job_events; RAISE EXCEPTION 'ACL: leyó historial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_list_fiscal_jobs(auth.uid(),'96960000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'ACL: llamó RPC servicio'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.cfdi_retry_queue WHERE id='96000000-0000-4000-8000-000000000022') THEN RAISE EXCEPTION 'RLS: leyó cola B'; END IF;
END $$;
RESET role;
RESET request.jwt.claims;
DO $$ DECLARE v jsonb; v_next jsonb; n integer; BEGIN
  FOR n IN 1..52 LOOP UPDATE public.cfdi_retry_queue SET deferrals=deferrals+1 WHERE id='96000000-0000-4000-8000-000000000021'; END LOOP;
  v:=public.platform_get_fiscal_job('96000000-0000-4000-8000-000000000001','96960000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000021');
  IF jsonb_array_length(v->'events')<>50 OR v->>'nextCursor' IS NULL THEN RAISE EXCEPTION 'PAGE: no acotó historial'; END IF;
  v_next:=public.platform_get_fiscal_job('96000000-0000-4000-8000-000000000001','96960000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000021',v->>'nextCursor');
  IF jsonb_array_length(v_next->'events')<>3 OR v_next->>'nextCursor' IS NOT NULL
    OR (v_next->'events'->0->>'id')::bigint>=(v->>'nextCursor')::bigint THEN RAISE EXCEPTION 'PAGE: duplicó/omitió eventos'; END IF;
  UPDATE public.company_settings SET facturapi_mode='live' WHERE organization_id='96000000-0000-4000-8000-000000000011';
  v:=public.platform_get_fiscal_job('96000000-0000-4000-8000-000000000001','96960000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000021');
  IF v->'job'->>'modeAtEnqueue'<>'test' OR v->'job'->>'currentMode'<>'live' THEN RAISE EXCEPTION 'MODE: reescribió ambiente histórico'; END IF;
  DELETE FROM public.cfdi_retry_queue WHERE id='96000000-0000-4000-8000-000000000021';
  v:=public.platform_get_fiscal_job('96000000-0000-4000-8000-000000000001','96960000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000021');
  IF NOT (v->'job'->>'removed')::boolean OR v->'events'->0->>'kind'<>'removed' THEN RAISE EXCEPTION 'DELETE: perdió historial'; END IF;
  BEGIN UPDATE public.platform_fiscal_job_events SET kind='changed'; RAISE EXCEPTION 'IMMUTABLE: pudo alterar historia'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.platform_fiscal_job_events; RAISE EXCEPTION 'IMMUTABLE: pudo borrar historia'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL role='service_role';
DO $$ BEGIN
  BEGIN INSERT INTO public.platform_fiscal_job_events(job_id,organization_id,revision,kind,state)
    VALUES(gen_random_uuid(),gen_random_uuid(),1,'queued','{}'); RAISE EXCEPTION 'SERVICE: insertó evento directo'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
TRUNCATE public.cfdi_retry_queue;
DO $$ BEGIN
  IF NOT (SELECT removed FROM public.platform_fiscal_jobs WHERE id='96000000-0000-4000-8000-000000000022') THEN RAISE EXCEPTION 'TRUNCATE: historial quedó en cola'; END IF;
END $$;
ROLLBACK;
