
-- ============================================================================
-- Sprint 2 · Ola 2.5 (v7.121.0)
-- BL-M3 · Trigger anti sobre-crédito de Notas de Crédito
-- BL-M4 · Endurecer soft-delete de flota + restore RPC
-- BL-M6 · Devolución dañada exige damage_record documentado
-- EC-M4 · Optimistic locking (opt-in) en bookings/invoices/quotes/customers
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- BL-M3: Impedir que la suma de NC (draft + stamped, no cancelled) supere el
-- total de la factura. Se ejecuta antes de INSERT y UPDATE, ignora la NC en
-- curso (por id) y las canceladas. Tolerancia de 1 centavo por redondeo.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_credit_note_max()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_total numeric;
  v_already_credited numeric;
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT total INTO v_invoice_total FROM invoices WHERE id = NEW.invoice_id;
  IF v_invoice_total IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_already_credited
  FROM credit_notes
  WHERE invoice_id = NEW.invoice_id
    AND status <> 'cancelled'
    AND cancellation_status <> 'accepted'
    AND id <> NEW.id;

  IF (v_already_credited + NEW.total) > (v_invoice_total + 0.01) THEN
    RAISE EXCEPTION 'La suma de notas de crédito (% + % = %) excede el total de la factura (%). Cancela o reduce alguna NC existente.',
      v_already_credited, NEW.total, v_already_credited + NEW.total, v_invoice_total
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_notes_max_check ON public.credit_notes;
CREATE TRIGGER trg_credit_notes_max_check
  BEFORE INSERT OR UPDATE OF total, status, cancellation_status, invoice_id
  ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_credit_note_max();

