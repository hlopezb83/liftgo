
-- 1. Bank accounts: cobranza fields
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS clabe TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS account_holder TEXT,
  ADD COLUMN IF NOT EXISTS is_default_collection BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_one_default_collection
  ON public.bank_accounts ((is_default_collection))
  WHERE is_default_collection = true;

-- 2. Quotes acceptance fields
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_ip TEXT,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Allow customers to read own quotes
DROP POLICY IF EXISTS "Customers read own quotes" ON public.quotes;
CREATE POLICY "Customers read own quotes"
ON public.quotes FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'customer'::app_role)
  AND customer_id = public.get_customer_id_for_user(auth.uid())
);

-- 3. customer_payment_intents
DO $$ BEGIN
  CREATE TYPE public.payment_intent_status AS ENUM ('pending_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.customer_payment_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  transfer_date DATE NOT NULL,
  sender_bank TEXT,
  sender_last4 TEXT,
  tracking_key TEXT,
  proof_url TEXT,
  status public.payment_intent_status NOT NULL DEFAULT 'pending_review',
  review_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cpi_invoice_idx ON public.customer_payment_intents(invoice_id);
CREATE INDEX IF NOT EXISTS cpi_customer_idx ON public.customer_payment_intents(customer_id);
CREATE INDEX IF NOT EXISTS cpi_status_idx ON public.customer_payment_intents(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payment_intents TO authenticated;
GRANT ALL ON public.customer_payment_intents TO service_role;

ALTER TABLE public.customer_payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Administrativo full access payment intents"
ON public.customer_payment_intents FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'administrativo'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'administrativo'));

CREATE POLICY "Customers read own payment intents"
ON public.customer_payment_intents FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'customer'::app_role)
  AND customer_id = public.get_customer_id_for_user(auth.uid())
);

CREATE POLICY "Customers create own payment intents"
ON public.customer_payment_intents FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'customer'::app_role)
  AND customer_id = public.get_customer_id_for_user(auth.uid())
  AND status = 'pending_review'
);

CREATE TRIGGER trg_cpi_updated_at
BEFORE UPDATE ON public.customer_payment_intents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RPCs for portal quote actions
CREATE OR REPLACE FUNCTION public.accept_quote_from_portal(p_quote_id UUID, p_ip TEXT DEFAULT NULL)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer UUID;
  v_quote public.quotes;
BEGIN
  v_customer := public.get_customer_id_for_user(auth.uid());
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_quote.customer_id <> v_customer THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_quote.status <> 'sent' THEN RAISE EXCEPTION 'Cotización no disponible para aceptar'; END IF;

  UPDATE public.quotes
    SET status = 'accepted',
        accepted_at = now(),
        accepted_ip = p_ip,
        accepted_by_user_id = auth.uid()
    WHERE id = p_quote_id
    RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_quote_from_portal(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_quote_from_portal(p_quote_id UUID, p_reason TEXT)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer UUID;
  v_quote public.quotes;
BEGIN
  v_customer := public.get_customer_id_for_user(auth.uid());
  IF v_customer IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_quote.customer_id <> v_customer THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_quote.status <> 'sent' THEN RAISE EXCEPTION 'Cotización no disponible para rechazar'; END IF;

  UPDATE public.quotes
    SET status = 'rejected',
        rejected_at = now(),
        rejection_reason = p_reason
    WHERE id = p_quote_id
    RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_quote_from_portal(UUID, TEXT) TO authenticated;

-- 5. RPC to expose default collection account to portal (only safe fields)
CREATE OR REPLACE FUNCTION public.get_portal_collection_account()
RETURNS TABLE (
  bank TEXT,
  clabe TEXT,
  account_number TEXT,
  account_holder TEXT,
  currency TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bank, clabe, account_number, account_holder, currency
  FROM public.bank_accounts
  WHERE is_default_collection = true AND is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_collection_account() TO authenticated;
