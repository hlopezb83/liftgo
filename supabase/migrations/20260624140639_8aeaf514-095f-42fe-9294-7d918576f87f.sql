
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.supplier_bill_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.credit_note_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.contract_number_seq;

GRANT USAGE ON SEQUENCE public.invoice_number_seq, public.supplier_bill_number_seq, public.credit_note_number_seq, public.contract_number_seq TO authenticated, service_role;

DO $$
DECLARE
  v_max_inv int; v_min_next int; v_max_sup int; v_max_nc int; v_max_ctr int; v_seed int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number,'[^0-9]','','g'),'')::int), 0) INTO v_max_inv
    FROM public.invoices WHERE COALESCE(is_e2e,false)=false AND invoice_number NOT LIKE 'E2E-%';
  SELECT COALESCE((SELECT min_next_number FROM public.invoice_number_settings LIMIT 1), 1) INTO v_min_next;
  v_seed := GREATEST(v_max_inv, v_min_next - 1, 0);
  IF v_seed > 0 THEN PERFORM setval('public.invoice_number_seq', v_seed, true);
  ELSE PERFORM setval('public.invoice_number_seq', 1, false); END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(bill_number,'[^0-9]','','g'),'')::int), 0) INTO v_max_sup FROM public.supplier_bills;
  IF v_max_sup > 0 THEN PERFORM setval('public.supplier_bill_number_seq', v_max_sup, true);
  ELSE PERFORM setval('public.supplier_bill_number_seq', 1, false); END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(credit_note_number,'[^0-9]','','g'),'')::int), 0) INTO v_max_nc FROM public.credit_notes;
  IF v_max_nc > 0 THEN PERFORM setval('public.credit_note_number_seq', v_max_nc, true);
  ELSE PERFORM setval('public.credit_note_number_seq', 1, false); END IF;

  SELECT COALESCE(MAX(NULLIF(substring(contract_number from 5),'')::int), 0) INTO v_max_ctr FROM public.contracts;
  IF v_max_ctr > 0 THEN PERFORM setval('public.contract_number_seq', v_max_ctr, true);
  ELSE PERFORM setval('public.contract_number_seq', 1, false); END IF;
END$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'FAC-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
$$;
CREATE OR REPLACE FUNCTION public.next_supplier_bill_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'CXP-' || lpad(nextval('public.supplier_bill_number_seq')::text, 4, '0');
$$;
CREATE OR REPLACE FUNCTION public.next_credit_note_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'NC-' || lpad(nextval('public.credit_note_number_seq')::text, 4, '0');
$$;
CREATE OR REPLACE FUNCTION public.next_contract_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'CTR-' || lpad(nextval('public.contract_number_seq')::text, 4, '0');
$$;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_unique_idx
  ON public.invoices (invoice_number) WHERE COALESCE(is_e2e, false) = false;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_contract_number_unique_idx
  ON public.contracts (contract_number);

-- Índice de consulta (no-único). Se promoverá a UNIQUE cuando se limpien los duplicados históricos.
CREATE INDEX IF NOT EXISTS invoices_recurring_period_idx
  ON public.invoices (customer_id, billing_period_start, billing_period_end)
  WHERE billing_period_start IS NOT NULL AND billing_period_end IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_supplier_payment_batch(
  p_bill_ids uuid[], p_scheduled_for date, p_payment_method text, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch_id uuid; v_bill_id uuid; v_bill public.supplier_bills%ROWTYPE; v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT (public.has_role(v_user_id, 'admin'::app_role) OR public.has_role(v_user_id, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_bill_ids IS NULL OR array_length(p_bill_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_bill_ids cannot be empty';
  END IF;

  INSERT INTO public.supplier_payment_batches (scheduled_for, payment_method, notes, created_by)
  VALUES (p_scheduled_for, p_payment_method, p_notes, v_user_id) RETURNING id INTO v_batch_id;

  FOREACH v_bill_id IN ARRAY p_bill_ids LOOP
    SELECT * INTO v_bill FROM public.supplier_bills WHERE id = v_bill_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'bill % not found', v_bill_id; END IF;
    IF v_bill.approval_status <> 'approved' THEN RAISE EXCEPTION 'bill % no está aprobada', v_bill.bill_number; END IF;
    IF v_bill.balance <= 0 THEN RAISE EXCEPTION 'bill % no tiene saldo pendiente', v_bill.bill_number; END IF;
    IF v_bill.payment_in_progress_at IS NOT NULL THEN
      RAISE EXCEPTION 'bill % ya está en otro lote de pago en proceso', v_bill.bill_number;
    END IF;

    UPDATE public.supplier_bills SET payment_in_progress_at = now() WHERE id = v_bill.id;

    INSERT INTO public.supplier_payment_batch_items (
      batch_id, bill_id, supplier_id, bill_number, supplier_name,
      bank_name, clabe, account_number, amount, currency
    )
    SELECT v_batch_id, v_bill.id, v_bill.supplier_id, v_bill.bill_number, s.name,
           sba.bank_name, sba.clabe, sba.account_number, v_bill.balance, v_bill.currency
      FROM public.suppliers s
      LEFT JOIN public.supplier_bank_accounts sba ON sba.supplier_id = s.id AND sba.is_primary = true
     WHERE s.id = v_bill.supplier_id;
  END LOOP;

  RETURN v_batch_id;
END;
$$;
