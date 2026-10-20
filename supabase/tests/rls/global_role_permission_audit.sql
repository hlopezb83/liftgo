-- Global permission audit: no tenant attribution and no application reader.
-- Synthetic records only; rollback preserves existing events and permissions.
BEGIN;

DO $$
DECLARE
  v_id uuid := '11300000-0000-4000-8000-000000000001';
  v_before bigint;
  v_tenant_before bigint;
  v_role text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.role_permission_audit_events'::regclass) THEN
    RAISE EXCEPTION 'Global audit RLS is disabled';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(v_role,'public.role_permission_audit_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
       OR has_function_privilege(v_role,'public.audit_global_role_permission_change()','EXECUTE') THEN
      RAISE EXCEPTION 'Application role % gained global audit access',v_role;
    END IF;
  END LOOP;

  INSERT INTO public.organizations(id,name,slug) VALUES
    ('11300000-0000-4000-8000-0000000000a0','Global audit A','global-audit-113-a'),
    ('11300000-0000-4000-8000-0000000000b0','Global audit B','global-audit-113-b');
  PERFORM set_config('app.organization_id','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM set_config('app.audit_source','user',true);
  PERFORM set_config('app.e2e_seed','on',true);
  SELECT count(*) INTO v_before FROM public.role_permission_audit_events;
  SELECT count(*) INTO v_tenant_before FROM public.audit_logs;
  INSERT INTO public.role_permissions(id,role,module,access_level)
    VALUES (v_id,'dispatcher','QA global audit 0113','read');
  UPDATE public.role_permissions SET access_level='none' WHERE id=v_id;
  UPDATE public.role_permissions SET updated_at=now() WHERE id=v_id;
  DELETE FROM public.role_permissions WHERE id=v_id;

  IF (SELECT count(*) FROM public.role_permission_audit_events) <> v_before+3 THEN
    RAISE EXCEPTION 'Global audit omitted/duplicated INSERT UPDATE DELETE events';
  END IF;
  IF EXISTS (SELECT 1 FROM public.role_permission_audit_events WHERE record_id=v_id
      AND (actor_user_id IS NOT NULL OR actor_kind<>'system' OR database_session_user<>session_user)) THEN
    RAISE EXCEPTION 'Global system migration was falsely attributed to a user';
  END IF;
  IF (SELECT array_agg(action ORDER BY recorded_at) FROM public.role_permission_audit_events WHERE record_id=v_id)
       IS DISTINCT FROM ARRAY['INSERT','UPDATE','DELETE'] THEN
    RAISE EXCEPTION 'Global audit operations mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.role_permission_audit_events WHERE record_id=v_id AND action='UPDATE'
      AND changed_fields=ARRAY['access_level'] AND old_data->>'access_level'='read' AND new_data->>'access_level'='none') THEN
    RAISE EXCEPTION 'Global permission diff is missing';
  END IF;
  IF (SELECT count(*) FROM public.audit_logs) <> v_tenant_before THEN
    RAISE EXCEPTION 'Global permission audit polluted tenant logs';
  END IF;
  -- A legitimate tenant event still uses the unchanged tenant audit trigger.
  PERFORM set_config('app.e2e_seed','off',true);
  PERFORM set_config('app.organization_id','11300000-0000-4000-8000-0000000000b0',true);
  INSERT INTO public.customers(id,name,created_by_organization_id)
    VALUES ('11300000-0000-4000-8000-0000000000c0','Audit tenant B customer','11300000-0000-4000-8000-0000000000b0');
  INSERT INTO public.organization_customers(organization_id,customer_id)
    VALUES ('11300000-0000-4000-8000-0000000000b0','11300000-0000-4000-8000-0000000000c0');
  INSERT INTO public.forklifts(id,name,model,organization_id)
    VALUES ('11300000-0000-4000-8000-0000000000f0','Audit tenant B forklift','QA','11300000-0000-4000-8000-0000000000b0');
  INSERT INTO public.bookings(id,customer_id,forklift_id,start_date,end_date,booking_number,status,organization_id)
    VALUES ('11300000-0000-4000-8000-0000000000e0','11300000-0000-4000-8000-0000000000c0',
      '11300000-0000-4000-8000-0000000000f0',current_date,current_date+1,'AUDIT-B-0113','confirmed','11300000-0000-4000-8000-0000000000b0');
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE table_name='bookings'
      AND record_id='11300000-0000-4000-8000-0000000000e0'
      AND organization_id='11300000-0000-4000-8000-0000000000b0') THEN
    RAISE EXCEPTION 'Tenant B booking audit was lost or misattributed';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='role_permission_audit_events' AND column_name='organization_id') THEN
    RAISE EXCEPTION 'Global audit has an arbitrary tenant association';
  END IF;
END $$;

ROLLBACK;
