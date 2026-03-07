
ALTER TABLE public.forklifts ADD COLUMN acquisition_cost numeric DEFAULT 0;

ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'costo_venta';
