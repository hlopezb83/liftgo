-- FIX N-3: bypass de app.cxp_recalc en validate_transition para supplier_bills
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

-- FIX N-1 (pago real requerido para 'paid') + N-21 (criterio unificado de NC)
CREATE OR REPLACE FUNCTION public.sync_invoice_status_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_total numeric(14,2);
  v_status text;
  v_paid numeric(14,2);
  v_credited numeric(14,2);
  v_latest_date date;
  v_due date;
  v_target text;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT total, status, due_date INTO v_total, v_status, v_due
  FROM invoices WHERE id = v_invoice_id
  FOR UPDATE;
  IF v_total IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status IN ('cancelled', 'draft') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
    INTO v_paid, v_latest_date
  FROM payments WHERE invoice_id = v_invoice_id;

  -- N-21: mismo criterio que la UI (creditNoteLimits.ts).
  SELECT COALESCE(SUM(total), 0) INTO v_credited
  FROM credit_notes
  WHERE invoice_id = v_invoice_id
    AND cfdi_status = 'stamped'
    AND status <> 'cancelled'
    AND cancellation_status IS DISTINCT FROM 'accepted';

  PERFORM set_config('app.payment_sync', 'on', true);

  -- M-15: la tolerancia (0.005) solo aplica para MARCAR 'paid'.
  -- N-1: 'paid' exige al menos un pago real.
  IF v_paid >= v_total - v_credited - 0.005 AND v_paid > 0 THEN
    IF v_status <> 'paid' THEN
      UPDATE invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
        WHERE id = v_invoice_id;
    END IF;
  ELSIF v_paid = 0 AND v_credited > 0 THEN
    -- N-1: solo notas de credito; se conserva el status salvo que fuera 'paid'.
    IF v_status = 'paid' THEN
      UPDATE invoices SET status = 'sent', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSIF (v_paid + v_credited) > 0 THEN
    IF v_status <> 'partial' THEN
      UPDATE invoices SET status = 'partial', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSE
    v_target := CASE
      WHEN v_due IS NOT NULL AND v_due < public.today_mty() THEN 'overdue'
      ELSE 'sent'
    END;
    IF v_status <> v_target THEN
      UPDATE invoices SET status = v_target, paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- FIX N-21: mismo criterio de NC en el guard de sobrepago
CREATE OR REPLACE FUNCTION public.enforce_payment_within_invoice_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_total NUMERIC;
  inv_status TEXT;
  total_paid NUMERIC;
  credited NUMERIC;
  payable NUMERIC;
BEGIN
  SELECT total, status INTO inv_total, inv_status
  FROM public.invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF inv_total IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found for payment', NEW.invoice_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF inv_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en facturas canceladas'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  SELECT COALESCE(SUM(total), 0) INTO credited
  FROM public.credit_notes
  WHERE invoice_id = NEW.invoice_id
    AND cfdi_status = 'stamped'
    AND status <> 'cancelled'
    AND cancellation_status IS DISTINCT FROM 'accepted';

  total_paid := total_paid + NEW.amount;
  payable := inv_total - credited;

  IF total_paid > payable THEN
    RAISE EXCEPTION
      'Sobrepago rechazado: la suma de pagos (%) excede el saldo facturable (%) despues de notas de credito',
      round(total_paid, 2), round(payable, 2)
      USING ERRCODE = 'check_violation',
            HINT = 'Reduce el monto del pago o cancela pagos previos antes de registrar uno nuevo.';
  END IF;

  RETURN NEW;
END;
$function$;

-- FIX N-33: tipo_cambio inmutable solo con CFDI timbrado o REP timbrado
CREATE OR REPLACE FUNCTION public.trg_invoice_tipo_cambio_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tipo_cambio IS DISTINCT FROM OLD.tipo_cambio
     AND (
       OLD.cfdi_uuid IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.payments p
                  WHERE p.invoice_id = OLD.id
                    AND p.rep_cfdi_status = 'stamped')
     ) THEN
    RAISE EXCEPTION
      'tipo_cambio es inmutable: la factura % ya está timbrada o tiene pagos con REP timbrado.',
      OLD.invoice_number
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$function$;

-- FIX N-2: la validacion de cliente solo aplica al salir de 'draft'
CREATE OR REPLACE FUNCTION public.enforce_invoice_customer_when_not_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'draft' THEN
    RETURN NEW;
  END IF;
  IF current_setting('app.payment_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'draft'
     AND NEW.customer_id IS NULL
     AND (NEW.customer_name IS NULL OR btrim(NEW.customer_name) = '') THEN
    RAISE EXCEPTION
      'La factura no puede salir de borrador sin cliente (se requiere customer_id o customer_name)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;