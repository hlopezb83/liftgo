
-- Add RLS policies for administrativo role on equipment_models, drivers, and mechanics

CREATE POLICY "Administrativo full access equipment_models"
ON public.equipment_models
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Administrativo full access drivers"
ON public.drivers
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Administrativo full access mechanics"
ON public.mechanics
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));
