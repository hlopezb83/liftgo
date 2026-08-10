-- SEC-B8: el manual de usuario es documentación interna del staff; clientes
-- del portal (rol 'customer', también 'authenticated') no deben leerlo.
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
