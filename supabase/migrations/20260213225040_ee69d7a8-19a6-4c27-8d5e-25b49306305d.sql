
-- Create invoices table
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text NOT NULL,
  booking_id uuid REFERENCES public.bookings(id),
  customer_id uuid REFERENCES public.customers(id),
  customer_name text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  paid_at date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Public access policy (matching existing pattern)
CREATE POLICY "Public access to invoices"
ON public.invoices
FOR ALL
USING (true)
WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Invoice number generator
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE sql
SET search_path TO 'public'
AS $$
  SELECT 'INV-' || lpad((coalesce(max(
    nullif(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '')::int
  ), 0) + 1)::text, 4, '0')
  FROM invoices;
$$;
