-- =====================================================================
-- R5 · Lote 2
-- A3: rebote de cotización 'converted' → 'accepted' cuando todas sus
--     reservas quedaron canceladas (salida del limbo).
-- A4: bitácora al liberar un daño por cancelación/eliminación de factura.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Máquina de estados: permitir converted → accepted SOLO cuando lo
--    ejecuta el rebote automático (flag de sesión app.quote_rebound).
-- ---------------------------------------------------------------------
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

  -- R4-19: revert_audit_log fija app.audit_revert='on' para restaurar old_data
  -- (incluye 'status') sin ser rechazado por el guard de transiciones.
  IF current_setting('app.audit_revert', true) = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','cancelled']
      WHEN 'sent'     THEN ARRAY['overdue','paid','cancelled']
      WHEN 'overdue'  THEN ARRAY['paid','cancelled']
      WHEN 'partial'  THEN ARRAY['overdue','paid','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'     THEN ARRAY['sent','rejected','expired']
      WHEN 'sent'      THEN ARRAY['accepted','rejected','expired']
      WHEN 'expired'   THEN ARRAY['draft']
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

  -- FIX N-3: recalc_supplier_bill fija app.cxp_recalc='on' para poder mover
  -- la bill (p.ej. salir de 'paid') al borrar/reversar pagos.
  IF TG_TABLE_NAME = 'supplier_bills'
     AND current_setting('app.cxp_recalc', true) = 'on' THEN
    RETURN NEW;
  END IF;

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

  -- Fix 4.4 + N-42: NINGUNA salida de 'rented' es valida si hay renta
  -- entregada sin devolucion. El flujo interno (app.forklift_rpc = 'on')
  -- queda exento para permitir la liberacion legitima tras la inspeccion.
  IF TG_TABLE_NAME = 'forklifts'
     AND OLD.status::text = 'rented'
     AND NEW.status::text IS DISTINCT FROM 'rented'
     AND current_setting('app.forklift_rpc', true) IS DISTINCT FROM 'on' THEN
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
      RAISE EXCEPTION 'La unidad tiene una renta entregada sin devolución; completa la devolución antes de cambiar su estado'
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

  -- R5-A3 (rebote de cotizacion): cuando se cancela la ultima reserva viva de
  -- una cotizacion convertida, `rebound_quote_on_booking_cancel` la regresa a
  -- 'accepted' para sacarla del limbo. Es la unica via permitida: el flag solo
  -- lo enciende esa funcion dentro de su propia transaccion.
  IF TG_TABLE_NAME = 'quotes'
     AND OLD.status::text = 'converted'
     AND NEW.status::text = 'accepted'
     AND current_setting('app.quote_rebound', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) La vigencia no aplica al rebote: la cotizacion YA habia sido aceptada
--    y convertida; exigir valid_until futura la dejaria atrapada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_quote_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    IF current_setting('app.quote_rebound', true) = 'on'
       AND OLD.status = 'converted' THEN
      RETURN NEW;
    END IF;
    IF NEW.valid_until IS NOT NULL AND NEW.valid_until < public.today_mty() THEN
      RAISE EXCEPTION 'No se puede aceptar una cotizacion vencida (valid_until=%)', NEW.valid_until
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.valid_until IS NOT NULL AND OLD.valid_until < public.today_mty() THEN
      RAISE EXCEPTION 'No se puede aceptar una cotizacion cuya vigencia ya vencio (valid_until=%). Extiende la vigencia y reenviala primero.', OLD.valid_until
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) Rebote automatico al cancelar la ultima reserva viva de la cotizacion.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebound_quote_on_booking_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote_status text;
BEGIN
  IF NEW.quote_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_quote_status
    FROM public.quotes WHERE id = NEW.quote_id FOR UPDATE;

  IF v_quote_status IS DISTINCT FROM 'converted' THEN
    RETURN NEW;
  END IF;

  -- Sigue habiendo reservas vivas: la cotizacion permanece convertida.
  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.quote_id = NEW.quote_id
       AND b.id <> NEW.id
       AND b.status <> 'cancelled'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.quote_rebound', 'on', true);
  UPDATE public.quotes
     SET status = 'accepted', updated_at = now()
   WHERE id = NEW.quote_id AND status = 'converted';
  PERFORM set_config('app.quote_rebound', 'off', true);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.quote_rebound', 'off', true);
  RAISE;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rebound_quote_on_booking_cancel ON public.bookings;
CREATE TRIGGER trg_rebound_quote_on_booking_cancel
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION public.rebound_quote_on_booking_cancel();

-- ---------------------------------------------------------------------
-- 4) Bitacora al liberar un daño por cancelacion/eliminacion de factura.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_damage_on_invoice_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_folio text;
  v_motivo text;
  r record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.id;
    v_folio := COALESCE(OLD.invoice_number, '');
    v_motivo := 'factura eliminada';
  ELSIF (COALESCE(NEW.status, '') = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled')
     OR (COALESCE(NEW.cancellation_status, '') = 'accepted'
         AND COALESCE(OLD.cancellation_status, '') <> 'accepted') THEN
    v_invoice_id := NEW.id;
    v_folio := COALESCE(NEW.invoice_number, '');
    v_motivo := 'factura cancelada';
  ELSE
    RETURN NEW;
  END IF;

  FOR r IN
    UPDATE public.damage_records
       SET invoice_id = NULL,
           status = CASE WHEN status = 'invoiced' THEN 'repaired' ELSE status END
     WHERE invoice_id = v_invoice_id
    RETURNING id, forklift_id, status
  LOOP
    -- R5-A4: antes la liberacion era silenciosa y nadie podia explicar el
    -- cambio de estatus del daño. Queda asentada en la bitacora del equipo.
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (
      r.forklift_id,
      'damage:invoiced',
      'damage:' || r.status,
      'Daño liberado de la facturación (' || v_motivo ||
        CASE WHEN v_folio <> '' THEN ' ' || v_folio ELSE '' END || ')',
      auth.uid()
    );
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;