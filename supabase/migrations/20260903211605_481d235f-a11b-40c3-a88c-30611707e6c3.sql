-- ============================================================
-- R-FIX41 (1/3): Entregas — completed_at con reloj del servidor
-- Prospectivo: NO modifica filas históricas (ENT-0027 conserva su
-- completed_at NULL; ENT-0028/0029/0031/0032/0033 quedan intactas).
-- ============================================================

-- Justificación mínima y nullable cuando se completa sin operador ni firma
-- (compatibilidad histórica: todas las filas existentes quedan NULL).
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS completed_no_evidence_reason text;

CREATE OR REPLACE FUNCTION public.set_delivery_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Seeds E2E y suites SQL corren como postgres/service_role y pueden fijar
  -- timestamps históricos explícitos; la app (authenticated) nunca.
  v_trusted boolean := current_user IN ('postgres', 'service_role');
BEGIN
  -- R4-19: no interferir con la reversión administrativa de bitácora.
  IF current_setting('app.audit_revert', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed' THEN
      -- Transición a completed: sellar con reloj del servidor (mismo tiempo
      -- de transacción que created_at en INSERT ⇒ completed_at >= created_at).
      IF v_trusted THEN
        NEW.completed_at := COALESCE(NEW.completed_at, now());
      ELSE
        NEW.completed_at := now();
      END IF;
    ELSIF NOT v_trusted THEN
      -- Ya estaba completada: completed_at es inmutable para la app.
      -- Preserva el NULL histórico (ENT-0027) sin backfill ni edición.
      NEW.completed_at := OLD.completed_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_delivery_completed_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_delivery_completed_at ON public.deliveries;
CREATE TRIGGER trg_set_delivery_completed_at
  BEFORE INSERT OR UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_delivery_completed_at();

-- ============================================================
-- R-FIX41 (2/3): Facturas agrupadas — sincronización atómica del
-- pivote invoice_bookings en UNA transacción, con idempotencia por
-- reserva + período (misma regla de duplicado que create_recurring_invoice:
-- igualdad exacta de billing_period_start/end en facturas no canceladas).
-- SECURITY INVOKER: la RLS existente de invoice_bookings/invoices aplica.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_invoice_bookings(
  p_invoice_id uuid,
  p_booking_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
  v_dup_booking text;
  v_dup_invoice text;
  v_expected integer := COALESCE(array_length(p_booking_ids, 1), 0);
  v_inserted integer := 0;
BEGIN
  SELECT i.billing_period_start, i.billing_period_end
    INTO v_start, v_end
  FROM public.invoices i
  WHERE i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada o sin permisos para modificarla.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotencia reserva + período: otra factura NO cancelada que cubra la
  -- misma reserva (vía pivote o vía booking_id legado) con el MISMO período.
  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    SELECT b.booking_number, i.invoice_number
      INTO v_dup_booking, v_dup_invoice
    FROM unnest(p_booking_ids) AS nb(booking_id)
    JOIN public.invoices i
      ON i.id <> p_invoice_id
     AND i.status <> 'cancelled'
     AND i.billing_period_start = v_start
     AND i.billing_period_end = v_end
     AND (
       i.booking_id = nb.booking_id
       OR EXISTS (
         SELECT 1 FROM public.invoice_bookings ib
         WHERE ib.invoice_id = i.id AND ib.booking_id = nb.booking_id
       )
     )
    JOIN public.bookings b ON b.id = nb.booking_id
    LIMIT 1;
    IF v_dup_booking IS NOT NULL THEN
      RAISE EXCEPTION 'La reserva % ya está facturada en % para el período % – %. Ajusta el período o cancela la factura anterior.',
        v_dup_booking, v_dup_invoice, v_start, v_end
        USING ERRCODE = '23505';
    END IF;
  END IF;

  DELETE FROM public.invoice_bookings WHERE invoice_id = p_invoice_id;

  IF v_expected > 0 THEN
    INSERT INTO public.invoice_bookings (invoice_id, booking_id, line_index)
    SELECT p_invoice_id, nb.booking_id, (nb.ord - 1)::integer
    FROM unnest(p_booking_ids) WITH ORDINALITY AS nb(booking_id, ord);
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_expected THEN
      RAISE EXCEPTION 'Sincronizar reservas: se esperaban % filas, se insertaron %.',
        v_expected, v_inserted
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_invoice_bookings(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_invoice_bookings(uuid, uuid[]) TO authenticated, service_role;

-- ============================================================
-- R-FIX41 (3/3): sin cambios de datos. FAC-0113, ENT-0027 y las cinco
-- entregas con completed_at < created_at permanecen intactas.
-- ============================================================