CREATE OR REPLACE FUNCTION public.approve_supplier_bill(p_bill_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden aprobar facturas';
  END IF;

  SELECT approval_status, bill_number INTO v_status, v_number
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'La factura no está pendiente de aprobación (estado: %)', v_status;
  END IF;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
    SET approval_status = 'approved',
        approved_by = auth.uid(),
        approved_at = now(),
        approval_notes = p_notes,
        updated_at = now()
    WHERE id = p_bill_id;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (p_bill_id, auth.uid(), 'approved', p_notes);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
  VALUES ('supplier_bill.approved','supplier_bill', p_bill_id,
    'Factura aprobada',
    'Factura ' || COALESCE(v_number,'') || ' aprobada para pago',
    auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.reject_supplier_bill(p_bill_id UUID, p_notes TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden rechazar facturas';
  END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Las notas de rechazo son obligatorias';
  END IF;

  SELECT approval_status, bill_number INTO v_status, v_number
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'La factura no está pendiente de aprobación (estado: %)', v_status;
  END IF;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
    SET approval_status = 'rejected',
        approved_by = auth.uid(),
        approved_at = now(),
        approval_notes = p_notes,
        updated_at = now()
    WHERE id = p_bill_id;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (p_bill_id, auth.uid(), 'rejected', p_notes);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
  VALUES ('supplier_bill.rejected','supplier_bill', p_bill_id,
    'Factura rechazada',
    'Factura ' || COALESCE(v_number,'') || ' rechazada: ' || p_notes,
    auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.request_bill_reapproval(p_bill_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No tienes permisos para solicitar reaprobación';
  END IF;

  SELECT approval_status, bill_number INTO v_status, v_number
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'Solo facturas rechazadas pueden re-solicitar aprobación';
  END IF;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
    SET approval_status = 'pending',
        approved_by = NULL,
        approved_at = NULL,
        approval_notes = NULL,
        updated_at = now()
    WHERE id = p_bill_id;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (p_bill_id, auth.uid(), 'reapproval_requested', p_notes);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
  VALUES ('supplier_bill.reapproval_requested','supplier_bill', p_bill_id,
    'Reaprobación solicitada',
    'Factura ' || COALESCE(v_number,'') || ' enviada nuevamente a aprobación',
    auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role'
     OR v_jwt_role IS NULL
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La aprobacion de facturas de proveedor solo se modifica via approve_supplier_bill / reject_supplier_bill / request_bill_reapproval.'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_supplier_bill_approval ON public.supplier_bills;
CREATE TRIGGER trg_guard_supplier_bill_approval
  BEFORE UPDATE OF approval_status, approved_by, approved_at, approval_notes
  ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_approval();

REVOKE UPDATE ON public.supplier_bills FROM authenticated;
GRANT UPDATE (
  bill_number, supplier_id, cfdi_uuid, folio, serie, issue_date, due_date,
  subtotal, tax_amount, retention_isr, retention_iva, total, currency,
  exchange_rate, payment_method_sat, payment_form_sat, cfdi_use, category,
  description, status, balance, xml_url, pdf_url, cfdi_xml_url, receptor_rfc,
  tipo_comprobante, coverage_start, coverage_end, notes, legacy_expense_id,
  created_by, payment_in_progress_at, updated_at
) ON public.supplier_bills TO authenticated;