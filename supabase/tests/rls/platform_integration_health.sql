-- CI efímero: no consulta al proveedor. Prueba ACL, proyección e invalidación de resultados.
BEGIN;
SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at)
SELECT ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'integration-health-'||n||'@example.com',now(),now(),now() FROM generate_series(1,3) n;
INSERT INTO public.profiles(user_id,full_name,is_active)
SELECT ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Salud CI '||n,true
FROM generate_series(1,3) n ON CONFLICT(user_id) DO UPDATE SET is_active=true;
INSERT INTO public.platform_operators(auth_user_id,access_profile) VALUES
('93000000-0000-4000-8000-000000000001','root'),
('93000000-0000-4000-8000-000000000002','support'),
('93000000-0000-4000-8000-000000000003','observer');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after)
SELECT ('93930000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now(),now()+interval '1 hour'
FROM generate_series(1,3) n;
INSERT INTO public.organizations(id,name,slug,is_active) VALUES
('93930000-0000-4000-8000-000000000011','Integración CI A','integration-ci-a-0093',true),
('93930000-0000-4000-8000-000000000012','Integración CI B','integration-ci-b-0093',true);
SELECT set_config('app.organization_id','93930000-0000-4000-8000-000000000011',true);
INSERT INTO public.company_settings(organization_id,facturapi_mode) VALUES('93930000-0000-4000-8000-000000000011','test');
INSERT INTO public.billing_secrets(organization_id,facturapi_test_key) VALUES('93930000-0000-4000-8000-000000000011','ci-private-A');
SELECT set_config('app.organization_id','93930000-0000-4000-8000-000000000012',true);
INSERT INTO public.company_settings(organization_id,facturapi_mode) VALUES('93930000-0000-4000-8000-000000000012','test');

SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"93000000-0000-4000-8000-000000000002","session_id":"93930000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ BEGIN
  BEGIN PERFORM * FROM public.platform_integration_checks;
    RAISE EXCEPTION 'ACL: navegador pudo leer historial privado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_begin_integration_check(auth.uid(),'93930000-0000-4000-8000-000000000002',
    '93930000-0000-4000-8000-000000000011',gen_random_uuid());
    RAISE EXCEPTION 'ACL: navegador pudo pedir llaves'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
RESET request.jwt.claims;

