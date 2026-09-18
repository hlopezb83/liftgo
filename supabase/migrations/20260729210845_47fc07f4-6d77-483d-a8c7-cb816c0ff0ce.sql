-- DB3-14: daños
UPDATE public.damage_records SET status = 'reported', updated_at = now() WHERE status = 'open';

ALTER TABLE public.damage_records DROP CONSTRAINT IF EXISTS damage_records_status_dominio;
ALTER TABLE public.damage_records ADD CONSTRAINT damage_records_status_dominio
  CHECK (status IN ('reported','in_repair','repaired','invoiced')) NOT VALID;
ALTER TABLE public.damage_records VALIDATE CONSTRAINT damage_records_status_dominio;

CREATE OR REPLACE FUNCTION public.damage_restore_forklift_status(p_forklift_id uuid, p_previous text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_previous = 'rented'
     AND EXISTS (SELECT 1 FROM public.bookings
                  WHERE forklift_id = p_forklift_id AND status = 'confirmed') THEN
    RETURN 'rented';
  END IF;
  RETURN 'available';
END; $$;

CREATE OR REPLACE FUNCTION public.soft_delete_damage_record(p_damage_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec public.damage_records%ROWTYPE;
  v_restore text;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_rec FROM public.damage_records
   WHERE id = p_damage_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;

  IF v_rec.invoice_id IS NULL AND v_rec.status NOT IN ('repaired') THEN
    RAISE EXCEPTION 'No se puede archivar el daño sin cargo: liga una factura (invoice_id) o marcalo como reparado (status=repaired) antes de archivarlo. Estado actual: %',
      v_rec.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE damage_records
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE id = p_damage_id;

  IF v_rec.forklift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.damage_records
        WHERE forklift_id = v_rec.forklift_id
          AND deleted_at IS NULL
          AND id <> p_damage_id
     ) THEN
    v_restore := public.damage_restore_forklift_status(v_rec.forklift_id, v_rec.previous_forklift_status);
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE public.forklifts
       SET status = v_restore, updated_at = now()
     WHERE id = v_rec.forklift_id
       AND status = 'maintenance'
       AND status IS DISTINCT FROM v_restore;
    IF FOUND THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (v_rec.forklift_id, 'maintenance', v_restore,
              'Daño ' || p_damage_id::text || ' archivado: restauracion de estado');
    END IF;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.soft_delete_damage_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_damage_record(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_forklift_on_damage_repaired()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_restore text;
BEGIN
  IF NEW.status = 'repaired' AND OLD.status IS DISTINCT FROM 'repaired'
     AND NEW.forklift_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.damage_records
                      WHERE forklift_id = NEW.forklift_id
                        AND deleted_at IS NULL
                        AND id <> NEW.id
                        AND status NOT IN ('repaired')) THEN
    v_restore := public.damage_restore_forklift_status(NEW.forklift_id, NEW.previous_forklift_status);
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE public.forklifts
       SET status = v_restore, updated_at = now()
     WHERE id = NEW.forklift_id
       AND status = 'maintenance'
       AND status IS DISTINCT FROM v_restore;
    IF FOUND THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, 'maintenance', v_restore,
              'Daño ' || NEW.id::text || ' reparado: restauracion de estado');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_damage_repaired_restore ON public.damage_records;
CREATE TRIGGER trg_damage_repaired_restore
  BEFORE UPDATE OF status ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.restore_forklift_on_damage_repaired();

CREATE OR REPLACE FUNCTION public.guard_damage_record_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice_customer uuid;
  v_damage_customer uuid;
BEGIN
  IF NEW.invoice_id IS NULL OR NEW.invoice_id IS NOT DISTINCT FROM OLD.invoice_id THEN
    RETURN NEW;
  END IF;
  SELECT customer_id INTO v_invoice_customer FROM public.invoices WHERE id = NEW.invoice_id;
  IF v_invoice_customer IS NULL THEN
    RAISE EXCEPTION 'La factura ligada al dano no existe o no tiene cliente (invoice_id=%)', NEW.invoice_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_damage_customer := COALESCE(
    NEW.customer_id,
    (SELECT customer_id FROM public.bookings WHERE id = NEW.booking_id)
  );
  IF v_damage_customer IS NOT NULL AND v_invoice_customer IS DISTINCT FROM v_damage_customer THEN
    RAISE EXCEPTION 'La factura ligada pertenece a otro cliente. El cargo del dano debe facturarse al cliente del dano.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_damage_record_invoice ON public.damage_records;
