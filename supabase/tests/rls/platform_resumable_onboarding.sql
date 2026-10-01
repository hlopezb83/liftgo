-- 0089: sólo fixtures en CI, todas las escrituras se revierten.
BEGIN;
INSERT INTO auth.users (id,email,created_at,updated_at) VALUES
  ('89000000-0000-4000-8000-000000000001','operator.0089@example.com',now(),now()),
  ('89000000-0000-4000-8000-000000000002','nonoperator.0089@example.com',now(),now());
INSERT INTO public.profiles (user_id,full_name,email,is_active) VALUES
  ('89000000-0000-4000-8000-000000000001','Operador 0089','operator.0089@example.com',true),
  ('89000000-0000-4000-8000-000000000002','Admin 0089','nonoperator.0089@example.com',true);
INSERT INTO public.platform_operators (auth_user_id,notes)
VALUES ('89000000-0000-4000-8000-000000000001','Fixture reversible 0089');

DO $$ DECLARE f regprocedure; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.platform_begin_onboarding(uuid,uuid,text,text,text,text)'::regprocedure,
    'public.platform_get_onboarding(uuid,uuid)'::regprocedure,
    'public.platform_list_pending_onboarding(uuid,integer)'::regprocedure,
    'public.platform_finish_onboarding(uuid,uuid)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE')
      OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL de onboarding incorrecta: %', f;
    END IF;
  END LOOP;
  IF has_function_privilege('service_role','public.platform_onboarding_view(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'El helper interno omite autorización';
  END IF;
END $$;

SET LOCAL role = service_role;
DO $$ DECLARE
  v_actor uuid := '89000000-0000-4000-8000-000000000001';
  v_request uuid := '89000000-0000-4000-8000-000000000003';
  v_job jsonb; v_retry jsonb; v_org uuid; v_before integer;
BEGIN
  BEGIN
    PERFORM public.platform_begin_onboarding('89000000-0000-4000-8000-000000000002',v_request,'Norte 0089','norte-0089','first.0089@example.com','María Norte');
    RAISE EXCEPTION 'Un no operador creó un alta';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  v_job := public.platform_begin_onboarding(v_actor,v_request,' Norte 0089 ','NORTE-0089',' First.0089@example.com ',' María Norte ');
  v_org := (v_job->>'organization_id')::uuid;
  PERFORM set_config('app.onboarding89.organization_id',v_org::text,true);
  PERFORM set_config('app.onboarding89.admin_user_id',v_job->>'admin_user_id',true);
  IF v_job->>'stage' <> 'auth_pending' OR EXISTS (SELECT 1 FROM public.organizations WHERE id=v_org AND is_active) THEN
    RAISE EXCEPTION 'El alta sin Auth no quedó pendiente/inactiva';
  END IF;
  SELECT count(*) INTO v_before FROM public.organizations;
  v_retry := public.platform_begin_onboarding(v_actor,v_request,'Norte 0089','norte-0089','first.0089@example.com','María Norte');
  IF v_retry IS DISTINCT FROM v_job OR (SELECT count(*) FROM public.organizations) <> v_before THEN
    RAISE EXCEPTION 'El replay duplicó empresa o identidad';
  END IF;
  BEGIN
    PERFORM public.platform_begin_onboarding(v_actor,v_request,'Norte alterado','norte-0089','first.0089@example.com','María Norte');
    RAISE EXCEPTION 'La clave aceptó otro payload';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.platform_begin_onboarding(v_actor,gen_random_uuid(),'Otra empresa','otra-0089','first.0089@example.com','María Norte');
    RAISE EXCEPTION 'Se reservó el mismo correo dos veces';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF (SELECT count(*) FROM public.organizations) <> v_before THEN RAISE EXCEPTION 'Una reserva rechazada dejó empresa'; END IF;
  BEGIN
    PERFORM public.platform_finish_onboarding(v_actor,v_request);
    RAISE EXCEPTION 'Se finalizó sin identidad Auth';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.platform_set_organization_active_with_reason(v_actor,v_org,true,'Activación anticipada');
    RAISE EXCEPTION 'Se activó una empresa con alta pendiente';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (public.platform_list_pending_onboarding(v_actor,0)->>'total')::integer < 1 THEN
    RAISE EXCEPTION 'Falta el alta en la lista reanudable';
  END IF;
END $$;
RESET role;

-- Reproduce la respuesta perdida de createUser: Auth ya existe, el job sigue pendiente.
INSERT INTO auth.users (id,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES (current_setting('app.onboarding89.admin_user_id')::uuid,'first.0089@example.com',
  jsonb_build_object('organization_id',current_setting('app.onboarding89.organization_id'),
    'platform_onboarding_request_id','89000000-0000-4000-8000-000000000003'),
  jsonb_build_object('full_name','María Norte'),now(),now());

DO $$ DECLARE v_actor uuid := '89000000-0000-4000-8000-000000000001';
  v_req uuid := '89000000-0000-4000-8000-000000000003';
  v_user uuid := current_setting('app.onboarding89.admin_user_id')::uuid;
  v_org uuid := current_setting('app.onboarding89.organization_id')::uuid;
  v_meta jsonb; v_result jsonb;
BEGIN
  IF public.platform_get_onboarding(v_actor,v_req)->>'stage' <> 'admin_pending' THEN RAISE EXCEPTION 'No detectó Auth ya creado'; END IF;
  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id=v_user;
  UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data - 'platform_onboarding_request_id' WHERE id=v_user;
  BEGIN
    PERFORM public.platform_finish_onboarding(v_actor,v_req);
    RAISE EXCEPTION 'Adoptó una identidad sin metadata confiable';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE auth.users SET raw_app_meta_data=v_meta WHERE id=v_user;
  -- La falta de perfil hace rollback de activación, rol y membresía.
  DELETE FROM public.profiles WHERE user_id=v_user;
  BEGIN
    PERFORM public.platform_finish_onboarding(v_actor,v_req);
    RAISE EXCEPTION 'Finalizó sin perfil';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id=v_org AND is_active)
    OR EXISTS (SELECT 1 FROM public.organization_memberships WHERE auth_user_id=v_user) THEN
    RAISE EXCEPTION 'Un error dejó activación o membresía parcial';
  END IF;
  INSERT INTO public.profiles(user_id,full_name,email,is_active) VALUES(v_user,'Nombre temporal','first.0089@example.com',true);
  v_result := public.platform_finish_onboarding(v_actor,v_req);
  IF v_result->>'stage' <> 'complete' OR NOT EXISTS (
    SELECT 1 FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id=o.id
    JOIN public.user_roles ur ON ur.user_id=m.auth_user_id JOIN public.profiles p ON p.user_id=m.auth_user_id
    WHERE o.id=v_org AND o.is_active AND m.auth_user_id=v_user AND m.member_type='internal'
      AND ur.role='admin' AND p.is_active AND p.full_name='María Norte') THEN
    RAISE EXCEPTION 'No finalizó atómicamente';
  END IF;
  IF public.platform_finish_onboarding(v_actor,v_req) IS DISTINCT FROM v_result THEN RAISE EXCEPTION 'Replay no idempotente'; END IF;
  IF (SELECT count(*) FROM public.organization_memberships WHERE auth_user_id=v_user) <> 1 THEN RAISE EXCEPTION 'Duplicó la membresía'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_audit_events WHERE organization_id=v_org
    AND request_id=v_req AND actor_id=v_actor AND action='UPDATE') THEN
    RAISE EXCEPTION 'La activación no conserva correlación/actor en bitácora';
  END IF;
  PERFORM public.platform_set_organization_active_with_reason(v_actor,v_org,false,'Pausa posterior al alta');
  BEGIN
    PERFORM public.platform_finish_onboarding(v_actor,v_req);
    RAISE EXCEPTION 'Replay reactivó una empresa suspendida';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id=v_org AND is_active) THEN RAISE EXCEPTION 'Replay cambió el estado'; END IF;
  PERFORM public.platform_set_organization_active_with_reason(v_actor,v_org,true,'Reactivación explícita');
  UPDATE public.user_roles SET role='ventas' WHERE user_id=v_user;
  BEGIN
    PERFORM public.platform_finish_onboarding(v_actor,v_req);
    RAISE EXCEPTION 'Replay restauró un rol revocado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_user AND role='admin') THEN RAISE EXCEPTION 'Restauró autoridad'; END IF;
END $$;

SET LOCAL role = authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.platform_onboarding_requests;
    RAISE EXCEPTION 'El cliente leyó la infraestructura de onboarding';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
UPDATE public.profiles SET is_active=false WHERE user_id='89000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  BEGIN
    PERFORM public.platform_get_onboarding('89000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Un operador inactivo reanudó el alta';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
