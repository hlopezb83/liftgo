
-- ============================================================
-- BL-21: Trigger que recalcula balance cuando cambia total
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_supplier_bill_balance_on_total_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paid numeric(14,2);
BEGIN
  IF NEW.total IS DISTINCT FROM OLD.total THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.supplier_payments WHERE bill_id = NEW.id;
    NEW.balance := GREATEST(NEW.total - v_paid, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_bill_recalc_on_total ON public.supplier_bills;
CREATE TRIGGER trg_supplier_bill_recalc_on_total
BEFORE UPDATE OF total ON public.supplier_bills
FOR EACH ROW EXECUTE FUNCTION public.recalc_supplier_bill_balance_on_total_change();

-- ============================================================
-- BL-22: FK de supplier_payments a supplier_bills -> ON DELETE RESTRICT
-- ============================================================
ALTER TABLE public.supplier_payments
  DROP CONSTRAINT IF EXISTS supplier_payments_bill_id_fkey;
ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_bill_id_fkey
  FOREIGN KEY (bill_id) REFERENCES public.supplier_bills(id) ON DELETE RESTRICT;

-- ============================================================
-- BL-25/26: RPC atómico para aprobar/rechazar payment intents del portal
-- ============================================================
ALTER TABLE public.customer_payment_intents
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.approve_payment_intent(
  p_intent_id uuid,
  p_payment_form_sat text DEFAULT '03',
  p_review_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_intent public.customer_payment_intents%ROWTYPE;
  v_payment_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Claim atómico: sólo procede si sigue en pending_review.
  UPDATE public.customer_payment_intents
     SET status = 'approved'::payment_intent_status,
         review_notes = p_review_notes,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   WHERE id = p_intent_id
     AND status = 'pending_review'::payment_intent_status
   RETURNING * INTO v_intent;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'intent_not_pending' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.payments(
    invoice_id, amount, payment_date, payment_method, payment_form_sat,
    reference_number, notes
  ) VALUES (
    v_intent.invoice_id, v_intent.amount, v_intent.transfer_date,
    'transfer', COALESCE(p_payment_form_sat, '03'),
    v_intent.tracking_key,
    'Aprobado desde portal (intent ' || v_intent.id::text || ')'
  ) RETURNING id INTO v_payment_id;

  UPDATE public.customer_payment_intents
     SET payment_id = v_payment_id
   WHERE id = p_intent_id;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_payment_intent(
  p_intent_id uuid,
  p_review_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.customer_payment_intents
     SET status = 'rejected'::payment_intent_status,
         review_notes = p_review_notes,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   WHERE id = p_intent_id
     AND status = 'pending_review'::payment_intent_status
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'intent_not_pending' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payment_intent(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_payment_intent(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payment_intent(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payment_intent(uuid, text) TO authenticated;
