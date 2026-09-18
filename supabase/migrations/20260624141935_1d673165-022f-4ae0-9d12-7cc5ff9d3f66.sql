-- Refactor delete_forklift → soft delete (preserva historial completo)
CREATE OR REPLACE FUNCTION public.delete_forklift(p_forklift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Bloquear si hay bookings activos (no archivados de negocio)
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE forklift_id = p_forklift_id
      AND status IN ('confirmed','in_progress')
  ) THEN
    RAISE EXCEPTION 'No se puede archivar: el montacargas tiene reservas activas';
  END IF;

  UPDATE forklifts
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = p_forklift_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montacargas no encontrado o ya archivado';
  END IF;
END;
$$;

-- RPC: soft delete customer (valida que no tenga facturas activas)
CREATE OR REPLACE FUNCTION public.soft_delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE customer_id = p_customer_id
      AND status IN ('confirmed','in_progress')
  ) THEN
    RAISE EXCEPTION 'No se puede archivar: el cliente tiene reservas activas';
  END IF;

  UPDATE customers
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = p_customer_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado o ya archivado';
  END IF;
END;
$$;

-- RPC: soft delete supplier (valida facturas pendientes de proveedor)
CREATE OR REPLACE FUNCTION public.soft_delete_supplier(p_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supplier_bills
    WHERE supplier_id = p_supplier_id
      AND status IN ('pending','approved','partially_paid')
  ) THEN
    RAISE EXCEPTION 'No se puede archivar: el proveedor tiene facturas pendientes';
  END IF;

  UPDATE suppliers
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = p_supplier_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor no encontrado o ya archivado';
  END IF;
END;
$$;

-- RPC: soft delete maintenance log (admin/administrativo, no mechanic — anti-manipulación)
CREATE OR REPLACE FUNCTION public.soft_delete_maintenance_log(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: solo admin/administrativo pueden archivar mantenimientos';
  END IF;

  UPDATE maintenance_logs
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = p_log_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;
END;
$$;

-- RPC: soft delete damage record (admin/administrativo/dispatcher)
CREATE OR REPLACE FUNCTION public.soft_delete_damage_record(p_damage_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE damage_records
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = p_damage_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_supplier(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_maintenance_log(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_damage_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_supplier(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_maintenance_log(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_damage_record(uuid)   TO authenticated;