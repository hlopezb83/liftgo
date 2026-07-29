-- DB4-08 (c) N9: balance de supplier_bills solo se recalcula, no se edita a mano.
CREATE OR REPLACE FUNCTION public.recalc_supplier_bill(p_bill_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total   NUMERIC(14,2);
  v_paid    NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_due     DATE;
  v_current public.supplier_bill_status;
BEGIN
  SELECT total, status, due_date INTO v_total, v_current, v_due
    FROM public.supplier_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_current IN ('draft','cancelled') THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.supplier_payments WHERE bill_id = p_bill_id;

  IF v_paid >= v_total THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < CURRENT_DATE THEN
    v_status := 'overdue';
  ELSE
    v_status := 'pending';
  END IF;

  PERFORM set_config('app.cxp_recalc', 'on', true);

  UPDATE public.supplier_bills
    SET balance = GREATEST(v_total - v_paid, 0),
        status  = v_status,
        updated_at = now()
    WHERE id = p_bill_id;
END $$;

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_jwt_role text;
  v_paid NUMERIC(14,2);
  v_expected NUMERIC(14,2);
BEGIN
  IF NEW.balance IS NOT DISTINCT FROM OLD.balance THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.cxp_recalc', true) = 'on' OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.supplier_payments WHERE bill_id = NEW.id;
  v_expected := GREATEST(round(COALESCE(NEW.total, OLD.total, 0) - v_paid, 2), 0);
  IF NEW.balance = v_expected THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'El balance de la bill no es editable directamente (esperado % segun total y pagos; recibido %). El balance se recalcula con los pagos (recalc_supplier_bill).', v_expected, NEW.balance
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS trg_guard_supplier_bill_balance ON public.supplier_bills;
CREATE TRIGGER trg_guard_supplier_bill_balance
  BEFORE UPDATE OF balance ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_balance();

-- DB4-08 (d) N4-r4: cierra el INSERT directo de bookings para no-admins.
CREATE OR REPLACE FUNCTION public.create_booking(p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_contact text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_recurring_billing boolean DEFAULT false, p_quote_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid; v_booking_number text; v_current_status text; v_starts_today boolean;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN NULL;
  ELSIF has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)
     OR has_role(auth.uid(), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = p_quote_id) THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
  ELSE RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN RAISE EXCEPTION 'Fechas de reserva requeridas'; END IF;
  IF p_end_date < p_start_date THEN RAISE EXCEPTION 'La fecha final no puede ser anterior a la inicial'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'El cliente seleccionado está archivado o no existe'; END IF;
  SELECT status INTO v_current_status FROM forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  IF v_current_status IN ('maintenance', 'out_of_service', 'retired', 'sold') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bookings WHERE forklift_id = p_forklift_id
      AND status NOT IN ('cancelled','completed')
      AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'El montacargas ya está reservado en ese rango de fechas' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
  v_booking_number := next_booking_number();
  PERFORM set_config('app.booking_rpc', 'on', true);
  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status, booking_number, quote_id)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number, p_quote_id)
  RETURNING id INTO v_booking_id;
  v_starts_today := p_start_date <= CURRENT_DATE;
  IF v_starts_today AND v_current_status = 'available' THEN
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (p_forklift_id, 'available', 'rented', 'Reserva ' || v_booking_number || ' creada');
  END IF;
  RETURN v_booking_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_booking_insert_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;
  IF current_setting('app.booking_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Solo un administrador puede crear reservas por INSERT directo. Usa el flujo de cotizacion (convert_quote_to_bookings) o create_booking.'
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS trg_guard_booking_insert_admin ON public.bookings;
CREATE TRIGGER trg_guard_booking_insert_admin
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_insert_admin();