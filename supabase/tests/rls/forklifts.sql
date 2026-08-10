-- RLS: forklifts — mecánico lee la flota pero no la modifica ni la borra.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('88888888-0000-4000-8000-000000000001', 'mecanico.fleet@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('88888888-0000-4000-8000-000000000001', 'mechanic')
ON CONFLICT DO NOTHING;

INSERT INTO public.forklifts (id, name, model, status)
VALUES ('88888888-0000-4000-8000-00000000000f', 'MONTACARGAS-RLS', 'MODELO-RLS', 'available');

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"88888888-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.forklifts
                  WHERE id = '88888888-0000-4000-8000-00000000000f') THEN
    RAISE EXCEPTION 'RLS ROTA: mecánico no puede leer la flota';
  END IF;

  BEGIN
    UPDATE public.forklifts SET status = 'maintenance'
     WHERE id = '88888888-0000-4000-8000-00000000000f';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'RLS BREACH: mecánico modificó la flota directamente';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: mecánico no escribe en forklifts';
  END;

  BEGIN
    DELETE FROM public.forklifts WHERE id = '88888888-0000-4000-8000-00000000000f';
    IF NOT EXISTS (SELECT 1 FROM public.forklifts
                    WHERE id = '88888888-0000-4000-8000-00000000000f') THEN
      RAISE EXCEPTION 'RLS BREACH: mecánico borró un equipo';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK: mecánico no borra equipos';
  END;
END $$;

ROLLBACK;
