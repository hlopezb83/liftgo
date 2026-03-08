
-- Create maintenance_policies table
CREATE TABLE public.maintenance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forklift_id uuid NOT NULL REFERENCES forklifts(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  monthly_cost numeric NOT NULL DEFAULT 0,
  service_type text NOT NULL DEFAULT 'Póliza de Mantenimiento',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  last_generated_month text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(forklift_id)
);

-- Enable RLS
ALTER TABLE public.maintenance_policies ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins full access maintenance_policies" ON public.maintenance_policies FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access maintenance_policies" ON public.maintenance_policies FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Mechanic read maintenance_policies" ON public.maintenance_policies FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "Auditor read maintenance_policies" ON public.maintenance_policies FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role));

CREATE POLICY "Dispatcher read maintenance_policies" ON public.maintenance_policies FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role));

-- updated_at trigger
CREATE TRIGGER update_maintenance_policies_updated_at
  BEFORE UPDATE ON public.maintenance_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
