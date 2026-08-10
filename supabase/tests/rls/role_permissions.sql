-- RLS: role_permissions — la matriz de permisos solo la edita admin.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('77777777-0000-4000-8000-000000000002', 'ventas.perm@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('77777777-0000-4000-8000-000000000002', 'ventas')
ON CONFLICT DO NOTHING;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"77777777-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  -- Ventas no puede otorgarse permisos nuevos.
  BEGIN
    INSERT INTO public.role_permissions (role, module, access_level)
    VALUES ('ventas', 'Facturación', 'full');
    RAISE EXCEPTION 'RLS BREACH: ventas se otorgó permisos en la matriz';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'AVISO: la fila ya existía; se valida el UPDATE';
  WHEN others THEN
    RAISE NOTICE 'OK: ventas no inserta en role_permissions';
  END;

  -- Ni escalar los existentes.
  BEGIN
    UPDATE public.role_permissions SET access_level = 'full' WHERE role = 'ventas';
    IF EXISTS (SELECT 1 FROM public.role_permissions
                WHERE role = 'ventas' AND module = 'Facturación' AND access_level = 'full') THEN
      RAISE EXCEPTION 'RLS BREACH: ventas escaló permisos vía UPDATE';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: ventas no actualiza role_permissions';
  END;
END $$;

ROLLBACK;