-- ────────────────────────────────────────────────────────────────────────────
-- BL-M4: Endurecer delete_forklift para bloquear también si hay facturas con
-- balance abierto (via v_invoices_with_balance) ligadas a bookings de la
-- unidad. Agregar restore_forklift (solo admin).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_forklift(p_forklift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE forklift_id = p_forklift_id
      AND status IN ('confirmed','in_progress')
  ) THEN
    RAISE EXCEPTION 'No se puede archivar: el montacargas tiene reservas activas';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM v_invoices_with_balance vib
    JOIN invoice_bookings ib ON ib.invoice_id = vib.id
    JOIN bookings b ON b.id = ib.booking_id
    WHERE b.forklift_id = p_forklift_id
      AND vib.balance > 0.01
      AND vib.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'No se puede archivar: existen facturas con saldo pendiente ligadas a este montacargas';
  END IF;

  UPDATE forklifts
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = p_forklift_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montacargas no encontrado o ya archivado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_forklift(p_forklift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: solo administradores pueden restaurar montacargas';
  END IF;

  UPDATE forklifts
     SET deleted_at = NULL,
         deleted_by = NULL,
         updated_at = now()
   WHERE id = p_forklift_id
     AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montacargas no encontrado o ya está activo';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_forklift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_forklift(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- BL-M6: complete_return_inspection ahora exige que si la condición es
-- damaged / needs_repair debe haber costo >0 o notas no vacías. Cuando hay
-- notas sin costo, se crea el damage_record con estimated_cost=0 y severity
-- 'minor' pero queda documentado. Además la unidad va a 'maintenance' en
-- ambos casos para forzar cierre del expediente.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_return_inspection(
  p_booking_id uuid,
  p_forklift_id uuid,
  p_condition text DEFAULT 'good',
  p_damage_notes text DEFAULT NULL,
  p_damage_cost numeric DEFAULT 0,
  p_hours_used numeric DEFAULT NULL,
  p_fuel_level text DEFAULT NULL,
  p_inspected_by text DEFAULT NULL,
  p_inspected_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inspection_id uuid;
  v_old_status text;
  v_new_status text;
  v_customer_id uuid;
  v_is_damaged_condition boolean;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
       OR has_role(auth.uid(), 'administrativo'::app_role)
       OR has_role(auth.uid(), 'dispatcher'::app_role)
       OR has_role(auth.uid(), 'mechanic'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_is_damaged_condition := p_condition IN ('damaged', 'needs_repair');

  -- BL-M6: cerrar el hueco de "damaged sin registro". Se exige costo o notas.
  IF v_is_damaged_condition
     AND COALESCE(p_damage_cost, 0) <= 0
     AND (p_damage_notes IS NULL OR btrim(p_damage_notes) = '') THEN
    RAISE EXCEPTION 'La devolución marcada como % requiere costo estimado (>0) o una descripción del daño.', p_condition
      USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_old_status FROM forklifts WHERE id = p_forklift_id;
  SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id;

  INSERT INTO return_inspections (booking_id, forklift_id, condition, damage_notes, damage_cost, hours_used, fuel_level, inspected_by, inspected_at)
  VALUES (p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost, p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at)
  RETURNING id INTO v_inspection_id;

  UPDATE bookings SET return_status = 'returned', status = 'completed', updated_at = now() WHERE id = p_booking_id;

  IF v_is_damaged_condition THEN
    INSERT INTO damage_records (inspection_id, forklift_id, booking_id, customer_id, description, estimated_cost, status)
    VALUES (v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
            COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
            COALESCE(p_damage_cost, 0), 'reported');
    v_new_status := 'maintenance';
  ELSE
    v_new_status := 'available';
  END IF;

  UPDATE forklifts SET status = v_new_status, updated_at = now() WHERE id = p_forklift_id;

  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_old_status, v_new_status, 'Returned — condition: ' || p_condition);

  RETURN v_inspection_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- EC-M4: Optimistic locking opt-in. Se agrega columna `version` a las 4
-- tablas críticas. El trigger BEFORE UPDATE valida así:
--   • Si el cliente NO envía version (NEW.version = OLD.version): asume no
--     opt-in y solo incrementa version. Retro-compatible.
--   • Si el cliente envía version = OLD.version: coincide, incrementa.
--   • Si envía cualquier otro valor: stale_write (P0001).
-- Como diferenciamos "no enviado" vs "enviado igual" es imposible sin
-- información adicional, la convención es: los mutation hooks que hacen
-- opt-in envían version = OLD.version - 0? No — mejor: siempre bump y solo
-- error si el valor recibido es MENOR al actual (implica lectura obsoleta).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bookings  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.invoices  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.quotes    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_version_optimistic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Retro-compatible: si NEW.version viene igual al OLD (caso típico cuando
  -- el cliente no toca el campo), simplemente se incrementa.
  -- Opt-in: si el cliente lee version=N y envía NEW.version=N, coincide y
  -- se incrementa. Si otra transacción ya bumpeó a N+1 antes, ese cliente
  -- todavía envía N pero OLD.version ya es N+1 → stale.
  IF NEW.version < OLD.version THEN
    RAISE EXCEPTION 'stale_write: registro modificado por otro proceso (v% < v%). Recarga los datos.',
      NEW.version, OLD.version
      USING ERRCODE = 'P0001';
  END IF;

  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_version  ON public.bookings;
DROP TRIGGER IF EXISTS trg_invoices_version  ON public.invoices;
DROP TRIGGER IF EXISTS trg_quotes_version    ON public.quotes;
DROP TRIGGER IF EXISTS trg_customers_version ON public.customers;

CREATE TRIGGER trg_bookings_version  BEFORE UPDATE ON public.bookings  FOR EACH ROW EXECUTE FUNCTION public.bump_version_optimistic();
CREATE TRIGGER trg_invoices_version  BEFORE UPDATE ON public.invoices  FOR EACH ROW EXECUTE FUNCTION public.bump_version_optimistic();
CREATE TRIGGER trg_quotes_version    BEFORE UPDATE ON public.quotes    FOR EACH ROW EXECUTE FUNCTION public.bump_version_optimistic();
CREATE TRIGGER trg_customers_version BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.bump_version_optimistic();
