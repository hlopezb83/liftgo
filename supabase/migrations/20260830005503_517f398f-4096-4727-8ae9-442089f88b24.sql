-- Helper reutilizable: definición canónica de "reserva activa" para el
-- archivado de clientes (misma que usaba soft_delete_customer).
CREATE OR REPLACE FUNCTION public.customer_has_active_bookings(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
     WHERE customer_id = p_customer_id
       AND status IN ('confirmed','in_progress')
  );
$$;

REVOKE ALL ON FUNCTION public.customer_has_active_bookings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_has_active_bookings(uuid) TO authenticated, service_role;

-- Guard: sólo la transición no archivado -> archivado.
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

  -- Procesos internos (service_role, tareas programadas) y sembrado E2E
  -- conservan el comportamiento actual: misma convención que
  -- public.guard_supplier_payment_delete().
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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_customer_archive() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_customer_archive ON public.customers;
CREATE TRIGGER trg_guard_customer_archive
BEFORE UPDATE OF deleted_at ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_archive();

-- El RPC usa ahora el mismo helper: una sola definición de "reserva activa".
CREATE OR REPLACE FUNCTION public.soft_delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'admin'::app_role)
          OR public.has_role((select auth.uid()), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF public.customer_has_active_bookings(p_customer_id) THEN
    RAISE EXCEPTION 'No se puede archivar: el cliente tiene reservas activas';
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