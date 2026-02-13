
-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create maintenance_logs table
CREATE TABLE public.maintenance_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  forklift_id UUID NOT NULL REFERENCES public.forklifts(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  description TEXT,
  cost NUMERIC DEFAULT 0,
  performed_by TEXT,
  performed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  next_service_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to maintenance_logs" ON public.maintenance_logs FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_maintenance_logs_updated_at
  BEFORE UPDATE ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add customer_id FK to bookings (optional link to customers table)
ALTER TABLE public.bookings ADD COLUMN customer_id UUID REFERENCES public.customers(id);
