-- RLS: notifications — cada usuario solo ve/edita las suyas; solo admin/administrativo insertan.
-- FIX-R2-04: chequeo de BREACH fuera del handler (ver invoices.sql).
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('55555555-0000-4000-8000-000000000001', 'user1.notif@test.local', now(), now()),
  ('55555555-0000-4000-8000-000000000002', 'user2.notif@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('55555555-0000-4000-8000-000000000001', 'ventas'),
  ('55555555-0000-4000-8000-000000000002', 'dispatcher')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.notifications (id, user_id, type, title) VALUES
  ('55555555-0000-4000-8000-00000000000a', '55555555-0000-4000-8000-000000000001', 'info', 'Para user1'),
  ('55555555-0000-4000-8000-00000000000b', '55555555-0000-4000-8000-000000000002', 'info', 'Para user2');

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"55555555-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.notifications) <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: user1 ve % notificaciones',
      (SELECT COUNT(*) FROM public.notifications);
  END IF;

  DECLARE v_rows int := 0;
  BEGIN
    BEGIN
      DELETE FROM public.notifications WHERE id = '55555555-0000-4000-8000-00000000000b';
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN
      v_rows := 0; -- denegación válida
    END;
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'RLS BREACH: user1 borró notificación ajena';
    END IF;
    RAISE NOTICE 'OK: no borra notificaciones ajenas';
  END;

  DECLARE v_blocked2 boolean := false;
  BEGIN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title)
      VALUES ('55555555-0000-4000-8000-000000000002', 'info', 'Spam');
    EXCEPTION WHEN insufficient_privilege THEN
      v_blocked2 := true;
    END;
    IF NOT v_blocked2 THEN
      RAISE EXCEPTION 'RLS BREACH: ventas pudo crear notificaciones';
    END IF;
    RAISE NOTICE 'OK: solo admin/administrativo crean notificaciones';
  END;
END $$;

ROLLBACK;
