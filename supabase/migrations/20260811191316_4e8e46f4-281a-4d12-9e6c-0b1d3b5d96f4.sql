-- M-3: get_sidebar_badge_counts es SECURITY DEFINER con GRANT EXECUTE a
-- authenticated y NO verificaba rol → cualquier usuario autenticado (incl.
-- customers del portal) podía leer métricas operativas internas
-- (mantenimientos abiertos, entregas/devoluciones del día, payment intents
-- pendientes de revisión).
--
-- Fix: guard de rol al inicio, permitiendo solo personal interno
-- (admin, administrativo, dispatcher, ventas, mechanic — se excluyen
-- 'customer' y 'auditor'). Mismo patrón has_role + RAISE 42501 usado en
-- otras funciones SECURITY DEFINER del repo. El cuerpo de la función queda
-- idéntico al vigente (versión con public.today_mty() aplicada por la
-- migración 20260731235443); solo cambia LANGUAGE sql → plpgsql para poder
-- alojar el guard.
CREATE OR REPLACE FUNCTION public.get_sidebar_badge_counts()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- M-3: solo staff interno puede ver los contadores del sidebar.
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'ventas'::app_role)
    OR public.has_role(auth.uid(), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado para ver métricas internas' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT json_build_object(
      'maintenance_open', (SELECT COUNT(*) FROM maintenance_logs
                           WHERE work_status IS DISTINCT FROM 'completed'
                             AND work_status IS DISTINCT FROM 'cancelled'),
      'deliveries_today', (SELECT COUNT(*) FROM deliveries
                           WHERE scheduled_date = public.today_mty()
                             AND status = 'scheduled'),
      'returns_today',    (SELECT COUNT(*) FROM bookings
                           WHERE status = 'confirmed'
                             AND end_date = public.today_mty()),
      'intents_pending',  (SELECT COUNT(*) FROM customer_payment_intents
                           WHERE status::text = 'pending_review')
    )
  );
END
$$;

REVOKE ALL ON FUNCTION public.get_sidebar_badge_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sidebar_badge_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sidebar_badge_counts() TO authenticated;

-- M-9: la política "Customers read own payments" (20260215214411) usa una
-- subconsulta directa sobre public.invoices, pero el SELECT de invoices para
-- customers fue revocado (20260515200202, DROP POLICY "Customers read own
-- invoices"). Con RLS aplicándose dentro de la subconsulta, ésta devuelve 0
-- filas para un customer y el portal no muestra ningún pago.
--
-- Fix: reemplazar la subconsulta por una función SECURITY DEFINER (STABLE,
-- search_path fijado) que verifica ownership saltando RLS — mismo patrón que
-- public.get_customer_id_for_user. No se tocan las políticas de storage.
CREATE OR REPLACE FUNCTION public.customer_owns_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND i.customer_id = public.get_customer_id_for_user(auth.uid())
  );
$$;

DROP POLICY IF EXISTS "Customers read own payments" ON public.payments;
CREATE POLICY "Customers read own payments"
ON public.payments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer'::app_role) AND
  public.customer_owns_invoice(invoice_id)
);