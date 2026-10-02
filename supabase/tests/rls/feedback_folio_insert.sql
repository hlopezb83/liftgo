-- Reproduce el INSERT de useCreateFeedback, sin organization_id ni folio.
-- Sólo PostgreSQL efímero de CI. Toda la fixture se revierte.
BEGIN;
SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at)
SELECT ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'feedback-folio-ci-'||n||'@example.com',now(),now(),now()
FROM generate_series(1,4) n;
INSERT INTO public.profiles(user_id,full_name,is_active)
SELECT ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Folio CI '||n,true FROM generate_series(1,4) n
ON CONFLICT(user_id) DO UPDATE SET is_active=true;
INSERT INTO public.organizations(id,name,slug,is_active) VALUES
('95950000-0000-4000-8000-000000000011','Reportes CI A','feedback-ci-a-0094',true),
('95950000-0000-4000-8000-000000000012','Reportes CI B','feedback-ci-b-0094',true),
('95950000-0000-4000-8000-000000000013','Reportes CI suspendida','feedback-ci-suspended-0094',false);
INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES
('95950000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000001','internal'),
('95950000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000002','internal'),
('95950000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000003','portal'),
('95950000-0000-4000-8000-000000000013','95000000-0000-4000-8000-000000000004','internal');
INSERT INTO public.user_roles(user_id,role) VALUES
('95000000-0000-4000-8000-000000000001','admin'),
('95000000-0000-4000-8000-000000000002','ventas'),
('95000000-0000-4000-8000-000000000003','customer'),
('95000000-0000-4000-8000-000000000004','ventas')
ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;

SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ DECLARE r public.feedback_reports; BEGIN
  BEGIN PERFORM public.generate_feedback_number(); RAISE EXCEPTION 'ACL: generador público'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.assign_feedback_folio_on_insert(); RAISE EXCEPTION 'ACL: trigger público'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description)
  VALUES(auth.uid(),'customer','improvement','Sin clasificar','Disponibilidad de equipos','Seguimiento de disponibilidad para el equipo de ventas') RETURNING * INTO r;
  IF r.folio<>'FB-0001' OR r.organization_id<>'95950000-0000-4000-8000-000000000011' OR r.reporter_type<>'internal' THEN
    RAISE EXCEPTION 'INSERT: folio, organización o tipo incorrecto'; END IF;
  BEGIN
    INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description)
    VALUES(auth.uid(),'internal','bug','Flota','Título válido','corta');
    RAISE EXCEPTION 'ROLLBACK: aceptó diagnóstico inválido'; EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description,folio)
    VALUES(auth.uid(),'internal','bug','Flota','Título válido','Diagnóstico suficientemente extenso','FB-9999');
    RAISE EXCEPTION 'FOLIO: aceptó número del navegador'; EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description)
    VALUES('95000000-0000-4000-8000-000000000003','customer','bug','Portal','Título válido','Diagnóstico suficientemente extenso');
    RAISE EXCEPTION 'OWNER: admin creó reporte de otro usuario'; EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description,organization_id)
    VALUES(auth.uid(),'internal','bug','Flota','Título válido','Diagnóstico suficientemente extenso','95950000-0000-4000-8000-000000000012');
    RAISE EXCEPTION 'ORG: escribió en empresa ajena'; EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description)
  VALUES(auth.uid(),'internal','bug','Flota','Segundo reporte','Diagnóstico suficientemente extenso') RETURNING * INTO r;
  IF r.folio<>'FB-0002' THEN RAISE EXCEPTION 'ROLLBACK: un fallo consumió folio %',r.folio; END IF;
END $$;
SET LOCAL request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ DECLARE r public.feedback_reports; BEGIN
  INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description)
  VALUES(auth.uid(),'internal','bug','Flota','Reporte empresa B','Diagnóstico suficientemente extenso') RETURNING * INTO r;
  IF r.folio<>'FB-0001' OR r.organization_id<>'95950000-0000-4000-8000-000000000012' THEN
    RAISE EXCEPTION 'ORG: contador no empieza por empresa'; END IF;
END $$;
SET LOCAL request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ DECLARE r public.feedback_reports; BEGIN
  INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description)
  VALUES(auth.uid(),'internal','bug','Portal','Reporte del cliente','Diagnóstico suficientemente extenso') RETURNING * INTO r;
  IF r.folio<>'FB-0003' OR r.reporter_type<>'customer' THEN RAISE EXCEPTION 'PORTAL: no pudo crear reporte propio'; END IF;
END $$;
RESET role;
RESET request.jwt.claims;
SELECT set_config('app.organization_id','95950000-0000-4000-8000-000000000012',true);
UPDATE public.profiles SET is_active=false WHERE user_id='95000000-0000-4000-8000-000000000002';
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ BEGIN
  BEGIN
    INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description)
    VALUES(auth.uid(),'internal','bug','Flota','Usuario desactivado','Diagnóstico suficientemente extenso');
    RAISE EXCEPTION 'PROFILE: usuario inactivo creó reporte'; EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET role;
RESET request.jwt.claims;
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $$ BEGIN
  BEGIN
    INSERT INTO public.feedback_reports(reporter_id,reporter_type,type,module,title,description)
    VALUES(auth.uid(),'internal','bug','Flota','Empresa suspendida','Diagnóstico suficientemente extenso');
    RAISE EXCEPTION 'SUSPEND: empresa suspendida creó reporte'; EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET role;
RESET request.jwt.claims;
ROLLBACK;
