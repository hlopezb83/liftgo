-- Lote B-1: contenido de 20260909100000_financial_integrity.sql
-- SIN el bloque de reconciliacion masiva de facturas historicas (fase posterior).

CREATE OR REPLACE FUNCTION public.guard_invoice_status_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
  v_invoice_currency text;
  v_paid numeric := 0;
  v_credited numeric := 0;
  v_remaining numeric := 0;
BEGIN
  IF current_setting('app.e2e_seed', true) = 'on'
     OR current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
    v_invoice_currency := upper(COALESCE(NEW.moneda, 'MXN'));

    IF EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.invoice_id = NEW.id
        AND upper(COALESCE(p.currency, v_invoice_currency)) <> v_invoice_currency
        AND COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(NEW.tipo_cambio, 0)) IS NULL
    ) THEN
      RAISE EXCEPTION
        'No se puede marcar la factura como pagada: hay pagos en otra moneda sin tipo de cambio.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, v_invoice_currency)) = v_invoice_currency
          THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(
            COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(NEW.tipo_cambio, 0)),
            0
          )
        ELSE p.amount * COALESCE(
          NULLIF(p.exchange_rate, 0),
          NULLIF(NEW.tipo_cambio, 0)
        )
      END
    ), 0)
    INTO v_paid
    FROM public.payments p
    WHERE p.invoice_id = NEW.id;

    SELECT COALESCE(SUM(cn.total), 0)
    INTO v_credited
    FROM public.credit_notes cn
    WHERE cn.invoice_id = NEW.id
      AND cn.cfdi_status = 'stamped'
      AND cn.status <> 'cancelled'
      AND cn.cancellation_status IS DISTINCT FROM 'accepted';

    v_remaining := GREATEST(
      COALESCE(NEW.total, 0) - COALESCE(v_paid, 0) - COALESCE(v_credited, 0),
      0
    );

    IF v_remaining > 0.005 THEN
      RAISE EXCEPTION
        'No se puede marcar la factura como pagada: saldo pendiente % (total %, pagos %, notas de crédito %). Registra el pago restante.',
        round(v_remaining, 2), round(NEW.total, 2), round(v_paid, 2), round(v_credited, 2)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF current_setting('app.sat_flow', true) IS DISTINCT FROM 'on' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
      IF NEW.cancellation_reason IS NULL OR btrim(NEW.cancellation_reason) = '' THEN
        RAISE EXCEPTION
          'Cancelar una factura requiere un motivo (cancellation_reason). Las facturas timbradas se cancelan por el flujo SAT.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_invoice_status_integrity() IS
  'Impide que cualquier ruta, incluida la sincronización de pagos/NC, declare paid con saldo pendiente.';

DROP TRIGGER IF EXISTS trg_guard_invoice_status_integrity ON public.invoices;
CREATE TRIGGER trg_guard_invoice_status_integrity
  BEFORE INSERT OR UPDATE OF status, total, moneda, tipo_cambio
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_status_integrity();

CREATE OR REPLACE FUNCTION public.get_cash_flow_recurring_bookings()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT jsonb_build_object(
    'id', b.id,
    'booking_number', b.booking_number,
    'customer_name', b.customer_name,
    'start_date', b.start_date,
    'end_date', b.end_date,
    'last_billed_date', CASE
      WHEN history.active_links = 0 THEN NULL
      WHEN history.max_period_end IS NOT NULL THEN history.max_period_end
      ELSE b.last_billed_date
    END,
    'monthly_rate', COALESCE(b.monthly_rate, f.monthly_rate),
    'currency', b.currency,
    'tipo_cambio', b.tipo_cambio,
    'customer_tax_rate', c.tax_rate
  )
  FROM public.bookings b
  LEFT JOIN public.forklifts f ON f.id = b.forklift_id
  LEFT JOIN public.customers c ON c.id = b.customer_id
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS active_links,
      max(i.billing_period_end) AS max_period_end
    FROM public.invoice_bookings ib
    JOIN public.invoices i ON i.id = ib.invoice_id
    WHERE ib.booking_id = b.id
      AND i.status <> 'cancelled'
      AND i.cfdi_status <> 'cancelled'
  ) history ON true
  WHERE b.recurring_billing = true
    AND b.status = 'confirmed';
$function$;

REVOKE ALL ON FUNCTION public.get_cash_flow_recurring_bookings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_flow_recurring_bookings() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_credit_note_for_stamping(
  p_credit_note_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_note public.credit_notes%ROWTYPE;
BEGIN
  SELECT * INTO v_note
    FROM public.credit_notes
   WHERE id = p_credit_note_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_note.cfdi_status NOT IN ('pending', 'error')
     OR v_note.cfdi_uuid IS NOT NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.credit_notes
     SET cfdi_status = 'stamping',
         lookup_attempts = 0,
         updated_at = now()
   WHERE id = p_credit_note_id
  RETURNING * INTO v_note;

  RETURN to_jsonb(v_note);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_credit_note_for_stamping(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_credit_note_for_stamping(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.guard_credit_note_stamping_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF OLD.cfdi_status = 'stamping' AND (
    NEW.credit_note_number IS DISTINCT FROM OLD.credit_note_number
    OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.motive IS DISTINCT FROM OLD.motive
    OR NEW.reason_text IS DISTINCT FROM OLD.reason_text
    OR NEW.line_items IS DISTINCT FROM OLD.line_items
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
  ) THEN
    RAISE EXCEPTION 'La nota de crédito está en proceso de timbrado y su contenido fiscal es inmutable.'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_credit_note_stamping_snapshot ON public.credit_notes;
CREATE TRIGGER trg_credit_note_stamping_snapshot
  BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_credit_note_stamping_snapshot();

REVOKE ALL ON FUNCTION public.guard_credit_note_stamping_snapshot()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';