-- FIX-07 (Media · M15): red final en DB — el horómetro nunca puede ser negativo.
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_hours_reading_nonneg
  CHECK (hours_reading IS NULL OR hours_reading >= 0) NOT VALID;
ALTER TABLE public.deliveries
  VALIDATE CONSTRAINT deliveries_hours_reading_nonneg;
