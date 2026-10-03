-- Fixtures exclusivamente en PostgreSQL efímero de CI; ningún diagnóstico real.
BEGIN;
SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at)
SELECT ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'support-ci-'||n||'@example.com',now(),now(),now() FROM generate_series(1,8) n;
INSERT INTO public.profiles(user_id,full_name,is_active)
SELECT ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Soporte CI '||n,true FROM generate_series(1,8) n
ON CONFLICT(user_id) DO UPDATE SET is_active=true;
INSERT INTO public.platform_operators(auth_user_id,access_profile) VALUES
('94000000-0000-4000-8000-000000000001','root'),('94000000-0000-4000-8000-000000000002','support'),
('94000000-0000-4000-8000-000000000007','observer'),('94000000-0000-4000-8000-000000000008','catalogs');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after)
SELECT ('94940000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
now(),now(),now()+interval '1 hour' FROM generate_series(1,8) n;
INSERT INTO public.organizations(id,name,slug,is_active) VALUES
('94940000-0000-4000-8000-000000000011','Soporte CI A','support-ci-a-0094',true),
('94940000-0000-4000-8000-000000000012','Soporte CI B','support-ci-b-0094',true);
INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES
('94940000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000003','internal'),
('94940000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000004','internal'),
('94940000-0000-4000-8000-000000000012','94000000-0000-4000-8000-000000000005','internal'),
('94940000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000006','portal');
INSERT INTO public.user_roles(user_id,role) SELECT ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ventas' FROM generate_series(3,5) n
ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
SELECT set_config('app.organization_id','94940000-0000-4000-8000-000000000011',true);
INSERT INTO public.company_settings(organization_id,razon_social,rfc,regimen_fiscal,lugar_expedicion)
VALUES('94940000-0000-4000-8000-000000000011','  Identidad legal Soporte A  ','AAA010101AAA','601','64000');
INSERT INTO public.feedback_reports(id,organization_id,reporter_id,reporter_type,type,folio,title,description,module,context_json,screenshot_url) VALUES
('94940000-0000-4000-8000-000000000021','94940000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000003','internal','bug','FB-0001','Reporte CI A','Diagnóstico privado original','Flota',
'{"app_version":"8.42.49","route":"/fleet/private?token=unshared","selected_element":{"text":"private-finance"}}',
'94940000-0000-4000-8000-000000000011/94000000-0000-4000-8000-000000000003/123.png'),
('94940000-0000-4000-8000-000000000023','94940000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000006','customer','bug','FB-0002','Reporte cliente CI','Contenido del cliente','Portal','{}',NULL);
SELECT set_config('app.organization_id','94940000-0000-4000-8000-000000000012',true);
INSERT INTO public.feedback_reports(id,organization_id,reporter_id,reporter_type,type,folio,title,description,module) VALUES
('94940000-0000-4000-8000-000000000022','94940000-0000-4000-8000-000000000012','94000000-0000-4000-8000-000000000005','internal','bug','FB-0001','Reporte CI B','Diagnóstico original B','Bancos');

DO $$ DECLARE v jsonb; BEGIN
  v:=public.platform_list_support('94000000-0000-4000-8000-000000000001','94940000-0000-4000-8000-000000000001','',
    '94940000-0000-4000-8000-000000000011');
  IF v->>'total'<>'0' THEN RAISE EXCEPTION 'CONSENT: incluyó feedback no compartido'; END IF;
END $$;
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"94000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"94940000-0000-4000-8000-000000000003"}';
DO $$ DECLARE v jsonb; BEGIN
  BEGIN PERFORM * FROM public.platform_support_cases; RAISE EXCEPTION 'ACL: leyó casos privados'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.platform_support_events; RAISE EXCEPTION 'ACL: leyó seguimiento privado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_list_support(auth.uid(),'94940000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'ACL: cliente llamó RPC de plataforma'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.share_my_support_report('94940000-0000-4000-8000-000000000022','0','Compartido B','Pasos de diagnóstico B','medium');
    RAISE EXCEPTION 'ORG: compartió reporte de otra empresa'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  v:=public.share_my_support_report('94940000-0000-4000-8000-000000000021','0','Compartido A','Sólo pasos revisados del guardado','high',
    '94940000-0000-4000-8000-000000000031',false);
  PERFORM set_config('test.support_case',v->>'id',true);
  IF v->>'revision'<>'1' OR (v->>'hasScreenshot')::boolean OR v->>'appVersion'<>'8.42.49' THEN
    RAISE EXCEPTION 'SHARE: contrato o captura automática incorrectos'; END IF;
  v:=public.share_my_support_report('94940000-0000-4000-8000-000000000021','1','Compartido A','Sólo pasos revisados del guardado','high',
    '94940000-0000-4000-8000-000000000031',false);
  IF v->>'revision'<>'1' THEN RAISE EXCEPTION 'NOOP: incrementó revisión sin cambios'; END IF;
  BEGIN PERFORM public.share_my_support_report('94940000-0000-4000-8000-000000000021','0','Otro título','Otro diagnóstico válido','high');
    RAISE EXCEPTION 'RACE: aceptó revisión anterior'; EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN PERFORM public.share_my_support_report('94940000-0000-4000-8000-000000000021','1','Título seguro','Credencial sk_test_no_share','high');
    RAISE EXCEPTION 'SECRET: aceptó credencial'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SET LOCAL request.jwt.claims='{"sub":"94000000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $$ BEGIN
  BEGIN PERFORM public.get_my_support_case('94940000-0000-4000-8000-000000000021');
    RAISE EXCEPTION 'OWNER: otro usuario de la empresa vio el caso'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.withdraw_my_support_report('94940000-0000-4000-8000-000000000021','1');
    RAISE EXCEPTION 'OWNER: retiró diagnóstico de otro usuario'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL request.jwt.claims='{"sub":"94000000-0000-4000-8000-000000000006","role":"authenticated"}';
DO $$ BEGIN
  BEGIN PERFORM public.share_my_support_report('94940000-0000-4000-8000-000000000023','0','Titulo cliente','Contenido del cliente','medium');
    RAISE EXCEPTION 'CUSTOMER: cliente pudo compartir reporte interno'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
RESET request.jwt.claims;
DO $$ DECLARE v jsonb; v_id uuid:=current_setting('test.support_case')::uuid; BEGIN
  v:=public.platform_get_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002',v_id);
  IF v::text LIKE '%unshared%' OR v::text LIKE '%private-finance%' OR v::text LIKE '%Diagnóstico privado original%'
    OR v->'case'->>'description'<>'Sólo pasos revisados del guardado' THEN RAISE EXCEPTION 'PROJECTION: diagnóstico excesivo'; END IF;
  IF jsonb_array_length(v->'events')<>1 THEN RAISE EXCEPTION 'NOOP: duplicó seguimiento'; END IF;
  IF v->'case'->>'organizationName'<>'Identidad legal Soporte A' OR v::text LIKE '%AAA010101AAA%' THEN
    RAISE EXCEPTION 'IDENTITY: nombre incorrecto o proyección fiscal excesiva'; END IF;
  v:=public.platform_list_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002','identidad legal',NULL);
  IF v->>'total'<>'1' OR v->'rows'->0->>'organizationName'<>'Identidad legal Soporte A' THEN
    RAISE EXCEPTION 'SEARCH: la razón social visible no encuentra el caso'; END IF;
  v:=public.platform_list_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002','Soporte CI A',NULL);
  IF v->>'total'<>'1' THEN RAISE EXCEPTION 'SEARCH: perdió el alias interno de la empresa'; END IF;
  v:=public.platform_list_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002','identidad legal','94940000-0000-4000-8000-000000000012');
  IF v->>'total'<>'0' THEN RAISE EXCEPTION 'ORG: búsqueda de razón social ignoró empresa'; END IF;
  IF public.platform_support_screenshot('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002',v_id) IS NOT NULL THEN
    RAISE EXCEPTION 'CAPTURE: entregó captura sin consentir'; END IF;
  BEGIN PERFORM public.platform_get_support('94000000-0000-4000-8000-000000000007','94940000-0000-4000-8000-000000000007',v_id);
    RAISE EXCEPTION 'CAPABILITY: observador vio diagnóstico'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_get_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000001',v_id);
    RAISE EXCEPTION 'SESSION: adoptó sesión de otro operador'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_update_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002',v_id,'1',
    'in_progress','high','94000000-0000-4000-8000-000000000008','Nota mínima');
    RAISE EXCEPTION 'ASSIGNEE: asignó catálogo sin permiso de soporte'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  v:=public.platform_update_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002',v_id,'1',
    'in_progress','high','94000000-0000-4000-8000-000000000002','Reproducción del guardado en curso');
  IF v->>'revision'<>'2' OR v->>'status'<>'in_progress' THEN RAISE EXCEPTION 'UPDATE: seguimiento incompleto'; END IF;
  BEGIN PERFORM public.platform_update_support('94000000-0000-4000-8000-000000000001','94940000-0000-4000-8000-000000000001',v_id,'1','resolved','high',NULL,'');
    RAISE EXCEPTION 'RACE: otro operador sobrescribió el cambio'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"94000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ DECLARE v jsonb; BEGIN
  v:=public.get_my_support_case('94940000-0000-4000-8000-000000000021');
  IF v->>'status'<>'in_progress' OR v->>'assigneeId'<>'94000000-0000-4000-8000-000000000002' THEN RAISE EXCEPTION 'OWN: no pudo seguir el caso'; END IF;
  v:=public.withdraw_my_support_report('94940000-0000-4000-8000-000000000021','2');
  IF (v->>'shared')::boolean OR v->>'description' IS NOT NULL THEN RAISE EXCEPTION 'WITHDRAW: mostró diagnóstico retirado'; END IF;
