-- Exclusivamente PostgreSQL efímero de CI. No llama Facturapi. Todos los fixtures se revierten.
BEGIN;
RESET request.jwt.claims;
CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('99000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at)
SELECT pg_temp.id(n),'fiscal-recovery-ci-'||n||'@example.com',now(),now(),now() FROM generate_series(1,3) n;
INSERT INTO public.profiles(user_id,full_name,is_active) SELECT pg_temp.id(n),'Operador fiscal CI '||n,true FROM generate_series(1,3) n
ON CONFLICT(user_id) DO UPDATE SET is_active=true;
INSERT INTO public.platform_operators(auth_user_id,access_profile) VALUES(pg_temp.id(1),'support'),(pg_temp.id(2),'observer');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after)
SELECT pg_temp.id(100+n),pg_temp.id(n),now(),now(),now()+interval '1 hour' FROM generate_series(1,3) n;
INSERT INTO public.organizations(id,name,slug,is_active) VALUES
(pg_temp.id(11),'Fiscal Recovery CI A','fiscal-recovery-ci-a-0099',true),(pg_temp.id(12),'Fiscal Recovery CI B','fiscal-recovery-ci-b-0099',true);
INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES(pg_temp.id(11),pg_temp.id(3),'internal');
INSERT INTO public.user_roles(user_id,role) VALUES(pg_temp.id(3),'admin') ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
SELECT set_config('app.organization_id',pg_temp.id(12)::text,true);
INSERT INTO public.company_settings(organization_id,razon_social,rfc,regimen_fiscal,lugar_expedicion,facturapi_mode)
VALUES(pg_temp.id(12),'Fiscal B','BBB010101BBB','601','64000','test');
INSERT INTO public.billing_secrets(organization_id,facturapi_test_key) VALUES(pg_temp.id(12),'sk_test_ci_recovery_b_only');
INSERT INTO public.invoices(id,invoice_number,customer_name,line_items,subtotal,tax_amount,total,cfdi_status)
VALUES(pg_temp.id(32),'BORRADOR-CI-B-0032','Cliente fiscal CI B',
  '[{"description":"Renta de montacargas","quantity":1,"unit_price":100,"amount":100}]',100,16,116,'error');
SELECT set_config('app.organization_id',pg_temp.id(11)::text,true);
INSERT INTO public.company_settings(organization_id,razon_social,rfc,regimen_fiscal,lugar_expedicion,facturapi_mode)
VALUES(pg_temp.id(11),'Fiscal A','AAA010101AAA','601','64000','test');
INSERT INTO public.billing_secrets(organization_id,facturapi_test_key) VALUES(pg_temp.id(11),'sk_test_ci_recovery_a_only');
INSERT INTO public.invoices(id,invoice_number,customer_name,line_items,subtotal,tax_amount,total,cfdi_status)
SELECT pg_temp.id(n),'BORRADOR-CI-A-'||n,'Cliente fiscal CI A',
  '[{"description":"Renta de montacargas","quantity":1,"unit_price":100,"amount":100}]'::jsonb,
  100,16,116,'error' FROM generate_series(31,46) n WHERE n NOT IN (32,43,44);
INSERT INTO public.invoices(id,invoice_number,customer_name,line_items,subtotal,tax_amount,total,cfdi_status)
SELECT pg_temp.id(n),'BORRADOR-CI-A-'||n,'Cliente fiscal CI A',
  '[{"description":"Renta de montacargas","quantity":1,"unit_price":100,"amount":100}]'::jsonb,
  100,16,116,'error' FROM generate_series(47,56) n;
UPDATE public.invoices SET cfdi_status='stamping',facturapi_invoice_id='provider-33',facturapi_env='test' WHERE id=pg_temp.id(33);
UPDATE public.invoices SET status='sent',cfdi_status='stamped',facturapi_invoice_id='provider-'||right(id::text,2),
  cfdi_uuid='11111111-1111-4111-8111-111111111111',cancellation_status=CASE WHEN id=pg_temp.id(42) THEN 'pending' ELSE 'none' END
WHERE id IN (pg_temp.id(41),pg_temp.id(42),pg_temp.id(46),pg_temp.id(55));
UPDATE public.invoices SET cfdi_uuid='abcdefab-1234-4123-8123-abcdefabcdef' WHERE id=pg_temp.id(55);
INSERT INTO public.credit_notes(id,invoice_id,credit_note_number,motive,reason_text,subtotal,tax_amount,total,
  cfdi_status,facturapi_invoice_id,cfdi_uuid)
