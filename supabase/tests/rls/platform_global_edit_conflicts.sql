-- 0101: escrituras concurrentes, clientes anteriores y lectura legal sin publicación.
-- Sólo base efímera de CI; no deja cambios ni llama servicios externos.
BEGIN;
SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
 ('10100000-0000-4000-8000-000000000001','root.0101@example.com',now(),now()),
 ('10100000-0000-4000-8000-000000000002','observer.0101@example.com',now(),now()),
 ('10100000-0000-4000-8000-000000000003','regular.0101@example.com',now(),now());
INSERT INTO public.profiles(user_id,full_name,is_active) VALUES
 ('10100000-0000-4000-8000-000000000001','Operador CI 0101',true),
 ('10100000-0000-4000-8000-000000000002','Observador CI 0101',true),
 ('10100000-0000-4000-8000-000000000003','Usuario ERP CI 0101',true)
 ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name,is_active=true;
INSERT INTO public.platform_operators(auth_user_id,access_profile) VALUES
 ('10100000-0000-4000-8000-000000000001','root'),
 ('10100000-0000-4000-8000-000000000002','observer');
INSERT INTO public.equipment_model_catalog(id,manufacturer,model) VALUES
 ('10100000-0000-4000-8000-0000000000e0','Toyota','CI 0101');
INSERT INTO public.parts_catalog(id,sku,name,unit_of_measure) VALUES
 ('10100000-0000-4000-8000-0000000000c0','CI-0101','Filtro CI','pieza');
INSERT INTO public.legal_template_definitions(id,template_key,document_type,name) VALUES
 ('10100000-0000-4000-8000-0000000000d0','rental_contract_ci_0101','rental_contract','Contrato CI 0101');

DO $$ DECLARE v_fn regprocedure; BEGIN
  FOR v_fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('platform_update_equipment_model_catalog','platform_update_parts_catalog',
      'platform_publish_legal_template_version','platform_list_legal_template_history') LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE') OR has_function_privilege('authenticated',v_fn,'EXECUTE')
      OR NOT has_function_privilege('service_role',v_fn,'EXECUTE') THEN RAISE EXCEPTION 'ACL 0101: %',v_fn; END IF;
  END LOOP;
END $$;

SET LOCAL role='service_role';
DO $$ DECLARE
  actor uuid := '10100000-0000-4000-8000-000000000001';
  model_id uuid := '10100000-0000-4000-8000-0000000000e0';
  part_id uuid := '10100000-0000-4000-8000-0000000000c0';
  base timestamptz; next_token timestamptz;
BEGIN
  SELECT updated_at INTO base FROM public.equipment_model_catalog WHERE id=model_id;
  PERFORM public.platform_update_equipment_model_catalog(actor,model_id,base,'Toyota','Guardado uno');
  SELECT updated_at INTO next_token FROM public.equipment_model_catalog WHERE id=model_id;
  IF next_token<=base THEN RAISE EXCEPTION '0101: token del modelo no avanzó dentro de la transacción'; END IF;
  BEGIN
    PERFORM public.platform_update_equipment_model_catalog(actor,model_id,base,'Toyota','Captura antigua');
    RAISE EXCEPTION '0101: sobrescribió modelo con token antiguo';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.platform_update_equipment_model_catalog(actor,model_id,'Toyota','Cliente anterior');
    RAISE EXCEPTION '0101: cliente anterior evitó control del modelo';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT model FROM public.equipment_model_catalog WHERE id=model_id)<>'Guardado uno' THEN
    RAISE EXCEPTION '0101: conflicto alteró el modelo'; END IF;
  PERFORM public.platform_update_equipment_model_catalog(actor,model_id,next_token,'Toyota','Guardado revisado');

  SELECT updated_at INTO base FROM public.parts_catalog WHERE id=part_id;
  PERFORM public.platform_update_parts_catalog(actor,part_id,base,'CI-0101','Filtro revisado');
  SELECT updated_at INTO next_token FROM public.parts_catalog WHERE id=part_id;
  IF next_token<=base THEN RAISE EXCEPTION '0101: token del SKU no avanzó'; END IF;
  BEGIN
    PERFORM public.platform_update_parts_catalog(actor,part_id,base,'CI-0101','Captura antigua');
    RAISE EXCEPTION '0101: sobrescribió SKU con token antiguo';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.platform_update_parts_catalog(actor,part_id,'CI-0101','Cliente anterior');
    RAISE EXCEPTION '0101: cliente anterior evitó control del SKU';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT name FROM public.parts_catalog WHERE id=part_id)<>'Filtro revisado' THEN
    RAISE EXCEPTION '0101: conflicto alteró el SKU'; END IF;
  BEGIN
    PERFORM public.platform_update_parts_catalog('10100000-0000-4000-8000-000000000003',part_id,next_token,'CI-0101','Usuario ERP');
    RAISE EXCEPTION '0101: usuario regular editó maestro global';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

DO $$ DECLARE
  actor uuid := '10100000-0000-4000-8000-000000000001';
  definition uuid := '10100000-0000-4000-8000-0000000000d0';
  content jsonb := '{"intro_text":"Contrato CI","declarations_landlord":[],"declarations_tenant":[],"clauses":[{"title":"Renta","body":"Texto CI"}],"checklist_sections":[],"pagare_text":"Pagaré CI"}';
  first_version uuid; second_version uuid; author text;
BEGIN
  SELECT version_id INTO first_version FROM public.platform_publish_legal_template_version(actor,definition,content,'Primera publicación',false);
  SELECT version_id INTO second_version FROM public.platform_publish_legal_template_version(actor,definition,first_version,content,'Segunda publicación',false);
  BEGIN
    PERFORM public.platform_publish_legal_template_version(actor,definition,first_version,content,'Captura antigua',true);
    RAISE EXCEPTION '0101: promovió una publicación con base antigua';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.platform_publish_legal_template_version(actor,definition,content,'Cliente anterior',false);
    RAISE EXCEPTION '0101: publicación anterior evitó control de versión';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT count(*) FROM public.legal_template_versions WHERE definition_id=definition)<>2
    OR (SELECT current_version_id FROM public.legal_template_definitions WHERE id=definition)<>second_version
    OR EXISTS(SELECT 1 FROM public.organization_legal_template_assignments WHERE definition_id=definition) THEN
    RAISE EXCEPTION '0101: conflicto creó versión o cambió asignaciones'; END IF;
  SELECT created_by_name INTO author FROM public.platform_list_legal_template_history('10100000-0000-4000-8000-000000000002',definition)
    WHERE id=second_version;
  IF author IS DISTINCT FROM 'Operador CI 0101' THEN RAISE EXCEPTION '0101: historial de lectura omitió autor'; END IF;
  BEGIN
    PERFORM public.platform_publish_legal_template_version('10100000-0000-4000-8000-000000000002',definition,second_version,content,'Observador',false);
    RAISE EXCEPTION '0101: observador publicó';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.platform_list_legal_template_history('10100000-0000-4000-8000-000000000003',definition);
    RAISE EXCEPTION '0101: usuario ERP leyó historial global';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
ROLLBACK;
