UPDATE public.forklifts SET mast_height_m = mast_height_m / 1000 WHERE mast_height_m > 20;
UPDATE public.forklifts SET mast_height_m = NULL WHERE mast_height_m <= 0;
UPDATE public.equipment_models SET default_mast_height_m = default_mast_height_m / 1000 WHERE default_mast_height_m > 20;
UPDATE public.equipment_models SET default_mast_height_m = NULL WHERE default_mast_height_m <= 0;

ALTER TABLE public.forklifts VALIDATE CONSTRAINT forklifts_mast_height_range_chk;

ALTER TABLE public.equipment_models
  ADD CONSTRAINT equipment_models_mast_height_range_chk
  CHECK (default_mast_height_m IS NULL OR (default_mast_height_m > 0 AND default_mast_height_m <= 20));