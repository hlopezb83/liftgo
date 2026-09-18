-- RLS: audit_logs — bitácora inmutable y de lectura restringida.
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
  ('66666666-0000-4000-8000-000000000001', 'ventas.audit@test.local', now(), now()),
  ('66666666-0000-4000-8000-000000000002', 'auditor.audit@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('66666666-0000-4000-8000-000000000001', 'ventas'),
  ('66666666-0000-4000-8000-000000000002', 'auditor')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.audit_logs (id, table_name, record_id, action) VALUES
  ('66666666-0000-4000-8000-00000000000a', 'invoices', gen_random_uuid(), 'UPDATE'),
  ('66666666-0000-4000-8000-00000000000b', 'prospects', gen_random_uuid(), 'INSERT');


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

-- 1) Ventas solo ve la bitácora de prospects.
SET LOCAL request.jwt.claims TO '{"sub":"66666666-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE table_name = 'invoices') THEN
    RAISE EXCEPTION 'RLS BREACH: ventas ve bitácora de facturación';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE table_name = 'prospects') THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia ver bitácora de prospects';
  END IF;
END $$;

-- 2) Auditor lee todo pero NO puede alterar la bitácora (inmutabilidad).
SET LOCAL request.jwt.claims TO '{"sub":"66666666-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.audit_logs) < 2 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor no lee toda la bitácora';
  END IF;

  BEGIN
    UPDATE public.audit_logs SET action = 'TAMPERED'
     WHERE id = '66666666-0000-4000-8000-00000000000a';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- denegación esperada; el efecto se verifica abajo
  END;
  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'TAMPERED') THEN
    RAISE EXCEPTION 'RLS BREACH: la bitácora es modificable';
  END IF;
  RAISE NOTICE 'OK: audit_logs inmutable ante UPDATE';

  BEGIN
    DELETE FROM public.audit_logs WHERE id = '66666666-0000-4000-8000-00000000000a';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- denegación esperada; el efecto se verifica abajo
  END;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs
                  WHERE id = '66666666-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'RLS BREACH: la bitácora es borrable';
  END IF;
  RAISE NOTICE 'OK: audit_logs inmutable ante DELETE';
END $$;

ROLLBACK;