VALUES(pg_temp.id(43),pg_temp.id(46),'NC-CI-0043','correction','Comprobante de prueba CI',10,1.6,11.6,'stamped','provider-43','11111111-1111-4111-8111-111111111111');
INSERT INTO public.payments(id,invoice_id,amount,rep_cfdi_status,rep_facturapi_id,rep_cfdi_uuid)
VALUES(pg_temp.id(44),pg_temp.id(46),50,'stamped','provider-44','11111111-1111-4111-8111-111111111111');
INSERT INTO public.credit_notes(id,invoice_id,credit_note_number,motive,reason_text,line_items,subtotal,tax_amount,total,
  status,cfdi_status,facturapi_invoice_id,cfdi_uuid)
VALUES(pg_temp.id(57),pg_temp.id(46),'NC-CI-0057','correction','Ajuste de renta',
  '[{"description":"Ajuste de renta","quantity":1,"unit_price":10,"amount":10}]',10,1.6,11.6,
  'stamped','stamped','provider-57','11111111-1111-4111-8111-111111111111');
INSERT INTO public.payments(id,invoice_id,amount,rep_cfdi_status,rep_facturapi_id,rep_cfdi_uuid)
VALUES(pg_temp.id(58),pg_temp.id(46),25,'stamped','provider-58','11111111-1111-4111-8111-111111111111');
INSERT INTO public.cfdi_retry_queue(id,operation,invoice_id,payload,attempts,max_attempts,status,last_error,next_retry_at)
SELECT pg_temp.id(n),CASE WHEN n IN (33,47) THEN 'cancel_nc' WHEN n IN (34,48) THEN 'cancel_rep' WHEN n IN (31,32,45) THEN 'cancel' ELSE 'stamp' END,
  pg_temp.id(n+10),jsonb_build_object('organization_id',pg_temp.id(12),'private','payload','_fiscal_context',
    jsonb_build_object('mode','test','fingerprint',public.platform_facturapi_fingerprint('test','sk_test_ci_recovery_a_only'))),
  CASE WHEN n=30 THEN 20 ELSE 5 END,5,'exhausted','private-original-diagnostic',now()+interval '1 day'
FROM generate_series(21,48) n;
-- Sin contexto del intento, la observación de configuración no permite reprogramar.
INSERT INTO public.cfdi_retry_queue(id,operation,invoice_id,payload,attempts,max_attempts,status)
VALUES(pg_temp.id(60),'stamp',pg_temp.id(47),'{}',5,5,'exhausted');
CREATE FUNCTION pg_temp.start_action(job integer,request integer,intent text DEFAULT 'reconcile') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.platform_begin_fiscal_action(pg_temp.id(1),pg_temp.id(101),pg_temp.id(job),pg_temp.id(request),
    (SELECT revision::text FROM public.platform_fiscal_jobs WHERE id=pg_temp.id(job)),intent,'Comprobar el documento fiscal CI')
