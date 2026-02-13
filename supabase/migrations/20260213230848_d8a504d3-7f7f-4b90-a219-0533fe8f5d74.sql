
CREATE TABLE public.equipment_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  default_capacity_kg NUMERIC,
  default_mast_height_m NUMERIC,
  default_fuel_type TEXT NOT NULL DEFAULT 'Diesel',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to equipment_models"
  ON public.equipment_models
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_equipment_models_updated_at
  BEFORE UPDATE ON public.equipment_models
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