CREATE TRIGGER trg_guard_damage_record_invoice
  BEFORE UPDATE OF invoice_id ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_record_invoice();

-- DB3-15: guards de DELETE
CREATE OR REPLACE FUNCTION public.guard_booking_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_jwt_role text;
BEGIN
  IF current_setting('app.e2e_teardown', true) = 'on' AND OLD.is_e2e IS TRUE THEN
    RETURN OLD;
  END IF;
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' AND OLD.is_e2e IS TRUE THEN
    RETURN OLD;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN OLD;
  END IF;
  IF OLD.status = 'cancelled' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Solo un administrador puede borrar una reserva, o cualquier rol si esta cancelada (estado actual: %).', OLD.status
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS trg_guard_booking_delete ON public.bookings;
CREATE TRIGGER trg_guard_booking_delete
  BEFORE DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_delete();

CREATE OR REPLACE FUNCTION public.guard_delivery_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'No se puede borrar una entrega completada (trazabilidad logistica). Contacta a un administrador si es un error de captura.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN OLD;
  END IF;
  IF OLD.status = 'cancelled' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Solo un administrador puede borrar una entrega programada (estado actual: %).', OLD.status
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS trg_guard_delivery_delete ON public.deliveries;
CREATE TRIGGER trg_guard_delivery_delete
  BEFORE DELETE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_delete();

-- DB3-16: prospects
CREATE OR REPLACE FUNCTION public.validate_prospect_close()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage = 'cerrado_ganado' AND (NEW.final_amount IS NULL OR NEW.final_amount <= 0) THEN
    RAISE EXCEPTION 'No se puede cerrar como ganado sin un monto final mayor a cero (final_amount=%)', NEW.final_amount
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage = 'cerrado_perdido' AND (NEW.lost_reason IS NULL OR length(trim(NEW.lost_reason)) = 0) THEN
    RAISE EXCEPTION 'Razón de pérdida requerida al marcar como Cerrado Perdido';
  END IF;
  IF NEW.stage IN ('cerrado_ganado','cerrado_perdido') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  IF NEW.stage NOT IN ('cerrado_ganado','cerrado_perdido') THEN
    NEW.closed_at := NULL;
    NEW.lost_reason := NULL;
    NEW.final_amount := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS prospects_validate_close ON public.prospects;
CREATE TRIGGER prospects_validate_close
  BEFORE INSERT OR UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.validate_prospect_close();

CREATE OR REPLACE FUNCTION public.validate_prospect_stage_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage IS DISTINCT FROM 'nuevo_prospecto' THEN
      RAISE EXCEPTION 'Estado inicial no permitido en prospects: %. Usa el flujo/RPC correspondiente.', NEW.stage
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN RETURN NEW; END IF;
  IF OLD.stage IN ('cerrado_ganado','cerrado_perdido') THEN
    RAISE EXCEPTION 'Un prospecto % no puede cambiar de etapa (transicion a % no permitida)', OLD.stage, NEW.stage
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage = 'cerrado_ganado' AND OLD.stage <> 'negociacion' THEN
    RAISE EXCEPTION 'Solo se puede cerrar como ganado un prospecto en negociacion (etapa actual: %)', OLD.stage
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prospect_stage_transition ON public.prospects;
CREATE TRIGGER trg_prospect_stage_transition BEFORE INSERT OR UPDATE OF stage ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.validate_prospect_stage_transition();

-- DB3-17 (a)
CREATE OR REPLACE FUNCTION public.trg_supplier_bill_init_balance()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('paid','partial','overdue','cancelled') THEN
      RAISE EXCEPTION 'No se puede crear una bill directamente en estado %. Registrala como pendiente y usa el flujo de pagos.', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.balance := COALESCE(NEW.total,0);
    IF NEW.status NOT IN ('draft','cancelled') THEN
      IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
        NEW.status := 'overdue';
      ELSE
        NEW.status := 'pending';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sb_init_balance ON public.supplier_bills;
CREATE TRIGGER trg_sb_init_balance
  BEFORE INSERT ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_bill_init_balance();

-- DB3-17 (b)
CREATE OR REPLACE FUNCTION public.validate_invoice_line_items_signs()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  item jsonb; qty numeric; price numeric; amount numeric; discount numeric;
  v_sum numeric := 0;
