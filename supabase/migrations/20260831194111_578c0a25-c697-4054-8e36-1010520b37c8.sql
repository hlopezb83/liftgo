REVOKE ALL ON public.fiscal_periods FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_periods TO authenticated;
GRANT ALL ON public.fiscal_periods TO service_role;