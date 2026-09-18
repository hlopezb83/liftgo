-- =============================================================
-- fix-03: M-7, M-8, L-2, L-4
-- =============================================================

-- ---------- M-7: deliveries 'completed' terminal + efectos ----------
CREATE OR REPLACE FUNCTION public.guard_delivery_completed_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Una entrega completada no puede reabrirse ni cambiar de estado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_delivery_completed_terminal() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_delivery_completed_terminal ON public.deliveries;
CREATE TRIGGER trg_guard_delivery_completed_terminal
BEFORE UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_completed_terminal();

-- Efecto: al completar una ENTREGA (no recoleccion) la unidad pasa a 'rented'.
CREATE OR REPLACE FUNCTION public.apply_delivery_completed_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  IF NEW.status <> 'completed' OR NEW.type <> 'delivery' OR NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts
     SET status = 'rented'
   WHERE id = NEW.forklift_id
     AND status IS DISTINCT FROM 'rented'
     AND status NOT IN ('sold', 'retired');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('app.forklift_rpc', 'off', true);

  IF v_rows > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, 'available', 'rented',
            'Entrega completada ' || COALESCE(NEW.delivery_number, NEW.id::text));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_delivery_completed_effects() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_delivery_completed_effects ON public.deliveries;
CREATE TRIGGER trg_delivery_completed_effects
AFTER INSERT OR UPDATE OF status ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.apply_delivery_completed_effects();

-- ---------- M-8: cotizacion 'converted' ----------
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_dominio;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_status_dominio
  CHECK (status = ANY (ARRAY['draft','sent','accepted','converted','rejected','expired','cancelled'])) NOT VALID;
ALTER TABLE public.quotes VALIDATE CONSTRAINT quotes_status_dominio;

