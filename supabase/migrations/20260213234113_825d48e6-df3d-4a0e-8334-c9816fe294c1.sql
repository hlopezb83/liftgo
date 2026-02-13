
-- Return inspections table
CREATE TABLE public.return_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id),
  forklift_id UUID NOT NULL REFERENCES public.forklifts(id),
  inspected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  condition TEXT NOT NULL DEFAULT 'good',
  damage_notes TEXT,
  damage_cost NUMERIC DEFAULT 0,
  hours_used NUMERIC,
  fuel_level TEXT,
  inspected_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.return_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to return_inspections" ON public.return_inspections FOR ALL USING (true) WITH CHECK (true);

-- Deliveries table for logistics
CREATE TABLE public.deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id),
  forklift_id UUID NOT NULL REFERENCES public.forklifts(id),
  type TEXT NOT NULL DEFAULT 'delivery',
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT,
  address TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to deliveries" ON public.deliveries FOR ALL USING (true) WITH CHECK (true);

-- Documents table for attachments
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to documents" ON public.documents FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for document uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true);
CREATE POLICY "Public read documents" ON storage.objects FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "Public upload documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Public delete documents" ON storage.objects FOR DELETE USING (bucket_id = 'documents');

-- Add return_status to bookings for tracking returned bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS return_status TEXT DEFAULT NULL;
