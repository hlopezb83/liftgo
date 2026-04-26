-- Permite lectura pública (anónima) de company_settings.
-- Necesario para mostrar el logo y razón social en pantallas
-- pre-autenticación como /auth y /portal/login.
-- La información es de identidad corporativa, no sensible (ya aparece
-- públicamente en facturas, cotizaciones y contratos PDF).
CREATE POLICY "Public read company_settings"
ON public.company_settings
FOR SELECT
TO anon, authenticated
USING (true);