CREATE OR REPLACE FUNCTION public.validate_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed text[];
  v_initial text[];
  v_due date;
  v_jwt_role text;
  v_has_payments boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_initial := CASE TG_TABLE_NAME
      WHEN 'invoices'       THEN ARRAY['draft','sent']
      WHEN 'quotes'         THEN ARRAY['draft','sent']
      WHEN 'bookings'       THEN ARRAY['confirmed']
      WHEN 'supplier_bills' THEN ARRAY['draft','pending']
      WHEN 'forklifts'      THEN ARRAY['available']
      ELSE ARRAY[]::text[]
    END;

    IF TG_TABLE_NAME = 'supplier_bills' AND NEW.status::text = 'overdue' THEN
      v_due := NULLIF(to_jsonb(NEW) ->> 'due_date', '')::date;
      IF v_due IS NOT NULL AND v_due < public.today_mty() THEN
        RETURN NEW;
      END IF;
    END IF;

    IF NOT (NEW.status::text = ANY(v_initial)) THEN
      RAISE EXCEPTION 'Estado inicial no permitido en %: %. Usa el flujo/RPC correspondiente.',
        TG_TABLE_NAME, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','cancelled']
      WHEN 'sent'     THEN ARRAY['overdue','paid','cancelled']
      WHEN 'overdue'  THEN ARRAY['paid','cancelled']
      WHEN 'partial'  THEN ARRAY['overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'     THEN ARRAY['sent','rejected','expired']
      WHEN 'sent'      THEN ARRAY['accepted','rejected','expired']
      WHEN 'expired'   THEN ARRAY['draft']
      -- M-8: una cotizacion aceptada puede marcarse como convertida al
      -- generar las reservas (lo hace convert_quote_to_bookings).
      WHEN 'accepted'  THEN ARRAY['cancelled','converted']
      WHEN 'converted' THEN ARRAY['cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'bookings' THEN CASE OLD.status::text
      WHEN 'confirmed' THEN ARRAY['completed','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'supplier_bills' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['pending','cancelled']
      WHEN 'pending'  THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['pending','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['pending','paid','overdue','cancelled']
      WHEN 'paid'     THEN ARRAY['pending','partial','overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'forklifts' THEN CASE OLD.status::text
      WHEN 'available'      THEN ARRAY['rented','maintenance','out_of_service','retired','sold']
      WHEN 'rented'         THEN ARRAY['available','maintenance','out_of_service','retired','sold']
      WHEN 'maintenance'    THEN ARRAY['available','rented','out_of_service','retired','sold']
      WHEN 'out_of_service' THEN ARRAY['available','maintenance','retired','sold']
      WHEN 'retired'        THEN ARRAY['available']
      ELSE ARRAY[]::text[] END
    ELSE ARRAY[]::text[]
  END;

  -- Fix 4.3: salir de 'paid' en CxP requiere service_role o cero pagos ligados.
  IF TG_TABLE_NAME = 'supplier_bills' AND OLD.status::text = 'paid' THEN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
      SELECT EXISTS (SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = OLD.id)
        INTO v_has_payments;
      IF v_has_payments THEN
        RAISE EXCEPTION 'La cuenta tiene pagos registrados; elimina o reversa los pagos primero.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- Fix 4.4: no vender/retirar una unidad con renta activa.
  IF TG_TABLE_NAME = 'forklifts'
     AND OLD.status::text = 'rented'
     AND NEW.status::text IN ('sold','retired') THEN
    IF EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.deliveries d
        ON d.booking_id = b.id AND d.type = 'delivery' AND d.status = 'completed'
      WHERE b.forklift_id = OLD.id
        AND b.status = 'confirmed'
        AND NOT EXISTS (
          SELECT 1 FROM public.deliveries r
          WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
        )
    ) THEN
      RAISE EXCEPTION 'La unidad tiene una renta activa; completa la devolución antes de venderla o darla de baja'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'invoices'
     AND current_setting('app.payment_sync', true) = 'on'
     AND pg_trigger_depth() > 1
     AND OLD.status::text IN ('sent','partial','overdue','paid')
     AND NEW.status::text IN ('sent','partial','overdue','paid') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'invoices'
     AND OLD.status::text = 'paid'
     AND NEW.status::text = 'cancelled' THEN
    IF v_jwt_role = 'service_role'
       OR current_setting('app.sat_flow', true) IS NOT DISTINCT FROM 'on' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'forklifts'
     AND current_setting('app.forklift_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- El candado de montos aplica igual a una cotizacion ya convertida.
CREATE OR REPLACE FUNCTION public.lock_accepted_quote_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IN ('accepted','converted') AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.line_items IS DISTINCT FROM OLD.line_items OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
    OR NEW.forklift_id IS DISTINCT FROM OLD.forklift_id
    OR NEW.quote_type IS DISTINCT FROM OLD.quote_type
    OR NEW.rental_meta IS DISTINCT FROM OLD.rental_meta
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar montos, fechas, cliente ni equipo de una cotizacion aceptada. Cancelala (admin/administrativo) y crea una nueva version.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IS DISTINCT FROM 'accepted' AND NEW.status = 'accepted' AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.line_items IS DISTINCT FROM OLD.line_items OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
    OR NEW.forklift_id IS DISTINCT FROM OLD.forklift_id
    OR NEW.quote_type IS DISTINCT FROM OLD.quote_type
    OR NEW.rental_meta IS DISTINCT FROM OLD.rental_meta
  ) THEN
    RAISE EXCEPTION 'No se pueden alterar montos, fechas, cliente ni equipo en el mismo movimiento que acepta la cotizacion.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;

-- convert_quote_to_bookings: marca la cotizacion como convertida al terminar.
CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(p_quote_id uuid, p_assignments jsonb, p_recurring boolean DEFAULT false)
RETURNS TABLE(booking_id uuid, forklift_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote quotes%ROWTYPE; v_assignment jsonb; v_forklift_id uuid; v_model_id uuid;
  v_daily numeric; v_weekly numeric; v_monthly numeric; v_booking_id uuid; v_meta jsonb;
  v_slots jsonb; v_idx int;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'ventas'::app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Solo se pueden convertir cotizaciones aceptadas (estado actual: %)', v_quote.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < public.today_mty() THEN
    RAISE EXCEPTION 'Cotización vencida: actualiza precios y vigencia antes de convertir';
  END IF;
  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;
  -- M7: expandir rental_meta a slots por unidad preservando el orden.
  SELECT COALESCE(jsonb_agg(elem ORDER BY ord, n), '[]'::jsonb)
    INTO v_slots
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(v_quote.rental_meta) = 'array'
              THEN v_quote.rental_meta ELSE '[]'::jsonb END
       ) WITH ORDINALITY AS t(elem, ord)
  CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE((t.elem->>'quantity')::int, 1), 1)) AS g(n);
  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments) LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;
    SELECT equipment_model_id INTO v_model_id FROM forklifts WHERE id = v_forklift_id;
    v_meta := NULL;
    IF v_model_id IS NOT NULL THEN
      SELECT s.elem, s.ord - 1 INTO v_meta, v_idx
        FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS s(elem, ord)
       WHERE (s.elem->>'modelId')::uuid = v_model_id
       ORDER BY s.ord
       LIMIT 1;
      IF v_meta IS NOT NULL THEN
        v_slots := v_slots - v_idx;
      END IF;
    END IF;
    IF v_meta IS NOT NULL THEN
      v_daily := COALESCE((v_meta->>'dailyRate')::numeric, 0);
      v_weekly := COALESCE((v_meta->>'weeklyRate')::numeric, 0);
      v_monthly := COALESCE((v_meta->>'monthlyRate')::numeric, 0);
    ELSE
      v_daily := COALESCE((v_assignment->>'daily_rate')::numeric, 0);
      v_weekly := COALESCE((v_assignment->>'weekly_rate')::numeric, 0);
      v_monthly := COALESCE((v_assignment->>'monthly_rate')::numeric, 0);
    END IF;
    v_booking_id := public.create_booking(
      v_forklift_id, v_quote.customer_id, v_quote.customer_name, NULL,
      v_quote.start_date, v_quote.end_date, p_recurring, p_quote_id
    );
    -- F5: COALESCE(NULLIF(v_*, 0), tarifa actual) — una tarifa entrante en 0
    -- conserva la existente en vez de pisarla con cero.
    UPDATE public.bookings
       SET daily_rate = COALESCE(NULLIF(v_daily, 0), daily_rate),
           weekly_rate = COALESCE(NULLIF(v_weekly, 0), weekly_rate),
           monthly_rate = COALESCE(NULLIF(v_monthly, 0), monthly_rate),
           currency = COALESCE(v_quote.currency, 'MXN'), tipo_cambio = COALESCE(v_quote.tipo_cambio, 1)
     WHERE id = v_booking_id;
    RETURN QUERY SELECT v_booking_id, v_forklift_id;
  END LOOP;

  -- M-8: cerrar el ciclo de la cotizacion.
  UPDATE public.quotes SET status = 'converted' WHERE id = p_quote_id;
END;
$function$;

-- ---------- L-2: sin status_logs fantasma ----------
CREATE OR REPLACE FUNCTION public.delete_quote_with_unassign(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote_number text;
  v_forklift_id uuid;
  v_rows int;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'administrativo') OR
    public.has_role(auth.uid(), 'dispatcher') OR
    public.has_role(auth.uid(), 'ventas')
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT quote_number INTO v_quote_number FROM public.quotes WHERE id = p_quote_id;
  IF v_quote_number IS NULL THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;

  FOR v_forklift_id IN
    SELECT forklift_id FROM public.quote_assigned_forklifts WHERE quote_id = p_quote_id
  LOOP
    UPDATE public.forklifts
      SET status = 'available'
      WHERE id = v_forklift_id AND status = 'sold';
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    -- L-2: solo se registra el movimiento si la unidad realmente cambio.
    IF v_rows > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (v_forklift_id, 'sold', 'available',
              'Liberado por eliminación de cotización ' || v_quote_number);
    END IF;
  END LOOP;

  DELETE FROM public.quote_assigned_forklifts WHERE quote_id = p_quote_id;
  DELETE FROM public.quotes WHERE id = p_quote_id;
END;
$function$;

-- ---------- L-4: fecha de pago a proveedor en horario Monterrey ----------
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT today_mty(), p_payment_method text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status, approval_status INTO v_balance, v_status, v_approval
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval = 'pending' THEN
    RAISE EXCEPTION 'La factura requiere aprobación antes de pagar';
  END IF;
  IF v_approval = 'rejected' THEN
    RAISE EXCEPTION 'La factura fue rechazada y no puede pagarse';
  END IF;
  IF p_amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $function$;