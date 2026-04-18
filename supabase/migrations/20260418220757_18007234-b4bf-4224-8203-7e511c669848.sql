-- Trigger to keep operating_expenses (costo_venta) in sync with forklifts.acquisition_cost
CREATE OR REPLACE FUNCTION public.sync_costo_venta_on_forklift_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sold'
     AND NEW.acquisition_cost IS DISTINCT FROM OLD.acquisition_cost
     AND NEW.acquisition_cost IS NOT NULL THEN
    UPDATE public.operating_expenses
    SET amount = NEW.acquisition_cost,
        updated_at = now()
    WHERE category = 'costo_venta'
      AND description ILIKE '%' || NEW.name || '%';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_costo_venta ON public.forklifts;
CREATE TRIGGER trg_sync_costo_venta
AFTER UPDATE OF acquisition_cost, status ON public.forklifts
FOR EACH ROW
EXECUTE FUNCTION public.sync_costo_venta_on_forklift_update();