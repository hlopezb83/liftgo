-- 0088: RPCs reales, roles reales y cambios reversibles en la base efímera de CI.
BEGIN;

INSERT INTO public.organizations (id,name,slug,is_active) VALUES
  ('88000000-0000-4000-8000-0000000000a0','Centro Norte','centro-norte-0088',true),
  ('88000000-0000-4000-8000-0000000000b0','Centro Sur','centro-sur-0088',true);
SELECT set_config('app.organization_id','88000000-0000-4000-8000-0000000000a0',true);
INSERT INTO auth.users (id,email,created_at,updated_at) VALUES
  ('88000000-0000-4000-8000-000000000001','operator.0088@example.com',now(),now()),
  ('88000000-0000-4000-8000-000000000002','admin.0088@example.com',now(),now()),
  ('88000000-0000-4000-8000-000000000003','admin.sur.0088@example.com',now(),now());
INSERT INTO public.profiles (user_id,full_name,email,is_active) VALUES
  ('88000000-0000-4000-8000-000000000001','Operador 0088','operator.0088@example.com',true),
  ('88000000-0000-4000-8000-000000000002','Admin Norte 0088','admin.0088@example.com',true),
  ('88000000-0000-4000-8000-000000000003','Admin Sur 0088','admin.sur.0088@example.com',true)
ON CONFLICT (user_id) DO UPDATE SET full_name=EXCLUDED.full_name,email=EXCLUDED.email,is_active=true;
DELETE FROM public.organization_memberships WHERE auth_user_id IN
  ('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000003');
DELETE FROM public.user_roles WHERE user_id='88000000-0000-4000-8000-000000000001';
INSERT INTO public.user_roles (user_id,role) VALUES
  ('88000000-0000-4000-8000-000000000002','admin'),
  ('88000000-0000-4000-8000-000000000003','admin')
ON CONFLICT (user_id) DO UPDATE SET role='admin';
INSERT INTO public.organization_memberships (organization_id,auth_user_id,member_type) VALUES
  ('88000000-0000-4000-8000-0000000000a0','88000000-0000-4000-8000-000000000002','internal'),
  ('88000000-0000-4000-8000-0000000000b0','88000000-0000-4000-8000-000000000003','internal');
INSERT INTO public.platform_operators (auth_user_id,notes)
VALUES ('88000000-0000-4000-8000-000000000001','CI 0088');
INSERT INTO public.company_settings (organization_id,razon_social,rfc,regimen_fiscal,lugar_expedicion,facturapi_mode) VALUES
  ('88000000-0000-4000-8000-0000000000a0','Centro Norte SA','CNO010101AB1','601','64000','test');
INSERT INTO public.billing_secrets (organization_id,facturapi_test_key,facturapi_live_key) VALUES
  ('88000000-0000-4000-8000-0000000000a0','sk_test_a','sk_live_b');
INSERT INTO public.bank_accounts (organization_id,name,bank,is_active,initial_balance)
VALUES ('88000000-0000-4000-8000-0000000000a0','No divulgar cuenta','Banco CI',true,999999);
INSERT INTO public.organization_document_counters (organization_id,document_type,next_value) VALUES
  ('88000000-0000-4000-8000-0000000000a0','quote',10001),
  ('88000000-0000-4000-8000-0000000000a0','invoice',555);

DO $$ DECLARE v_fn regprocedure; v_role text; BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.platform_get_organization_detail(uuid,uuid)'::regprocedure,
    'public.platform_list_audit_events(uuid,uuid,text,bigint,integer)'::regprocedure,
    'public.platform_set_organization_active_with_reason(uuid,uuid,boolean,text)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE') OR has_function_privilege('authenticated',v_fn,'EXECUTE')
      OR NOT has_function_privilege('service_role',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION '0088 ACL RPC: %',v_fn;
    END IF;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(v_role,'public.platform_audit_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION '0088 tabla expuesta a %',v_role;
    END IF;
    IF has_sequence_privilege(v_role,'public.platform_audit_events_id_seq','USAGE,SELECT,UPDATE') THEN
      RAISE EXCEPTION '0088 secuencia expuesta a %',v_role;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_audit_events'
    AND permissive='RESTRICTIVE' AND qual='false' AND with_check='false')
    OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_audit_events'
      AND (qual IS DISTINCT FROM 'false' OR with_check IS DISTINCT FROM 'false')) THEN
    RAISE EXCEPTION '0088 bitácora requiere deny-all de clientes';
  END IF;
END $$;

