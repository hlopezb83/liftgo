-- RLS: activity_feed — todo el back-office lee la bitácora de actividad,
-- pero SOLO admin escribe/edita/borra. Cliente del portal y anon sin acceso.
BEGIN;

DO $fixture$
DECLARE
  v_org uuid;
  v_admin uuid := 'af000005-0000-4000-8000-000000000001';
  v_dispatcher uuid := 'af000005-0000-4000-8000-000000000002';
  v_ventas uuid := 'af000005-0000-4000-8000-000000000003';
  v_cliente uuid := 'af000005-0000-4000-8000-000000000004';
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  ORDER BY created_at
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;

  PERFORM set_config('app.organization_id', v_org::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_admin, 'admin.af@test.local', now(), now()),
    (v_dispatcher, 'dispatcher.af@test.local', now(), now()),
    (v_ventas, 'ventas.af@test.local', now(), now()),
    (v_cliente, 'cliente.af@test.local', now(), now())
  ON CONFLICT DO NOTHING;

  -- El personal interno necesita membresía: current_organization_id() es
  -- fail-closed y sin ella org_scope_isolation oculta la bitácora.
  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  )
  VALUES
    (v_org, v_admin, 'internal'),
    (v_org, v_dispatcher, 'internal'),
    (v_org, v_ventas, 'internal')
  ON CONFLICT (auth_user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin, 'admin'),
    (v_dispatcher, 'dispatcher'),
    (v_ventas, 'ventas'),
    (v_cliente, 'customer')
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.activity_feed (id, event_type, entity_type, entity_id, title) VALUES
    ('af000005-0000-4000-8000-0000000000a1', 'created', 'booking', gen_random_uuid(), 'Evento RLS');
END;
$fixture$;

-- 1) anon: sin acceso.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.activity_feed) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee activity_feed';
  END IF;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: la bitácora interna no se expone.
SET LOCAL request.jwt.claims TO '{"sub":"af000005-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.activity_feed) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee activity_feed';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a activity_feed';
END $$;

-- 3) Ventas: lee, pero no puede fabricar ni alterar eventos.
SET LOCAL request.jwt.claims TO '{"sub":"af000005-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_rows int; v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.activity_feed
       WHERE id = 'af000005-0000-4000-8000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia leer activity_feed';
  END IF;

  BEGIN
    INSERT INTO public.activity_feed (event_type, entity_type, entity_id, title)
    VALUES ('fake', 'booking', gen_random_uuid(), 'Evento falso');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo insertar en activity_feed';
  END IF;

  BEGIN
    UPDATE public.activity_feed SET title = 'alterado'
     WHERE id = 'af000005-0000-4000-8000-0000000000a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo alterar activity_feed';
  END IF;
  RAISE NOTICE 'OK: ventas es de solo lectura en activity_feed';
END $$;

-- 4) Dispatcher: lee, pero tampoco borra.
SET LOCAL request.jwt.claims TO '{"sub":"af000005-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.activity_feed
       WHERE id = 'af000005-0000-4000-8000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: dispatcher deberia leer activity_feed';
  END IF;

  BEGIN
    DELETE FROM public.activity_feed WHERE id = 'af000005-0000-4000-8000-0000000000a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: dispatcher borro eventos de activity_feed';
  END IF;
  RAISE NOTICE 'OK: dispatcher no borra activity_feed';
END $$;

-- 5) Admin: único rol que escribe.
SET LOCAL request.jwt.claims TO '{"sub":"af000005-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  INSERT INTO public.activity_feed (event_type, entity_type, entity_id, title)
  VALUES ('created', 'invoice', gen_random_uuid(), 'Evento admin');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: admin deberia poder escribir activity_feed';
  END IF;
  RAISE NOTICE 'OK: admin escribe activity_feed';
END $$;

ROLLBACK;