BEGIN
  IF NEW.status IS DISTINCT FROM 'draft'
     AND COALESCE(NEW.subtotal, 0) > 0
     AND (NEW.line_items IS NULL OR jsonb_typeof(NEW.line_items) <> 'array'
          OR jsonb_array_length(NEW.line_items) = 0) THEN
    RAISE EXCEPTION 'Una factura fuera de borrador requiere al menos una partida en line_items (subtotal=%).', NEW.subtotal
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.line_items IS NULL OR jsonb_typeof(NEW.line_items) <> 'array' THEN RETURN NEW; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(NEW.line_items) LOOP
    qty := COALESCE((item->>'quantity')::numeric, 1);
    price := COALESCE((item->>'unit_price')::numeric, 0);
    amount := COALESCE((item->>'amount')::numeric, qty * price);
    discount := COALESCE((item->>'discount')::numeric, 0);
    IF qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad debe ser mayor a cero (recibido: %). Descripcion: %', qty, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    IF price < 0 THEN
      RAISE EXCEPTION 'Precio unitario no puede ser negativo (recibido: %). Descripcion: %', price, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    IF amount < 0 THEN
      RAISE EXCEPTION 'El importe de la partida no puede ser negativo (recibido: %). Descripcion: %', amount, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    IF discount < 0 THEN
      RAISE EXCEPTION 'El descuento de la partida no puede ser negativo (recibido: %). Descripcion: %', discount, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    v_sum := v_sum + round(amount - discount, 2);
  END LOOP;

  IF jsonb_array_length(NEW.line_items) > 0
     AND NEW.subtotal IS NOT NULL
     AND abs(v_sum - round(NEW.subtotal, 2)) > 0.05 THEN
    RAISE EXCEPTION 'Las partidas no cuadran con el subtotal: suma de partidas (%) <> subtotal (%) (tolerancia 0.05).',
      v_sum, NEW.subtotal USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_invoice_line_items_signs ON public.invoices;
CREATE TRIGGER trg_validate_invoice_line_items_signs
  BEFORE INSERT OR UPDATE OF line_items, subtotal, status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_line_items_signs();

-- DB3-17 (c)
CREATE OR REPLACE FUNCTION public.validate_credit_note_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.subtotal   := round(COALESCE(NEW.subtotal, 0), 2);
  NEW.tax_amount := round(COALESCE(NEW.tax_amount, 0), 2);
  NEW.total      := round(COALESCE(NEW.total, 0), 2);

  IF NEW.subtotal <= 0 OR NEW.total <= 0 OR NEW.tax_amount < 0 THEN
    RAISE EXCEPTION 'Los montos de la nota de credito deben ser positivos (subtotal=%, tax_amount=%, total=%)',
      NEW.subtotal, NEW.tax_amount, NEW.total USING ERRCODE = 'check_violation';
  END IF;
  IF abs((NEW.subtotal + NEW.tax_amount) - NEW.total) > 0.01 THEN
    RAISE EXCEPTION 'La nota de credito no cuadra: subtotal (%) + tax_amount (%) <> total (%) (tolerancia 0.01)',
      NEW.subtotal, NEW.tax_amount, NEW.total USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_credit_note_totals ON public.credit_notes;
CREATE TRIGGER trg_validate_credit_note_totals
  BEFORE INSERT OR UPDATE OF subtotal, tax_amount, total, status ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.validate_credit_note_totals();

-- DB3-17 (d)
CREATE OR REPLACE FUNCTION public.validate_delivery_not_in_past()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF COALESCE(NEW.status, 'scheduled') = 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'La entrega no puede programarse en el pasado (%)', NEW.scheduled_date USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_delivery_not_in_past ON public.deliveries;
CREATE TRIGGER trg_delivery_not_in_past
  BEFORE INSERT OR UPDATE OF scheduled_date, status ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_not_in_past();

-- DB3-17 (e)
CREATE OR REPLACE FUNCTION public.sync_forklift_on_booking_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'confirmed' AND NEW.start_date IS NOT NULL AND NEW.start_date <= current_date THEN
    UPDATE public.forklifts
       SET status = 'rented', updated_at = now()
     WHERE id = NEW.forklift_id
       AND status = 'available';
    IF FOUND THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, 'available', 'rented',
              'Reserva ' || COALESCE(NEW.booking_number, NEW.id::text) || ' confirmada (inicio inmediato)');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_forklift_on_booking_insert ON public.bookings;
CREATE TRIGGER trg_sync_forklift_on_booking_insert
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_forklift_on_booking_insert();