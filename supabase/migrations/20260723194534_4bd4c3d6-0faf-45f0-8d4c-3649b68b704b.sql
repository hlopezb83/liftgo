-- R12 M5: seed idempotente del módulo "Auditoría" para que /audit y /activity
-- respeten el RoleGuard (antes no tenían `module` y colaban a cualquier autenticado).
INSERT INTO public.role_permissions (role, module, access_level) VALUES
  ('admin',          'Auditoría', 'full'),
  ('administrativo', 'Auditoría', 'full'),
  ('auditor',        'Auditoría', 'read')
ON CONFLICT (role, module) DO NOTHING;
