
-- =========================================================================
-- PHASE 1: Accounts Payable backend
-- =========================================================================

-- Status enum
DO $$ BEGIN
  CREATE TYPE public.supplier_bill_status AS ENUM
    ('draft','pending','partial','paid','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- supplier_bills ----------
CREATE TABLE public.supplier_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number     TEXT NOT NULL UNIQUE,
  supplier_id     UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  cfdi_uuid       TEXT,
  folio           TEXT,
  serie           TEXT,
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  retention_isr   NUMERIC(14,2) NOT NULL DEFAULT 0,
  retention_iva   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total           NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  currency        TEXT NOT NULL DEFAULT 'MXN' CHECK (currency IN ('MXN','USD')),
  exchange_rate   NUMERIC(14,6) NOT NULL DEFAULT 1,
  payment_method_sat TEXT CHECK (payment_method_sat IN ('PUE','PPD') OR payment_method_sat IS NULL),
  payment_form_sat   TEXT,
  cfdi_use        TEXT,
  category        public.expense_category,
  description     TEXT,
  status          public.supplier_bill_status NOT NULL DEFAULT 'pending',
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
  xml_url         TEXT,
  pdf_url         TEXT,
  notes           TEXT,
  legacy_expense_id UUID,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX supplier_bills_cfdi_uuid_uniq
  ON public.supplier_bills (cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;
CREATE INDEX supplier_bills_supplier_idx ON public.supplier_bills (supplier_id);
CREATE INDEX supplier_bills_status_idx ON public.supplier_bills (status);
CREATE INDEX supplier_bills_due_idx ON public.supplier_bills (due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_bills TO authenticated;
GRANT ALL ON public.supplier_bills TO service_role;
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bills: admin/administrativo full"
  ON public.supplier_bills FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo'));

CREATE POLICY "Bills: auditor read"
  ON public.supplier_bills FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'auditor'));

CREATE TRIGGER update_supplier_bills_updated_at
  BEFORE UPDATE ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- supplier_payments ----------
CREATE TABLE public.supplier_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id         UUID NOT NULL REFERENCES public.supplier_bills(id) ON DELETE CASCADE,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT,
  bank_account    TEXT,
  reference       TEXT,
  receipt_url     TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX supplier_payments_bill_idx ON public.supplier_payments (bill_id);
CREATE INDEX supplier_payments_date_idx ON public.supplier_payments (payment_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SupPay: admin/administrativo full"
  ON public.supplier_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo'));

CREATE POLICY "SupPay: auditor read"
  ON public.supplier_payments FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'auditor'));

-- ---------- Numbering: next_supplier_bill_number ----------
CREATE OR REPLACE FUNCTION public.next_supplier_bill_number()
RETURNS TEXT
LANGUAGE sql
SET search_path = public
AS $$
  SELECT 'CXP-' || lpad(
    (coalesce(max(nullif(regexp_replace(bill_number,'[^0-9]','','g'),'')::int), 0) + 1)::text,
    4, '0')
  FROM public.supplier_bills;
$$;

-- Auto-assign bill_number if blank
CREATE OR REPLACE FUNCTION public.set_supplier_bill_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.bill_number IS NULL OR length(trim(NEW.bill_number)) = 0 THEN
    NEW.bill_number := public.next_supplier_bill_number();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_set_supplier_bill_number
  BEFORE INSERT ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_bill_number();

-- ---------- Recalc balance/status ----------
CREATE OR REPLACE FUNCTION public.recalc_supplier_bill(p_bill_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total   NUMERIC(14,2);
  v_paid    NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_due     DATE;
  v_current public.supplier_bill_status;
BEGIN
  SELECT total, status, due_date INTO v_total, v_current, v_due
    FROM public.supplier_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- draft/cancelled never auto-change
  IF v_current IN ('draft','cancelled') THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.supplier_payments WHERE bill_id = p_bill_id;

  IF v_paid >= v_total THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < CURRENT_DATE THEN
    v_status := 'overdue';
  ELSE
    v_status := 'pending';
  END IF;

  UPDATE public.supplier_bills
    SET balance = GREATEST(v_total - v_paid, 0),
        status  = v_status,
        updated_at = now()
    WHERE id = p_bill_id;
END $$;

-- Trigger: payment changes
CREATE OR REPLACE FUNCTION public.trg_supplier_payment_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_supplier_bill(OLD.bill_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_supplier_bill(NEW.bill_id);
    IF TG_OP = 'UPDATE' AND OLD.bill_id <> NEW.bill_id THEN
      PERFORM public.recalc_supplier_bill(OLD.bill_id);
    END IF;
    RETURN NEW;
  END IF;
END $$;

CREATE TRIGGER trg_sp_recalc_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_payment_recalc();

-- Trigger: bill insert/update initial balance
CREATE OR REPLACE FUNCTION public.trg_supplier_bill_init_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.balance := COALESCE(NEW.total,0);
    IF NEW.status NOT IN ('draft','cancelled') THEN
      IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
        NEW.status := 'overdue';
      ELSE
        NEW.status := 'pending';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sb_init_balance
  BEFORE INSERT ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_bill_init_balance();

-- ---------- RPC: register_supplier_payment ----------
CREATE OR REPLACE FUNCTION public.register_supplier_payment(
  p_bill_id       UUID,
  p_amount        NUMERIC,
  p_payment_date  DATE DEFAULT CURRENT_DATE,
  p_payment_method TEXT DEFAULT NULL,
  p_bank_account  TEXT DEFAULT NULL,
  p_reference     TEXT DEFAULT NULL,
  p_receipt_url   TEXT DEFAULT NULL,
  p_notes         TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_id      UUID;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status INTO v_balance, v_status
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF p_amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by
  ) VALUES (
    p_bill_id, p_payment_date, p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.register_supplier_payment(
  UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ---------- Data migration: operating_expenses -> supplier_bills (+ payments) ----------
INSERT INTO public.supplier_bills (
  bill_number, supplier_id, cfdi_uuid, issue_date, due_date,
  subtotal, tax_amount, total, currency, exchange_rate,
  category, description, status, balance,
  legacy_expense_id, created_at, updated_at
)
SELECT
  'CXP-' || lpad((row_number() OVER (ORDER BY oe.created_at))::text, 4, '0'),
  oe.supplier_id,
  oe.cfdi_uuid,
  oe.expense_date,
  oe.expense_date,
  oe.amount, 0, oe.amount, 'MXN', 1,
  oe.category, oe.description,
  'paid', 0,
  oe.id, oe.created_at, oe.updated_at
FROM public.operating_expenses oe;

INSERT INTO public.supplier_payments (
  bill_id, payment_date, amount, payment_method, notes, created_at
)
SELECT sb.id, sb.issue_date, sb.total, 'migrado',
       'Migrado automáticamente desde operating_expenses', sb.created_at
FROM public.supplier_bills sb
WHERE sb.legacy_expense_id IS NOT NULL;
