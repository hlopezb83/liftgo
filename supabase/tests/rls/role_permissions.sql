-- RLS: role_permissions — la matriz de permisos solo la edita admin.
-- FIX-R2-04: chequeo de BREACH fuera del handler (ver invoices.sql).
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('77777777-0000-4000-8000-000000000002', 'ventas.perm@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('77777777-0000-4000-8000-000000000002', 'ventas')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"77777777-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE
  v_blocked boolean := false;
  v_row_existed boolean := false;
  v_rows int := 0;
BEGIN
  -- Ventas no puede otorgarse permisos nuevos.
  BEGIN
    INSERT INTO public.role_permissions (role, module, access_level)
    VALUES ('ventas', 'Facturación', 'full');
  EXCEPTION WHEN unique_violation THEN
    v_row_existed := true;
  WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked AND NOT v_row_existed THEN
    RAISE EXCEPTION 'RLS BREACH: ventas se otorgó permisos en la matriz';
  END IF;
  IF v_row_existed THEN
    RAISE NOTICE 'AVISO: la fila ya existía; se valida el UPDATE';
  ELSE
    RAISE NOTICE 'OK: ventas no inserta en role_permissions';
  END IF;

  -- Ni escalar los existentes.
  BEGIN
    UPDATE public.role_permissions SET access_level = 'full' WHERE role = 'ventas';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0; -- denegación esperada
  END;
  IF v_rows > 0 AND EXISTS (SELECT 1 FROM public.role_permissions
              WHERE role = 'ventas' AND module = 'Facturación' AND access_level = 'full') THEN
    RAISE EXCEPTION 'RLS BREACH: ventas escaló permisos vía UPDATE';
  END IF;
  RAISE NOTICE 'OK: ventas no actualiza role_permissions';
END $$;


ROLLBACK;
