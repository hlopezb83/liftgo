-- RLS: forklifts — mecánico lee la flota pero no la modifica ni la borra.
-- FIX-R2-04: chequeo de BREACH fuera del handler (ver invoices.sql).
BEGIN;

-- Contexto multiempresa (migración 0031): las operaciones de servicio deben
-- declarar la organización antes de sembrar datos.
DO $ctx$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;

  PERFORM set_config('app.organization_id', v_org::text, true);
END $ctx$;


INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('88888888-0000-4000-8000-000000000001', 'mecanico.fleet@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('88888888-0000-4000-8000-000000000001', 'mechanic')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.forklifts (id, name, model, status)
VALUES ('88888888-0000-4000-8000-00000000000f', 'MONTACARGAS-RLS', 'MODELO-RLS', 'available');


-- Contexto multiempresa (migración 0031): el personal interno sólo tiene
-- contexto de organización con una membresía interna explícita.
DO $mem$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  PERFORM set_config('app.organization_id', v_org::text, true);

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  SELECT v_org, ur.user_id, 'internal'
  FROM public.user_roles ur
  WHERE ur.role <> 'customer'
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.auth_user_id = ur.user_id
    )
  ON CONFLICT DO NOTHING;
END $mem$;

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
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0; -- denegación esperada
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: mecánico modificó la flota directamente';
  END IF;
  RAISE NOTICE 'OK: mecánico no escribe en forklifts';

  BEGIN
    DELETE FROM public.forklifts WHERE id = '88888888-0000-4000-8000-00000000000f';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- denegación esperada; el efecto se verifica abajo
  END;
  IF NOT EXISTS (SELECT 1 FROM public.forklifts
                  WHERE id = '88888888-0000-4000-8000-00000000000f') THEN
    RAISE EXCEPTION 'RLS BREACH: mecánico borró un equipo';
  END IF;
  RAISE NOTICE 'OK: mecánico no borra equipos';
END $$;

ROLLBACK;
