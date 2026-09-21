-- 0040_multi_org_mutating_rpc_org_guard
--
-- Paso 4 · lote A del endurecimiento multiempresa: las RPC SECURITY DEFINER que
-- MUTAN datos a partir de un UUID hoy validan solo el rol global, de modo que un
-- admin de la empresa A podia operar recursos de la empresa B con privilegios del
-- owner.
--
-- Reglas aplicadas en todas ellas:
--   * Se conservan firma, resultado, defaults, mensajes funcionales, efectos y
--     SECURITY DEFINER (siguen necesitando privilegio elevado por triggers).
--   * Para sesion autenticada se exige, ademas del rol actual,
--     current_internal_organization_id() NOT NULL e is_internal_member(auth.uid()).
--   * La organizacion se toma de la fila objetivo (nunca de parametros del cliente)
--     y se compara antes de cualquier mutacion o lectura sensible.
--   * Toda lectura, subconsulta, UPDATE, DELETE e INSERT derivado incluye la
--     organizacion; las filas derivadas (payments, status_logs,
--     feedback_status_history) reciben organization_id = v_org.
--   * Un UUID ajeno y un UUID inexistente producen el mismo error generico.
--   * El canal interno (auth.uid() IS NULL / service_role) se conserva solo donde
--     ya existia: assign_stamped_invoice_number y claim_payment_rep_stamping.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. approve_payment_intent
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_payment_intent(p_intent_id uuid, p_payment_form_sat text DEFAULT '03'::text, p_review_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_intent public.customer_payment_intents%ROWTYPE;
  v_payment_id uuid; v_invoice_customer uuid; v_invoice_currency text;
  v_invoice_total numeric; v_invoice_exchange numeric;
  v_paid numeric; v_credited numeric; v_pending numeric; v_balance numeric;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.customer_payment_intents
     SET status = 'approved'::payment_intent_status,
         review_notes = p_review_notes, reviewed_at = now(), reviewed_by = v_uid
   WHERE id = p_intent_id
     AND organization_id = v_org
     AND status = 'pending_review'::payment_intent_status
   RETURNING * INTO v_intent;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_pending' USING ERRCODE = 'P0001'; END IF;

  -- (a) bloqueo de la factura ANTES de calcular el saldo
  SELECT customer_id, COALESCE(moneda, 'MXN'), total, COALESCE(tipo_cambio, 1)
    INTO v_invoice_customer, v_invoice_currency, v_invoice_total, v_invoice_exchange
  FROM public.invoices
  WHERE id = v_intent.invoice_id AND organization_id = v_org
  FOR UPDATE;
  IF v_invoice_customer IS NULL THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_invoice_customer <> v_intent.customer_id THEN
    RAISE EXCEPTION 'La factura del reporte no pertenece al cliente que lo envió' USING ERRCODE = 'check_violation';
  END IF;
  v_invoice_currency := upper(v_invoice_currency);

  -- (b) pagos convertidos a la moneda de la factura
  SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, v_invoice_currency)) = v_invoice_currency THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_invoice_exchange, 0)), 0)
        WHEN v_invoice_currency = 'MXN'
          THEN p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_invoice_exchange, 0))
        ELSE p.amount
      END), 0)
    INTO v_paid
  FROM public.payments p
  WHERE p.invoice_id = v_intent.invoice_id AND p.organization_id = v_org;

  -- (d) criterio canonico de notas de credito
  SELECT COALESCE(SUM(total), 0) INTO v_credited FROM public.credit_notes
   WHERE invoice_id = v_intent.invoice_id
     AND organization_id = v_org
     AND cfdi_status = 'stamped'
     AND status <> 'cancelled'
     AND cancellation_status IS DISTINCT FROM 'accepted';

  -- (c) intents pendientes de revision descuentan saldo
  SELECT COALESCE(SUM(amount), 0) INTO v_pending
  FROM public.customer_payment_intents
   WHERE invoice_id = v_intent.invoice_id
     AND organization_id = v_org
     AND status = 'pending_review'::payment_intent_status
     AND id <> v_intent.id;

  v_balance := v_invoice_total - v_paid - v_credited - v_pending;
  IF v_intent.amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'El monto reportado (%) excede el saldo pendiente (%) de la factura', v_intent.amount, v_balance
      USING ERRCODE = 'check_violation';
  END IF;

  -- (e) moneda de la factura y exchange_rate NULL (no falsear el TC)
  INSERT INTO public.payments(
    invoice_id, amount, payment_date, payment_method, payment_form_sat,
    reference_number, notes, currency, exchange_rate, organization_id
  ) VALUES (
    v_intent.invoice_id, v_intent.amount, v_intent.transfer_date,
    'transfer', COALESCE(p_payment_form_sat, '03'), v_intent.tracking_key,
    'Aprobado desde portal (intent ' || v_intent.id::text || ')',
    v_invoice_currency, NULL, v_org
  ) RETURNING id INTO v_payment_id;

  UPDATE public.customer_payment_intents
     SET payment_id = v_payment_id
   WHERE id = v_intent.id AND organization_id = v_org;

  RETURN v_payment_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. assign_stamped_invoice_number (conserva canal interno service_role)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_stamped_invoice_number(p_invoice_id uuid, p_serie text, p_folio text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_new_number text;
  v_rows int;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;

    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'FAC-' || lpad(p_folio, 4, '0');

  BEGIN
    UPDATE public.invoices
       SET invoice_number = v_new_number,
           serie = COALESCE(p_serie, serie),
           folio = p_folio
     WHERE id = p_invoice_id
       AND (v_org IS NULL OR organization_id = v_org);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'invoice % not found', p_invoice_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'invoice_number % already assigned (concurrent stamp)', v_new_number
      USING ERRCODE = 'unique_violation';
  END;

  RETURN v_new_number;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. cancel_supplier_payment_batch
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_supplier_payment_batch(p_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF NOT (public.has_role(v_user, 'admin'::app_role) OR public.has_role(v_user, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado para cancelar lotes de pago' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_user) THEN
    RAISE EXCEPTION 'No autorizado para cancelar lotes de pago' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.supplier_payment_batches
   WHERE id = p_batch_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de pago no encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- FIX-3: sólo bloquean los pagos registrados POR ESTE lote (batch_id),
  -- no cualquier pago histórico de la factura.
  IF EXISTS (
    SELECT 1 FROM public.supplier_payments sp
     WHERE sp.batch_id = p_batch_id
       AND sp.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'El lote ya tiene pagos registrados; no se puede cancelar'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.supplier_bills sb
     SET payment_in_progress_at = NULL
   WHERE sb.organization_id = v_org
     AND sb.id IN (
       SELECT i.bill_id FROM public.supplier_payment_batch_items i
        WHERE i.batch_id = p_batch_id AND i.organization_id = v_org
     );

  DELETE FROM public.supplier_payment_batch_items
   WHERE batch_id = p_batch_id AND organization_id = v_org;
  DELETE FROM public.supplier_payment_batches
   WHERE id = p_batch_id AND organization_id = v_org;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. change_feedback_status
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_feedback_status(_report_id uuid, _new_status text, _comment text DEFAULT NULL::text)
 RETURNS feedback_reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_report public.feedback_reports;
  v_points integer := 0;
  v_severity_mult numeric := 1;
BEGIN
  -- Authorization: only admin/administrativo can change status
  IF NOT (has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_report FROM public.feedback_reports
   WHERE id = _report_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte no encontrado';
  END IF;

  IF v_report.status = _new_status THEN
    RETURN v_report;
  END IF;

  -- Severity multiplier (only applies to bugs)
  IF v_report.type = 'bug' THEN
    v_severity_mult := CASE v_report.severity
      WHEN 'critical' THEN 2
      WHEN 'high' THEN 1.5
      ELSE 1
    END;
  END IF;

  -- Points awarded on transition (cumulative; resets if rejected)
  IF _new_status = 'accepted' AND v_report.points_awarded < 5 THEN
    v_points := CASE WHEN v_report.type = 'bug' THEN 5 ELSE 3 END;
  ELSIF _new_status = 'resolved' THEN
    v_points := CASE
      WHEN v_report.type = 'bug' THEN ROUND(15 * v_severity_mult)::integer
      ELSE 10
    END;
  ELSIF _new_status IN ('rejected', 'duplicate') THEN
    v_points := 0;
  ELSE
    v_points := v_report.points_awarded;
  END IF;

  UPDATE public.feedback_reports
  SET status = _new_status,
      points_awarded = GREATEST(v_points, CASE WHEN _new_status IN ('rejected','duplicate') THEN 0 ELSE points_awarded END),
      resolved_at = CASE WHEN _new_status = 'resolved' THEN now() ELSE resolved_at END,
      updated_at = now()
  WHERE id = _report_id AND organization_id = v_org
  RETURNING * INTO v_report;

  INSERT INTO public.feedback_status_history (report_id, from_status, to_status, changed_by, comment, organization_id)
  VALUES (_report_id, v_report.status, _new_status, v_uid, _comment, v_org);

  RETURN v_report;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. change_forklift_status
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_forklift_status(p_forklift_id uuid, p_new_status text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_current text;
  v_confirmed int;
BEGIN
  IF NOT (public.has_role(v_uid,'admin')
       OR public.has_role(v_uid,'administrativo')
       OR public.has_role(v_uid,'mechanic')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_current FROM public.forklifts
   WHERE id = p_forklift_id AND organization_id = v_org
   FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  IF v_current = p_new_status THEN RETURN; END IF;
  IF p_new_status NOT IN ('available','rented','maintenance','retired','sold') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_new_status;
  END IF;

  SELECT count(*) INTO v_confirmed
    FROM public.bookings b
   WHERE b.forklift_id = p_forklift_id
     AND b.organization_id = v_org
     AND b.status = 'confirmed';
  IF p_new_status = 'rented' AND v_confirmed = 0 THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa';
  END IF;

  IF v_current = 'rented'
     AND p_new_status IN ('maintenance','available','sold','retired')
     AND public.has_open_rental(p_forklift_id) THEN
    RAISE EXCEPTION 'La unidad tiene una renta activa; completa la devolución antes de venderla o darla de baja'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_new_status IN ('maintenance','sold','retired') AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'La razón es obligatoria para este cambio de estado';
  END IF;
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts SET status = p_new_status
   WHERE id = p_forklift_id AND organization_id = v_org;
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, organization_id)
  VALUES (p_forklift_id, v_current, p_new_status, p_reason, v_org);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. claim_payment_rep_stamping (conserva canal interno service_role)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_payment_rep_stamping(p_payment_id uuid, p_stale_minutes integer DEFAULT 5)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claimed uuid;
  v_status text;
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT (public.has_role(v_uid, 'admin'::app_role)
            OR public.has_role(v_uid, 'administrativo'::app_role)) THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere rol Admin o Administrativo';
    END IF;

    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere rol Admin o Administrativo';
    END IF;
  END IF;

  UPDATE public.payments
     SET rep_cfdi_status = 'stamping',
         rep_stamping_started_at = now(),
         rep_lookup_attempts = 0
   WHERE id = p_payment_id
     AND (v_org IS NULL OR organization_id = v_org)
     AND (
       (rep_cfdi_status IN ('pending', 'error', 'none') AND rep_cfdi_uuid IS NULL)
       OR rep_cfdi_status = 'cancelled'
       OR (rep_cfdi_status = 'stamping'
           AND rep_stamping_started_at < now() - make_interval(mins => p_stale_minutes))
     )
  RETURNING id INTO v_claimed;

  IF v_claimed IS NOT NULL THEN
    RETURN 'claimed';
  END IF;

  SELECT rep_cfdi_status INTO v_status FROM public.payments
   WHERE id = p_payment_id
     AND (v_org IS NULL OR organization_id = v_org);
  RETURN COALESCE(v_status, 'not_found');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. delete_forklift
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_forklift(p_forklift_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF NOT (has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.forklift_id = p_forklift_id
      AND b.organization_id = v_org
      AND b.status IN ('confirmed','in_progress')
  ) THEN
    RAISE EXCEPTION 'No se puede archivar: el montacargas tiene reservas activas';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.v_invoices_with_balance vib
    JOIN public.invoice_bookings ib ON ib.invoice_id = vib.id AND ib.organization_id = v_org
    JOIN public.bookings b ON b.id = ib.booking_id AND b.organization_id = v_org
    WHERE b.forklift_id = p_forklift_id
      AND vib.balance > 0.01
      AND vib.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'No se puede archivar: existen facturas con saldo pendiente ligadas a este montacargas';
  END IF;

  UPDATE public.forklifts
     SET deleted_at = now(),
         deleted_by = v_uid
   WHERE id = p_forklift_id
     AND organization_id = v_org
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montacargas no encontrado o ya archivado';
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. reopen_work_order
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reopen_work_order(p_log_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_old text;
BEGIN
  IF NOT has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede reabrir una orden de trabajo'
      USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Solo un administrador puede reabrir una orden de trabajo'
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Se requiere un motivo para reabrir la orden de trabajo'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT work_status INTO v_old
    FROM public.maintenance_logs
   WHERE id = p_log_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de trabajo % no existe', p_log_id;
  END IF;
  IF COALESCE(v_old, '') NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'La orden de trabajo no está cerrada' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.maintenance_reopen_rpc', 'on', true);
  UPDATE public.maintenance_logs
     SET work_status = 'in_progress'
   WHERE id = p_log_id AND organization_id = v_org;
  PERFORM set_config('app.maintenance_reopen_rpc', 'off', true);

  INSERT INTO public.status_logs (entity_type, entity_id, from_status, to_status, reason, changed_by, organization_id)
  VALUES ('maintenance_log', p_log_id, v_old, 'in_progress', btrim(p_reason), v_uid, v_org);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. restore_customer (customers no tiene organization_id: alcance por vinculo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_customer(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  -- Mismo criterio que customer_scope_matches, sin depender de RLS.
  UPDATE public.customers c
     SET deleted_at = NULL, updated_at = now()
   WHERE c.id = p_customer_id
     AND c.deleted_at IS NOT NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.organization_customers oc
          WHERE oc.customer_id = c.id
            AND oc.organization_id = v_org
       )
       OR c.created_by_organization_id = v_org
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El cliente no existe o no está archivado' USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. restore_forklift
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_forklift(p_forklift_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF NOT has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: solo administradores pueden restaurar montacargas';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: solo administradores pueden restaurar montacargas';
  END IF;

  UPDATE public.forklifts
     SET deleted_at = NULL,
         deleted_by = NULL,
         updated_at = now()
   WHERE id = p_forklift_id
     AND organization_id = v_org
     AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montacargas no encontrado o ya está activo';
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. restore_maintenance_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_maintenance_log(p_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_forklift uuid;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: solo un administrador puede restaurar mantenimientos'
      USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: solo un administrador puede restaurar mantenimientos'
      USING ERRCODE = '42501';
  END IF;

  SELECT forklift_id INTO v_forklift
    FROM public.maintenance_logs
   WHERE id = p_log_id AND organization_id = v_org AND deleted_at IS NOT NULL
   FOR UPDATE;

  IF v_forklift IS NULL THEN
    RAISE EXCEPTION 'Registro no encontrado o no esta archivado';
  END IF;

  UPDATE public.maintenance_logs
     SET deleted_at = NULL,
         updated_at = now()
   WHERE id = p_log_id AND organization_id = v_org;

  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by, organization_id)
  VALUES (v_forklift, 'ot:archived', 'ot:active',
          'Orden de trabajo ' || p_log_id::text || ' restaurada desde archivados',
          v_uid, v_org);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. restore_supplier
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_supplier(p_supplier_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.suppliers
     SET deleted_at = NULL, updated_at = now()
   WHERE id = p_supplier_id
     AND organization_id = v_org
     AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El proveedor no existe o no está archivado' USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. soft_delete_maintenance_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_maintenance_log(p_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_status text;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role)
          OR public.has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: solo admin/administrativo pueden archivar mantenimientos';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: solo admin/administrativo pueden archivar mantenimientos';
  END IF;

  SELECT work_status INTO v_status
    FROM public.maintenance_logs
   WHERE id = p_log_id AND organization_id = v_org AND deleted_at IS NULL;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;

  -- E1: una OT cerrada (posiblemente ya facturada) solo la archiva un admin.
  IF v_status = 'completed' AND NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'La orden de trabajo esta cerrada: solo un administrador puede archivarla';
  END IF;

  -- R5-A5: el archivado NUNCA borra hijos. Antes las OTs abiertas perdian
  -- fisicamente refacciones y mano de obra, y al restaurarlas ya no existian.
  PERFORM set_config('app.maintenance_archive_rpc', 'on', true);

  UPDATE public.maintenance_logs
     SET deleted_at = now(),
         updated_at = now()
   WHERE id = p_log_id AND organization_id = v_org AND deleted_at IS NULL;

  PERFORM set_config('app.maintenance_archive_rpc', 'off', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.maintenance_archive_rpc', 'off', true);
  RAISE;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. soft_delete_supplier
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_supplier(p_supplier_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF NOT (has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.supplier_bills sb
    WHERE sb.supplier_id = p_supplier_id
      AND sb.organization_id = v_org
      AND sb.status IN ('pending','approved','partially_paid')
  ) THEN
    RAISE EXCEPTION 'No se puede archivar: el proveedor tiene facturas pendientes';
  END IF;

  UPDATE public.suppliers
     SET deleted_at = now(),
         deleted_by = v_uid
   WHERE id = p_supplier_id
     AND organization_id = v_org
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor no encontrado o ya archivado';
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACL: nada para PUBLIC ni anon; se conserva authenticated/service_role.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.approve_payment_intent(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_stamped_invoice_number(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_supplier_payment_batch(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_feedback_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_forklift_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_payment_rep_stamping(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_forklift(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_work_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_forklift(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_maintenance_log(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_supplier(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_maintenance_log(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_supplier(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_payment_intent(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_stamped_invoice_number(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_payment_batch(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_feedback_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_forklift_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_payment_rep_stamping(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_forklift(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_work_order(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_customer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_forklift(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_maintenance_log(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_supplier(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_maintenance_log(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_supplier(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_payment_intent(uuid, text, text) IS
  'Multiempresa 0040: exige rol + membresia interna y opera solo sobre filas de current_internal_organization_id(); propaga organization_id al pago derivado.';
COMMENT ON FUNCTION public.change_forklift_status(uuid, text, text) IS
  'Multiempresa 0040: montacargas, reservas y bitacora acotados a current_internal_organization_id().';
COMMENT ON FUNCTION public.restore_customer(uuid) IS
  'Multiempresa 0040: restaura solo clientes vinculados a la organizacion interna del invocante (organization_customers o created_by_organization_id).';
