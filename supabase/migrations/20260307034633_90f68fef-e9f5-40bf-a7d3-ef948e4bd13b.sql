
-- Create expense category enum
CREATE TYPE public.expense_category AS ENUM ('renta', 'nomina', 'software', 'depreciacion', 'otro');

-- Create operating_expenses table
CREATE TABLE public.operating_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category expense_category NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.operating_expenses ENABLE ROW LEVEL SECURITY;

-- RLS policies following existing pattern
CREATE POLICY "Admins full access operating_expenses" ON public.operating_expenses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access operating_expenses" ON public.operating_expenses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Auditor read operating_expenses" ON public.operating_expenses FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role));

CREATE POLICY "Dispatchers read operating_expenses" ON public.operating_expenses FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role));

-- Audit trigger
CREATE TRIGGER audit_operating_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.operating_expenses
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Activity feed trigger
CREATE TRIGGER activity_operating_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.operating_expenses
  FOR EACH ROW EXECUTE FUNCTION log_activity();

-- Updated_at trigger
CREATE TRIGGER update_operating_expenses_updated_at
  BEFORE UPDATE ON public.operating_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
