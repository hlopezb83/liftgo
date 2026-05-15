DROP POLICY IF EXISTS "Others read equipment_models" ON public.equipment_models;
DROP POLICY IF EXISTS "Ventas read equipment_models" ON public.equipment_models;
DROP POLICY IF EXISTS "Auditor read equipment_models" ON public.equipment_models;

CREATE POLICY "Staff read equipment_models"
  ON public.equipment_models FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'mechanic'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role)
  );