-- Incluso un operador autenticado usa el servidor; no tiene RPC privilegiado.
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"88000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ BEGIN
  BEGIN
    PERFORM public.platform_get_organization_detail('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000a0');
    RAISE EXCEPTION '0088 RPC ejecutable directamente por cliente';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM 1 FROM public.platform_audit_events;
    RAISE EXCEPTION '0088 lectura directa de bitácora';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
RESET request.jwt.claims;

SET LOCAL role='service_role';
DO $$ DECLARE v_a jsonb; v_b jsonb; BEGIN
  v_a := public.platform_get_organization_detail('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000a0');
  v_b := public.platform_get_organization_detail('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000b0');
  IF v_a#>>'{billing,key_configured}' <> 'true' OR v_b#>>'{billing,key_configured}' <> 'false'
    OR v_a#>>'{settings,razon_social}' <> 'Centro Norte SA' OR v_b#>>'{settings,records}' <> '0'
    OR v_a#>>'{administrators,0,full_name}' <> 'Admin Norte 0088'
    OR v_b#>>'{administrators,0,full_name}' <> 'Admin Sur 0088'
    OR v_a#>>'{active_bank_accounts}' <> '1' OR v_b#>>'{active_bank_accounts}' <> '0' THEN
    RAISE EXCEPTION '0088 mezcla de fichas A/B';
  END IF;
  IF v_a::text ~ 'sk_(test|live)_' OR v_a::text LIKE '%999999%' OR v_a::text LIKE '%No divulgar cuenta%'
    OR v_a#>>'{counters,0,next_value}' <> '10001' OR jsonb_array_length(v_a->'counters') <> 1 THEN
    RAISE EXCEPTION '0088 secretos/saldos/folios fiscales expuestos';
  END IF;
  IF (SELECT next_value FROM public.organization_document_counters
      WHERE organization_id='88000000-0000-4000-8000-0000000000a0' AND document_type='quote') <> 10001 THEN
    RAISE EXCEPTION '0088 lectura consumió folio';
  END IF;
  BEGIN
    PERFORM public.platform_get_organization_detail('88000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-0000000000b0');
    RAISE EXCEPTION '0088 admin no operador aceptado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.platform_get_organization_detail('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION '0088 empresa inexistente aceptada';
  EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;

-- Operaciones reales de catálogo generan eventos atómicos, sin sus contenidos.
DO $$ DECLARE v_model uuid; v_part uuid; v_event public.platform_audit_events%ROWTYPE; v_count bigint; BEGIN
  v_model := public.platform_create_equipment_model_catalog('88000000-0000-4000-8000-000000000001',
    'LiftGo CI','0088 modelo',2500,4.5,'Diesel','{"secret":"DO_NOT_LOG_0088"}', 'DO_NOT_LOG_0088',NULL);
  v_part := public.platform_create_parts_catalog('88000000-0000-4000-8000-000000000001',
    'CI-0088','Filtro CI','DO_NOT_LOG_0088',NULL,'{}','Filtros','pieza',NULL,ARRAY[v_model]);
  SELECT * INTO v_event FROM public.platform_audit_events WHERE target_type='equipment_model_catalog' AND target_id=v_model ORDER BY id DESC LIMIT 1;
  IF v_event.actor_id IS DISTINCT FROM '88000000-0000-4000-8000-000000000001'::uuid
    OR v_event.actor_name <> 'Operador 0088' OR v_event.action <> 'INSERT' OR v_event.new_state->>'model' <> '0088 modelo'
    OR v_event.new_state::text LIKE '%DO_NOT_LOG_0088%' THEN
    RAISE EXCEPTION '0088 evento global incorrecto';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_audit_events WHERE target_type='parts_catalog_equipment_models'
    AND target_id=v_part AND new_state->>'equipment_model_catalog_id'=v_model::text AND request_id=v_event.request_id) THEN
    RAISE EXCEPTION '0088 compatibilidad sin evento correlacionado';
  END IF;
  SELECT count(*) INTO v_count FROM public.platform_audit_events;
  PERFORM public.platform_set_equipment_model_catalog_active('88000000-0000-4000-8000-000000000001',v_model,true);
  IF (SELECT count(*) FROM public.platform_audit_events) <> v_count THEN
    RAISE EXCEPTION '0088 evento fantasma por guardado idéntico';
  END IF;
  -- La excepción revierte tanto la fila como el evento de ese subbloque.
  BEGIN
    PERFORM public.platform_create_equipment_model_catalog('88000000-0000-4000-8000-000000000001','LiftGo CI','0088 rollback');
    RAISE EXCEPTION 'ROLLBACK_PROBE_0088' USING ERRCODE='P0001';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.equipment_model_catalog WHERE manufacturer='LiftGo CI' AND model='0088 rollback')
    OR EXISTS (SELECT 1 FROM public.platform_audit_events WHERE new_state->>'model'='0088 rollback') THEN
    RAISE EXCEPTION '0088 mutación y evento no revierten juntos';
  END IF;
