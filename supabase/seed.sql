-- Seed mínimo de demo para LiftGo (solo entornos locales / CI).
--
-- 1) Inserta una fila placeholder en public.company_settings.
-- 2) El primer usuario administrador NO puede crearse desde aquí: los auth
--    users se crean vía signup en la app o desde el panel de autenticación.
--    Después de crear el auth user, asigna el rol 'admin' en
--    public.user_roles con su user_id, por ejemplo:
--
--      INSERT INTO public.user_roles (user_id, role)
--      VALUES ('<uuid-del-auth-user>', 'admin'::public.app_role)
--      ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.company_settings
  (rfc, razon_social, regimen_fiscal, lugar_expedicion, logo_url, facturapi_mode)
SELECT 'XAXX010101000', 'Empresa Demo S.A. de C.V.', '601', '06600', NULL, 'test'
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);

-- R4-20: ya NO se otorga admin al usuario más antiguo de forma ciega.
-- Para sembrar un admin en local/CI, define el GUC antes de ejecutar el seed:
--
--   SET app.seed_admin_email = 'admin@example.com';
--
-- Si el GUC no está definido (o el email no existe en auth.users), no se
-- asigna ningún rol y la asignación de admin queda manual.
DO $$
DECLARE
  v_admin_email text := nullif(current_setting('app.seed_admin_email', true), '');
BEGIN
  IF v_admin_email IS NULL THEN
    RAISE NOTICE 'app.seed_admin_email no definido: seed.sql no asigna rol admin';
    RETURN;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  SELECT id, 'admin'::public.app_role
  FROM auth.users
  WHERE lower(email) = lower(v_admin_email)
  ON CONFLICT (user_id, role) DO NOTHING;
  IF NOT FOUND THEN
    RAISE WARNING 'app.seed_admin_email=% no existe en auth.users; no se asignó admin', v_admin_email;
  END IF;
END $$;

