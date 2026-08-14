-- F5 (Sprint M2): la matriz de roles declara al dispatcher SIN acceso a
-- finanzas. Estas tres policies de lectura lo contradecían.
DROP POLICY IF EXISTS "Dispatchers read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Dispatchers read payments" ON public.payments;
DROP POLICY IF EXISTS "Dispatchers read operating_expenses" ON public.operating_expenses;