END $$;

DO $$ DECLARE v_count bigint; v_event public.platform_audit_events%ROWTYPE; v_reason text; BEGIN
  SELECT count(*) INTO v_count FROM public.platform_audit_events;
  FOREACH v_reason IN ARRAY ARRAY['','abcd','sk_test_a','Bearer NOTAREALTOKEN',repeat('x',501)] LOOP
    BEGIN
      PERFORM public.platform_set_organization_active_with_reason('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000a0',false,v_reason);
      RAISE EXCEPTION '0088 motivo inválido aceptado';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  PERFORM public.platform_set_organization_active_with_reason('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000a0',false,'  Suspensión de prueba en CI  ');
  SELECT * INTO v_event FROM public.platform_audit_events WHERE target_type='organizations'
    AND target_id='88000000-0000-4000-8000-0000000000a0' ORDER BY id DESC LIMIT 1;
  IF v_event.reason <> 'Suspensión de prueba en CI' OR v_event.old_state->>'is_active' <> 'true'
    OR v_event.new_state->>'is_active' <> 'false' OR (SELECT count(*) FROM public.platform_audit_events) <> v_count+1 THEN
    RAISE EXCEPTION '0088 cambio de acceso sin motivo o estado correcto';
  END IF;
  PERFORM public.platform_set_organization_active_with_reason('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000a0',false,'Mismo cambio repetido en CI');
  IF (SELECT count(*) FROM public.platform_audit_events) <> v_count+1 THEN
    RAISE EXCEPTION '0088 suspensión repetida creó evento';
  END IF;
  BEGIN
    PERFORM public.platform_set_organization_active_with_reason('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000099',false,'Empresa inexistente en CI');
    RAISE EXCEPTION '0088 suspensión de empresa inexistente aceptada';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  -- El servidor anterior conserva compatibilidad y una razón identificable.
  PERFORM public.platform_set_organization_active('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000a0',true);
END $$;

-- Las versiones legales conservan su cuerpo en el sistema de documentos.
-- La bitácora sólo conserva identidad, número de versión y checksum.
RESET role;
INSERT INTO public.legal_template_definitions (id,template_key,document_type,name,is_active)
VALUES ('88000000-0000-4000-8000-0000000000d0','rental_contract_center_0088','rental_contract','Contrato CI 0088',true);
INSERT INTO public.legal_template_versions (id,definition_id,version,content,checksum_sha256,change_summary)
VALUES ('88000000-0000-4000-8000-0000000000d1','88000000-0000-4000-8000-0000000000d0',1,
  '{"intro_text":"DO_NOT_LOG_LEGAL_0088","declarations_landlord":[],"declarations_tenant":[],"clauses":[{"title":"Primera","body":"Texto CI"}],"checklist_sections":[],"pagare_text":"CI"}',repeat('a',64),'DO_NOT_LOG_LEGAL_0088');
UPDATE public.legal_template_definitions SET current_version_id='88000000-0000-4000-8000-0000000000d1'
WHERE id='88000000-0000-4000-8000-0000000000d0';
SET LOCAL role='service_role';
DO $$ DECLARE v_version record; v_detail jsonb; BEGIN
  SELECT * INTO v_version FROM public.platform_publish_legal_template_version(
    '88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000d0',
    '{"intro_text":"DO_NOT_LOG_LEGAL_0088","declarations_landlord":[],"declarations_tenant":[],"clauses":[{"title":"Primera","body":"Texto revisado CI"}],"checklist_sections":[],"pagare_text":"CI"}',
    'DO_NOT_LOG_LEGAL_0088',false);
  PERFORM public.platform_assign_legal_template_version('88000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-0000000000a0','88000000-0000-4000-8000-0000000000d0',v_version.version_id);
  v_detail := public.platform_get_organization_detail('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000a0');
  IF v_detail#>>'{templates,0,version}' <> '2' OR v_detail#>>'{templates,0,is_current}' <> 'true'
    OR v_detail::text LIKE '%DO_NOT_LOG_LEGAL_0088%' THEN RAISE EXCEPTION '0088 ficha de machote incorrecta'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_audit_events WHERE target_type='legal_template_versions'
    AND target_id=v_version.version_id AND actor_id='88000000-0000-4000-8000-000000000001')
    OR NOT EXISTS (SELECT 1 FROM public.platform_audit_events WHERE target_type='organization_legal_template_assignments'
      AND organization_id='88000000-0000-4000-8000-0000000000a0') THEN
    RAISE EXCEPTION '0088 publicación/asignación sin trazabilidad';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_audit_events WHERE coalesce(old_state,new_state)::text LIKE '%DO_NOT_LOG_LEGAL_0088%') THEN
    RAISE EXCEPTION '0088 bitácora almacenó contenido legal';
  END IF;
