
-- Notas de Crédito (CFDI tipo Egreso)
CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers(id),
  motive text NOT NULL CHECK (motive IN ('return','discount','correction','credit_balance')),
  reason_text text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 16,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MXN',
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','stamped','cancelled')),
  -- SAT / Facturapi
  facturapi_invoice_id text,
  cfdi_uuid uuid,
  cfdi_xml_url text,
  cfdi_pdf_url text,
  cfdi_status text NOT NULL DEFAULT 'pending' CHECK (cfdi_status IN ('pending','stamped','error','cancelled')),
  cfdi_error_message text,
  cancellation_status text NOT NULL DEFAULT 'none' CHECK (cancellation_status IN ('none','pending','accepted','rejected','expired')),
  cancellation_motive text,
  substitution_uuid uuid,
  cancellation_reason text,
  cancelled_at timestamptz,
  -- auditoría
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_notes_invoice ON public.credit_notes(invoice_id);
CREATE INDEX idx_credit_notes_status ON public.credit_notes(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access credit_notes" ON public.credit_notes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Administrativo full access credit_notes" ON public.credit_notes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrativo'::app_role));

CREATE POLICY "Dispatchers full access credit_notes" ON public.credit_notes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(),'dispatcher'::app_role));

CREATE POLICY "Auditor read credit_notes" ON public.credit_notes
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'auditor'::app_role));

-- updated_at trigger
CREATE TRIGGER update_credit_notes_updated_at
  BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Numbering RPC
CREATE OR REPLACE FUNCTION public.next_credit_note_number()
RETURNS text
LANGUAGE sql
SET search_path = public
AS $$
  SELECT 'NC-' || lpad(
    (coalesce(max(nullif(regexp_replace(credit_note_number,'[^0-9]','','g'),'')::int), 0) + 1)::text,
    4, '0')
  FROM public.credit_notes;
$$;
