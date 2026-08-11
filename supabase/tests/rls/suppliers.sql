-- RLS: suppliers — catálogo de proveedores.
-- Estado esperado (v7.302.5):
--   lectura  : staff (is_staff)
--   escritura: admin y administrativo (is_admin_or_administrativo)
--   anon y cliente del portal: sin acceso (sin GRANT ni policy)
--   FORCE ROW LEVEL SECURITY activo.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('5b111111-1111-4111-8111-111111111101', 'admin.sup@test.local', now(), now()),
  ('5b111111-1111-4111-8111-111111111102', 'mecanico.sup@test.local', now(), now()),
  ('5b111111-1111-4111-8111-111111111103', 'cliente.sup@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('5b111111-1111-4111-8111-111111111101', 'admin'),
  ('5b111111-1111-4111-8111-111111111102', 'mechanic'),
  ('5b111111-1111-4111-8111-111111111103', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO public.suppliers (id, name) VALUES
  ('5b111111-1111-4111-8111-1111111111a1', 'Proveedor RLS');

-- 0) FORCE RLS debe estar activo en la tabla.
DO $$
BEGIN
  IF NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.suppliers'::regclass) THEN
    RAISE EXCEPTION 'CONFIG: suppliers sin FORCE ROW LEVEL SECURITY';
  END IF;
  RAISE NOTICE 'OK: suppliers con FORCE RLS';
END $$;

-- 1) anon: sin GRANT ni policy.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
DECLARE
  v_count integer;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.suppliers;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'RLS BREACH: anon lee suppliers';
    END IF;
    RAISE NOTICE 'OK: anon sin filas en suppliers';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: anon sin GRANT sobre suppliers';
  END;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: los proveedores no son suyos.
SET LOCAL request.jwt.claims TO '{"sub":"5b111111-1111-4111-8111-111111111103","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.suppliers) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee suppliers';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a suppliers';
END $$;

-- 3) Staff no administrativo (mechanic): lee pero no escribe.
SET LOCAL request.jwt.claims TO '{"sub":"5b111111-1111-4111-8111-111111111102","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.suppliers
       WHERE id = '5b111111-1111-4111-8111-1111111111a1') <> 1 THEN
    RAISE EXCEPTION 'REGRESIÓN: staff no puede leer suppliers';
  END IF;
  RAISE NOTICE 'OK: staff lee suppliers';

  BEGIN
    UPDATE public.suppliers SET name = 'Hackeado'
     WHERE id = '5b111111-1111-4111-8111-1111111111a1';
    IF EXISTS (SELECT 1 FROM public.suppliers
                WHERE id = '5b111111-1111-4111-8111-1111111111a1' AND name = 'Hackeado') THEN
      RAISE EXCEPTION 'RLS BREACH: mechanic actualizó un proveedor';
    END IF;
    RAISE NOTICE 'OK: update de mechanic sin efecto';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: update de mechanic denegado';
  END;

  BEGIN
    DELETE FROM public.suppliers WHERE id = '5b111111-1111-4111-8111-1111111111a1';
    IF NOT EXISTS (SELECT 1 FROM public.suppliers
                    WHERE id = '5b111111-1111-4111-8111-1111111111a1') THEN
      RAISE EXCEPTION 'RLS BREACH: mechanic borró un proveedor';
    END IF;
    RAISE NOTICE 'OK: delete de mechanic sin efecto';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: delete de mechanic denegado';
  END;
END $$;

-- 4) Admin: CRUD completo.
SET LOCAL request.jwt.claims TO '{"sub":"5b111111-1111-4111-8111-111111111101","role":"authenticated"}';

DO $$
BEGIN
  INSERT INTO public.suppliers (id, name)
  VALUES ('5b111111-1111-4111-8111-1111111111a2', 'Proveedor Admin');

  UPDATE public.suppliers SET name = 'Proveedor Admin 2'
   WHERE id = '5b111111-1111-4111-8111-1111111111a2';
  IF NOT EXISTS (SELECT 1 FROM public.suppliers
                  WHERE id = '5b111111-1111-4111-8111-1111111111a2'
                    AND name = 'Proveedor Admin 2') THEN
    RAISE EXCEPTION 'REGRESIÓN: admin no pudo actualizar suppliers';
  END IF;

  DELETE FROM public.suppliers WHERE id = '5b111111-1111-4111-8111-1111111111a2';
  IF EXISTS (SELECT 1 FROM public.suppliers
              WHERE id = '5b111111-1111-4111-8111-1111111111a2') THEN
    RAISE EXCEPTION 'REGRESIÓN: admin no pudo borrar suppliers';
  END IF;
  RAISE NOTICE 'OK: admin con CRUD completo sobre suppliers';
END $$;

-- 5) service_role: acceso sin restricción (mantenimiento y edge functions).
RESET ROLE;
SET LOCAL role = 'service_role';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.suppliers
       WHERE id = '5b111111-1111-4111-8111-1111111111a1') <> 1 THEN
    RAISE EXCEPTION 'REGRESIÓN: service_role no lee suppliers';
  END IF;
  RAISE NOTICE 'OK: service_role lee suppliers';
END $$;

RESET ROLE;
ROLLBACK;
