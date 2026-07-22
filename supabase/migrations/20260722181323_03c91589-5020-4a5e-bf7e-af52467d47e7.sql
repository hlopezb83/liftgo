-- B10a: CHECK constraints NOT VALID en public.forklifts.
-- NOT VALID = sólo aplica a filas nuevas/modificadas; respeta legacy fuera de rango.

ALTER TABLE public.forklifts
  ADD CONSTRAINT forklifts_year_range_chk
    CHECK (year IS NULL OR (year >= 1980 AND year <= EXTRACT(YEAR FROM now())::int + 1)) NOT VALID;

ALTER TABLE public.forklifts
  ADD CONSTRAINT forklifts_capacity_kg_range_chk
    CHECK (capacity_kg IS NULL OR (capacity_kg > 0 AND capacity_kg <= 100000)) NOT VALID;

ALTER TABLE public.forklifts
  ADD CONSTRAINT forklifts_mast_height_range_chk
    CHECK (mast_height_m IS NULL OR (mast_height_m > 0 AND mast_height_m <= 20)) NOT VALID;

ALTER TABLE public.forklifts
  ADD CONSTRAINT forklifts_daily_rate_nonneg_chk
    CHECK (daily_rate IS NULL OR (daily_rate >= 0 AND daily_rate <= 999999)) NOT VALID;

ALTER TABLE public.forklifts
  ADD CONSTRAINT forklifts_weekly_rate_nonneg_chk
    CHECK (weekly_rate IS NULL OR (weekly_rate >= 0 AND weekly_rate <= 9999999)) NOT VALID;

ALTER TABLE public.forklifts
  ADD CONSTRAINT forklifts_monthly_rate_nonneg_chk
    CHECK (monthly_rate IS NULL OR (monthly_rate >= 0 AND monthly_rate <= 9999999)) NOT VALID;

ALTER TABLE public.forklifts
  ADD CONSTRAINT forklifts_acquisition_cost_nonneg_chk
    CHECK (acquisition_cost IS NULL OR (acquisition_cost >= 0 AND acquisition_cost <= 99999999)) NOT VALID;

ALTER TABLE public.forklifts
  ADD CONSTRAINT forklifts_insurance_cost_nonneg_chk
    CHECK (insurance_cost IS NULL OR (insurance_cost >= 0 AND insurance_cost <= 9999999)) NOT VALID;