DO $$ DECLARE v jsonb; v_id uuid:='93930000-0000-4000-8000-000000000021'; BEGIN
  v:=public.platform_begin_integration_check('93000000-0000-4000-8000-000000000002',
    '93930000-0000-4000-8000-000000000002','93930000-0000-4000-8000-000000000011',v_id);
  IF v->>'apiKey'<>'ci-private-A' OR v->>'preflight'<>'ready' THEN RAISE EXCEPTION 'KEY: no seleccionó llave propia'; END IF;
  v:=public.platform_begin_integration_check('93000000-0000-4000-8000-000000000002',
    '93930000-0000-4000-8000-000000000002','93930000-0000-4000-8000-000000000011',v_id);
  IF (v->>'started')::boolean OR v ? 'apiKey' THEN RAISE EXCEPTION 'IDEMPOTENCY: volvió a entregar llave'; END IF;
  BEGIN PERFORM public.platform_begin_integration_check('93000000-0000-4000-8000-000000000001',
    '93930000-0000-4000-8000-000000000001','93930000-0000-4000-8000-000000000011',v_id);
    RAISE EXCEPTION 'ACTOR: reutilizó solicitud ajena'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_begin_integration_check('93000000-0000-4000-8000-000000000002',
    '93930000-0000-4000-8000-000000000002','93930000-0000-4000-8000-000000000011',gen_random_uuid());
    RAISE EXCEPTION 'RATE: permitió consulta inmediata';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Espera un minuto antes de comprobar de nuevo' THEN RAISE; END IF; END;
  PERFORM public.platform_complete_integration_check('93000000-0000-4000-8000-000000000002',
    '93930000-0000-4000-8000-000000000002',v_id,'connected',23,200,'8.42.47');
  IF public.platform_complete_integration_check('93000000-0000-4000-8000-000000000002',
    '93930000-0000-4000-8000-000000000002',v_id,'auth_error',25,401,'8.42.47')<>'connected' THEN
    RAISE EXCEPTION 'IDEMPOTENCY: sobrescribió resultado terminado'; END IF;
  v:=public.platform_get_integrations('93000000-0000-4000-8000-000000000003',
    '93930000-0000-4000-8000-000000000003','Integración CI');
  IF v::text LIKE '%ci-private%' OR v::text LIKE '%key_fingerprint%' OR v::text LIKE '%payload%' OR v::text LIKE '%last_error%' THEN
    RAISE EXCEPTION 'LEAK: proyección expuso secreto o cuerpo fiscal'; END IF;
  IF v->>'total'<>'2' OR v->'rows'->0->'lastCheck'->>'status'<>'connected' THEN RAISE EXCEPTION 'LIST: proyección incorrecta'; END IF;
  BEGIN PERFORM public.platform_begin_integration_check('93000000-0000-4000-8000-000000000003',
    '93930000-0000-4000-8000-000000000003','93930000-0000-4000-8000-000000000012',gen_random_uuid());
    RAISE EXCEPTION 'CAP: observador ejecutó comprobación'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_get_integrations('93000000-0000-4000-8000-000000000002','93930000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'SESSION: aceptó sesión ajena'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('app.organization_id','93930000-0000-4000-8000-000000000011',true);
UPDATE public.billing_secrets SET facturapi_test_key='ci-private-rotated' WHERE organization_id='93930000-0000-4000-8000-000000000011';
DO $$ DECLARE v jsonb; BEGIN
  v:=public.platform_get_integrations('93000000-0000-4000-8000-000000000003','93930000-0000-4000-8000-000000000003','Integración CI A');
  IF v->'rows'->0->'lastCheck'<>'null'::jsonb THEN RAISE EXCEPTION 'ROTATION: mostró resultado de llave anterior'; END IF;
END $$;
-- El reloj se adelanta únicamente en fixtures locales para preparar la siguiente reserva.
UPDATE public.platform_integration_checks SET started_at=now()-interval '2 minutes';
SELECT public.platform_begin_integration_check('93000000-0000-4000-8000-000000000002',
  '93930000-0000-4000-8000-000000000002','93930000-0000-4000-8000-000000000011','93930000-0000-4000-8000-000000000022');
UPDATE public.company_settings SET facturapi_mode='live' WHERE organization_id='93930000-0000-4000-8000-000000000011';
DO $$ BEGIN
  IF public.platform_complete_integration_check('93000000-0000-4000-8000-000000000002',
    '93930000-0000-4000-8000-000000000002','93930000-0000-4000-8000-000000000022','connected',23,200,'8.42.47')<>'config_changed' THEN
    RAISE EXCEPTION 'RACE: aceptó resultado de ambiente anterior'; END IF;
END $$;

DO $$ DECLARE v jsonb; BEGIN
  v:=public.platform_begin_integration_check('93000000-0000-4000-8000-000000000002',
    '93930000-0000-4000-8000-000000000002','93930000-0000-4000-8000-000000000012','93930000-0000-4000-8000-000000000023');
  IF v->>'preflight'<>'unconfigured' OR v->>'apiKey' IS NOT NULL THEN RAISE EXCEPTION 'MISSING: usó llave global o ajena'; END IF;
  UPDATE public.platform_operators SET access_profile='observer' WHERE auth_user_id='93000000-0000-4000-8000-000000000002';
  BEGIN PERFORM public.platform_complete_integration_check('93000000-0000-4000-8000-000000000002',
    '93930000-0000-4000-8000-000000000002','93930000-0000-4000-8000-000000000023','unconfigured',NULL,NULL,'8.42.47');
    RAISE EXCEPTION 'REVOKE: aceptó operación con permiso retirado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF public.platform_get_monitoring('93000000-0000-4000-8000-000000000003',
    '93930000-0000-4000-8000-000000000003')->>'incompleteBilling' IS NULL THEN RAISE EXCEPTION 'MONITOR: contrato incompleto'; END IF;
END $$;
SELECT set_config('app.organization_id','93930000-0000-4000-8000-000000000012',true);
INSERT INTO public.billing_secrets(organization_id,facturapi_test_key) VALUES('93930000-0000-4000-8000-000000000012','ci-private-rotated');
UPDATE public.platform_integration_checks SET started_at=now()-interval '2 minutes';
DO $$ DECLARE v jsonb; BEGIN
  v:=public.platform_begin_integration_check('93000000-0000-4000-8000-000000000001',
    '93930000-0000-4000-8000-000000000001','93930000-0000-4000-8000-000000000012','93930000-0000-4000-8000-000000000024');
  IF v->>'preflight'<>'duplicate_key' OR v->>'apiKey' IS NOT NULL THEN RAISE EXCEPTION 'DUPLICATE: entregó una llave compartida'; END IF;
  PERFORM public.platform_complete_integration_check('93000000-0000-4000-8000-000000000001',
    '93930000-0000-4000-8000-000000000001','93930000-0000-4000-8000-000000000024','duplicate_key',NULL,NULL,'8.42.47');
END $$;
ROLLBACK;
