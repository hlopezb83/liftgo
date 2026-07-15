CREATE POLICY "Administrativo update company_settings"
ON public.company_settings
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));