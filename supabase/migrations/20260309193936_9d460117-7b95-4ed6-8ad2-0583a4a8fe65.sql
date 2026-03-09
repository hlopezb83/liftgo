
-- Create suppliers table
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  website text,
  address text,
  rfc text,
  regimen_fiscal text,
  category text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- RLS policies: read for all authenticated, write for admin/administrativo
CREATE POLICY "Authenticated users can read suppliers"
  ON public.suppliers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/administrativo can insert suppliers"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'administrativo')
  );

CREATE POLICY "Admin/administrativo can update suppliers"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'administrativo')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'administrativo')
  );

CREATE POLICY "Admin/administrativo can delete suppliers"
  ON public.suppliers FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'administrativo')
  );

-- updated_at trigger
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trigger
CREATE TRIGGER suppliers_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- Activity feed trigger
CREATE TRIGGER suppliers_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Add supplier_id to operating_expenses
ALTER TABLE public.operating_expenses ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id);

-- Add supplier_id to maintenance_logs
ALTER TABLE public.maintenance_logs ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id);
