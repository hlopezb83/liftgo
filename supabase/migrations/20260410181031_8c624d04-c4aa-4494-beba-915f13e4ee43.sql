-- Fix 1: Restrict mechanics table read access to internal roles only
-- Drop the overly permissive "Others read mechanics" policy
DROP POLICY IF EXISTS "Others read mechanics" ON public.mechanics;

-- Add role-specific read policies for internal roles that need it
CREATE POLICY "Dispatchers read mechanics" ON public.mechanics
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Mechanics read mechanics" ON public.mechanics
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "Ventas read mechanics" ON public.mechanics
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ventas'::app_role));

-- Fix 2: Restrict company_settings read access to internal roles only
-- Drop the overly permissive "Others read company_settings" policy
DROP POLICY IF EXISTS "Others read company_settings" ON public.company_settings;

-- Add role-specific read policies for internal staff who need company info (for PDFs, etc.)
CREATE POLICY "Administrativo read company_settings" ON public.company_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Dispatchers read company_settings" ON public.company_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Mechanics read company_settings" ON public.company_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "Ventas read company_settings" ON public.company_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ventas'::app_role));