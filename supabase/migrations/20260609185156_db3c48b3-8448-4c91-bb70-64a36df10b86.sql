
-- 1) Add tracking column to supplier_bills
ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS payment_in_progress_at timestamptz;

-- Clear flag when a payment is registered (bill no longer "in progress")
-- (Handled via trigger on supplier_payments insert)
CREATE OR REPLACE FUNCTION public.clear_bill_payment_in_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.supplier_bills
     SET payment_in_progress_at = NULL
   WHERE id = NEW.bill_id
     AND payment_in_progress_at IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_bill_payment_in_progress ON public.supplier_payments;
CREATE TRIGGER trg_clear_bill_payment_in_progress
AFTER INSERT ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.clear_bill_payment_in_progress();

-- 2) supplier_payment_batches
CREATE TABLE IF NOT EXISTS public.supplier_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  exported_at timestamptz NOT NULL DEFAULT now(),
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  bill_count integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MXN',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payment_batches TO authenticated;
GRANT ALL ON public.supplier_payment_batches TO service_role;
ALTER TABLE public.supplier_payment_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Administrativo manage payment batches"
ON public.supplier_payment_batches FOR ALL
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role));

-- 3) supplier_payment_batch_items (snapshot)
CREATE TABLE IF NOT EXISTS public.supplier_payment_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.supplier_payment_batches(id) ON DELETE CASCADE,
  bill_id uuid REFERENCES public.supplier_bills(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  supplier_rfc text,
  bank_name text,
  clabe text,
  account_number text,
  account_holder text,
  bill_number text NOT NULL,
  due_date date,
  reference text NOT NULL,
  concept text,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payment_batch_items TO authenticated;
GRANT ALL ON public.supplier_payment_batch_items TO service_role;
ALTER TABLE public.supplier_payment_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Administrativo manage payment batch items"
ON public.supplier_payment_batch_items FOR ALL
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role));

CREATE INDEX IF NOT EXISTS idx_spbi_batch ON public.supplier_payment_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_spbi_bill ON public.supplier_payment_batch_items(bill_id);

-- 4) RPC to create a batch atomically
CREATE OR REPLACE FUNCTION public.create_supplier_payment_batch(
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_total numeric(14,2) := 0;
  v_count integer := 0;
  v_user uuid := auth.uid();
  v_item jsonb;
  v_bill_id uuid;
  v_amount numeric;
  v_bill record;
  v_supplier record;
  v_bank record;
  v_reference text;
BEGIN
  IF NOT (public.has_role(v_user,'admin'::app_role) OR public.has_role(v_user,'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado para crear lotes de pago';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos una factura';
  END IF;

  INSERT INTO public.supplier_payment_batches(exported_by, total_amount, bill_count, notes)
  VALUES (v_user, 0, 0, p_notes)
  RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bill_id := (v_item->>'bill_id')::uuid;
    v_amount := (v_item->>'amount')::numeric;

    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Monto inválido para la factura %', v_bill_id;
    END IF;

    SELECT * INTO v_bill FROM public.supplier_bills WHERE id = v_bill_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Factura % no encontrada', v_bill_id;
    END IF;

    IF v_bill.approval_status <> 'approved' THEN
      RAISE EXCEPTION 'La factura % no está aprobada', v_bill.bill_number;
    END IF;

    IF v_bill.balance < v_amount - 0.01 THEN
      RAISE EXCEPTION 'Monto excede el saldo de la factura %', v_bill.bill_number;
    END IF;

    SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_bill.supplier_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proveedor de la factura % no encontrado', v_bill.bill_number;
    END IF;

    SELECT * INTO v_bank
      FROM public.supplier_bank_accounts
     WHERE supplier_id = v_supplier.id
     ORDER BY is_primary DESC, created_at ASC
     LIMIT 1;

    IF NOT FOUND OR v_bank.clabe IS NULL OR length(trim(v_bank.clabe)) <> 18 THEN
      RAISE EXCEPTION 'Proveedor % no tiene cuenta bancaria con CLABE válida', v_supplier.name;
    END IF;

    v_reference := COALESCE(NULLIF(v_item->>'reference',''), 'LIFTGO-' || v_bill.bill_number);

    INSERT INTO public.supplier_payment_batch_items(
      batch_id, bill_id, supplier_id, supplier_name, supplier_rfc,
      bank_name, clabe, account_number, account_holder,
      bill_number, due_date, reference, concept, amount, currency
    ) VALUES (
      v_batch_id, v_bill.id, v_supplier.id, v_supplier.name, v_supplier.rfc,
      v_bank.bank_name, v_bank.clabe, v_bank.account_number, v_bank.account_holder,
      v_bill.bill_number, v_bill.due_date, v_reference,
      COALESCE(v_bill.description, v_bill.bill_number),
      v_amount, v_bill.currency
    );

    UPDATE public.supplier_bills
       SET payment_in_progress_at = now()
     WHERE id = v_bill.id;

    v_total := v_total + v_amount;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.supplier_payment_batches
     SET total_amount = v_total, bill_count = v_count
   WHERE id = v_batch_id;

  RETURN v_batch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_supplier_payment_batch(jsonb, text) TO authenticated;
