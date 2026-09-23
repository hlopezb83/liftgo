-- La identidad global del cliente puede aparecer en varias empresas. Sus
-- datos comerciales se editan en organization_customers, nunca en customers.
ALTER TABLE public.organization_customers
  ADD COLUMN IF NOT EXISTS website text;

COMMENT ON COLUMN public.organization_customers.website IS
  'Sitio web del cliente para esta relación comercial; NULL conserva el dato global legado.';

CREATE OR REPLACE FUNCTION public.guard_customer_global_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Procesos de sistema conservan sus rutas de mantenimiento. El personal
  -- sólo puede editar una identidad global si la creó su empresa y todavía
  -- no existe otra relación, incluso archivada (historial compartido).
  IF auth.uid() IS NOT NULL
     AND (
       OLD.created_by_organization_id IS DISTINCT FROM public.current_organization_id()
       OR EXISTS (
         SELECT 1 FROM public.organization_customers oc
         WHERE oc.customer_id = OLD.id
           AND oc.organization_id <> public.current_organization_id()
       )
     ) THEN
    RAISE EXCEPTION 'La identidad compartida no se puede editar; modifica los datos de tu empresa'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_customer_global_update() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_customer_global_update ON public.customers;
CREATE TRIGGER trg_guard_customer_global_update
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_global_update();

-- Archivar sólo la relación si la identidad pertenece a más de una empresa.
CREATE OR REPLACE FUNCTION public.soft_delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid := public.current_internal_organization_id();
  v_relation_status text;
  v_created_by uuid;
  v_shared boolean := false;
  v_balance numeric;
BEGIN
  -- Identidad + membresía interna + empresa activa (el helper ya exige las
  -- tres cosas). Una cuenta de portal, un usuario sin membresía o una empresa
  -- suspendida fallan cerrado, aunque conserven un rol administrativo.
  IF v_uid IS NULL OR v_org IS NULL OR public.current_portal_customer_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden: se requiere una membresía interna verificada'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'administrativo'::public.app_role)) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT oc.status INTO v_relation_status
  FROM public.organization_customers oc
  WHERE oc.organization_id = v_org AND oc.customer_id = p_customer_id;

  SELECT c.created_by_organization_id INTO v_created_by
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.deleted_at IS NULL;

  IF v_relation_status IS NULL AND v_created_by IS DISTINCT FROM v_org THEN
    -- Cliente de otra empresa e inexistente responden igual.
    RAISE EXCEPTION 'Cliente no encontrado o ya archivado';
  END IF;

  v_shared := EXISTS (
    SELECT 1 FROM public.organization_customers oc
    WHERE oc.customer_id = p_customer_id
      AND oc.organization_id <> v_org
      -- También una relación archivada conserva historial de otra empresa.
  );

  IF v_shared THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.customer_id = p_customer_id
        AND b.organization_id = v_org
        AND b.status IN ('confirmed', 'in_progress')
    ) THEN
      RAISE EXCEPTION 'No se puede archivar: el cliente tiene reservas activas'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(SUM(b.balance_mxn), 0) INTO v_balance
    FROM public.v_invoices_with_balance b
    JOIN public.invoices i ON i.id = b.id
    WHERE b.customer_id = p_customer_id
      AND i.organization_id = v_org
      AND b.status IN ('sent', 'partial', 'overdue')
      AND COALESCE(b.cancellation_status, '') <> 'accepted';
    IF v_balance > 0.01 THEN
      RAISE EXCEPTION 'No se puede archivar: el cliente tiene saldo pendiente'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.organization_customers
    SET status = 'archived', updated_at = now()
    WHERE organization_id = v_org
      AND customer_id = p_customer_id
      AND status <> 'archived';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente no encontrado o ya archivado';
    END IF;

    UPDATE public.customer_portal_accounts
    SET status = 'suspended', updated_at = now()
    WHERE organization_id = v_org
      AND customer_id = p_customer_id
      AND status = 'active';
    RETURN;
  END IF;

  -- Única empresa con relación vigente: además del archivado por relación se
  -- conserva el archivado histórico de la identidad global.
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
         deleted_by = v_uid
   WHERE id = p_customer_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado o ya archivado';
  END IF;

  UPDATE public.organization_customers
  SET status = 'archived', updated_at = now()
  WHERE customer_id = p_customer_id
    AND organization_id = v_org
    AND status <> 'archived';

  UPDATE public.customer_portal_accounts
  SET status = 'suspended', updated_at = now()
  WHERE customer_id = p_customer_id
    AND organization_id = v_org
    AND status = 'active';
END;
$$;
