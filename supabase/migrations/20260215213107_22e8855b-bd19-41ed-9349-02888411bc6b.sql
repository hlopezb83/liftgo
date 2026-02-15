
-- Contracts table
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number text NOT NULL,
  booking_id uuid REFERENCES public.bookings(id),
  customer_id uuid REFERENCES public.customers(id),
  forklift_id uuid REFERENCES public.forklifts(id),
  start_date date,
  end_date date,
  daily_rate numeric DEFAULT 0,
  weekly_rate numeric DEFAULT 0,
  monthly_rate numeric DEFAULT 0,
  deposit_amount numeric DEFAULT 0,
  terms_text text,
  status text NOT NULL DEFAULT 'draft',
  signed_at timestamptz,
  signed_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-increment contract number function
CREATE OR REPLACE FUNCTION public.next_contract_number()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'CTR-' || lpad((coalesce(max(substring(contract_number from 5)::int), 0) + 1)::text, 4, '0')
  FROM public.contracts;
$$;

-- Updated_at trigger for contracts
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on contracts
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access contracts"
  ON public.contracts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers full access contracts"
  ON public.contracts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Mechanics read contracts"
  ON public.contracts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'mechanic'::app_role));

-- Payments table
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text,
  reference_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access payments"
  ON public.payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers full access payments"
  ON public.payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Mechanics read payments"
  ON public.payments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'mechanic'::app_role));
