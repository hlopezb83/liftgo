-- Fix: recompute cost on INSERT so nuevos servicios de mantenimiento con
-- manual_cost > 0 no queden con cost = 0 hasta editarlos o agregar partes/labor.
CREATE OR REPLACE FUNCTION public.recalc_log_from_manual_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.cost := ROUND(COALESCE(NEW.manual_cost, 0), 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_log_from_manual_insert ON public.maintenance_logs;
CREATE TRIGGER trg_recalc_log_from_manual_insert
  BEFORE INSERT ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.recalc_log_from_manual_insert();

-- Backfill: sincronizar logs recientes donde cost=0 y manual_cost>0 (creados
-- después del cambio de payload que dejó de escribir `cost`).
UPDATE public.maintenance_logs
   SET cost = ROUND(manual_cost, 2)
 WHERE COALESCE(cost, 0) = 0
   AND COALESCE(manual_cost, 0) > 0;
