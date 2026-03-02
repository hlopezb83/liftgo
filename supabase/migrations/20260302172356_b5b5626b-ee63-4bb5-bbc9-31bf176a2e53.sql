
ALTER TABLE public.quotes
  ADD COLUMN equipment_model_id uuid REFERENCES public.equipment_models(id);