END $$;
RESET role;
RESET request.jwt.claims;
DO $$ DECLARE v jsonb; v_id uuid:=current_setting('test.support_case')::uuid; BEGIN
  IF EXISTS(SELECT 1 FROM public.platform_support_cases WHERE id=v_id AND (description IS NOT NULL OR screenshot_path IS NOT NULL)) THEN
    RAISE EXCEPTION 'SCRUB: conserva diagnóstico retirado en BD'; END IF;
  IF EXISTS(SELECT 1 FROM public.platform_support_events WHERE case_id=v_id AND comment IS NOT NULL) THEN RAISE EXCEPTION 'SCRUB: conservó notas'; END IF;
  BEGIN PERFORM public.platform_update_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002',v_id,'3','resolved','high',NULL,'');
    RAISE EXCEPTION 'WITHDRAW: actualizó caso sin consentimiento'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT status FROM public.feedback_reports WHERE id='94940000-0000-4000-8000-000000000021')<>'new' THEN RAISE EXCEPTION 'BUSINESS: cambió estado original'; END IF;
END $$;
-- Recompartir con captura explícita mantiene el mismo caso. Rechaza prefijos ajenos.
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"94000000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT public.share_my_support_report('94940000-0000-4000-8000-000000000021','3','Compartido A','Sólo pasos revisados del guardado','high',NULL,true);
RESET role;
RESET request.jwt.claims;
DO $$ BEGIN
  IF public.platform_support_screenshot('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002',current_setting('test.support_case')::uuid) IS NULL THEN
    RAISE EXCEPTION 'CAPTURE: no entregó captura explícita'; END IF;
