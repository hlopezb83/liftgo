-- Ficha de empresas: fixtures sólo en PostgreSQL efímero de CI.
BEGIN;
SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at)
SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'governance-ci-'||n||'@example.com',now(),now(),now()
FROM generate_series(1,7) n;
INSERT INTO public.profiles(user_id,full_name,is_active)
SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Governance CI '||n,true FROM generate_series(1,7) n
ON CONFLICT(user_id) DO UPDATE SET is_active=true;
INSERT INTO public.platform_operators(auth_user_id,access_profile)
SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
(ARRAY['root','organizations','observer','support','catalogs'])[n] FROM generate_series(1,5) n;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after)
SELECT ('10100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
now(),now(),now()+interval '1 hour' FROM generate_series(1,7) n;
INSERT INTO public.organizations(id,name,slug,is_active) VALUES
('10100000-0000-4000-8000-000000000011','Governance CI A','governance-ci-a-0100',true),
('10100000-0000-4000-8000-000000000012','Governance CI B','governance-ci-b-0100',false);

DO $$ DECLARE v jsonb; v_count bigint; v_role text; v_function regprocedure; BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(v_role,'public.platform_organization_governance','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'ACL: ficha privada expuesta a %',v_role; END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role','public.platform_organization_governance','SELECT')
    OR has_table_privilege('service_role','public.platform_organization_governance','INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'ACL: el servicio exige sólo SELECT'; END IF;
  FOREACH v_function IN ARRAY ARRAY[
    'public.platform_list_organization_governance(uuid,uuid)'::regprocedure,
    'public.platform_get_organization_governance(uuid,uuid,uuid)'::regprocedure,
    'public.platform_set_organization_governance(uuid,uuid,uuid,text,text,text,text,text,text,text,text)'::regprocedure
  ] LOOP
    IF NOT has_function_privilege('service_role',v_function,'EXECUTE')
      OR has_function_privilege('anon',v_function,'EXECUTE') OR has_function_privilege('authenticated',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: RPC no es exclusiva del servidor'; END IF;
  END LOOP;
  IF has_function_privilege('service_role','public.platform_governance_projection(uuid,boolean)','EXECUTE')
    OR has_function_privilege('authenticated','public.platform_governance_assert(uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'ACL: helper privado expuesto'; END IF;
  IF NOT ('organizations.configure'=ANY(public.platform_profile_capabilities('root')))
    OR NOT ('organizations.configure'=ANY(public.platform_profile_capabilities('organizations')))
    OR 'organizations.configure'=ANY(public.platform_profile_capabilities('support'))
    OR 'organizations.configure'=ANY(public.platform_profile_capabilities('catalogs'))
    OR 'organizations.configure'=ANY(public.platform_profile_capabilities('observer')) THEN
    RAISE EXCEPTION 'CAP: permiso de edición excesivo'; END IF;
  v:=public.platform_get_organization_governance('10000000-0000-4000-8000-000000000002','10100000-0000-4000-8000-000000000002','10100000-0000-4000-8000-000000000011');
  IF v->>'revision'<>'0' OR v->>'classification'<>'unclassified' THEN RAISE EXCEPTION 'DEFAULT: inventó clasificación'; END IF;
  v:=public.platform_set_organization_governance('10000000-0000-4000-8000-000000000002','10100000-0000-4000-8000-000000000002',
    '10100000-0000-4000-8000-000000000011','0','test',' Monterrey ',' Noreste ','Contacto privado','contacto@example.com','+52 81 1234 5678','Clasificación revisada');
  IF v->'governance'->>'revision'<>'1' OR v->'governance'->>'city'<>'Monterrey' OR NOT (v->>'changed')::boolean THEN
    RAISE EXCEPTION 'WRITE: no guardó ficha normalizada'; END IF;
  SELECT count(*) INTO v_count FROM public.platform_audit_events WHERE target_id='10100000-0000-4000-8000-000000000011';
  v:=public.platform_set_organization_governance('10000000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000001',
    '10100000-0000-4000-8000-000000000011','1','test','Monterrey','Noreste','Contacto privado','contacto@example.com','+52 81 1234 5678','Revisión sin cambios');
  IF (v->>'changed')::boolean OR v->'governance'->>'revision'<>'1'
    OR v_count<>(SELECT count(*) FROM public.platform_audit_events WHERE target_id='10100000-0000-4000-8000-000000000011') THEN
    RAISE EXCEPTION 'NOOP: incrementó revisión o duplicó auditoría'; END IF;
  BEGIN
    PERFORM public.platform_set_organization_governance('10000000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000001',
      '10100000-0000-4000-8000-000000000011','0','live','Saltillo','Coahuila','','','','Otro cambio concurrente');
    RAISE EXCEPTION 'CAS: otro operador sobrescribió la captura'; EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  v:=public.platform_get_organization_governance('10000000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000012');
  IF v->>'revision'<>'0' OR v->>'city' IS NOT NULL THEN RAISE EXCEPTION 'ORG: copió ficha A a B'; END IF;
  v:=public.platform_list_organization_governance('10000000-0000-4000-8000-000000000003','10100000-0000-4000-8000-000000000003');
  IF v::text~'Contacto privado|contacto@example|1234 5678|contactName|contactEmail|contactPhone' THEN
    RAISE EXCEPTION 'PROJECTION: lista expuso contacto'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE x->>'organizationId'='10100000-0000-4000-8000-000000000012') THEN
    RAISE EXCEPTION 'REGISTRY: ocultó empresa suspendida'; END IF;
  IF EXISTS(SELECT 1 FROM public.platform_audit_events WHERE target_id='10100000-0000-4000-8000-000000000011'
    AND (old_state::text||new_state::text)~'Contacto privado|contacto@example|1234 5678|contactName|contactEmail|contactPhone') THEN
    RAISE EXCEPTION 'AUDIT: copió valores privados del contacto'; END IF;
  BEGIN
    PERFORM public.platform_get_organization_governance('10000000-0000-4000-8000-000000000003','10100000-0000-4000-8000-000000000003','10100000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'CAP: observador obtuvo contacto'; EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.platform_set_organization_governance('10000000-0000-4000-8000-000000000004','10100000-0000-4000-8000-000000000004',
      '10100000-0000-4000-8000-000000000011','1','live','','','','','','Motivo válido');
    RAISE EXCEPTION 'CAP: soporte modificó ficha'; EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.platform_list_organization_governance('10000000-0000-4000-8000-000000000006','10100000-0000-4000-8000-000000000006');
    RAISE EXCEPTION 'CAP: no operador enumeró empresas'; EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.platform_list_organization_governance('10000000-0000-4000-8000-000000000002','10100000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'SESSION: adoptó sesión de raíz'; EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.platform_set_organization_governance('10000000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000001',
      '10100000-0000-4000-8000-000000000011','1','live','','','','','','Credencial sk_test_private');
    RAISE EXCEPTION 'SECRET: aceptó credencial en motivo'; EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.platform_get_organization_governance('10000000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'MISSING: inventó ficha ausente'; EXCEPTION WHEN no_data_found THEN NULL;
  END;
END $$;
-- La revisión no se convierte a double/Number y no se pierde más allá de 2^53.
UPDATE public.platform_organization_governance SET revision=9007199254740993 WHERE organization_id='10100000-0000-4000-8000-000000000011';
DO $$ DECLARE v jsonb; BEGIN
  v:=public.platform_set_organization_governance('10000000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000001',
    '10100000-0000-4000-8000-000000000011','9007199254740993','live','Monterrey','Noreste','','','','Clasificación real aprobada');
  IF v->'governance'->>'revision'<>'9007199254740994' THEN RAISE EXCEPTION 'REVISION: perdió precisión'; END IF;
END $$;
UPDATE public.platform_operators SET access_profile='observer' WHERE auth_user_id='10000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  BEGIN
    PERFORM public.platform_set_organization_governance('10000000-0000-4000-8000-000000000002','10100000-0000-4000-8000-000000000002',
      '10100000-0000-4000-8000-000000000011','9007199254740994','test','','','','','','Permiso retirado');
    RAISE EXCEPTION 'REVOKE: usó autoridad anterior'; EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id='10100000-0000-4000-8000-000000000001';
DO $$ BEGIN
  BEGIN PERFORM public.platform_list_organization_governance('10000000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'SESSION: leyó con sesión vencida'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL role='service_role';
DO $$ BEGIN
  BEGIN UPDATE public.platform_organization_governance SET classification='test';
    RAISE EXCEPTION 'ACL: servicio escribió ficha directamente'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
ROLLBACK;
