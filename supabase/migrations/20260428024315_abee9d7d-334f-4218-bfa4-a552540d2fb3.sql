-- Public branding view: exposes ONLY non-sensitive logo + company name for login screens
CREATE OR REPLACE VIEW public.public_branding
WITH (security_invoker = false) AS
SELECT logo_url, razon_social
FROM public.company_settings
LIMIT 1;

GRANT SELECT ON public.public_branding TO anon, authenticated;