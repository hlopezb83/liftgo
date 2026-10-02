-- 0090: sólo base efímera de CI. Orígenes, roles y cambios terminan en ROLLBACK.
BEGIN;
INSERT INTO public.organizations(id,name,slug,is_active) VALUES
 ('90000000-0000-4000-8000-0000000000a0','Centro Norte','centro-norte-0090',true),
 ('90000000-0000-4000-8000-0000000000b0','Centro Sur','centro-sur-0090',true);
UPDATE public.platform_catalog_import_source SET source_organization_id='90000000-0000-4000-8000-0000000000a0';
SELECT set_config('app.organization_id','90000000-0000-4000-8000-0000000000a0',true);
INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
 ('90000000-0000-4000-8000-000000000001','operator.0090@example.com',now(),now()),
 ('90000000-0000-4000-8000-000000000002','admin.0090@example.com',now(),now());
INSERT INTO public.profiles(user_id,email,full_name,is_active) VALUES
 ('90000000-0000-4000-8000-000000000001','operator.0090@example.com','Operador Norte',true),
 ('90000000-0000-4000-8000-000000000002','admin.0090@example.com','Admin Norte',true)
ON CONFLICT(user_id) DO UPDATE SET is_active=true,full_name=EXCLUDED.full_name;
-- Una segunda autoridad explícita permite probar desactivación/revocación
-- del actor principal sin debilitar el invariante del último raíz (0091).
INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
 ('91b00000-0000-4000-8000-000000000001','backup-root-ci@example.com',now(),now());
INSERT INTO public.profiles(user_id,full_name,is_active) VALUES
 ('91b00000-0000-4000-8000-000000000001','Raíz de respaldo CI',true)
 ON CONFLICT(user_id) DO UPDATE SET is_active=true;
INSERT INTO public.platform_operators(auth_user_id,access_profile) VALUES
 ('91b00000-0000-4000-8000-000000000001','root');

INSERT INTO public.platform_operators(auth_user_id,notes) VALUES('90000000-0000-4000-8000-000000000001','CI 0090');
INSERT INTO public.equipment_models(id,organization_id,manufacturer,model,default_capacity_kg,default_daily_rate,default_monthly_rate) VALUES
 ('90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-0000000000a0','Atlas','Norte 30',3000,987,25000),
 ('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-0000000000a0',' Atlas ','Norte 45',4500,765,21000),
 ('90000000-0000-4000-8000-000000000012','90000000-0000-4000-8000-0000000000b0','Atlas','Sur 60',6000,999,35000);
INSERT INTO public.equipment_model_catalog(id,manufacturer,model,capacity_kg) VALUES
 ('90000000-0000-4000-8000-000000000020','ATLAS','Norte 45',4000);
INSERT INTO public.parts_inventory(id,organization_id,sku,name,category,stock_quantity,min_stock_level,unit_cost,location) VALUES
 ('90000000-0000-4000-8000-000000000030','90000000-0000-4000-8000-0000000000a0',' af-301 ','Filtro de aire','Filtros',17,4,777,'B2'),
 ('90000000-0000-4000-8000-000000000031','90000000-0000-4000-8000-0000000000a0','','Filtro sin SKU','Filtros',5,2,123,'B3');
INSERT INTO public.contract_templates(id,organization_id,name,body_text) VALUES
 ('90000000-0000-4000-8000-000000000040','90000000-0000-4000-8000-0000000000a0','Renta norte 0090','Contrato nuevo. {{company_name}}'),
 ('90000000-0000-4000-8000-000000000041','90000000-0000-4000-8000-0000000000a0','Renta homologada 0090','Contrato aprobado.'),
 ('90000000-0000-4000-8000-000000000042','90000000-0000-4000-8000-0000000000a0','Renta homologada 0090','Contrato diferente.');
INSERT INTO public.legal_template_definitions(id,template_key,document_type,name) VALUES
 ('90000000-0000-4000-8000-000000000050','rental_contract_0090_existing','rental_contract','Renta homologada 0090');
SELECT public.platform_publish_legal_template_version('90000000-0000-4000-8000-000000000001',
 '90000000-0000-4000-8000-000000000050','{"body_text":"Contrato aprobado."}'::jsonb,'Versión aprobada para CI',false);