END $$;

DO $$ DECLARE v_page jsonb; v_next jsonb; v_cursor bigint; v_event jsonb; BEGIN
  v_page := public.platform_list_audit_events('88000000-0000-4000-8000-000000000001',NULL,NULL,NULL,1);
  IF jsonb_array_length(v_page->'events') <> 1 OR v_page->>'has_more' <> 'true' THEN
    RAISE EXCEPTION '0088 límite de página incorrecto';
  END IF;
  v_cursor := (v_page#>>'{events,0,id}')::bigint;
  v_next := public.platform_list_audit_events('88000000-0000-4000-8000-000000000001',NULL,NULL,v_cursor,25);
  FOR v_event IN SELECT value FROM jsonb_array_elements(v_next->'events') LOOP
    IF (v_event->>'id')::bigint >= v_cursor THEN RAISE EXCEPTION '0088 cursor duplicó evento'; END IF;
  END LOOP;
  v_page := public.platform_list_audit_events('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000a0','organizations');
  FOR v_event IN SELECT value FROM jsonb_array_elements(v_page->'events') LOOP
    IF v_event->>'organization_id' <> '88000000-0000-4000-8000-0000000000a0' OR v_event->>'target_type' <> 'organizations' THEN
      RAISE EXCEPTION '0088 filtro mezcló empresa/ámbito';
    END IF;
  END LOOP;
  BEGIN
    PERFORM public.platform_list_audit_events('88000000-0000-4000-8000-000000000001',NULL,'billing_secrets');
    RAISE EXCEPTION '0088 ámbito no permitido aceptado';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.platform_list_audit_events('88000000-0000-4000-8000-000000000001',NULL,NULL,0,101);
    RAISE EXCEPTION '0088 paginación no permitida aceptada';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.platform_list_audit_events('88000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION '0088 admin leyó bitácora global';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;

-- Immutabilidad se comprueba incluso desde el dueño de la tabla.
DO $$ BEGIN
  BEGIN
    UPDATE public.platform_audit_events SET reason='Motivo reescrito CI' WHERE id=(SELECT min(id) FROM public.platform_audit_events);
    RAISE EXCEPTION '0088 evento editable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.platform_audit_events WHERE id=(SELECT min(id) FROM public.platform_audit_events);
    RAISE EXCEPTION '0088 evento borrable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE public.platform_audit_events;
    RAISE EXCEPTION '0088 bitácora truncable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

INSERT INTO public.organization_memberships (organization_id,auth_user_id,member_type)
VALUES ('88000000-0000-4000-8000-0000000000b0','88000000-0000-4000-8000-000000000001','internal');
SET LOCAL role='service_role';
DO $$ BEGIN
  IF public.platform_get_organization_detail('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000b0')->>'can_suspend' <> 'false' THEN
    RAISE EXCEPTION '0088 ficha no informa protección de suspensión propia';
  END IF;
  BEGIN
    PERFORM public.platform_set_organization_active_with_reason('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000b0',false,'Suspensión propia en CI');
    RAISE EXCEPTION '0088 suspensión propia permitida';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
UPDATE public.profiles SET is_active=false WHERE user_id='88000000-0000-4000-8000-000000000001';
SET LOCAL role='service_role';
DO $$ BEGIN
  BEGIN
    PERFORM public.platform_list_audit_events('88000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION '0088 perfil inactivo aceptado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
UPDATE public.profiles SET is_active=true WHERE user_id='88000000-0000-4000-8000-000000000001';
DELETE FROM public.platform_operators WHERE auth_user_id='88000000-0000-4000-8000-000000000001';
SET LOCAL role='service_role';
DO $$ BEGIN
  BEGIN
    PERFORM public.platform_get_organization_detail('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-0000000000b0');
    RAISE EXCEPTION '0088 operador revocado aceptado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
