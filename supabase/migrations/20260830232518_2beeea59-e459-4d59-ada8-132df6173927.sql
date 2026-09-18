-- Helper canónico: saldo pendiente del cliente (misma definición que
-- get_customer_summary.outstanding_revenue: v_invoices_with_balance en MXN,
-- estados por cobrar y excluyendo cancelaciones aceptadas).
CREATE OR REPLACE FUNCTION public.customer_outstanding_balance(p_customer_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(b.balance_mxn), 0)::numeric
  FROM public.v_invoices_with_balance b
  WHERE b.customer_id = p_customer_id
    AND b.status IN ('sent', 'partial', 'overdue')
    AND COALESCE(b.cancellation_status, '') <> 'accepted';
$$;

REVOKE ALL ON FUNCTION public.customer_outstanding_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_outstanding_balance(uuid) TO authenticated, service_role;

-- Tolerancia monetaria 0.01, misma convención que los guards de pagos.
CREATE OR REPLACE FUNCTION public.customer_has_outstanding_balance(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.customer_outstanding_balance(p_customer_id) > 0.01;
$$;

REVOKE ALL ON FUNCTION public.customer_has_outstanding_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_has_outstanding_balance(uuid) TO authenticated, service_role;

-- Guard de UPDATE directo: misma regla que el RPC.
CREATE OR REPLACE FUNCTION public.guard_customer_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL OR coalesce(current_setting('app.e2e_seed', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT (public.has_role(v_uid, 'admin'::app_role)
          OR public.has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin o administrativo pueden archivar un cliente'
      USING ERRCODE = '42501';
  END IF;

  IF public.customer_has_active_bookings(OLD.id) THEN
    RAISE EXCEPTION 'No se puede archivar: el cliente tiene reservas activas'
      USING ERRCODE = 'P0001';
  END IF;

  IF public.customer_has_outstanding_balance(OLD.id) THEN
    RAISE EXCEPTION 'No se puede archivar: el cliente tiene saldo pendiente'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_customer_archive() FROM PUBLIC, anon, authenticated;

-- RPC canónico: misma regla, mismo helper.
CREATE OR REPLACE FUNCTION public.soft_delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'admin'::app_role)
          OR public.has_role((select auth.uid()), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.customer_has_active_bookings(p_customer_id) THEN
    RAISE EXCEPTION 'No se puede archivar: el cliente tiene reservas activas'
      USING ERRCODE = 'P0001';
  END IF;

  IF public.customer_has_outstanding_balance(p_customer_id) THEN
    RAISE EXCEPTION 'No se puede archivar: el cliente tiene saldo pendiente'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.customers
     SET deleted_at = now(),
         deleted_by = (select auth.uid())
   WHERE id = p_customer_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado o ya archivado';
  END IF;
END;
$$;