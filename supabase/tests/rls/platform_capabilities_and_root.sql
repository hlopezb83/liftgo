-- CI efímero: permisos reales, RLS y protección del único raíz. Sin MFA.
BEGIN;
SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
INSERT INTO auth.users(id,email,created_at,updated_at)
SELECT ('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'platform-cap-'||n||'@example.com',now(),now() FROM generate_series(1,5) n;
INSERT INTO public.profiles(user_id,full_name,is_active)
SELECT ('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Operador CI '||n,true
FROM generate_series(1,5) n ON CONFLICT(user_id) DO UPDATE SET is_active=true;
INSERT INTO public.platform_operators(auth_user_id,access_profile)
SELECT ('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  (ARRAY['root','organizations','catalogs','support','observer'])[n] FROM generate_series(1,5) n;

SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $$ DECLARE v jsonb; BEGIN
  v:=public.get_platform_access();
  IF v->>'profile'<>'support' OR (v->>'revision')::bigint<1 OR NOT (v->>'isOperator')::boolean
    OR NOT public.has_platform_capability('organizations.read')
    OR public.has_platform_capability('organizations.details')
    OR public.has_platform_capability('operators.manage')
    OR public.has_platform_capability('catalogs.write') THEN
    RAISE EXCEPTION 'CAP: soporte obtuvo capacidades incorrectas';
  END IF;
  IF EXISTS(SELECT 1 FROM public.platform_operators WHERE auth_user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'CAP: consulta de asignaciones ajenas';
  END IF;
  BEGIN
    INSERT INTO public.equipment_model_catalog(manufacturer,model) VALUES('CI','NO-WRITE');
    RAISE EXCEPTION 'CAP: soporte escribió catálogo por RLS';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.assert_platform_capability(auth.uid(),'operators.manage');
    RAISE EXCEPTION 'CAP: cliente ejecutó helper privilegiado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET role;
RESET request.jwt.claims;

SELECT public.platform_create_equipment_model_catalog(
  '91000000-0000-4000-8000-000000000003','CI','CAP-ALLOWED-0091');
SELECT public.platform_create_parts_catalog(
  '91000000-0000-4000-8000-000000000003','CI-CAP-0091','Refacción CI');
DO $$ BEGIN
  BEGIN
    PERFORM public.platform_create_equipment_model_catalog(
      '91000000-0000-4000-8000-000000000004','CI','CAP-DENIED-0091');
    RAISE EXCEPTION 'CAP: soporte creó un modelo por RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

DO $$ DECLARE v_actor uuid; v_caps text[]; v_profile text; BEGIN
  FOR v_actor,v_profile IN SELECT auth_user_id,access_profile FROM public.platform_operators
    WHERE auth_user_id::text LIKE '91000000-%' LOOP
    v_caps:=public.platform_profile_capabilities(v_profile);
    IF 'organizations.read'=ANY(v_caps) THEN PERFORM public.platform_list_organizations(v_actor); END IF;
    IF 'catalogs.read'=ANY(v_caps) THEN PERFORM public.platform_list_equipment_model_catalog(v_actor); END IF;
    IF 'templates.read'=ANY(v_caps) THEN PERFORM public.platform_list_legal_templates(v_actor); END IF;
    IF NOT ('audit.read'=ANY(v_caps)) THEN
      BEGIN
        PERFORM public.platform_list_audit_events(v_actor);
        RAISE EXCEPTION 'CAP: perfil % consultó bitácora sin permiso',v_profile;
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END IF;
    IF NOT ('organizations.details'=ANY(v_caps)) THEN
      BEGIN
        PERFORM public.platform_get_organization_detail(v_actor,(SELECT id FROM public.organizations LIMIT 1));
        RAISE EXCEPTION 'CAP: perfil % consultó ficha privada',v_profile;
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END IF;
    IF v_profile<>'root' THEN
      BEGIN
        PERFORM public.assert_platform_operator(v_actor);
        RAISE EXCEPTION 'CAP: legacy elevó % a raíz',v_profile;
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END IF;
  END LOOP;
  -- Los invariantes no dependen de que el servicio recuerde comprobarlos.
  BEGIN
    UPDATE public.platform_operators SET access_profile='observer'
    WHERE auth_user_id='91000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'ROOT: permitió degradar al último raíz';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.profiles SET is_active=false
    WHERE user_id='91000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'ROOT: permitió desactivar al último raíz';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.platform_operators WHERE auth_user_id='91000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'ROOT: permitió revocar al último raíz';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM auth.users WHERE id='91000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'ROOT: cascada eliminó al último raíz';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('app.test_cap_revision',(SELECT permission_revision::text FROM public.platform_operators
  WHERE auth_user_id='91000000-0000-4000-8000-000000000003'),true);
UPDATE public.platform_operators SET access_profile='observer'
WHERE auth_user_id='91000000-0000-4000-8000-000000000003';
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ BEGIN
  IF public.has_platform_capability('catalogs.write')
    OR (public.get_platform_access()->>'revision')::bigint<=current_setting('app.test_cap_revision')::bigint THEN
    RAISE EXCEPTION 'CAP: conservaron permisos o revisión antigua';
  END IF;
END $$;
RESET role;
RESET request.jwt.claims;
UPDATE public.profiles SET is_active=false WHERE user_id='91000000-0000-4000-8000-000000000003';
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ BEGIN
  IF public.is_platform_operator() OR public.has_platform_capability('catalogs.read')
    OR public.get_platform_access()->>'isOperator'<>'false' THEN
    RAISE EXCEPTION 'CAP: perfil inactivo conservó acceso';
  END IF;
END $$;
RESET role;
RESET request.jwt.claims;
UPDATE public.profiles SET is_active=true WHERE user_id='91000000-0000-4000-8000-000000000003';
SELECT set_config('app.test_cap_revision',(SELECT permission_revision::text FROM public.platform_operators
  WHERE auth_user_id='91000000-0000-4000-8000-000000000003'),true);
DELETE FROM public.platform_operators WHERE auth_user_id='91000000-0000-4000-8000-000000000003';
INSERT INTO public.platform_operators(auth_user_id,access_profile)
VALUES('91000000-0000-4000-8000-000000000003','support');
DO $$ BEGIN
  IF (SELECT permission_revision FROM public.platform_operators
    WHERE auth_user_id='91000000-0000-4000-8000-000000000003')<=current_setting('app.test_cap_revision')::bigint THEN
    RAISE EXCEPTION 'CAP: revocar y reasignar reutilizó una revisión';
  END IF;
END $$;
SET LOCAL role='service_role';
DO $$ BEGIN
  BEGIN
    INSERT INTO public.platform_operators(auth_user_id) VALUES('91000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'CAP: servicio asignó permisos sin RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
