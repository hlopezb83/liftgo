
-- Forklifts table
CREATE TABLE public.forklifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  manufacturer TEXT,
  year INTEGER,
  capacity_kg NUMERIC,
  mast_height_m NUMERIC,
  fuel_type TEXT DEFAULT 'Diesel',
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  daily_rate NUMERIC DEFAULT 0,
  weekly_rate NUMERIC DEFAULT 0,
  monthly_rate NUMERIC DEFAULT 0,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status logs table
CREATE TABLE public.status_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  forklift_id UUID NOT NULL REFERENCES public.forklifts(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

-- Bookings table
CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  forklift_id UUID NOT NULL REFERENCES public.forklifts(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  customer_name TEXT,
  customer_contact TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.forklifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth)
CREATE POLICY "Public access to forklifts" ON public.forklifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to status_logs" ON public.status_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to bookings" ON public.bookings FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_forklifts_updated_at BEFORE UPDATE ON public.forklifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed data
INSERT INTO public.forklifts (name, model, manufacturer, year, capacity_kg, mast_height_m, fuel_type, serial_number, status, daily_rate, weekly_rate, monthly_rate) VALUES
('FL-001', 'H50', 'Hyster', 2021, 2500, 4.5, 'Diesel', 'HY-2021-001', 'available', 150, 750, 2500),
('FL-002', 'E35', 'Toyota', 2022, 1500, 3.5, 'Electric', 'TY-2022-002', 'rented', 120, 600, 2000),
('FL-003', 'GP25', 'Cat', 2020, 2500, 5.0, 'LPG', 'CT-2020-003', 'maintenance', 140, 700, 2300),
('FL-004', 'RX20', 'Still', 2023, 2000, 6.0, 'Electric', 'ST-2023-004', 'available', 160, 800, 2800),
('FL-005', 'H40', 'Hyster', 2019, 2000, 4.0, 'Diesel', 'HY-2019-005', 'rented', 130, 650, 2100),
('FL-006', 'E25', 'Linde', 2022, 2500, 5.5, 'Electric', 'LN-2022-006', 'available', 170, 850, 3000);

-- Seed status logs
INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
SELECT id, NULL, 'available', 'Initial registration' FROM public.forklifts WHERE name = 'FL-001';
INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
SELECT id, 'available', 'rented', 'Rented to ABC Construction' FROM public.forklifts WHERE name = 'FL-002';
INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
SELECT id, 'available', 'maintenance', 'Scheduled service' FROM public.forklifts WHERE name = 'FL-003';

-- Seed bookings
INSERT INTO public.bookings (forklift_id, start_date, end_date, customer_name, customer_contact, status)
SELECT id, CURRENT_DATE - 5, CURRENT_DATE + 10, 'ABC Construction', 'john@abc.com', 'confirmed' FROM public.forklifts WHERE name = 'FL-002';
INSERT INTO public.bookings (forklift_id, start_date, end_date, customer_name, customer_contact, status)
SELECT id, CURRENT_DATE + 3, CURRENT_DATE + 17, 'XYZ Logistics', 'info@xyz.com', 'confirmed' FROM public.forklifts WHERE name = 'FL-005';
