
-- Create prospects table
CREATE TABLE public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  deal_value numeric DEFAULT 0,
  stage text NOT NULL DEFAULT 'nuevo_prospecto',
  notes text,
  stage_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins full access prospects" ON public.prospects FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access prospects" ON public.prospects FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Dispatchers full access prospects" ON public.prospects FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Auditor read prospects" ON public.prospects FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Activity feed trigger
CREATE TRIGGER prospects_activity_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION log_activity();

-- Audit trigger
CREATE TRIGGER prospects_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_fn();
