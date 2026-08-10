-- RLS: notifications — cada usuario solo ve/edita las suyas; solo admin/administrativo insertan.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('55555555-0000-4000-8000-000000000001', 'user1.notif@test.local', now(), now()),
  ('55555555-0000-4000-8000-000000000002', 'user2.notif@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('55555555-0000-4000-8000-000000000001', 'ventas'),
  ('55555555-0000-4000-8000-000000000002', 'dispatcher')
ON CONFLICT DO NOTHING;

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

  BEGIN
    DELETE FROM public.notifications WHERE id = '55555555-0000-4000-8000-00000000000b';
    IF NOT EXISTS (SELECT 1 FROM public.notifications
                    WHERE id = '55555555-0000-4000-8000-00000000000b') THEN
      RAISE EXCEPTION 'RLS BREACH: user1 borró notificación ajena';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: no borra notificaciones ajenas';
  END;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title)
    VALUES ('55555555-0000-4000-8000-000000000002', 'info', 'Spam');
    RAISE EXCEPTION 'RLS BREACH: ventas pudo crear notificaciones';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK: solo admin/administrativo crean notificaciones';
  END;
END $$;

ROLLBACK;
