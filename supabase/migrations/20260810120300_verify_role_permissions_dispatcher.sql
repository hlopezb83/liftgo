-- SEC-M1b: la matriz role_permissions es la fuente de verdad (la UI la usa
-- con minAccess "full" para crear/editar contratos; ver routes-config.tsx
-- GUI-FE-04). Tras FIX-01, RLS también la obedece vía has_permission().
-- Esta migración fija los valores de dispatcher y falla si divergen.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = 'dispatcher' AND module = 'Contratos' AND access_level = 'read'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = 'dispatcher' AND module = 'Mantenimiento' AND access_level = 'none'
  ) THEN
    RAISE EXCEPTION 'role_permissions dispatcher diverge de lo esperado (Contratos=read, Mantenimiento=none). Revisa SEC-M1b antes de continuar.';
  END IF;
END $$;

-- OPCIÓN B (solo si negocio confirma que el dispatcher crea contratos y/o
-- consulta mantenimiento): descomentar lo que aplique y quitar el DO de arriba.
-- Con FIX-01 aplicado, RLS concederá el acceso automáticamente.
-- UPDATE public.role_permissions
--   SET access_level = 'full', updated_at = now()
--   WHERE role = 'dispatcher' AND module = 'Contratos';
-- UPDATE public.role_permissions
--   SET access_level = 'read', updated_at = now()
--   WHERE role = 'dispatcher' AND module = 'Mantenimiento';
