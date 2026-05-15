DROP POLICY IF EXISTS "Authenticated users can read suppliers" ON public.suppliers;

CREATE POLICY "Staff read suppliers" ON public.suppliers
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role) OR
  has_role(auth.uid(), 'dispatcher'::app_role) OR
  has_role(auth.uid(), 'ventas'::app_role) OR
  has_role(auth.uid(), 'auditor'::app_role) OR
  has_role(auth.uid(), 'mechanic'::app_role)
);