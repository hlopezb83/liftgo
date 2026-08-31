-- 1) CxP: prohibir auto-aprobación
CREATE OR REPLACE FUNCTION public.approve_supplier_bill(p_bill_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
  v_created_by uuid;
BEGIN
  IF NOT public.has_role((select auth.uid()),'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden aprobar facturas';
  END IF;

  SELECT approval_status, bill_number, created_by
    INTO v_status, v_number, v_created_by
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'La factura no está pendiente de aprobación (estado: %)', v_status;
  END IF;

  -- Segregación de funciones: quien registró la factura no puede aprobarla.
  IF v_created_by IS NOT NULL AND v_created_by = (select auth.uid()) THEN
    RAISE EXCEPTION 'No puedes aprobar una factura que tú mismo registraste. Debe aprobarla otro administrador.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
    SET approval_status = 'approved',
        approved_by = (select auth.uid()),
        approved_at = now(),
        approval_notes = p_notes,
        updated_at = now()
    WHERE id = p_bill_id;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (p_bill_id, (select auth.uid()), 'approved', p_notes);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
  VALUES ('supplier_bill.approved','supplier_bill', p_bill_id,
    'Factura aprobada',
    'Factura ' || COALESCE(v_number,'') || ' aprobada para pago',
    (select auth.uid()));
END $function$;

REVOKE EXECUTE ON FUNCTION public.approve_supplier_bill(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_supplier_bill(uuid, text) TO authenticated;

-- 2) Dashboard: excluir reservas E2E
DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_stats';

  v_def := replace(v_def,
    'WHERE b.status = ''confirmed''
          AND b.end_date < public.today_mty()',
    'WHERE b.status = ''confirmed''
          AND b.is_e2e IS NOT TRUE
          AND b.end_date < public.today_mty()');

  v_def := replace(v_def,
    'LEFT JOIN bookings b ON b.forklift_id = f.id
          AND b.status IN (''confirmed'', ''completed'')',
    'LEFT JOIN bookings b ON b.forklift_id = f.id
          AND b.is_e2e IS NOT TRUE
          AND b.status IN (''confirmed'', ''completed'')');

  v_def := replace(v_def,
    'LEFT JOIN bookings bk ON bk.status IN (''confirmed'', ''completed'')',
    'LEFT JOIN bookings bk ON bk.status IN (''confirmed'', ''completed'') AND bk.is_e2e IS NOT TRUE');

  EXECUTE v_def;
END
$do$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;