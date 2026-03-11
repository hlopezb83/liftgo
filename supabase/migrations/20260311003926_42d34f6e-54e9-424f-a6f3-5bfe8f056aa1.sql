ALTER TABLE equipment_models
  ADD COLUMN default_daily_rate numeric DEFAULT 0,
  ADD COLUMN default_weekly_rate numeric DEFAULT 0,
  ADD COLUMN default_monthly_rate numeric DEFAULT 0;