END $$;
SELECT set_config('app.organization_id','94940000-0000-4000-8000-000000000011',true);
UPDATE public.feedback_reports SET screenshot_url='94940000-0000-4000-8000-000000000012/94000000-0000-4000-8000-000000000003/123.png'
WHERE id='94940000-0000-4000-8000-000000000021';
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"94000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ BEGIN
  BEGIN PERFORM public.share_my_support_report('94940000-0000-4000-8000-000000000021','4','Compartido A','Otro diagnóstico revisado','high',NULL,true);
    RAISE EXCEPTION 'STORAGE: aceptó captura de otra empresa'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET role;
RESET request.jwt.claims;
-- Retención: la consulta ya oculta antes de la purga; purga física redacta sólo el diagnóstico compartido.
UPDATE public.platform_support_cases SET shared_until=now()-interval '1 minute' WHERE id=current_setting('test.support_case')::uuid;
DO $$ DECLARE v jsonb; BEGIN
  v:=public.platform_get_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002',current_setting('test.support_case')::uuid);
  IF v->'case'->>'title' IS NOT NULL OR v->'case'->>'description' IS NOT NULL THEN RAISE EXCEPTION 'RETENTION: mostró diagnóstico vencido'; END IF;
  PERFORM public.purge_expired_support_diagnostics();
  IF EXISTS(SELECT 1 FROM public.platform_support_cases WHERE id=current_setting('test.support_case')::uuid AND
    (title IS NOT NULL OR description IS NOT NULL OR screenshot_path IS NOT NULL)) THEN RAISE EXCEPTION 'RETENTION: no redactó físicamente'; END IF;
END $$;
UPDATE public.platform_operators SET access_profile='observer' WHERE auth_user_id='94000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  BEGIN PERFORM public.platform_get_support('94000000-0000-4000-8000-000000000002','94940000-0000-4000-8000-000000000002',current_setting('test.support_case')::uuid);
    RAISE EXCEPTION 'REVOKE: leyó con permiso retirado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL role='service_role';
DO $$ BEGIN
  BEGIN DELETE FROM public.platform_support_cases; RAISE EXCEPTION 'ACL: servicio pudo borrar casos directamente'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
SELECT set_config('app.organization_id','94940000-0000-4000-8000-000000000011',true);
UPDATE public.company_settings SET razon_social='   ' WHERE organization_id='94940000-0000-4000-8000-000000000011';
DO $$ BEGIN
  IF public.support_case_projection(current_setting('test.support_case')::uuid)->>'organizationName'<>'Soporte CI A' THEN
    RAISE EXCEPTION 'IDENTITY: falta fallback de razón social vacía'; END IF;
END $$;
ROLLBACK;
