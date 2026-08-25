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

-- Asigna rol admin al primer auth user existente (si ya fue creado).
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;