DO $$ DECLARE v_fn regprocedure; v_table text; BEGIN
 FOREACH v_fn IN ARRAY ARRAY[
  'public.platform_list_catalog_import_candidates(uuid,text,integer)'::regprocedure,
  'public.platform_get_catalog_import_preview(uuid,text,uuid)'::regprocedure,
  'public.platform_import_catalog_candidate(uuid,uuid,text,uuid,text,text,text)'::regprocedure
 ] LOOP
  IF has_function_privilege('anon',v_fn,'EXECUTE') OR has_function_privilege('authenticated',v_fn,'EXECUTE')
   OR NOT has_function_privilege('service_role',v_fn,'EXECUTE') THEN RAISE EXCEPTION '0090 RPC expuesta: %',v_fn; END IF;
 END LOOP;
 FOREACH v_table IN ARRAY ARRAY['platform_catalog_import_source','platform_catalog_imports'] LOOP
  IF has_table_privilege('anon','public.'||v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
   OR has_table_privilege('authenticated','public.'||v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
   OR has_table_privilege('service_role','public.'||v_table,'INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION '0090 tabla expuesta: %',v_table; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||v_table)::regclass AND relrowsecurity AND relforcerowsecurity) THEN
   RAISE EXCEPTION '0090 faltan RLS/FORCE'; END IF;
 END LOOP;
 IF has_function_privilege('service_role','public.platform_catalog_import_candidate(text,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.platform_catalog_legal_content(jsonb)','EXECUTE') THEN RAISE EXCEPTION '0090 helper expuesto'; END IF;
END $$;

SET LOCAL role=service_role;
DO $$ DECLARE v_actor uuid := '90000000-0000-4000-8000-000000000001'; v_page jsonb; v_preview jsonb;
 v_result jsonb; v_before jsonb; v_count integer; v_request uuid := '90000000-0000-4000-8000-000000000060';
BEGIN
 v_page := public.platform_list_catalog_import_candidates(v_actor,'model',0);
 IF v_page->>'total'<>'2' OR v_page#>>'{source_organization,id}'<>'90000000-0000-4000-8000-0000000000a0'
  OR (v_page::text ~ 'daily_rate|monthly_rate|stock_quantity|unit_cost|location') THEN RAISE EXCEPTION '0090 mezcla de empresas/datos locales'; END IF;
 IF public.platform_list_catalog_import_candidates(v_actor,'model',20)->'items'<>'[]'::jsonb THEN RAISE EXCEPTION '0090 página fuera de rango'; END IF;
 BEGIN PERFORM public.platform_get_catalog_import_preview(v_actor,'model','90000000-0000-4000-8000-000000000012');
  RAISE EXCEPTION '0090 aceptó origen B'; EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN PERFORM public.platform_list_catalog_import_candidates('90000000-0000-4000-8000-000000000002','model',0);
  RAISE EXCEPTION '0090 admin concedió plataforma'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 v_preview := public.platform_get_catalog_import_preview(v_actor,'model','90000000-0000-4000-8000-000000000010');
 SELECT to_jsonb(m) INTO v_before FROM public.equipment_models m WHERE id='90000000-0000-4000-8000-000000000010';
 v_result := public.platform_import_catalog_candidate(v_actor,v_request,'model','90000000-0000-4000-8000-000000000010',v_preview->>'fingerprint','create','Modelo aprobado para el ecosistema');
 IF (SELECT to_jsonb(m) FROM public.equipment_models m WHERE id='90000000-0000-4000-8000-000000000010') IS DISTINCT FROM v_before
  OR NOT EXISTS(SELECT 1 FROM public.equipment_model_catalog WHERE id=(v_result->>'target_id')::uuid AND capacity_kg=3000
   AND source_organization_id='90000000-0000-4000-8000-0000000000a0' AND source_record_id='90000000-0000-4000-8000-000000000010') THEN
  RAISE EXCEPTION '0090 promoción alteró origen o perdió procedencia'; END IF;
 SELECT count(*) INTO v_count FROM public.platform_audit_events WHERE request_id=v_request;
 IF public.platform_import_catalog_candidate(v_actor,v_request,'model','90000000-0000-4000-8000-000000000010',v_preview->>'fingerprint','create','Modelo aprobado para el ecosistema') IS DISTINCT FROM v_result
  OR (SELECT count(*) FROM public.platform_audit_events WHERE request_id=v_request)<>v_count THEN RAISE EXCEPTION '0090 replay duplicó recursos/eventos'; END IF;
 BEGIN PERFORM public.platform_import_catalog_candidate(v_actor,v_request,'model','90000000-0000-4000-8000-000000000010',v_preview->>'fingerprint','create','Otro motivo distinto');
  RAISE EXCEPTION '0090 clave aceptó otro payload'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN PERFORM public.platform_import_catalog_candidate(v_actor,gen_random_uuid(),'model','90000000-0000-4000-8000-000000000010',v_preview->>'fingerprint','create','Modelo aprobado para el ecosistema');
  RAISE EXCEPTION '0090 duplicó origen con otra clave'; EXCEPTION WHEN unique_violation THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.platform_audit_events WHERE request_id=v_request AND target_type='platform_catalog_imports'
  AND actor_id=v_actor AND reason='Modelo aprobado para el ecosistema' AND new_state->>'source_record_id'='90000000-0000-4000-8000-000000000010') THEN
  RAISE EXCEPTION '0090 falta recibo en bitácora'; END IF;
 IF public.platform_list_audit_events(v_actor,NULL,'platform_catalog_imports',NULL,25)->'events'='[]'::jsonb THEN RAISE EXCEPTION '0090 filtro sin recibos'; END IF;
 BEGIN UPDATE public.platform_catalog_imports SET reason='Cambio no permitido' WHERE id=v_request;
  RAISE EXCEPTION '0090 servicio modificó recibo'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;

-- Cambios después de la vista previa se rechazan; reutilizar no sobrescribe.
DO $$ DECLARE v_actor uuid := '90000000-0000-4000-8000-000000000001'; v_preview jsonb; v_result jsonb; v_before jsonb;
BEGIN
 v_preview := public.platform_get_catalog_import_preview(v_actor,'model','90000000-0000-4000-8000-000000000011');
 IF v_preview->>'status'<>'duplicate' THEN RAISE EXCEPTION '0090 no detectó fabricante normalizado'; END IF;
 UPDATE public.equipment_model_catalog SET capacity_kg=4100 WHERE id='90000000-0000-4000-8000-000000000020';
 BEGIN PERFORM public.platform_import_catalog_candidate(v_actor,gen_random_uuid(),'model','90000000-0000-4000-8000-000000000011',v_preview->>'fingerprint','reuse','Equivalencia revisada');
  RAISE EXCEPTION '0090 aceptó global cambiado'; EXCEPTION WHEN unique_violation THEN NULL; END;
 v_preview := public.platform_get_catalog_import_preview(v_actor,'model','90000000-0000-4000-8000-000000000011');
 SELECT to_jsonb(c) INTO v_before FROM public.equipment_model_catalog c WHERE id='90000000-0000-4000-8000-000000000020';
 v_result := public.platform_import_catalog_candidate(v_actor,gen_random_uuid(),'model','90000000-0000-4000-8000-000000000011',v_preview->>'fingerprint','reuse','Equivalencia revisada');
 IF v_result->>'target_id'<>'90000000-0000-4000-8000-000000000020'
  OR (SELECT to_jsonb(c) FROM public.equipment_model_catalog c WHERE id='90000000-0000-4000-8000-000000000020') IS DISTINCT FROM v_before THEN
  RAISE EXCEPTION '0090 reutilización sobrescribió maestro'; END IF;
 v_preview := public.platform_get_catalog_import_preview(v_actor,'part','90000000-0000-4000-8000-000000000030');
 UPDATE public.parts_inventory SET name='Filtro de aire actualizado' WHERE id='90000000-0000-4000-8000-000000000030';
 BEGIN PERFORM public.platform_import_catalog_candidate(v_actor,gen_random_uuid(),'part','90000000-0000-4000-8000-000000000030',v_preview->>'fingerprint','create','Filtro aprobado para LiftGo');
  RAISE EXCEPTION '0090 aceptó origen cambiado'; EXCEPTION WHEN unique_violation THEN NULL; END;
 v_preview := public.platform_get_catalog_import_preview(v_actor,'part','90000000-0000-4000-8000-000000000030');
 IF v_preview::text ~ 'stock_quantity|unit_cost|min_stock_level|location' THEN RAISE EXCEPTION '0090 publicó datos financieros'; END IF;
 SELECT to_jsonb(p) INTO v_before FROM public.parts_inventory p WHERE id='90000000-0000-4000-8000-000000000030';
 v_result := public.platform_import_catalog_candidate(v_actor,gen_random_uuid(),'part','90000000-0000-4000-8000-000000000030',v_preview->>'fingerprint','create','Filtro aprobado para LiftGo');
 IF (SELECT to_jsonb(p) FROM public.parts_inventory p WHERE id='90000000-0000-4000-8000-000000000030') IS DISTINCT FROM v_before
  OR NOT EXISTS(SELECT 1 FROM public.parts_catalog WHERE id=(v_result->>'target_id')::uuid AND sku='AF-301' AND unit_of_measure='pieza') THEN RAISE EXCEPTION '0090 part normalización/aislamiento'; END IF;
 v_preview := public.platform_get_catalog_import_preview(v_actor,'part','90000000-0000-4000-8000-000000000031');
 IF v_preview->>'status'<>'invalid' THEN RAISE EXCEPTION '0090 SKU vacío considerado válido'; END IF;
 BEGIN PERFORM public.platform_import_catalog_candidate(v_actor,gen_random_uuid(),'part','90000000-0000-4000-8000-000000000031',v_preview->>'fingerprint','create','No debe incorporarse');
  RAISE EXCEPTION '0090 importó SKU inválido'; EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

DO $$ DECLARE v_actor uuid := '90000000-0000-4000-8000-000000000001'; v_preview jsonb; v_result jsonb; v_count integer; v_local jsonb;
BEGIN
 SELECT count(*) INTO v_count FROM public.organization_legal_template_assignments;
 SELECT to_jsonb(t) INTO v_local FROM public.contract_templates t WHERE id='90000000-0000-4000-8000-000000000040';
 v_preview := public.platform_get_catalog_import_preview(v_actor,'template','90000000-0000-4000-8000-000000000040');
 v_result := public.platform_import_catalog_candidate(v_actor,gen_random_uuid(),'template','90000000-0000-4000-8000-000000000040',v_preview->>'fingerprint','create','Machote revisado para LiftGo');
 IF v_result->>'version_id' IS NULL OR (SELECT count(*) FROM public.organization_legal_template_assignments)<>v_count
  OR (SELECT to_jsonb(t) FROM public.contract_templates t WHERE id='90000000-0000-4000-8000-000000000040') IS DISTINCT FROM v_local THEN
  RAISE EXCEPTION '0090 legal sin versión/alteró adopción u origen'; END IF;
 v_preview := public.platform_get_catalog_import_preview(v_actor,'template','90000000-0000-4000-8000-000000000041');
 IF v_preview->>'status'<>'duplicate' THEN RAISE EXCEPTION '0090 no normalizó contenido legal sin campos opcionales'; END IF;
 PERFORM public.platform_import_catalog_candidate(v_actor,gen_random_uuid(),'template','90000000-0000-4000-8000-000000000041',v_preview->>'fingerprint','reuse','Usar machote homologado');
 v_preview := public.platform_get_catalog_import_preview(v_actor,'template','90000000-0000-4000-8000-000000000042');
 IF v_preview->>'status'<>'conflict' THEN RAISE EXCEPTION '0090 machote distinto aceptado por nombre'; END IF;
 BEGIN PERFORM public.platform_import_catalog_candidate(v_actor,gen_random_uuid(),'template','90000000-0000-4000-8000-000000000042',v_preview->>'fingerprint','reuse','No sobrescribir versión');
  RAISE EXCEPTION '0090 reutilizó contenido legal diferente'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN UPDATE public.platform_catalog_imports SET reason='Cambio no permitido';
  RAISE EXCEPTION '0090 propietario mutó recibo'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SET LOCAL role=authenticated;
DO $$ BEGIN
 BEGIN PERFORM 1 FROM public.platform_catalog_imports; RAISE EXCEPTION '0090 cliente leyó recibos'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.platform_list_catalog_import_candidates('90000000-0000-4000-8000-000000000001','model',0);
  RAISE EXCEPTION '0090 cliente invocó RPC privilegiado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
UPDATE public.profiles SET is_active=false WHERE user_id='90000000-0000-4000-8000-000000000001';
DO $$ BEGIN
 BEGIN PERFORM public.platform_list_catalog_import_candidates('90000000-0000-4000-8000-000000000001','model',0);
  RAISE EXCEPTION '0090 operador revocado leyó origen'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
