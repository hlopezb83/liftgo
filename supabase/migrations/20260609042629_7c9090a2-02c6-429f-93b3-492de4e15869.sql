
-- ============================================================
-- PR 5: Recepción de Complementos de Pago (REP) de proveedores
-- ============================================================

-- 1) Columnas nuevas en supplier_payments
ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS rep_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rep_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS rep_cfdi_uuid uuid,
  ADD COLUMN IF NOT EXISTS rep_xml_url text,
  ADD COLUMN IF NOT EXISTS rep_pdf_url text,
  ADD COLUMN IF NOT EXISTS rep_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS rep_notes text,
  ADD COLUMN IF NOT EXISTS rep_uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.supplier_payments
  DROP CONSTRAINT IF EXISTS supplier_payments_rep_status_check;
ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_rep_status_check
  CHECK (rep_status IN ('not_required','pending','received','rejected'));

CREATE INDEX IF NOT EXISTS supplier_payments_rep_status_idx
  ON public.supplier_payments(rep_status)
  WHERE rep_status = 'pending';

-- 2) Trigger BEFORE INSERT: clasifica REP según factura
CREATE OR REPLACE FUNCTION public.set_supplier_payment_rep_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text;
BEGIN
  SELECT payment_method_sat INTO v_method
  FROM public.supplier_bills
  WHERE id = NEW.bill_id;

  IF v_method = 'PPD' THEN
    NEW.rep_required := true;
    IF NEW.rep_status IS NULL OR NEW.rep_status = 'not_required' THEN
      NEW.rep_status := 'pending';
    END IF;
  ELSE
    NEW.rep_required := false;
    NEW.rep_status := 'not_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sp_set_rep_required ON public.supplier_payments;
CREATE TRIGGER trg_sp_set_rep_required
  BEFORE INSERT ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_payment_rep_required();

-- 3) RPCs para gestión del REP
CREATE OR REPLACE FUNCTION public.mark_supplier_rep_rejected(
  p_payment_id uuid,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'administrativo')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Las notas de rechazo son obligatorias';
  END IF;

  UPDATE public.supplier_payments
     SET rep_status = 'rejected',
         rep_notes = p_notes
   WHERE id = p_payment_id
     AND rep_status IN ('pending','received');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado o REP no rechazable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_supplier_rep_pending(
  p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'administrativo')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.supplier_payments
     SET rep_status = 'pending',
         rep_cfdi_uuid = NULL,
         rep_xml_url = NULL,
         rep_pdf_url = NULL,
         rep_received_at = NULL,
         rep_notes = NULL,
         rep_uploaded_by = NULL
   WHERE id = p_payment_id
     AND rep_required = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado o no requiere REP';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_supplier_rep_rejected(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.reset_supplier_rep_pending(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_supplier_rep_rejected(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_supplier_rep_pending(uuid) TO authenticated;

-- 4) Backfill: pagos existentes en facturas PPD pasan a 'pending'
UPDATE public.supplier_payments sp
   SET rep_required = true,
       rep_status = 'pending'
  FROM public.supplier_bills sb
 WHERE sp.bill_id = sb.id
   AND sb.payment_method_sat = 'PPD'
   AND sp.rep_status = 'not_required';
