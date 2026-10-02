-- CI efímero: Auth y perfiles sintéticos; todos los cambios se revierten.
BEGIN;
SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at)
SELECT ('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'operator-access-'||n||'@example.com',CASE WHEN n<>5 THEN now() END,now(),now()
FROM generate_series(1,6) n;
INSERT INTO public.profiles(user_id,full_name,is_active)
SELECT ('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Cuenta CI 0092 '||n,true
FROM generate_series(1,6) n ON CONFLICT(user_id) DO UPDATE SET is_active=true;
INSERT INTO public.user_roles(user_id,role) VALUES
('92000000-0000-4000-8000-000000000002','ventas'),
('92000000-0000-4000-8000-000000000004','customer'),
('92000000-0000-4000-8000-000000000005','admin'),
('92000000-0000-4000-8000-000000000006','admin');
UPDATE public.profiles SET is_active=false WHERE user_id='92000000-0000-4000-8000-000000000006';
INSERT INTO public.platform_operators(auth_user_id,access_profile) VALUES
('92000000-0000-4000-8000-000000000001','root'),
('92000000-0000-4000-8000-000000000003','support');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after)
SELECT ('92920000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now(),now()+interval '1 hour'
FROM generate_series(1,3) n;

SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"92000000-0000-4000-8000-000000000001","session_id":"92920000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ BEGIN
  IF public.get_platform_session()->>'id'<>'92920000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'SESSION: no recuperó la sesión propia'; END IF;
  BEGIN
    PERFORM public.platform_list_operator_accounts(auth.uid(),'92920000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'ACL: cliente ejecutó lista privilegiada';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.platform_set_operator_profile(auth.uid(),'92920000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002','root',NULL,'Cambio CI');
    RAISE EXCEPTION 'ACL: cliente ejecutó cambio privilegiado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.platform_session_exists(auth.uid(),'92920000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'ACL: cliente consultó sesiones arbitrarias';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL request.jwt.claims='{"sub":"92000000-0000-4000-8000-000000000003","session_id":"92920000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ BEGIN
  IF public.get_platform_session() IS NOT NULL THEN RAISE EXCEPTION 'SESSION: leyó una sesión ajena'; END IF;
END $$;
SET LOCAL request.jwt.claims='{"sub":"92000000-0000-4000-8000-000000000003","session_id":"not-a-uuid","role":"authenticated"}';
DO $$ BEGIN
  IF public.get_platform_session() IS NOT NULL THEN RAISE EXCEPTION 'SESSION: aceptó sesión inválida'; END IF;
END $$;
RESET role;
RESET request.jwt.claims;

DO $$ DECLARE v jsonb; BEGIN
  v:=public.platform_list_operator_accounts('92000000-0000-4000-8000-000000000001',
    '92920000-0000-4000-8000-000000000001','Cuenta CI 0092','eligible');
  IF jsonb_array_length(v->'rows')<>3 THEN RAISE EXCEPTION 'LIST: incluyó cuentas no verificadas, clientes o inactivas'; END IF;
  BEGIN
    PERFORM public.platform_list_operator_accounts('92000000-0000-4000-8000-000000000003',
      '92920000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'LIST: soporte consultó operadores';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.platform_list_operator_accounts('92000000-0000-4000-8000-000000000001',
      '92920000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'LIST: aceptó sesión ajena';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT public.platform_set_operator_profile('92000000-0000-4000-8000-000000000001',
  '92920000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','support',NULL,'Asignación soporte CI 0092');
DO $$ DECLARE v_revision text; v_audit bigint; BEGIN
  SELECT permission_revision::text INTO v_revision FROM public.platform_operators
    WHERE auth_user_id='92000000-0000-4000-8000-000000000002';
  SELECT count(*) INTO v_audit FROM public.platform_audit_events;
  IF NOT EXISTS(SELECT 1 FROM public.platform_audit_events WHERE target_id='92000000-0000-4000-8000-000000000002'
    AND actor_id='92000000-0000-4000-8000-000000000001' AND reason='Asignación soporte CI 0092'
    AND new_state->>'access_profile'='support') THEN RAISE EXCEPTION 'AUDIT: cambio sin actor, motivo y perfil'; END IF;
  IF public.platform_set_operator_profile('92000000-0000-4000-8000-000000000001',
    '92920000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','support',v_revision,'Cambio idéntico CI') THEN
    RAISE EXCEPTION 'NOOP: guardó perfil idéntico'; END IF;
  IF (SELECT count(*) FROM public.platform_audit_events)<>v_audit OR (SELECT permission_revision::text
    FROM public.platform_operators WHERE auth_user_id='92000000-0000-4000-8000-000000000002')<>v_revision THEN
    RAISE EXCEPTION 'NOOP: cambió revisión o bitácora'; END IF;
  PERFORM public.platform_set_operator_profile('92000000-0000-4000-8000-000000000001',
    '92920000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','observer',v_revision,'Cambio observador CI');
  BEGIN
    PERFORM public.platform_set_operator_profile('92000000-0000-4000-8000-000000000001',
      '92920000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','root',v_revision,'Revisión obsoleta CI');
    RAISE EXCEPTION 'STALE: aceptó revisión obsoleta';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  SELECT permission_revision::text INTO v_revision FROM public.platform_operators
    WHERE auth_user_id='92000000-0000-4000-8000-000000000002';
  PERFORM public.platform_set_operator_profile('92000000-0000-4000-8000-000000000001',
    '92920000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002',NULL,v_revision,'Revocación soporte CI');
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id='92000000-0000-4000-8000-000000000002' AND role='ventas')
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id='92000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'REVOKE: modificó la identidad o el rol empresarial'; END IF;
END $$;

DO $$ DECLARE v_target uuid; BEGIN
  FOR v_target IN SELECT ('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(4,6) n LOOP
    BEGIN
      PERFORM public.platform_set_operator_profile('92000000-0000-4000-8000-000000000001',
        '92920000-0000-4000-8000-000000000001',v_target,'root',NULL,'Cuenta no válida CI');
      RAISE EXCEPTION 'GRANT: aceptó cuenta no elegible';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM public.platform_set_operator_profile('92000000-0000-4000-8000-000000000001',
      '92920000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',NULL,NULL,'Revocación propia CI');
    RAISE EXCEPTION 'SELF: permitió administrar acceso propio';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id='92920000-0000-4000-8000-000000000001';
DO $$ BEGIN
  BEGIN
    PERFORM public.platform_set_operator_profile('92000000-0000-4000-8000-000000000001',
      '92920000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','root',NULL,'Sesión expirada CI');
    RAISE EXCEPTION 'SESSION: aceptó cambio con sesión expirada';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
DELETE FROM auth.sessions WHERE id='92920000-0000-4000-8000-000000000003';
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"92000000-0000-4000-8000-000000000003","session_id":"92920000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ BEGIN
  IF public.get_platform_session() IS NOT NULL THEN RAISE EXCEPTION 'SESSION: aceptó sesión eliminada'; END IF;
END $$;
RESET role;
RESET request.jwt.claims;
ROLLBACK;
