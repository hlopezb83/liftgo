
-- Phase 1: Company Settings table
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfc text NOT NULL,
  razon_social text NOT NULL,
  regimen_fiscal text NOT NULL,
  lugar_expedicion text NOT NULL,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access company_settings"
  ON public.company_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Others read company_settings"
  ON public.company_settings FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 1: Add CFDI columns to customers
ALTER TABLE public.customers
  ADD COLUMN rfc text,
  ADD COLUMN regimen_fiscal text,
  ADD COLUMN uso_cfdi text,
  ADD COLUMN domicilio_fiscal_cp text;

-- Phase 1: Add CFDI columns to invoices
ALTER TABLE public.invoices
  ADD COLUMN serie text,
  ADD COLUMN folio text,
  ADD COLUMN forma_pago text,
  ADD COLUMN metodo_pago text,
  ADD COLUMN uso_cfdi text,
  ADD COLUMN moneda text DEFAULT 'MXN',
  ADD COLUMN tipo_cambio numeric DEFAULT 1,
  ADD COLUMN receptor_rfc text,
  ADD COLUMN receptor_razon_social text,
  ADD COLUMN receptor_regimen_fiscal text,
  ADD COLUMN receptor_domicilio_fiscal_cp text,
  ADD COLUMN cfdi_uuid uuid,
  ADD COLUMN cfdi_xml text,
  ADD COLUMN cfdi_status text DEFAULT 'pending',
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancellation_reason text;
