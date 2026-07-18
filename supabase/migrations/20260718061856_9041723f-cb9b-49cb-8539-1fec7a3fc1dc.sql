
-- DI-004: create_booking usa SELECT ... FOR UPDATE para eliminar TOCTOU entre check y update de forklift.
CREATE OR REPLACE FUNCTION public.create_booking(
  p_forklift_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_contact text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_recurring_billing boolean DEFAULT false,
  p_quote_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid;
  v_booking_number text;
  v_current_status text;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    NULL;
  ELSIF has_role(auth.uid(), 'administrativo'::app_role)
     OR has_role(auth.uid(), 'dispatcher'::app_role)
     OR has_role(auth.uid(), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = p_quote_id) THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
  ELSE
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- DI-004: lock de la fila del montacargas para cerrar la ventana entre check y update.
  SELECT status INTO v_current_status
  FROM forklifts
  WHERE id = p_forklift_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Montacargas no encontrado';
  END IF;
  IF v_current_status <> 'available' THEN
    RAISE EXCEPTION 'El montacargas no está disponible';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
  v_booking_number := next_booking_number();

  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status, booking_number, quote_id)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number, p_quote_id)
  RETURNING id INTO v_booking_id;

  UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;

  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, 'available', 'rented', 'Reserva ' || v_booking_number || ' creada');

  RETURN v_booking_id;
END;
$function$;

-- DI-002: candado advisory por invoice para prevenir doble pago concurrente y balance negativo.
-- BL-002: trigger que valida que la suma de pagos no exceda el total de la factura.
CREATE OR REPLACE FUNCTION public.enforce_payment_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_total numeric(14,2);
  v_paid_after numeric(14,2);
  v_status text;
BEGIN
  -- Candado por invoice — serializa pagos concurrentes de una misma factura.
  PERFORM pg_advisory_xact_lock(hashtext('invoice_payment:' || NEW.invoice_id::text));

  SELECT total, status INTO v_invoice_total, v_status
  FROM invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF v_invoice_total IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en facturas canceladas';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_after
  FROM payments
  WHERE invoice_id = NEW.invoice_id;

  IF TG_OP = 'INSERT' THEN
    v_paid_after := v_paid_after + NEW.amount;
  ELSIF TG_OP = 'UPDATE' THEN
    v_paid_after := v_paid_after - OLD.amount + NEW.amount;
  END IF;

  IF v_paid_after > v_invoice_total + 0.01 THEN
    RAISE EXCEPTION 'El pago excede el saldo pendiente (total: %, pagado tras esta operación: %)',
      v_invoice_total, v_paid_after;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_payment_balance_trg ON public.payments;
CREATE TRIGGER enforce_payment_balance_trg
  BEFORE INSERT OR UPDATE OF amount, invoice_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_balance();
