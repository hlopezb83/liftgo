-- GUI-DB-02: create_booking exige cotización aceptada (sin bloquear fechas pasadas).
CREATE OR REPLACE FUNCTION public.create_booking(p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_contact text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_recurring_billing boolean DEFAULT false, p_quote_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid; v_booking_number text; v_current_status text; v_starts_today boolean;
  v_quote_status text;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN NULL;
  ELSIF has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)
     OR has_role(auth.uid(), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
  ELSE RAISE EXCEPTION 'Forbidden';
  END IF;
  -- GUI-DB-02: si la reserva viene de una cotización, esta debe estar aceptada
  -- por el cliente (mismo criterio que convert_quote_to_bookings).
  IF p_quote_id IS NOT NULL THEN
    SELECT status INTO v_quote_status FROM quotes WHERE id = p_quote_id;
    IF v_quote_status IS NULL THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
    IF v_quote_status <> 'accepted' THEN
      RAISE EXCEPTION 'La cotización debe estar aceptada por el cliente para crear la reserva (estado actual: %).', v_quote_status
        USING ERRCODE = 'check_violation';
    END IF;
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

-- GUI-DB-05: secuencias defensivas (solo avanzan) + folio asignado en servidor.
DO $$
DECLARE
  v_quote_max bigint;
  v_booking_max bigint;
  v_bill_max bigint;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(quote_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_quote_max
  FROM public.quotes
  WHERE coalesce(is_e2e, false) = false AND quote_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(booking_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_booking_max
  FROM public.bookings
  WHERE coalesce(is_e2e, false) = false AND booking_number NOT LIKE 'E2E-%';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(bill_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_bill_max
  FROM public.supplier_bills;

  -- GREATEST con last_value: la secuencia nunca retrocede.
  PERFORM setval('public.quote_number_seq',
    GREATEST(v_quote_max, (SELECT last_value FROM public.quote_number_seq), 1), true);
  PERFORM setval('public.booking_number_seq',
    GREATEST(v_booking_max, (SELECT last_value FROM public.booking_number_seq), 1), true);
  PERFORM setval('public.supplier_bill_number_seq',
    GREATEST(v_bill_max, (SELECT last_value FROM public.supplier_bill_number_seq), 1), true);
END $$;

CREATE OR REPLACE FUNCTION public.assign_quote_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.quote_number IS NULL OR btrim(NEW.quote_number) = '' THEN
    NEW.quote_number := public.next_quote_number();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_assign_quote_number ON public.quotes;
CREATE TRIGGER trg_assign_quote_number
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.assign_quote_number();

CREATE OR REPLACE FUNCTION public.assign_booking_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.booking_number IS NULL OR btrim(NEW.booking_number) = '' THEN
    NEW.booking_number := public.next_booking_number();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_assign_booking_number ON public.bookings;
CREATE TRIGGER trg_assign_booking_number
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.assign_booking_number();

-- GUI-DB-06: guard de borrado de contratos + dispatcher sin DELETE.
CREATE OR REPLACE FUNCTION public.guard_contract_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_jwt_role text;
BEGIN
  IF current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN OLD;
  END IF;
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' THEN
    RETURN OLD;
  END IF;
  IF OLD.status IN ('active', 'signed', 'completed') THEN
    RAISE EXCEPTION 'No se puede borrar un contrato % (integridad legal/financiera). Cancela el contrato si es un error.', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'administrativo'::public.app_role) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Solo un administrador o administrativo puede borrar un contrato en borrador (estado actual: %).', OLD.status
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS trg_guard_contract_delete ON public.contracts;
CREATE TRIGGER trg_guard_contract_delete
  BEFORE DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contract_delete();

DROP POLICY IF EXISTS "Dispatchers full access contracts" ON public.contracts;
CREATE POLICY "Dispatchers read contracts"
  ON public.contracts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role));
CREATE POLICY "Dispatchers insert contracts"
  ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));
CREATE POLICY "Dispatchers update contracts"
  ON public.contracts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

-- GUI-DB-07: una factura de proveedor puede nacer 'overdue' si ya está vencida.
CREATE OR REPLACE FUNCTION public.validate_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
  v_initial text[];
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
    IF TG_TABLE_NAME = 'supplier_bills'
       AND NEW.status::text = 'overdue'
       AND NEW.due_date IS NOT NULL
       AND NEW.due_date < CURRENT_DATE THEN
      RETURN NEW;
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

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','cancelled']
      WHEN 'sent'     THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['sent','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['sent','paid','overdue','cancelled']
      WHEN 'paid'     THEN ARRAY['cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','rejected','expired']
      WHEN 'sent'     THEN ARRAY['accepted','rejected','expired']
      WHEN 'expired'  THEN ARRAY['draft']
      WHEN 'accepted' THEN ARRAY['cancelled']
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

  IF TG_TABLE_NAME = 'invoices'
     AND current_setting('app.payment_sync', true) = 'on'
     AND pg_trigger_depth() > 1
     AND OLD.status::text IN ('sent','partial','overdue','paid')
     AND NEW.status::text IN ('sent','partial','overdue','paid') THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- GUI-DB-08: dispatcher solo lectura en clientes.
DROP POLICY IF EXISTS "Dispatchers full access customers" ON public.customers;
CREATE POLICY "Dispatchers read customers" ON public.customers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher'::app_role));

-- GUI-DB-09: mechanic reporta daños + RPC transaccional de reparación.
DROP POLICY IF EXISTS "Mechanics insert damage_records" ON public.damage_records;
CREATE POLICY "Mechanics insert damage_records" ON public.damage_records FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'mechanic'::app_role));

CREATE OR REPLACE FUNCTION public.start_repair_work_order(p_damage_id uuid, p_service_type text DEFAULT 'reparacion'::text, p_description text DEFAULT NULL::text, p_estimated_cost numeric DEFAULT NULL::numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_damage public.damage_records%ROWTYPE;
  v_log_id uuid;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_estimated_cost IS NOT NULL AND p_estimated_cost < 0 THEN
    RAISE EXCEPTION 'El costo estimado de la reparación no puede ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_damage
    FROM public.damage_records
   WHERE id = p_damage_id
     AND deleted_at IS NULL
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

  INSERT INTO public.maintenance_logs (forklift_id, service_type, description, cost, work_status)
  VALUES (
    v_damage.forklift_id,
    COALESCE(NULLIF(btrim(p_service_type), ''), 'reparacion'),
    COALESCE(NULLIF(btrim(p_description), ''), 'Reparación de daño ' || p_damage_id::text || ': ' || v_damage.description),
    COALESCE(p_estimated_cost, v_damage.estimated_cost, 0),
    'in_progress'
  )
  RETURNING id INTO v_log_id;

  UPDATE public.damage_records
     SET maintenance_log_id = v_log_id,
         status = 'in_repair',
         updated_at = now()
   WHERE id = p_damage_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_repair_work_order(uuid, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_repair_work_order(uuid, text, text, numeric) TO authenticated;