-- SEC-M1: RLS alineado a la matriz role_permissions (fuente única de verdad).
-- Corrige divergencias de fábrica:
--   * dispatcher Contratos = read     → se revoca INSERT/UPDATE en contracts.
--   * dispatcher Mantenimiento = none → se revoca SELECT en maintenance_logs,
--     maintenance_parts, maintenance_policies, maintenance_labor.

-- 1) Función de autorización por matriz.
--    'full' satisface cualquier nivel pedido; 'read' solo satisface 'read'.
CREATE OR REPLACE FUNCTION public.has_permission(p_module text, p_level text DEFAULT 'read')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE rp.access_level
               WHEN 'full' THEN true
               WHEN 'read' THEN p_level = 'read'
               ELSE false
             END
      FROM public.role_permissions rp
      WHERE rp.role = (
        SELECT ur.role
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        LIMIT 1
      )
        AND rp.module = p_module
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO authenticated;

-- 2) contracts: la escritura pasa a gobernarse por la matriz.
--    Con la matriz vigente (dispatcher = read) el dispatcher pierde INSERT/UPDATE,
--    que la UI ya le niega (routes-config.tsx marca /contracts/new con minAccess "full").
DROP POLICY IF EXISTS "Dispatchers insert contracts" ON public.contracts;
DROP POLICY IF EXISTS "Dispatchers update contracts" ON public.contracts;

CREATE POLICY "Matrix insert contracts"
  ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('Contratos', 'full'));

CREATE POLICY "Matrix update contracts"
  ON public.contracts FOR UPDATE TO authenticated
  USING (public.has_permission('Contratos', 'full'))
  WITH CHECK (public.has_permission('Contratos', 'full'));

-- La política "Dispatchers read contracts" (SELECT) se conserva: coincide con
-- la matriz (Contratos = read).

-- 3) Mantenimiento: reemplazar los SELECT por rol fijo del dispatcher por
--    SELECT gobernado por la matriz (módulo 'Mantenimiento').
DROP POLICY IF EXISTS "Dispatchers read maintenance_logs" ON public.maintenance_logs;
CREATE POLICY "Matrix read maintenance_logs"
  ON public.maintenance_logs FOR SELECT TO authenticated
  USING (public.has_permission('Mantenimiento', 'read'));

DROP POLICY IF EXISTS "Dispatcher read maintenance_parts" ON public.maintenance_parts;
CREATE POLICY "Matrix read maintenance_parts"
  ON public.maintenance_parts FOR SELECT TO authenticated
  USING (public.has_permission('Mantenimiento', 'read'));

DROP POLICY IF EXISTS "Dispatcher read maintenance_policies" ON public.maintenance_policies;
CREATE POLICY "Matrix read maintenance_policies"
  ON public.maintenance_policies FOR SELECT TO authenticated
  USING (public.has_permission('Mantenimiento', 'read'));

DROP POLICY IF EXISTS "Dispatcher read maintenance_labor" ON public.maintenance_labor;
CREATE POLICY "Matrix read maintenance_labor"
  ON public.maintenance_labor FOR SELECT TO authenticated
  USING (public.has_permission('Mantenimiento', 'read'));
