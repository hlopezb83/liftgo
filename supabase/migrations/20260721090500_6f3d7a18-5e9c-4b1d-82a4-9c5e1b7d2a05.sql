-- ============================================================================
-- BL: TOCTOU en enforce_credit_note_max. El trigger leía invoices.total sin
-- bloquear la fila, así dos notas de crédito concurrentes sobre la misma
-- factura podían pasar ambas la validación y exceder el total. Se recrea el
-- trigger con SELECT ... FOR UPDATE (mismo patrón que
-- enforce_payment_within_invoice_total, 20260719052520): el lock de la fila
-- de invoices serializa las NC concurrentes y la segunda ve la suma ya
-- comprometida por la primera.
-- ============================================================================

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

  -- Lock de la fila de la factura para serializar NC concurrentes.
  SELECT total INTO v_invoice_total FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
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
