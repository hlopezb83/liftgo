-- 0035_storage_manual_resolutions_force_rls
--
-- Endurecimiento de la tabla de infraestructura creada en 0034.
--
-- `public.storage_migration_manual_resolutions` es deny-all para `anon` y
-- `authenticated` y solo la usa `service_role` (que tiene BYPASSRLS). Sin
-- FORCE ROW LEVEL SECURITY, cualquier funcion SECURITY DEFINER propiedad del
-- owner de la tabla la leeria o escribiria saltandose las policies. FORCE
-- cierra esa ruta sin afectar a `service_role`.
--
-- Cambio aditivo: no crea, renombra ni elimina columnas, ni toca datos.

ALTER TABLE public.storage_migration_manual_resolutions
  FORCE ROW LEVEL SECURITY;

-- Revocacion defensiva: la tabla contiene rutas de objetos de Storage y no
-- debe ser alcanzable desde la aplicacion bajo ninguna circunstancia.
REVOKE ALL ON public.storage_migration_manual_resolutions FROM anon;
REVOKE ALL ON public.storage_migration_manual_resolutions FROM authenticated;
REVOKE ALL ON public.storage_migration_manual_resolutions FROM PUBLIC;

GRANT ALL ON public.storage_migration_manual_resolutions TO service_role;