$$;
CREATE FUNCTION pg_temp.finish_action(request integer,outcome text,provider_id text DEFAULT NULL,remote_uuid text DEFAULT NULL,
  cancellation text DEFAULT NULL,folio text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT public.platform_complete_fiscal_action(pg_temp.id(1),pg_temp.id(101),pg_temp.id(request),outcome,provider_id,remote_uuid,cancellation,folio,'A')
$$;
DO $$ DECLARE v jsonb; v_status text; v_rows integer; v_rejected boolean; BEGIN
  -- Capacidades, sesiones y referencia de otra empresa, antes de entregar una llave al servidor.
  BEGIN PERFORM public.platform_begin_fiscal_action(pg_temp.id(2),pg_temp.id(102),pg_temp.id(21),pg_temp.id(121),'1','retry','Comprobar documento');
    RAISE EXCEPTION 'CAP: observador obtuvo acción'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_begin_fiscal_action(pg_temp.id(3),pg_temp.id(103),pg_temp.id(21),pg_temp.id(121),'1','retry','Comprobar documento');
    RAISE EXCEPTION 'CAP: admin empresarial obtuvo acción'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_begin_fiscal_action(pg_temp.id(1),pg_temp.id(102),pg_temp.id(21),pg_temp.id(121),'1','retry','Comprobar documento');
    RAISE EXCEPTION 'SESSION: sesión ajena'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM pg_temp.start_action(22,122); RAISE EXCEPTION 'ORG: entregó llave A para documento B'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.platform_fiscal_actions WHERE id=pg_temp.id(122)) THEN RAISE EXCEPTION 'ORG: creó reserva ajena'; END IF;
  v:=pg_temp.start_action(21,121,'retry');
  IF NOT (v->>'started')::boolean OR v->>'documentId'<>pg_temp.id(31)::text OR v->>'knownId' IS NOT NULL
    OR v::text LIKE '%payload%' THEN RAISE EXCEPTION 'RESERVE: identidad o proyección incorrecta'; END IF;
  UPDATE public.cfdi_retry_queue SET status='processing' WHERE id=pg_temp.id(21) AND status='pending';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>0 THEN RAISE EXCEPTION 'CLAIM: el worker tomó una reserva'; END IF;
  v_rejected:=false;
  BEGIN
    PERFORM pg_temp.start_action(21,921,'retry');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'Consulta en proceso' THEN RAISE; END IF;
    v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'CLAIM: segunda consulta activa'; END IF;
  v:=public.platform_begin_fiscal_action(pg_temp.id(1),pg_temp.id(101),pg_temp.id(21),pg_temp.id(121),'1','retry','Comprobar el documento fiscal CI');
  IF (v->>'started')::boolean OR v->>'status'<>'pending' OR v ? 'apiKey' THEN RAISE EXCEPTION 'REPLAY: vuelve a entregar la llave'; END IF;
  BEGIN PERFORM public.platform_begin_fiscal_action(pg_temp.id(1),pg_temp.id(101),pg_temp.id(21),pg_temp.id(121),'1','reconcile','Comprobar el documento fiscal CI');
    RAISE EXCEPTION 'REPLAY: cambió intención'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  v_status:=pg_temp.finish_action(121,'missing');
  IF v_status<>'retry_scheduled' OR NOT EXISTS(SELECT 1 FROM public.cfdi_retry_queue WHERE id=pg_temp.id(21)
    AND attempts=5 AND max_attempts=6 AND status='pending' AND last_error='private-original-diagnostic') THEN
    RAISE EXCEPTION 'BUDGET: reinició intentos o perdió diagnóstico'; END IF;
  IF pg_temp.finish_action(121,'missing')<>'retry_scheduled'
    OR (SELECT count(*) FROM public.platform_fiscal_actions WHERE job_id=pg_temp.id(21))<>1 THEN RAISE EXCEPTION 'REPLAY: duplicó resultado'; END IF;
  -- 202/ID sin UUID: guarda ID, nunca crea otro CFDI ni marca stamped sin archivos.
  PERFORM pg_temp.start_action(23,123,'retry');
  IF pg_temp.finish_action(123,'pending','provider-33')<>'pac_pending'
    OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=pg_temp.id(33) AND cfdi_uuid IS NULL AND cfdi_status='stamping') THEN
    RAISE EXCEPTION '202: inventó UUID o estado stamped'; END IF;
  -- Recuperación con folio Facturapi y transición a conciliación existente.
  PERFORM pg_temp.start_action(24,124,'retry');
  IF pg_temp.finish_action(124,'valid','provider-34','11111111-1111-4111-8111-111111111111','none','42')<>'recovered'
    OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=pg_temp.id(34) AND cfdi_status='stamping'
      AND folio='42' AND serie='A' AND invoice_number='FAC-0042' AND facturapi_env='test') THEN RAISE EXCEPTION 'RECOVERY: perdió folio o inventó stamped'; END IF;
  PERFORM pg_temp.start_action(25,125,'retry');
  IF pg_temp.finish_action(125,'failed','provider-35')<>'provider_failed'
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(25))<>'exhausted' THEN RAISE EXCEPTION 'FAILED: reprogramó fallo del PAC'; END IF;
  PERFORM pg_temp.start_action(26,126,'retry');
  IF pg_temp.finish_action(126,'inconclusive')<>'inconclusive'
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(26))<>'exhausted' THEN RAISE EXCEPTION 'UNKNOWN: reprogramó a ciegas'; END IF;
  PERFORM pg_temp.start_action(27,127,'retry');
  UPDATE public.company_settings SET facturapi_mode='live' WHERE organization_id=pg_temp.id(11);
  IF pg_temp.finish_action(127,'missing')<>'config_changed' THEN RAISE EXCEPTION 'CONFIG: aplicó una respuesta de ambiente anterior'; END IF;
  UPDATE public.company_settings SET facturapi_mode='test' WHERE organization_id=pg_temp.id(11);
  PERFORM pg_temp.start_action(28,128,'retry');
  UPDATE public.invoices SET customer_name='Cambió durante la consulta' WHERE id=pg_temp.id(38);
  IF pg_temp.finish_action(128,'missing')<>'document_changed' THEN RAISE EXCEPTION 'CONCURRENCY: sobrescribió documento cambiado'; END IF;
  PERFORM pg_temp.start_action(29,129,'retry');
  UPDATE public.cfdi_retry_queue SET status='succeeded' WHERE id=pg_temp.id(29);
  IF pg_temp.finish_action(129,'missing')<>'document_changed'
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(29))<>'succeeded' THEN RAISE EXCEPTION 'CONCURRENCY: sobrescribió otro procesador'; END IF;
  PERFORM pg_temp.start_action(30,130,'retry');
  IF pg_temp.finish_action(130,'missing')<>'budget_exhausted' THEN RAISE EXCEPTION 'BUDGET: excedió límite'; END IF;
  -- Cancelaciones: concilia lo confirmado; no vuelve a solicitar una pendiente.
  PERFORM pg_temp.start_action(31,131,'retry');
  IF pg_temp.finish_action(131,'cancelled','provider-41','11111111-1111-4111-8111-111111111111','accepted','41')<>'cancelled'
    OR (SELECT status FROM public.invoices WHERE id=pg_temp.id(41))<>'cancelled' THEN RAISE EXCEPTION 'CANCEL: no concilió factura'; END IF;
  PERFORM pg_temp.start_action(32,132,'retry');
  IF pg_temp.finish_action(132,'valid','provider-42','11111111-1111-4111-8111-111111111111','pending','42')<>'cancellation_pending'
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(32))<>'exhausted' THEN RAISE EXCEPTION 'CANCEL: reenviaría solicitud pendiente'; END IF;
  PERFORM pg_temp.start_action(33,133);
  IF pg_temp.finish_action(133,'cancelled','provider-43','11111111-1111-4111-8111-111111111111','accepted','43')<>'cancelled'
    OR (SELECT cfdi_status FROM public.credit_notes WHERE id=pg_temp.id(43))<>'cancelled' THEN RAISE EXCEPTION 'NC: no concilió'; END IF;
  PERFORM pg_temp.start_action(34,134);
  IF pg_temp.finish_action(134,'cancelled','provider-44','11111111-1111-4111-8111-111111111111','accepted','44')<>'cancelled'
    OR (SELECT rep_cfdi_status FROM public.payments WHERE id=pg_temp.id(44))<>'cancelled' THEN RAISE EXCEPTION 'REP: no concilió'; END IF;
  v:=public.platform_list_fiscal_actions(pg_temp.id(2),pg_temp.id(102),pg_temp.id(24));
  IF jsonb_array_length(v)<>1 OR v->0->>'actorName'<>'Operador fiscal CI 1'
    OR v::text LIKE '%fingerprint%' OR v::text LIKE '%provider-34%' OR v::text LIKE '%sk_test_%'
    OR v::text LIKE '%document_snapshot%' OR v::text LIKE '%private-original%' THEN RAISE EXCEPTION 'PROJECTION: filtró estado privado'; END IF;
  v_rejected:=false;
  BEGIN PERFORM pg_temp.start_action(60,160,'retry');
  EXCEPTION WHEN invalid_parameter_value THEN v_rejected:=true; END;
  IF NOT v_rejected OR EXISTS(SELECT 1 FROM public.platform_fiscal_actions WHERE id=pg_temp.id(160)) THEN
    RAISE EXCEPTION 'LEGACY: aceptó configuración sólo observada'; END IF;
  PERFORM pg_temp.start_action(37,137,'retry');
  UPDATE public.billing_secrets SET facturapi_test_key='sk_test_ci_rotated_only' WHERE organization_id=pg_temp.id(11);
  IF pg_temp.finish_action(137,'missing')<>'config_changed' OR NOT EXISTS(SELECT 1 FROM public.cfdi_retry_queue
    WHERE id=pg_temp.id(37) AND attempts=5 AND max_attempts=5 AND status='exhausted') THEN
    RAISE EXCEPTION 'KEY: reprogramó con otra llave'; END IF;
  UPDATE public.billing_secrets SET facturapi_test_key='sk_test_ci_recovery_a_only' WHERE organization_id=pg_temp.id(11);
  -- Permiso revocado durante el GET: tampoco se puede completar con una sesión antigua.
  PERFORM pg_temp.start_action(39,139,'retry');
  UPDATE public.platform_operators SET access_profile='observer' WHERE auth_user_id=pg_temp.id(1);
  v_rejected:=false;
  BEGIN PERFORM pg_temp.finish_action(139,'missing');
  EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
  IF NOT v_rejected OR (SELECT status FROM public.platform_fiscal_actions WHERE id=pg_temp.id(139))<>'pending'
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(39))<>'processing' THEN
    RAISE EXCEPTION 'REVOKED: completó sin capacidad'; END IF;
  UPDATE public.platform_operators SET access_profile='support' WHERE auth_user_id=pg_temp.id(1);
  PERFORM pg_temp.finish_action(139,'inconclusive');
  -- Un error al asignar el folio revierte también el documento y la reserva.
  PERFORM pg_temp.start_action(40,140,'retry');
  v_rejected:=false;
  BEGIN PERFORM pg_temp.finish_action(140,'valid','provider-50','11111111-1111-4111-8111-111111111111','none','42');
  EXCEPTION WHEN unique_violation THEN v_rejected:=true; END;
  IF NOT v_rejected OR (SELECT facturapi_invoice_id FROM public.invoices WHERE id=pg_temp.id(50)) IS NOT NULL
    OR (SELECT status FROM public.platform_fiscal_actions WHERE id=pg_temp.id(140))<>'pending'
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(40))<>'processing' THEN
    RAISE EXCEPTION 'ROLLBACK: persistió parcialmente una recuperación'; END IF;
  PERFORM pg_temp.finish_action(140,'inconclusive');
  -- Un nuevo dueño puede conservar processing y la misma revisión, pero cambia el token.
  PERFORM pg_temp.start_action(41,141,'retry');
  UPDATE public.cfdi_retry_queue SET status='processing' WHERE id=pg_temp.id(41);
  IF pg_temp.finish_action(141,'missing')<>'document_changed' OR
    (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(41))<>'processing' THEN
    RAISE EXCEPTION 'TOKEN: completó o liberó el trabajo de otro dueño'; END IF;
  -- CFDI ya cancelado descubierto por external_id: recuperar identidad/folio, sin volver a emitir.
  PERFORM pg_temp.start_action(42,142,'retry');
  IF pg_temp.finish_action(142,'cancelled','provider-52','11111111-1111-4111-8111-111111111111','accepted','52')<>'cancelled'
    OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=pg_temp.id(52) AND cfdi_status='cancelled'
      AND status='cancelled' AND facturapi_invoice_id='provider-52' AND facturapi_env='test'
      AND cfdi_uuid='11111111-1111-4111-8111-111111111111' AND invoice_number='FAC-0052' AND folio='52' AND cfdi_xml_pending)
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(42))<>'succeeded' THEN
    RAISE EXCEPTION 'CANCELLED RECOVERY: perdió identidad/folio o inventó archivos'; END IF;
  -- Cuatro dígitos son un mínimo: un folio mayor del PAC no se puede truncar.
  PERFORM pg_temp.start_action(43,143,'retry');
  IF pg_temp.finish_action(143,'valid','provider-53','11111111-1111-4111-8111-111111111111','none','12345')<>'recovered'
    OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=pg_temp.id(53) AND cfdi_status='stamping'
      AND folio='12345' AND invoice_number='FAC-12345' AND serie='A' AND facturapi_env='test') THEN
    RAISE EXCEPTION 'FOLIO: truncó el folio asignado por Facturapi'; END IF;
  -- Un resultado incierto o fallido pausa también una cola que antes estaba pendiente.
  UPDATE public.cfdi_retry_queue SET status='pending',max_attempts=6 WHERE id IN
    (pg_temp.id(44),pg_temp.id(45),pg_temp.id(46),pg_temp.id(47),pg_temp.id(48));
  PERFORM pg_temp.start_action(44,144,'retry');
  IF pg_temp.finish_action(144,'inconclusive')<>'inconclusive' OR NOT EXISTS(
    SELECT 1 FROM public.cfdi_retry_queue WHERE id=pg_temp.id(44) AND status='exhausted' AND attempts=5 AND max_attempts=6) THEN
    RAISE EXCEPTION 'UNCERTAIN PENDING: habilitó otro intento sin resolución'; END IF;
  PERFORM pg_temp.start_action(46,146,'retry');
  IF pg_temp.finish_action(146,'failed','provider-56')<>'provider_failed' OR NOT EXISTS(
    SELECT 1 FROM public.cfdi_retry_queue WHERE id=pg_temp.id(46) AND status='exhausted' AND attempts=5 AND max_attempts=6) THEN
    RAISE EXCEPTION 'FAILED PENDING: habilitó otro intento con un fallo del PAC'; END IF;
  -- Una cancelación pendiente en el PAC se conserva en el ERP para bloquear otro POST.
  PERFORM pg_temp.start_action(45,145,'retry');
  IF pg_temp.finish_action(145,'valid','provider-55','ABCDEFAB-1234-4123-8123-ABCDEFABCDEF','pending','55')<>'cancellation_pending'
    OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=pg_temp.id(55) AND cancellation_status='pending'
      AND cancellation_requested_at IS NOT NULL AND cfdi_status='stamped')
    OR NOT EXISTS(SELECT 1 FROM public.cfdi_retry_queue WHERE id=pg_temp.id(45) AND status='exhausted' AND attempts=5 AND max_attempts=6) THEN
    RAISE EXCEPTION 'PAC PENDING: permitió reenviar una cancelación confirmada pendiente'; END IF;
  PERFORM pg_temp.start_action(47,147,'retry');
  IF pg_temp.finish_action(147,'valid','provider-57','11111111-1111-4111-8111-111111111111','pending','57')<>'cancellation_pending'
    OR NOT EXISTS(SELECT 1 FROM public.credit_notes WHERE id=pg_temp.id(57) AND cancellation_status='pending'
      AND cancellation_requested_at IS NOT NULL AND cfdi_status='stamped')
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(47))<>'exhausted' THEN
    RAISE EXCEPTION 'NC PAC PENDING: permitió reenviar la cancelación pendiente'; END IF;
  PERFORM pg_temp.start_action(48,148,'retry');
  IF pg_temp.finish_action(148,'valid','provider-58','11111111-1111-4111-8111-111111111111','pending','58')<>'cancellation_pending'
    OR NOT EXISTS(SELECT 1 FROM public.payments WHERE id=pg_temp.id(58) AND rep_cancellation_status='pending'
      AND rep_cancellation_requested_at IS NOT NULL AND rep_cfdi_status='stamped')
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(48))<>'exhausted' THEN
    RAISE EXCEPTION 'REP PAC PENDING: permitió reenviar la cancelación pendiente'; END IF;
