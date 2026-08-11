-- Endurecimiento de bordes en public.profiles y public.suppliers.
-- No se modifican policies: ya fueron reescritas por rol en migraciones previas.
-- 1) anon no necesita ningún privilegio de tabla (no existe policy para anon).
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.suppliers FROM anon;

-- 2) Grants explícitos alineados a las policies vivas.
--    profiles: no hay policy de DELETE -> no se otorga DELETE a authenticated.
REVOKE DELETE ON TABLE public.profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suppliers TO authenticated;
GRANT ALL ON TABLE public.suppliers TO service_role;

-- 3) FORCE RLS en suppliers (profiles ya lo tiene desde 20260811211228/v7.299.1).
--    service_role y postgres conservan BYPASSRLS, por lo que triggers y edge
--    functions administrativas siguen funcionando.
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;

-- Rollback:
--   ALTER TABLE public.suppliers NO FORCE ROW LEVEL SECURITY;
--   GRANT DELETE ON TABLE public.profiles TO authenticated;