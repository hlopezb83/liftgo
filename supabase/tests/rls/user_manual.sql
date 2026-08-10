-- RLS: user_manual — manual interno restringido al personal; el cliente del portal no lo ve.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'cliente.man@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'customer')
ON CONFLICT DO NOTHING;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"dddddddd-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.user_manual) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee el manual interno';
  END IF;

  BEGIN
    INSERT INTO public.user_manual (content) VALUES ('contenido malicioso');
    RAISE EXCEPTION 'RLS BREACH: cliente pudo escribir en user_manual';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK: cliente bloqueado en user_manual';
  END;
END $$;

ROLLBACK;