END $$;
-- La llave rota entre la llamada al PAC y el enqueue: se conserva la huella del intento anterior.
UPDATE public.billing_secrets SET facturapi_test_key='sk_test_ci_rotation_before_enqueue' WHERE organization_id=pg_temp.id(11);
INSERT INTO public.cfdi_retry_queue(id,operation,invoice_id,payload,attempts,max_attempts,status)
VALUES(pg_temp.id(61),'stamp',pg_temp.id(47),jsonb_build_object('_fiscal_context',jsonb_build_object('mode','test',
  'fingerprint',public.platform_facturapi_fingerprint('test','sk_test_ci_recovery_a_only'))),5,5,'exhausted');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.platform_fiscal_jobs WHERE id=pg_temp.id(61) AND config_source='attempt'
    AND key_fingerprint=public.platform_facturapi_fingerprint('test','sk_test_ci_recovery_a_only')) THEN
    RAISE EXCEPTION 'ATTEMPT CONTEXT: adoptó la llave nueva al registrar el intento anterior'; END IF;
  BEGIN PERFORM pg_temp.start_action(61,161,'retry'); RAISE EXCEPTION 'ROTATED ATTEMPT: entregó la llave nueva';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
UPDATE public.billing_secrets SET facturapi_test_key='sk_test_ci_recovery_a_only' WHERE organization_id=pg_temp.id(11);
-- Cinco reprogramaciones históricas consumen el presupuesto manual, sin reiniciar attempts.
INSERT INTO public.platform_fiscal_actions(id,job_id,organization_id,actor_id,session_id,intent,reason,
  expected_revision,reserved_revision,queue_token,previous_state,document_snapshot,mode,key_fingerprint,status,started_at,completed_at)
