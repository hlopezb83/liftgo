-- A1. Restringir notas de crédito para dispatchers (solo lectura)
DROP POLICY IF EXISTS "Dispatchers full access credit_notes" ON public.credit_notes;
CREATE POLICY "Dispatchers read credit_notes" ON public.credit_notes
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role));

-- A2. Restringir quotes para dispatchers (solo lectura)
DROP POLICY IF EXISTS "Dispatchers full access quotes" ON public.quotes;
CREATE POLICY "Dispatchers read quotes" ON public.quotes
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role));

-- A3. Evitar mutación del log de flota por mecánicos (solo lectura)
-- CORRECCIÓN: tabla real es status_logs (el diff original decía forklift_status_logs, inexistente)
DROP POLICY IF EXISTS "Mechanics full access status_logs" ON public.status_logs;
CREATE POLICY "Mechanics read status_logs" ON public.status_logs
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'mechanic'::app_role));

-- A4. Restringir collection_notes para dispatchers (solo lectura)
DROP POLICY IF EXISTS "Dispatchers full access collection_notes" ON public.collection_notes;
CREATE POLICY "Dispatchers read collection_notes" ON public.collection_notes
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'dispatcher'::app_role));

-- Endurecimiento: FORCE RLS en las 4 tablas financieras/auditoría sensibles
ALTER TABLE public.credit_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.collection_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.status_logs FORCE ROW LEVEL SECURITY;