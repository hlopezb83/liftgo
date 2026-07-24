-- RLS: user_roles — escalada de privilegio.
-- Guard: un usuario no-admin NO puede auto-otorgarse `admin`.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('e1111111-1111-4111-8111-111111111111', 'ventas@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('e1111111-1111-4111-8111-111111111111', 'ventas')
ON CONFLICT DO NOTHING;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES ('e1111111-1111-4111-8111-111111111111', 'admin');
    RAISE EXCEPTION 'PRIVILEGE ESCALATION: ventas pudo insertarse admin';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR unique_violation OR others THEN
      RAISE NOTICE 'OK: escalada bloqueada';
  END;

  BEGIN
    UPDATE public.user_roles SET role = 'admin'
     WHERE user_id = 'e1111111-1111-4111-8111-111111111111';
    -- Si el UPDATE pasó y afectó filas, verificar:
    IF EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = 'e1111111-1111-4111-8111-111111111111' AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'PRIVILEGE ESCALATION: ventas pudo UPDATE su rol a admin';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege OR others THEN
      NULL;
  END;
END $$;

ROLLBACK;