SELECT pg_temp.id(380+n),j.id,j.organization_id,pg_temp.id(1),pg_temp.id(101),'retry','Reprogramación histórica CI',
  1,1,(SELECT updated_at FROM public.cfdi_retry_queue WHERE id=j.id),'{"status":"exhausted"}',public.platform_fiscal_document_snapshot(j),'test',j.key_fingerprint,'retry_scheduled',
  now()-interval '10 minutes',now()-interval '9 minutes' FROM public.platform_fiscal_jobs j CROSS JOIN generate_series(1,5) n WHERE j.id=pg_temp.id(38);
DO $$ BEGIN
  PERFORM pg_temp.start_action(38,138,'retry');
  IF pg_temp.finish_action(138,'missing')<>'budget_exhausted' OR NOT EXISTS(SELECT 1 FROM public.cfdi_retry_queue
    WHERE id=pg_temp.id(38) AND attempts=5 AND max_attempts=5 AND status='exhausted') THEN
    RAISE EXCEPTION 'MANUAL BUDGET: habilitó una sexta reprogramación'; END IF;
END $$;
-- Reserva huérfana vencida: una nueva solicitud autorizada sólo la libera, sin entregar otra llave.
UPDATE public.cfdi_retry_queue SET status='processing' WHERE id=pg_temp.id(35);
INSERT INTO public.platform_fiscal_actions(id,job_id,organization_id,actor_id,session_id,intent,reason,expected_revision,
  reserved_revision,queue_token,previous_state,document_snapshot,mode,key_fingerprint,started_at,expires_at)
