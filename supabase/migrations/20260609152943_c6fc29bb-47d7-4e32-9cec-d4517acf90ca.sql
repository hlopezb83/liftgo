
-- A2: default payment terms on suppliers
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS default_payment_terms_days int
  CHECK (default_payment_terms_days IS NULL OR (default_payment_terms_days BETWEEN 0 AND 365));

-- A1: supplier_contacts
CREATE TABLE IF NOT EXISTS public.supplier_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_contacts_supplier_idx ON public.supplier_contacts(supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_contacts_one_primary
  ON public.supplier_contacts(supplier_id) WHERE is_primary;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_contacts TO authenticated;
GRANT ALL ON public.supplier_contacts TO service_role;
ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_contacts_select_auth" ON public.supplier_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "supplier_contacts_write_admin" ON public.supplier_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role));

CREATE TRIGGER supplier_contacts_updated_at
  BEFORE UPDATE ON public.supplier_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A3: supplier_bank_accounts
CREATE TABLE IF NOT EXISTS public.supplier_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_holder text NOT NULL,
  clabe text,
  account_number text,
  currency text NOT NULL DEFAULT 'MXN' CHECK (currency IN ('MXN','USD')),
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_bank_accounts_supplier_idx ON public.supplier_bank_accounts(supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_bank_accounts_one_primary
  ON public.supplier_bank_accounts(supplier_id) WHERE is_primary;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_bank_accounts TO authenticated;
GRANT ALL ON public.supplier_bank_accounts TO service_role;
ALTER TABLE public.supplier_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_bank_accounts_select_auth" ON public.supplier_bank_accounts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "supplier_bank_accounts_write_admin" ON public.supplier_bank_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role));

CREATE TRIGGER supplier_bank_accounts_updated_at
  BEFORE UPDATE ON public.supplier_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CLABE validation trigger
CREATE OR REPLACE FUNCTION public.validate_supplier_bank_clabe()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.clabe IS NOT NULL AND length(trim(NEW.clabe)) > 0 THEN
    IF NEW.clabe !~ '^[0-9]{18}$' THEN
      RAISE EXCEPTION 'La CLABE debe contener exactamente 18 dígitos numéricos';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER supplier_bank_accounts_validate_clabe
  BEFORE INSERT OR UPDATE ON public.supplier_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_bank_clabe();

-- A4: auto-fill due_date on supplier_bills from supplier default terms
CREATE OR REPLACE FUNCTION public.set_supplier_bill_due_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_days int;
BEGIN
  IF NEW.due_date IS NULL AND NEW.issue_date IS NOT NULL AND NEW.supplier_id IS NOT NULL THEN
    SELECT default_payment_terms_days INTO v_days
      FROM public.suppliers WHERE id = NEW.supplier_id;
    IF v_days IS NOT NULL THEN
      NEW.due_date := NEW.issue_date + v_days;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER supplier_bills_auto_due_date
  BEFORE INSERT ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_bill_due_date();

-- Backfill: existing supplier contact info → primary contact row
INSERT INTO public.supplier_contacts (supplier_id, name, email, phone, is_primary, role)
SELECT s.id,
       COALESCE(NULLIF(trim(s.contact_person), ''), s.name),
       NULLIF(trim(s.email), ''),
       NULLIF(trim(s.phone), ''),
       true,
       'Principal'
FROM public.suppliers s
WHERE (s.contact_person IS NOT NULL AND trim(s.contact_person) <> '')
   OR (s.email IS NOT NULL AND trim(s.email) <> '')
   OR (s.phone IS NOT NULL AND trim(s.phone) <> '')
ON CONFLICT DO NOTHING;
