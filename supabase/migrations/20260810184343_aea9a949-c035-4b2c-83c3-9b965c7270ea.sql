-- SEC-M1: RLS alineado a la matriz role_permissions (fuente única de verdad).
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

DROP POLICY IF EXISTS "Dispatchers insert contracts" ON public.contracts;
DROP POLICY IF EXISTS "Dispatchers update contracts" ON public.contracts;

CREATE POLICY "Matrix insert contracts"
  ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('Contratos', 'full'));

CREATE POLICY "Matrix update contracts"
  ON public.contracts FOR UPDATE TO authenticated
  USING (public.has_permission('Contratos', 'full'))
  WITH CHECK (public.has_permission('Contratos', 'full'));

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

-- SEC-M2: revocación inmediata de sesiones desde Edge Functions admin.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM auth.refresh_tokens
  WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = _user_id);
  DELETE FROM auth.sessions WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;

-- SEC-B8: manual de usuario solo para staff.
DROP POLICY IF EXISTS "Anyone authenticated can read manual" ON public.user_manual;

CREATE POLICY "Staff read manual"
  ON public.user_manual FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'mechanic'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
    OR public.has_role(auth.uid(), 'ventas'::app_role)
  );

-- SEC-M1b: guardarraíl de la semilla de permisos del dispatcher.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = 'dispatcher' AND module = 'Contratos' AND access_level = 'read'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = 'dispatcher' AND module = 'Mantenimiento' AND access_level = 'none'
  ) THEN
    RAISE EXCEPTION 'role_permissions dispatcher diverge de lo esperado (Contratos=read, Mantenimiento=none).';
  END IF;
END $$;