SELECT pg_temp.id(135),j.id,j.organization_id,pg_temp.id(1),pg_temp.id(101),'retry','Comprobar el documento fiscal CI',1,j.revision,
  (SELECT updated_at FROM public.cfdi_retry_queue WHERE id=j.id),jsonb_build_object('status','exhausted'),public.platform_fiscal_document_snapshot(j),'test','private-fingerprint',now()-interval '3 minutes',now()-interval '1 minute'
FROM public.platform_fiscal_jobs j WHERE j.id=pg_temp.id(35);
DO $$ DECLARE v jsonb; BEGIN
  v:=pg_temp.start_action(35,935,'retry');
  IF (v->>'started')::boolean OR v->>'status'<>'expired' OR v ? 'apiKey'
    OR (SELECT status FROM public.cfdi_retry_queue WHERE id=pg_temp.id(35))<>'exhausted' THEN RAISE EXCEPTION 'EXPIRY: no liberó reserva'; END IF;
  BEGIN UPDATE public.platform_fiscal_actions SET status='missing' WHERE id=pg_temp.id(121);
    RAISE EXCEPTION 'IMMUTABLE: editó resultado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.platform_fiscal_actions WHERE id=pg_temp.id(121);
    RAISE EXCEPTION 'IMMUTABLE: borró historial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN TRUNCATE public.platform_fiscal_actions;
    RAISE EXCEPTION 'IMMUTABLE: truncó historial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"99000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000103"}';
DO $$ BEGIN
  BEGIN PERFORM * FROM public.platform_fiscal_actions; RAISE EXCEPTION 'ACL: lectura directa'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_list_fiscal_actions(auth.uid(),pg_temp.id(103),pg_temp.id(21));
    RAISE EXCEPTION 'ACL: llamó RPC servicio'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
RESET request.jwt.claims;
SET LOCAL role='service_role';
DO $$ BEGIN
  BEGIN UPDATE public.platform_fiscal_actions SET reason='Texto alterado' WHERE id=pg_temp.id(121);
    RAISE EXCEPTION 'SERVICE: actualizó historial directo'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_fiscal_document_snapshot(j) FROM public.platform_fiscal_jobs j LIMIT 1;
    RAISE EXCEPTION 'SERVICE: ejecutó helper privado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
ROLLBACK;
