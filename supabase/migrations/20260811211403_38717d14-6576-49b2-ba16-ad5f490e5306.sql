-- Tema 4: guards de rol en funciones SECURITY DEFINER sensibles.
-- Patrón: (select auth.uid()) IS NULL => proceso interno (service_role / cron), permitido.
--         Con sesión => se exige rol. anon ya no tiene EXECUTE sobre estas funciones.

CREATE OR REPLACE FUNCTION public.assert_invoice_cancellable(p_invoice_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_payment_count integer;
  v_payment_total numeric;
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_payment_count, v_payment_total
  FROM public.payments
  WHERE invoice_id = p_invoice_id;

  IF v_payment_count > 0 THEN
    RETURN format(
      'La factura tiene %s pago(s) aplicado(s) por $%s. Elimina o reversa los pagos antes de cancelar el CFDI.',
      v_payment_count,
      to_char(v_payment_total, 'FM999,999,999,990.00')
    );
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.peek_next_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_last bigint;
  v_called boolean;
  v_next bigint;
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT last_value, is_called
    INTO v_last, v_called
    FROM public.invoice_number_seq;
  v_next := CASE WHEN v_called THEN v_last + 1 ELSE v_last END;
  RETURN 'FAC-' || lpad(v_next::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_stamped_invoice_number(p_invoice_id uuid, p_serie text, p_folio text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_new_number text;
  v_rows int;
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
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
     WHERE id = p_invoice_id;
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

CREATE OR REPLACE FUNCTION public.assign_stamped_rep_number(p_payment_id uuid, p_folio text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_new_number text;
  v_rows int;
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'CP-' || lpad(p_folio, 4, '0');

  BEGIN
    UPDATE public.payments
       SET rep_number = v_new_number,
           rep_folio = p_folio
     WHERE id = p_payment_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'payment % not found', p_payment_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'rep_number % already assigned (concurrent stamp)', v_new_number
      USING ERRCODE = 'unique_violation';
  END;

  RETURN v_new_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_stamped_credit_note_number(p_credit_note_id uuid, p_folio text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_new_number text;
  v_existing_id uuid;
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'NC-' || lpad(p_folio, 4, '0');

  SELECT id INTO v_existing_id
  FROM public.credit_notes
  WHERE credit_note_number = v_new_number AND id <> p_credit_note_id;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'credit_note_number % already exists on credit_note %', v_new_number, v_existing_id;
  END IF;

  UPDATE public.credit_notes
     SET credit_note_number = v_new_number
   WHERE id = p_credit_note_id;

  RETURN v_new_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_maintenance_policy_month(p_policy_id uuid, p_month text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_claimed uuid;
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.maintenance_policies
     SET last_generated_month = p_month
   WHERE id = p_policy_id
     AND is_active
     AND (last_generated_month IS NULL OR last_generated_month < p_month)
  RETURNING id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.damage_restore_forklift_status(p_forklift_id uuid, p_previous text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.maintenance_logs
    WHERE forklift_id = p_forklift_id
      AND deleted_at IS NULL
      AND work_status IN ('pending', 'in_progress')
  ) THEN
    RETURN 'maintenance';
  END IF;

  IF p_previous = 'rented'
     AND EXISTS (SELECT 1 FROM public.bookings
                  WHERE forklift_id = p_forklift_id AND status = 'confirmed') THEN
    RETURN 'rented';
  END IF;
  RETURN 'available';
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_active_rental(p_forklift_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'auditor'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'ventas'::app_role)
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.bookings
    WHERE forklift_id = p_forklift_id
      AND status = 'confirmed'
      AND public.today_mty() BETWEEN start_date AND end_date
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
 RETURNS SETOF forklifts
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'auditor'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT f.*
  FROM public.forklifts f
  WHERE f.status IN ('available', 'rented')
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.forklift_id = f.id
        AND b.status NOT IN ('completed', 'cancelled')
        AND b.start_date <= p_end_date
        AND b.end_date >= p_start_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
        FROM public.maintenance_logs ml
        WHERE ml.next_service_date IS NOT NULL
          AND ml.deleted_at IS NULL
          AND ml.work_status NOT IN ('scheduled', 'cancelled')
        ORDER BY ml.forklift_id, ml.performed_at DESC
      ) latest
      WHERE latest.forklift_id = f.id
        AND latest.next_service_date - INTERVAL '3 days' <= p_end_date
        AND latest.next_service_date + INTERVAL '3 days' >= p_start_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.maintenance_logs ml
      WHERE ml.forklift_id = f.id AND ml.work_status = 'in_progress'
        AND ml.deleted_at IS NULL
    )
  ORDER BY f.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_invoice_cancellable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.peek_next_invoice_number() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_stamped_invoice_number(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_stamped_rep_number(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_stamped_credit_note_number(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_maintenance_policy_month(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.damage_restore_forklift_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_rental(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_available_forklifts(date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assert_invoice_cancellable(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.peek_next_invoice_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_stamped_invoice_number(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_stamped_credit_note_number(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_maintenance_policy_month(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.damage_restore_forklift_status(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_rental(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_forklifts(date, date) TO authenticated, service_role;