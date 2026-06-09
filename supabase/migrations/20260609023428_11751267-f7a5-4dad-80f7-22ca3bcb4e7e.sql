
-- 1. Threshold column on company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS cxp_approval_threshold_mxn NUMERIC(14,2) NOT NULL DEFAULT 10000;

-- 2. Approval status enum
DO $$ BEGIN
  CREATE TYPE public.supplier_bill_approval_status AS ENUM ('not_required','pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. New columns on supplier_bills
ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS approval_status public.supplier_bill_approval_status NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_supplier_bills_approval_status
  ON public.supplier_bills(approval_status)
  WHERE approval_status IN ('pending','rejected');

-- 4. Approvals log table
CREATE TABLE IF NOT EXISTS public.supplier_bill_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.supplier_bills(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('requested','approved','rejected','reapproval_requested')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_bill_approvals_bill ON public.supplier_bill_approvals(bill_id, created_at DESC);

GRANT SELECT, INSERT ON public.supplier_bill_approvals TO authenticated;
GRANT ALL ON public.supplier_bill_approvals TO service_role;

ALTER TABLE public.supplier_bill_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cxp_approvals_select" ON public.supplier_bill_approvals
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'administrativo'::app_role)
    OR public.has_role(auth.uid(),'auditor'::app_role)
  );

CREATE POLICY "cxp_approvals_insert_admin" ON public.supplier_bill_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'administrativo'::app_role)
  );

-- 5. Trigger: set approval_status on INSERT based on threshold
CREATE OR REPLACE FUNCTION public.set_supplier_bill_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_threshold NUMERIC(14,2);
  v_total_mxn NUMERIC(14,2);
BEGIN
  -- Only auto-classify on INSERT; updates do not reclassify.
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Skip if caller explicitly set approval_status != default
  IF NEW.approval_status IS DISTINCT FROM 'not_required' THEN
    RETURN NEW;
  END IF;

  SELECT cxp_approval_threshold_mxn INTO v_threshold
    FROM public.company_settings ORDER BY created_at ASC LIMIT 1;
  v_threshold := COALESCE(v_threshold, 10000);

  v_total_mxn := CASE
    WHEN NEW.currency = 'MXN' THEN COALESCE(NEW.total,0)
    ELSE COALESCE(NEW.total,0) * COALESCE(NEW.exchange_rate,1)
  END;

  IF v_total_mxn > v_threshold THEN
    NEW.approval_status := 'pending';
  ELSE
    NEW.approval_status := 'not_required';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_supplier_bill_approval_status ON public.supplier_bills;
CREATE TRIGGER trg_set_supplier_bill_approval_status
  BEFORE INSERT ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_bill_approval_status();

-- Log initial 'requested' when approval_status='pending' on insert
CREATE OR REPLACE FUNCTION public.log_supplier_bill_approval_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.approval_status = 'pending' THEN
    INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (NEW.id, auth.uid(), 'requested',
      'Auto-clasificada por superar el umbral de aprobación');

    INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
    VALUES ('supplier_bill.approval_requested','supplier_bill', NEW.id,
      'Factura requiere aprobación',
      'Factura ' || COALESCE(NEW.bill_number,'') || ' por $' || NEW.total::text || ' ' || NEW.currency,
      auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_supplier_bill_approval_requested ON public.supplier_bills;
CREATE TRIGGER trg_log_supplier_bill_approval_requested
  AFTER INSERT ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.log_supplier_bill_approval_requested();

-- 6. RPCs
CREATE OR REPLACE FUNCTION public.approve_supplier_bill(p_bill_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden aprobar facturas';
  END IF;

  SELECT approval_status, bill_number INTO v_status, v_number
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'La factura no está pendiente de aprobación (estado: %)', v_status;
  END IF;

  UPDATE public.supplier_bills
    SET approval_status = 'approved',
        approved_by = auth.uid(),
        approved_at = now(),
        approval_notes = p_notes,
        updated_at = now()
    WHERE id = p_bill_id;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (p_bill_id, auth.uid(), 'approved', p_notes);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
  VALUES ('supplier_bill.approved','supplier_bill', p_bill_id,
    'Factura aprobada',
    'Factura ' || COALESCE(v_number,'') || ' aprobada para pago',
    auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.reject_supplier_bill(p_bill_id UUID, p_notes TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden rechazar facturas';
  END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Las notas de rechazo son obligatorias';
  END IF;

  SELECT approval_status, bill_number INTO v_status, v_number
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'La factura no está pendiente de aprobación (estado: %)', v_status;
  END IF;

  UPDATE public.supplier_bills
    SET approval_status = 'rejected',
        approved_by = auth.uid(),
        approved_at = now(),
        approval_notes = p_notes,
        updated_at = now()
    WHERE id = p_bill_id;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (p_bill_id, auth.uid(), 'rejected', p_notes);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
  VALUES ('supplier_bill.rejected','supplier_bill', p_bill_id,
    'Factura rechazada',
    'Factura ' || COALESCE(v_number,'') || ' rechazada: ' || p_notes,
    auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.request_bill_reapproval(p_bill_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.supplier_bill_approval_status;
  v_number TEXT;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No tienes permisos para solicitar reaprobación';
  END IF;

  SELECT approval_status, bill_number INTO v_status, v_number
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'Solo facturas rechazadas pueden re-solicitar aprobación';
  END IF;

  UPDATE public.supplier_bills
    SET approval_status = 'pending',
        approved_by = NULL,
        approved_at = NULL,
        approval_notes = NULL,
        updated_at = now()
    WHERE id = p_bill_id;

  INSERT INTO public.supplier_bill_approvals(bill_id, actor_id, action, notes)
    VALUES (p_bill_id, auth.uid(), 'reapproval_requested', p_notes);

  INSERT INTO public.activity_feed(event_type, entity_type, entity_id, title, description, actor_id)
  VALUES ('supplier_bill.reapproval_requested','supplier_bill', p_bill_id,
    'Reaprobación solicitada',
    'Factura ' || COALESCE(v_number,'') || ' enviada nuevamente a aprobación',
    auth.uid());
END $$;

-- 7. Block payment when approval pending/rejected
CREATE OR REPLACE FUNCTION public.register_supplier_payment(
  p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE,
  p_payment_method text DEFAULT NULL, p_bank_account text DEFAULT NULL,
  p_reference text DEFAULT NULL, p_receipt_url text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status, approval_status INTO v_balance, v_status, v_approval
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval = 'pending' THEN
    RAISE EXCEPTION 'La factura requiere aprobación antes de pagar';
  END IF;
  IF v_approval = 'rejected' THEN
    RAISE EXCEPTION 'La factura fue rechazada y no puede pagarse';
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
