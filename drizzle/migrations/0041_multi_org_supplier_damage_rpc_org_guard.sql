-- 0041_multi_org_supplier_damage_rpc_org_guard
--
-- Paso 4 · lote B del endurecimiento multiempresa. Las RPC SECURITY DEFINER de
-- cuentas por pagar, daños, bitácora y sincronizaciones masivas validaban solo el
-- rol global, de modo que un administrador de la empresa A podía operar recursos
-- de la empresa B con privilegios del owner.
--
-- Reglas aplicadas en todas ellas:
--   * Se conservan firma, defaults, resultado, mensajes funcionales, efectos y
--     SECURITY DEFINER (siguen necesitando privilegio elevado por triggers).
--   * Para sesión autenticada se exige, además del rol actual,
--     current_internal_organization_id() NOT NULL e is_internal_member(auth.uid()).
--   * La organización se toma de la fila objetivo (nunca de parámetros del
--     cliente) y se compara antes de cualquier lectura sensible o mutación.
--   * Arrays y JSON de identificadores deben pertenecer por completo a la
--     organización actual; una mezcla A/B falla de forma atómica antes de escribir.
--   * Las filas derivadas (supplier_bill_approvals, activity_feed,
--     supplier_payments, supplier_payment_batch(_items), status_logs,
--     maintenance_logs, invoices, invoice_bookings, audit_logs) reciben
--     organization_id = v_org.
--   * Un UUID ajeno y un UUID inexistente producen el mismo error genérico.
--   * Sólo se conservan los canales internos (auth.uid() IS NULL / service_role)
--     que ya existían: create_recurring_invoice y sync_invoice_status.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. approve_supplier_bill
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_supplier_bill(p_bill_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
  v_created_by uuid;
BEGIN
  IF NOT public.has_role(v_uid,'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden aprobar facturas';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT approval_status, bill_number, created_by
    INTO v_status, v_number, v_created_by
    FROM public.supplier_bills
   WHERE id = p_bill_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'La factura no está pendiente de aprobación (estado: %)', v_status;
  END IF;

  -- Segregación de funciones: quien registró la factura no puede aprobarla.
  IF v_created_by IS NOT NULL AND v_created_by = v_uid THEN
    RAISE EXCEPTION 'No puedes aprobar una factura que tú mismo registraste. Debe aprobarla otro administrador.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
    SET approval_status = 'approved',
        approved_by = v_uid,
        approved_at = now(),
        approval_notes = p_notes,
        updated_at = now()
    WHERE id = p_bill_id AND organization_id = v_org;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes, organization_id)
    VALUES (p_bill_id, v_uid, 'approved', p_notes, v_org);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id, organization_id)
  VALUES ('supplier_bill.approved','supplier_bill', p_bill_id,
    'Factura aprobada',
    'Factura ' || COALESCE(v_number,'') || ' aprobada para pago',
    v_uid, v_org);
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. reject_supplier_bill
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_supplier_bill(p_bill_id uuid, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT public.has_role(v_uid,'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden rechazar facturas';
  END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Las notas de rechazo son obligatorias';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT approval_status, bill_number INTO v_status, v_number
    FROM public.supplier_bills
   WHERE id = p_bill_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'La factura no está pendiente de aprobación (estado: %)', v_status;
  END IF;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  -- A6R2-2: el rechazante ya no se guarda como aprobador.
  UPDATE public.supplier_bills
    SET approval_status = 'rejected',
        approved_by = NULL,
        approved_at = NULL,
        rejected_by = v_uid,
        rejected_at = now(),
        approval_notes = p_notes,
        updated_at = now()
    WHERE id = p_bill_id AND organization_id = v_org;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes, organization_id)
    VALUES (p_bill_id, v_uid, 'rejected', p_notes, v_org);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id, organization_id)
  VALUES ('supplier_bill.rejected','supplier_bill', p_bill_id,
    'Factura rechazada',
    'Factura ' || COALESCE(v_number,'') || ' rechazada: ' || p_notes,
    v_uid, v_org);
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. request_bill_reapproval
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_bill_reapproval(p_bill_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT (public.has_role(v_uid,'admin'::app_role)
          OR public.has_role(v_uid,'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No tienes permisos para solicitar reaprobación';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT approval_status, bill_number
    INTO v_status, v_number
    FROM public.supplier_bills
   WHERE id = p_bill_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'Solo facturas rechazadas pueden re-solicitar aprobación';
  END IF;

  -- R10-01: un rechazo explícito NO se puede auto-limpiar; la factura regresa
  -- siempre al circuito de aprobación ('pending').
  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
    SET approval_status = 'pending',
        approved_by = NULL,
        approved_at = NULL,
        updated_at = now()
    WHERE id = p_bill_id AND organization_id = v_org;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes, organization_id)
    VALUES (p_bill_id, v_uid, 'reapproval_requested', p_notes, v_org);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id, organization_id)
  VALUES ('supplier_bill.reapproval_requested','supplier_bill', p_bill_id,
    'Reaprobación solicitada',
    'Factura ' || COALESCE(v_number,'') || ' enviada nuevamente a aprobación',
    v_uid, v_org);
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. register_supplier_payment (8 argumentos)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT today_mty(), p_payment_method text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
  v_batch_id UUID;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status, approval_status INTO v_balance, v_status, v_approval
    FROM public.supplier_bills
   WHERE id = p_bill_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'No se puede pagar una factura en borrador';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval NOT IN ('approved', 'not_required') THEN
    RAISE EXCEPTION 'La factura no está aprobada para pago (estado de aprobación: %)', v_approval;
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  SELECT i.batch_id INTO v_batch_id
    FROM public.supplier_payment_batch_items i
    JOIN public.supplier_payment_batches b ON b.id = i.batch_id
   WHERE i.bill_id = p_bill_id
     AND COALESCE(i.organization_id, v_org) = v_org
     AND COALESCE(b.organization_id, v_org) = v_org
   ORDER BY b.created_at DESC
   LIMIT 1;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by, batch_id, organization_id
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, v_uid, v_batch_id, v_org
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. register_supplier_payment (9 argumentos, con lote explícito)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT today_mty(), p_payment_method text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_batch_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
  v_batch_id UUID;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status, approval_status INTO v_balance, v_status, v_approval
    FROM public.supplier_bills
   WHERE id = p_bill_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'No se puede pagar una factura en borrador';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval NOT IN ('approved', 'not_required') THEN
    RAISE EXCEPTION 'La factura no está aprobada para pago (estado de aprobación: %)', v_approval;
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  IF p_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.supplier_payment_batch_items i
      JOIN public.supplier_payment_batches b ON b.id = i.batch_id
     WHERE i.batch_id = p_batch_id
       AND i.bill_id = p_bill_id
       AND COALESCE(i.organization_id, v_org) = v_org
       AND COALESCE(b.organization_id, v_org) = v_org
  ) THEN
    RAISE EXCEPTION 'El lote % no contiene la factura %', p_batch_id, p_bill_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_batch_id := p_batch_id;
  IF v_batch_id IS NULL THEN
    SELECT i.batch_id INTO v_batch_id
      FROM public.supplier_payment_batch_items i
      JOIN public.supplier_payment_batches b ON b.id = i.batch_id
     WHERE i.bill_id = p_bill_id
       AND COALESCE(i.organization_id, v_org) = v_org
       AND COALESCE(b.organization_id, v_org) = v_org
     ORDER BY b.created_at DESC
     LIMIT 1;
  END IF;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by, batch_id, organization_id
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, v_uid, v_batch_id, v_org
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. mark_supplier_rep_rejected
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_supplier_rep_rejected(p_payment_id uuid, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'administrativo')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Las notas de rechazo son obligatorias';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.supplier_payments sp
     SET rep_status = 'rejected',
         rep_notes = p_notes
   WHERE sp.id = p_payment_id
     AND sp.rep_status IN ('pending','received')
     AND COALESCE(sp.organization_id, v_org) = v_org
     AND EXISTS (
       SELECT 1 FROM public.supplier_bills b
        WHERE b.id = sp.bill_id AND b.organization_id = v_org
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado o REP no rechazable';
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. reset_supplier_rep_pending
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_supplier_rep_pending(p_payment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'administrativo')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.supplier_payments sp
     SET rep_status = 'pending',
         rep_cfdi_uuid = NULL,
         rep_xml_url = NULL,
         rep_pdf_url = NULL,
         rep_received_at = NULL,
         rep_notes = NULL,
         rep_uploaded_by = NULL
   WHERE sp.id = p_payment_id
     AND sp.rep_required = true
     AND COALESCE(sp.organization_id, v_org) = v_org
     AND EXISTS (
       SELECT 1 FROM public.supplier_bills b
        WHERE b.id = sp.bill_id AND b.organization_id = v_org
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado o no requiere REP';
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. create_supplier_payment_batch(uuid[], date, text, text)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_supplier_payment_batch(p_bill_ids uuid[], p_scheduled_for date, p_payment_method text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_id uuid; v_bill_id uuid; v_bill public.supplier_bills%ROWTYPE;
  v_user_id uuid := (select auth.uid());
  v_org uuid;
  v_visible integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT (public.has_role(v_user_id, 'admin'::app_role) OR public.has_role(v_user_id, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_user_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_bill_ids IS NULL OR array_length(p_bill_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_bill_ids cannot be empty';
  END IF;

  -- Validación atómica del lote ANTES de escribir: todos los identificadores
  -- deben existir dentro de la organización actual. Una mezcla A/B falla aquí.
  SELECT count(DISTINCT b.id) INTO v_visible
    FROM public.supplier_bills b
   WHERE b.id = ANY(p_bill_ids) AND b.organization_id = v_org;
  IF v_visible <> (SELECT count(DISTINCT x) FROM unnest(p_bill_ids) AS t(x)) THEN
    RAISE EXCEPTION 'bill % not found', p_bill_ids[1];
  END IF;

  INSERT INTO public.supplier_payment_batches (scheduled_for, payment_method, notes, created_by, organization_id)
  VALUES (p_scheduled_for, p_payment_method, p_notes, v_user_id, v_org) RETURNING id INTO v_batch_id;

  FOREACH v_bill_id IN ARRAY p_bill_ids LOOP
    SELECT * INTO v_bill FROM public.supplier_bills
     WHERE id = v_bill_id AND organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'bill % not found', v_bill_id; END IF;
    IF v_bill.status = 'draft' THEN
      RAISE EXCEPTION 'bill % está en borrador; no puede incluirse en un lote', v_bill.bill_number;
    END IF;
    IF v_bill.status = 'cancelled' THEN
      RAISE EXCEPTION 'bill % está cancelada; no puede incluirse en un lote', v_bill.bill_number;
    END IF;
    IF v_bill.approval_status NOT IN ('approved', 'not_required') THEN
      RAISE EXCEPTION 'bill % no está aprobada', v_bill.bill_number;
    END IF;
    IF v_bill.balance <= 0 THEN RAISE EXCEPTION 'bill % no tiene saldo pendiente', v_bill.bill_number; END IF;
    IF v_bill.payment_in_progress_at IS NOT NULL THEN
      RAISE EXCEPTION 'bill % ya está en otro lote de pago en proceso', v_bill.bill_number;
    END IF;

    UPDATE public.supplier_bills SET payment_in_progress_at = now()
     WHERE id = v_bill.id AND organization_id = v_org;

    INSERT INTO public.supplier_payment_batch_items (
      batch_id, bill_id, supplier_id, bill_number, supplier_name,
      bank_name, clabe, account_number, amount, currency, organization_id
    )
    SELECT v_batch_id, v_bill.id, v_bill.supplier_id, v_bill.bill_number, s.name,
           sba.bank_name, sba.clabe, sba.account_number, v_bill.balance, v_bill.currency, v_org
      FROM public.suppliers s
      LEFT JOIN public.supplier_bank_accounts sba
        ON sba.supplier_id = s.id AND sba.is_primary = true
       AND COALESCE(sba.organization_id, v_org) = v_org
     WHERE s.id = v_bill.supplier_id
       AND COALESCE(s.organization_id, v_org) = v_org;
  END LOOP;

  RETURN v_batch_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. create_supplier_payment_batch(jsonb, text)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_supplier_payment_batch(p_items jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_id uuid;
  v_total numeric(14,2) := 0;
  v_count integer := 0;
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_item jsonb;
  v_bill_id uuid;
  v_amount numeric;
  v_bill record;
  v_supplier record;
  v_bank record;
  v_reference text;
  v_ids uuid[];
  v_visible integer;
BEGIN
  IF NOT (public.has_role(v_user,'admin'::app_role) OR public.has_role(v_user,'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado para crear lotes de pago';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_user) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos una factura';
  END IF;

  -- Validación atómica del JSON ANTES de escribir nada.
  SELECT array_agg(DISTINCT (e->>'bill_id')::uuid) INTO v_ids
    FROM jsonb_array_elements(p_items) AS e;
  IF v_ids IS NULL OR array_position(v_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Factura % no encontrada', NULL::uuid;
  END IF;
  SELECT count(*) INTO v_visible
    FROM public.supplier_bills b
   WHERE b.id = ANY(v_ids) AND b.organization_id = v_org;
  IF v_visible <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'Factura % no encontrada', v_ids[1];
  END IF;

  INSERT INTO public.supplier_payment_batches(exported_by, total_amount, bill_count, notes, organization_id)
  VALUES (v_user, 0, 0, p_notes, v_org) RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bill_id := (v_item->>'bill_id')::uuid;
    v_amount := (v_item->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Monto inválido para la factura %', v_bill_id;
    END IF;
    SELECT * INTO v_bill FROM public.supplier_bills
     WHERE id = v_bill_id AND organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Factura % no encontrada', v_bill_id; END IF;
    IF v_bill.status = 'draft' THEN
      RAISE EXCEPTION 'La factura % está en borrador; no puede incluirse en un lote de pago', v_bill.bill_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_bill.status = 'cancelled' THEN
      RAISE EXCEPTION 'La factura % está cancelada; no puede incluirse en un lote de pago', v_bill.bill_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_bill.approval_status NOT IN ('approved', 'not_required') THEN
      RAISE EXCEPTION 'La factura % no está aprobada', v_bill.bill_number;
    END IF;
    IF v_bill.payment_in_progress_at IS NOT NULL THEN
      RAISE EXCEPTION 'La factura % ya está en un lote de pago en curso', v_bill.bill_number
        USING ERRCODE = 'check_violation';
    END IF;
    -- Sin tolerancia por redondeo: el lote no puede exceder el saldo real.
    IF v_amount > v_bill.balance THEN
      RAISE EXCEPTION 'Monto excede el saldo de la factura %', v_bill.bill_number;
    END IF;
    SELECT * INTO v_supplier FROM public.suppliers
     WHERE id = v_bill.supplier_id AND COALESCE(organization_id, v_org) = v_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor de la factura % no encontrado', v_bill.bill_number; END IF;
    SELECT * INTO v_bank FROM public.supplier_bank_accounts
     WHERE supplier_id = v_supplier.id
       AND COALESCE(organization_id, v_org) = v_org
     ORDER BY is_primary DESC, created_at ASC LIMIT 1;
    IF NOT FOUND OR v_bank.clabe IS NULL OR length(trim(v_bank.clabe)) <> 18 THEN
      RAISE EXCEPTION 'Proveedor % no tiene cuenta bancaria con CLABE válida', v_supplier.name;
    END IF;
    v_reference := COALESCE(NULLIF(v_item->>'reference',''), 'LIFTGO-' || v_bill.bill_number);
    INSERT INTO public.supplier_payment_batch_items(
      batch_id, bill_id, supplier_id, supplier_name, supplier_rfc,
      bank_name, clabe, account_number, account_holder,
      bill_number, due_date, reference, concept, amount, currency, organization_id
    ) VALUES (
      v_batch_id, v_bill.id, v_supplier.id, v_supplier.name, v_supplier.rfc,
      v_bank.bank_name, v_bank.clabe, v_bank.account_number, v_bank.account_holder,
      v_bill.bill_number, v_bill.due_date, v_reference,
      COALESCE(v_bill.description, v_bill.bill_number),
      v_amount, v_bill.currency, v_org);
    UPDATE public.supplier_bills SET payment_in_progress_at = now()
     WHERE id = v_bill.id AND organization_id = v_org;
    v_total := v_total + v_amount;
    v_count := v_count + 1;
  END LOOP;
  UPDATE public.supplier_payment_batches SET total_amount = v_total, bill_count = v_count
   WHERE id = v_batch_id AND COALESCE(organization_id, v_org) = v_org;
  RETURN v_batch_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. release_stale_payment_locks (operación masiva sin ID)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_stale_payment_locks(p_older_than_hours integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_count integer := 0;
BEGIN
  IF NOT (
    public.has_role(v_user, 'admin'::app_role)
    OR public.has_role(v_user, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado para liberar bloqueos de pago' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_user) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_older_than_hours IS NULL OR p_older_than_hours < 1 THEN
    RAISE EXCEPTION 'La antigüedad mínima debe ser de al menos 1 hora'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Sólo la organización del llamante: nunca libera bloqueos de otra empresa.
  UPDATE public.supplier_bills b
     SET payment_in_progress_at = NULL
   WHERE b.organization_id = v_org
     AND b.id IN (SELECT id FROM public.releasable_payment_locks(p_older_than_hours));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. soft_delete_damage_record
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_damage_record(p_damage_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_rec public.damage_records%ROWTYPE;
  v_restore text;
  v_previous_rpc text;
  v_updated boolean := false;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rec
    FROM public.damage_records
   WHERE id = p_damage_id AND deleted_at IS NULL AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado' USING ERRCODE = 'P0002';
  END IF;

  IF v_rec.repaired_at IS NULL OR v_rec.status NOT IN ('repaired', 'invoiced') THEN
    RAISE EXCEPTION 'No se puede archivar: primero completa la reparación del daño.'
      USING ERRCODE = '23514';
  END IF;
  IF v_rec.status = 'invoiced' AND v_rec.invoice_id IS NULL THEN
    RAISE EXCEPTION 'El daño marcado como facturado no tiene una factura ligada.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.damage_records
     SET deleted_at = now(), deleted_by = v_uid, updated_at = now()
   WHERE id = p_damage_id AND organization_id = v_org;

  IF v_rec.forklift_id IS NOT NULL THEN
    PERFORM 1
    FROM public.forklifts
    WHERE id = v_rec.forklift_id
      AND COALESCE(organization_id, v_org) = v_org
    FOR UPDATE;
  END IF;

  IF v_rec.forklift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.damage_records
        WHERE forklift_id = v_rec.forklift_id
          AND organization_id = v_org
          AND deleted_at IS NULL
          AND id <> p_damage_id
          AND (status IN ('reported', 'in_repair') OR repaired_at IS NULL)
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.maintenance_logs
        WHERE forklift_id = v_rec.forklift_id
          AND COALESCE(organization_id, v_org) = v_org
          AND deleted_at IS NULL
          AND work_status IN ('pending', 'in_progress', 'waiting_parts')
     ) THEN
    v_restore := public.damage_restore_forklift_status(
      v_rec.forklift_id,
      v_rec.previous_forklift_status
    );
    v_previous_rpc := current_setting('app.forklift_rpc', true);
    PERFORM set_config('app.forklift_rpc', 'on', true);
    BEGIN
      UPDATE public.forklifts
         SET status = v_restore, updated_at = now()
       WHERE id = v_rec.forklift_id
         AND COALESCE(organization_id, v_org) = v_org
         AND status = 'maintenance'
         AND status IS DISTINCT FROM v_restore;
      v_updated := FOUND;
      PERFORM set_config(
        'app.forklift_rpc', coalesce(nullif(v_previous_rpc, ''), 'off'), true
      );
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config(
        'app.forklift_rpc', coalesce(nullif(v_previous_rpc, ''), 'off'), true
      );
      RAISE;
    END;
    IF v_updated THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, organization_id)
      VALUES (
        v_rec.forklift_id,
        'maintenance',
        v_restore,
        'Daño ' || p_damage_id::text || ' archivado: restauración de estado',
        v_org
      );
    END IF;
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. restore_damage_record
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_damage_record(p_damage_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_rec public.damage_records%ROWTYPE;
  v_invoice_cancelled boolean := false;
  v_target_invoice_id uuid;
  v_target_status text;
  v_previous_restore text;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: solo un administrador puede restaurar daños'
      USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rec
    FROM public.damage_records
   WHERE id = p_damage_id
     AND deleted_at IS NOT NULL
     AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o no está archivado'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_rec.invoice_id IS NOT NULL THEN
    SELECT COALESCE(i.status = 'cancelled', false)
           OR COALESCE(i.cancellation_status = 'accepted', false)
      INTO v_invoice_cancelled
      FROM public.invoices i
     WHERE i.id = v_rec.invoice_id
       AND i.organization_id = v_org;
    IF NOT FOUND THEN
      v_invoice_cancelled := true;
    END IF;
  END IF;

  v_target_invoice_id := CASE
    WHEN v_invoice_cancelled THEN NULL
    ELSE v_rec.invoice_id
  END;
  v_target_status := CASE
    WHEN v_invoice_cancelled AND v_rec.status = 'invoiced'
      THEN CASE WHEN v_rec.repaired_at IS NULL THEN 'reported' ELSE 'repaired' END
    ELSE v_rec.status
  END;

  IF v_target_invoice_id IS NOT NULL
     AND (v_target_status <> 'invoiced' OR v_rec.repaired_at IS NULL) THEN
    RAISE EXCEPTION 'El daño archivado conserva una factura activa pero no una reparación válida.'
      USING ERRCODE = '23514';
  END IF;

  v_previous_restore := current_setting('app.damage_restore', true);
  PERFORM set_config('app.damage_restore', 'on', true);
  BEGIN
    UPDATE public.damage_records
       SET deleted_at = NULL,
           deleted_by = NULL,
           invoice_id = v_target_invoice_id,
           status = v_target_status,
           updated_at = now()
     WHERE id = p_damage_id AND organization_id = v_org;
    PERFORM set_config(
      'app.damage_restore', COALESCE(NULLIF(v_previous_restore, ''), 'off'), true
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.damage_restore', COALESCE(NULLIF(v_previous_restore, ''), 'off'), true
    );
    RAISE;
  END;

  PERFORM public.ensure_forklift_maintenance_for_open_damage(
    v_rec.forklift_id,
    'Daño ' || p_damage_id::text || ' restaurado con reparación física pendiente'
  );

  IF v_rec.forklift_id IS NOT NULL THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by, organization_id)
    VALUES (
      v_rec.forklift_id,
      'damage:archived',
      'damage:' || v_target_status,
      'Daño ' || p_damage_id::text || ' restaurado desde archivados' ||
        CASE WHEN v_invoice_cancelled THEN '; factura cancelada conciliada' ELSE '' END,
      v_uid,
      v_org
    );
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. start_repair_work_order
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_repair_work_order(p_damage_id uuid, p_service_type text DEFAULT 'reparacion'::text, p_description text DEFAULT NULL::text, p_estimated_cost numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_damage public.damage_records%ROWTYPE;
  v_log_id uuid;
  v_actor text;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_estimated_cost IS NOT NULL AND p_estimated_cost < 0 THEN
    RAISE EXCEPTION 'El costo estimado de la reparación no puede ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_damage
    FROM public.damage_records
   WHERE id = p_damage_id
     AND deleted_at IS NULL
     AND organization_id = v_org
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daño no encontrado o archivado' USING ERRCODE = 'P0001';
  END IF;
  IF v_damage.status <> 'reported' THEN
    RAISE EXCEPTION 'Solo se puede iniciar la reparación de un daño en estado reported (estado actual: %).', v_damage.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_damage.maintenance_log_id IS NOT NULL THEN
    RAISE EXCEPTION 'El daño ya tiene una orden de trabajo vinculada (%).', v_damage.maintenance_log_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email)
    INTO v_actor
    FROM public.profiles p
   WHERE p.id = v_uid;

  INSERT INTO public.maintenance_logs (forklift_id, service_type, description, manual_cost, work_status, performed_by, organization_id)
  VALUES (
    v_damage.forklift_id,
    COALESCE(NULLIF(btrim(p_service_type), ''), 'reparacion'),
    COALESCE(NULLIF(btrim(p_description), ''), 'Reparación de daño ' || p_damage_id::text || ': ' || v_damage.description),
    COALESCE(p_estimated_cost, v_damage.estimated_cost, 0),
    'in_progress',
    v_actor,
    v_org
  )
  RETURNING id INTO v_log_id;

  UPDATE public.damage_records
     SET maintenance_log_id = v_log_id,
         status = 'in_repair',
         updated_at = now()
   WHERE id = p_damage_id AND organization_id = v_org;

  RETURN v_log_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. revert_audit_log (SQL dinámico con predicado organizacional)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revert_audit_log(p_audit_log_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_log RECORD;
  v_allowed_tables text[] := ARRAY['forklifts','customers','contracts','deliveries','maintenance_logs','damage_records','quotes','return_inspections'];
  v_financial_tables text[] := ARRAY['bookings','invoices','payments'];
  v_key text; v_sets text := ''; v_first boolean := true; v_revert_id uuid;
  v_current jsonb;
  v_mismatch text;
  v_org_col text;
  v_org_pred text;
  v_exists boolean;
BEGIN
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins can revert audit logs';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- La bitácora debe pertenecer a la organización actual; un id ajeno y uno
  -- inexistente devuelven el mismo error.
  SELECT * INTO v_log FROM public.audit_logs
   WHERE id = p_audit_log_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit log not found'; END IF;

  IF v_log.table_name = ANY(v_financial_tables) THEN
    RAISE EXCEPTION 'Las operaciones financieras (%) se reversan por sus flujos de negocio (cancelación SAT, notas de crédito, eliminación de pago con re-sync), no por la bitácora.', v_log.table_name;
  END IF;

  IF NOT (v_log.table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for revert', v_log.table_name;
  END IF;

  -- Columna organizacional real de la tabla objetivo (allowlist).
  SELECT c.column_name INTO v_org_col
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = v_log.table_name
     AND c.column_name IN ('organization_id','created_by_organization_id')
   ORDER BY CASE c.column_name WHEN 'organization_id' THEN 0 ELSE 1 END
   LIMIT 1;
  IF v_org_col IS NULL THEN
    RAISE EXCEPTION 'Table % is not allowed for revert', v_log.table_name;
  END IF;
  v_org_pred := format(' AND %I = %L', v_org_col, v_org);

  -- La fila objetivo también debe pertenecer a la organización actual.
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = %L%s)',
                 v_log.table_name, v_log.record_id, v_org_pred)
    INTO v_exists;
  IF NOT v_exists AND v_log.action <> 'INSERT' THEN
    RAISE EXCEPTION 'Audit log not found';
  END IF;

  -- R4-19: bypass de los guards de transición/terminal durante la restauración.
  PERFORM set_config('app.audit_revert', 'on', true);

  BEGIN
    CASE v_log.action
      WHEN 'INSERT' THEN
        EXECUTE format('DELETE FROM %I WHERE id = %L%s', v_log.table_name, v_log.record_id, v_org_pred);
      WHEN 'UPDATE' THEN
        -- N-18: bloqueo optimista antes de restaurar old_data.
        EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = %L%s', v_log.table_name, v_log.record_id, v_org_pred)
          INTO v_current;
        IF v_current IS NULL THEN
          RAISE EXCEPTION 'No se puede revertir: el registro % de % ya no existe (fue eliminado despues del cambio registrado).',
            v_log.record_id, v_log.table_name;
        END IF;
        IF v_log.new_data ? 'updated_at' AND v_current ? 'updated_at' THEN
          IF v_current->>'updated_at' IS DISTINCT FROM v_log.new_data->>'updated_at' THEN
            RAISE EXCEPTION 'No se puede revertir: el registro % de % fue modificado despues del cambio registrado. Revierta primero los cambios posteriores.',
              v_log.record_id, v_log.table_name;
          END IF;
        ELSE
          v_mismatch := NULL;
          FOR v_key IN SELECT jsonb_object_keys(v_log.new_data) LOOP
            IF v_current->v_key IS DISTINCT FROM v_log.new_data->v_key THEN
              v_mismatch := v_key;
              EXIT;
            END IF;
          END LOOP;
          IF v_mismatch IS NOT NULL THEN
            RAISE EXCEPTION 'No se puede revertir: el registro % de % fue modificado despues del cambio registrado (el campo "%" ya no coincide). Revierta primero los cambios posteriores.',
              v_log.record_id, v_log.table_name, v_mismatch;
          END IF;
        END IF;
        FOR v_key IN SELECT jsonb_object_keys(v_log.old_data) LOOP
          IF NOT v_first THEN v_sets := v_sets || ', '; END IF;
          v_sets := v_sets || format('%I = %L', v_key, v_log.old_data->>v_key);
          v_first := false;
        END LOOP;
        IF v_sets <> '' THEN
          EXECUTE format('UPDATE %I SET %s WHERE id = %L%s', v_log.table_name, v_sets, v_log.record_id, v_org_pred);
        END IF;
      WHEN 'DELETE' THEN
        RAISE EXCEPTION 'Cannot revert DELETE operations automatically';
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.audit_revert', 'off', true);
    RAISE;
  END;

  -- R4-19: reset del bypass al terminar la restauración.
  PERFORM set_config('app.audit_revert', 'off', true);

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id, organization_id)
  VALUES (v_log.table_name, v_log.record_id, 'REVERT', v_log.new_data, v_log.old_data, v_uid, v_org)
  RETURNING id INTO v_revert_id;

  RETURN v_revert_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. sync_forklift_rental_status (operación masiva sin ID)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_forklift_rental_status()
 RETURNS TABLE(forklift_id uuid, previous_status text, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  RETURN QUERY
  WITH active AS (
    SELECT DISTINCT b.forklift_id AS fid
      FROM public.bookings b
     WHERE b.status = 'confirmed'
       AND b.organization_id = v_org
       AND NOT public.booking_is_returned(b.id)
       AND EXISTS (
         SELECT 1
           FROM public.deliveries d
          WHERE d.booking_id = b.id
            AND d.type = 'delivery'
            AND d.status = 'completed'
       )
  ),
  blocked AS (
    SELECT DISTINCT dr.forklift_id AS fid
      FROM public.damage_records dr
     WHERE dr.deleted_at IS NULL
       AND COALESCE(dr.organization_id, v_org) = v_org
       AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
    UNION
    SELECT DISTINCT ml.forklift_id
      FROM public.maintenance_logs ml
     WHERE ml.deleted_at IS NULL
       AND COALESCE(ml.organization_id, v_org) = v_org
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ),
  promote AS (
    UPDATE public.forklifts f
       SET status = 'rented', updated_at = now()
      FROM active a
     WHERE f.id = a.fid
       AND f.organization_id = v_org
       AND f.status = 'available'
    RETURNING f.id, 'available'::text AS prev, 'rented'::text AS newv
  ),
  demote AS (
    UPDATE public.forklifts f
       SET status = 'available', updated_at = now()
     WHERE f.status = 'rented'
       AND f.organization_id = v_org
       AND NOT EXISTS (SELECT 1 FROM active a WHERE a.fid = f.id)
       AND NOT EXISTS (SELECT 1 FROM blocked bl WHERE bl.fid = f.id)
    RETURNING f.id, 'rented'::text AS prev, 'available'::text AS newv
  ),
  moved AS (
    SELECT id, prev, newv FROM promote
    UNION ALL
    SELECT id, prev, newv FROM demote
  ),
  logged AS (
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by, organization_id)
    SELECT m.id, m.prev, m.newv, 'Sincronización de estatus de renta', v_uid, v_org
      FROM moved m
    RETURNING 1
  )
  SELECT m.id, m.prev, m.newv
    FROM moved m
   WHERE (SELECT count(*) FROM logged) >= 0;

  PERFORM set_config('app.forklift_rpc', 'off', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. sync_invoice_status
--
-- Llamada directa por la UI: la factura debe ser de la organización actual.
-- Canal interno conservado: los triggers de pagos del owner (auth.uid() IS NULL
-- o service_role) siguen sincronizando sin contexto de organización.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_invoice_status(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_invoice_id uuid;
  v_invoice_org uuid;
  v_total numeric(14,2);
  v_status text;
  v_paid numeric(14,2);
  v_credited numeric(14,2);
  v_latest_date date;
  v_due date;
  v_target text;
  v_moneda text;
  v_tc numeric;
BEGIN
  v_invoice_id := p_invoice_id;
  IF v_invoice_id IS NULL THEN
    RETURN;
  END IF;

  IF v_uid IS NOT NULL AND public.is_internal_member(v_uid) THEN
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT total, status, due_date, moneda, tipo_cambio, organization_id
    INTO v_total, v_status, v_due, v_moneda, v_tc, v_invoice_org
  FROM public.invoices WHERE id = v_invoice_id
  FOR UPDATE;
  IF v_total IS NULL THEN
    RETURN;
  END IF;

  -- Llamada directa desde una sesión interna: sólo su propia organización.
  IF v_org IS NOT NULL AND v_invoice_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_status IN ('cancelled', 'draft') THEN
    RETURN;
  END IF;

  v_moneda := upper(COALESCE(v_moneda, 'MXN'));

  -- R4-15: pagos convertidos a la moneda de la factura (ver FIX R4-03).
  SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, v_moneda)) = v_moneda THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0)), 0)
        ELSE p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0))
      END), 0), MAX(p.payment_date)
    INTO v_paid, v_latest_date
  FROM public.payments p
  WHERE p.invoice_id = v_invoice_id
    AND COALESCE(p.organization_id, v_invoice_org) = v_invoice_org;

  -- N-21 / R4-15: criterio canónico de NC (mismo que la vista y la UI).
  SELECT COALESCE(SUM(total), 0) INTO v_credited
  FROM public.credit_notes
  WHERE invoice_id = v_invoice_id
    AND COALESCE(organization_id, v_invoice_org) = v_invoice_org
    AND cfdi_status = 'stamped'
    AND status <> 'cancelled'
    AND cancellation_status IS DISTINCT FROM 'accepted';

  PERFORM set_config('app.payment_sync', 'on', true);

  IF v_paid >= v_total - v_credited - 0.005 AND v_paid > 0 THEN
    IF v_status <> 'paid' THEN
      UPDATE public.invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
        WHERE id = v_invoice_id;
    END IF;
  -- R4-16: cubierta al 100% por NC timbrada(s) => 'paid'.
  ELSIF v_paid = 0 AND v_credited >= v_total - 0.005 THEN
    IF v_status <> 'paid' THEN
      UPDATE public.invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
        WHERE id = v_invoice_id;
    END IF;
  ELSIF v_paid = 0 AND v_credited > 0 THEN
    IF v_status = 'paid' THEN
      -- R5-15: la factura deja de estar pagada (NC parcial sin pagos).
      v_target := CASE
        WHEN v_due IS NOT NULL AND v_due < public.today_mty() THEN 'overdue'
        ELSE 'sent'
      END;
      UPDATE public.invoices SET status = v_target, paid_at = NULL
        WHERE id = v_invoice_id;
    ELSIF v_status <> 'partial' THEN
      -- R5-15: NC parcial sin pagos y no estaba 'paid' => 'partial'.
      UPDATE public.invoices SET status = 'partial', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSIF (v_paid + v_credited) > 0 THEN
    IF v_status <> 'partial' THEN
      UPDATE public.invoices SET status = 'partial', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSE
    v_target := CASE
      WHEN v_due IS NOT NULL AND v_due < public.today_mty() THEN 'overdue'
      ELSE 'sent'
    END;
    IF v_status <> v_target THEN
      UPDATE public.invoices SET status = v_target, paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. create_recurring_invoice
--
-- Conserva el canal service_role existente (facturación recurrente automática).
-- La organización se deriva de las reservas: todas deben pertenecer a una sola
-- organización y, en sesión interna, a la del llamante.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_recurring_invoice(p_booking_ids uuid[], p_customer_id uuid, p_customer_name text, p_line_items jsonb, p_subtotal numeric, p_tax_rate numeric, p_tax_amount numeric, p_total numeric, p_billing_period_start date, p_billing_period_end date, p_receptor_rfc text, p_receptor_razon_social text, p_receptor_regimen_fiscal text, p_receptor_domicilio_fiscal_cp text, p_uso_cfdi text, p_moneda text DEFAULT 'MXN'::text, p_tipo_cambio numeric DEFAULT 1)
 RETURNS TABLE(invoice_id uuid, invoice_number text, already_existed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_is_service boolean := COALESCE(auth.jwt() ->> 'role', '') = 'service_role';
  v_org uuid;
  v_orgs uuid[];
  v_invoice_id uuid;
  v_invoice_number text;
  v_existing_id uuid;
  v_existing_number text;
  v_lock_key bigint;
  v_bid uuid;
  v_is_single boolean := array_length(p_booking_ids, 1) = 1;
  v_moneda text := COALESCE(NULLIF(upper(btrim(p_moneda)), ''), 'MXN');
  v_tipo_cambio numeric;
  v_uso_cfdi text := NULLIF(btrim(p_uso_cfdi), '');
  v_bad text;
  v_missing integer;
BEGIN
  IF NOT v_is_service
     AND NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'administrativo')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_booking_ids requerido';
  END IF;

  IF NOT v_is_service THEN
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_billing_period_start IS NULL OR p_billing_period_end IS NULL THEN
    RAISE EXCEPTION 'El periodo de facturación (inicio y fin) es obligatorio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_billing_period_start > p_billing_period_end THEN
    RAISE EXCEPTION 'El fin del periodo (%) no puede ser anterior al inicio (%).',
      p_billing_period_end, p_billing_period_start USING ERRCODE = 'check_violation';
  END IF;

  -- Organización derivada de las reservas reales. Una mezcla A/B, una reserva
  -- inexistente o una reserva ajena producen el mismo error genérico y nada se
  -- escribe.
  SELECT array_agg(DISTINCT b.organization_id) INTO v_orgs
    FROM public.bookings b
   WHERE b.id = ANY(p_booking_ids)
     AND (v_org IS NULL OR b.organization_id = v_org);

  SELECT count(*) INTO v_missing
    FROM unnest(p_booking_ids) AS nb(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.bookings b
      WHERE b.id = nb.id
        AND (v_org IS NULL OR b.organization_id = v_org)
   );
  IF v_missing > 0 OR v_orgs IS NULL OR array_length(v_orgs, 1) <> 1 THEN
    RAISE EXCEPTION 'Alguna reserva del periodo recurrente no existe.' USING ERRCODE = 'check_violation';
  END IF;
  v_org := v_orgs[1];

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE p_customer_id IS NOT NULL
     AND b.customer_id IS DISTINCT FROM p_customer_id
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % pertenece a otro cliente; no puede incluirse en esta factura recurrente.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE b.status IN ('cancelled', 'completed')
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % está cancelada o completada; no es facturable.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE COALESCE(b.recurring_billing, false) = false
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % no tiene facturación recurrente activa.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE p_billing_period_start < b.start_date
      OR (b.end_date IS NOT NULL AND p_billing_period_end > b.end_date)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'El periodo % – % queda fuera del rango de la reserva %.',
      p_billing_period_start, p_billing_period_end, v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_uso_cfdi IS NULL THEN
    RAISE EXCEPTION 'El cliente no tiene uso de CFDI capturado; captúralo antes de generar la factura recurrente.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_moneda = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSIF public.fx_is_missing(v_moneda, p_tipo_cambio) THEN
    RAISE EXCEPTION 'Tipo de cambio inválido para facturar en % (se requiere un valor mayor a 0 y distinto de 1)', v_moneda
      USING ERRCODE = 'check_violation';
  ELSE
    v_tipo_cambio := p_tipo_cambio;
  END IF;

  FOR v_bid IN SELECT unnest(p_booking_ids) ORDER BY 1 LOOP
    v_lock_key := ('x' || substr(md5(v_bid::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  SELECT i.id, i.invoice_number
    INTO v_existing_id, v_existing_number
  FROM public.invoice_bookings ib
  JOIN public.invoices i ON i.id = ib.invoice_id AND i.organization_id = v_org
  WHERE ib.booking_id = ANY(p_booking_ids)
    AND COALESCE(ib.organization_id, v_org) = v_org
    AND i.billing_period_start = p_billing_period_start
    AND i.billing_period_end = p_billing_period_end
    AND i.status <> 'cancelled'
    AND (i.cfdi_status IS NULL OR i.cfdi_status <> 'cancelled')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.bookings SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids) AND organization_id = v_org;
    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT public.next_draft_invoice_number() INTO v_invoice_number;
  IF v_invoice_number IS NULL THEN
    v_invoice_number := 'FAC-AUTO-' || extract(epoch FROM now())::bigint::text;
  END IF;

  BEGIN
    INSERT INTO public.invoices (
      invoice_number, booking_id, customer_id, customer_name, line_items,
      subtotal, tax_rate, tax_amount, total, status, due_date,
      billing_period_start, billing_period_end,
      receptor_rfc, receptor_razon_social, receptor_regimen_fiscal,
      receptor_domicilio_fiscal_cp, uso_cfdi,
      forma_pago, metodo_pago, moneda, tipo_cambio, organization_id
    ) VALUES (
      v_invoice_number,
      CASE WHEN v_is_single THEN p_booking_ids[1] ELSE NULL END,
      p_customer_id, p_customer_name, p_line_items,
      p_subtotal, p_tax_rate, p_tax_amount, p_total, 'draft', p_billing_period_end,
      p_billing_period_start, p_billing_period_end,
      p_receptor_rfc, p_receptor_razon_social, p_receptor_regimen_fiscal,
      p_receptor_domicilio_fiscal_cp, v_uso_cfdi,
      '99', 'PPD', v_moneda, v_tipo_cambio, v_org
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_bookings (invoice_id, booking_id, organization_id)
    SELECT v_invoice_id, unnest(p_booking_ids), v_org;
  EXCEPTION WHEN unique_violation THEN
    SELECT i.id, i.invoice_number
      INTO v_existing_id, v_existing_number
    FROM public.invoice_bookings ib
    JOIN public.invoices i ON i.id = ib.invoice_id AND i.organization_id = v_org
    WHERE ib.booking_id = ANY(p_booking_ids)
      AND COALESCE(ib.organization_id, v_org) = v_org
      AND i.billing_period_start = p_billing_period_start
      AND i.billing_period_end = p_billing_period_end
      AND i.status <> 'cancelled'
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      SELECT i.id, i.invoice_number
        INTO v_existing_id, v_existing_number
      FROM public.invoices i
      WHERE i.booking_id = ANY(p_booking_ids)
        AND i.organization_id = v_org
        AND i.billing_period_start = p_billing_period_start
        AND i.billing_period_end = p_billing_period_end
        AND i.status <> 'cancelled'
      LIMIT 1;
    END IF;

    IF v_existing_id IS NULL THEN RAISE; END IF;

    UPDATE public.bookings SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids) AND organization_id = v_org;

    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END;

  UPDATE public.bookings SET last_billed_date = p_billing_period_end
   WHERE id = ANY(p_booking_ids) AND organization_id = v_org;

  invoice_id := v_invoice_id;
  invoice_number := v_invoice_number;
  already_existed := false;
  RETURN NEXT;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACL: sin PUBLIC ni anon; authenticated y service_role conservan EXECUTE.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.approve_supplier_bill(uuid, text)',
    'public.reject_supplier_bill(uuid, text)',
    'public.request_bill_reapproval(uuid, text)',
    'public.register_supplier_payment(uuid, numeric, date, text, text, text, text, text)',
    'public.register_supplier_payment(uuid, numeric, date, text, text, text, text, text, uuid)',
    'public.mark_supplier_rep_rejected(uuid, text)',
    'public.reset_supplier_rep_pending(uuid)',
    'public.create_supplier_payment_batch(uuid[], date, text, text)',
    'public.create_supplier_payment_batch(jsonb, text)',
    'public.release_stale_payment_locks(integer)',
    'public.soft_delete_damage_record(uuid)',
    'public.restore_damage_record(uuid)',
    'public.start_repair_work_order(uuid, text, text, numeric)',
    'public.revert_audit_log(uuid)',
    'public.sync_forklift_rental_status()',
    'public.sync_invoice_status(uuid)',
    'public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text, text, numeric)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.revert_audit_log(uuid) IS
  'Multiempresa 0041: valida bitácora y fila objetivo contra current_internal_organization_id() y añade predicado organizacional al SQL dinámico (allowlist sin cambios).';
COMMENT ON FUNCTION public.sync_invoice_status(uuid) IS
  'Multiempresa 0041: la llamada directa desde una sesión interna exige que la factura sea de su organización; el canal de triggers del owner se conserva.';
COMMENT ON FUNCTION public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text, text, numeric) IS
  'Multiempresa 0041: la organización se deriva de las reservas; una mezcla de empresas falla antes de escribir. Canal service_role conservado.';
