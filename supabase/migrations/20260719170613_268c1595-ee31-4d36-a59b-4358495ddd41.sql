-- BL-38: Mano de obra por mecánico en mantenimientos
-- 1) Tabla maintenance_labor
CREATE TABLE public.maintenance_labor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_log_id uuid NOT NULL REFERENCES public.maintenance_logs(id) ON DELETE CASCADE,
  mechanic_id uuid NOT NULL REFERENCES public.mechanics(id) ON DELETE RESTRICT,
  hours numeric(6,2) NOT NULL CHECK (hours > 0),
  hourly_rate numeric(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  total_cost numeric(12,2) GENERATED ALWAYS AS (ROUND(hours * hourly_rate, 2)) STORED,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_labor TO authenticated;
GRANT ALL ON public.maintenance_labor TO service_role;

ALTER TABLE public.maintenance_labor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access maintenance_labor" ON public.maintenance_labor
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Administrativo full access maintenance_labor" ON public.maintenance_labor
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrativo'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrativo'::public.app_role));

CREATE POLICY "Mechanic full access maintenance_labor" ON public.maintenance_labor
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'mechanic'::public.app_role));

CREATE POLICY "Auditor read maintenance_labor" ON public.maintenance_labor
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'auditor'::public.app_role));

CREATE POLICY "Dispatcher read maintenance_labor" ON public.maintenance_labor
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher'::public.app_role));

CREATE INDEX idx_maintenance_labor_log ON public.maintenance_labor(maintenance_log_id);
CREATE INDEX idx_maintenance_labor_mechanic ON public.maintenance_labor(mechanic_id, created_at DESC);

-- updated_at trigger
CREATE TRIGGER trg_maintenance_labor_updated_at
  BEFORE UPDATE ON public.maintenance_labor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Actualizar función recalc para incluir labor
CREATE OR REPLACE FUNCTION public.recalc_maintenance_log_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log_id uuid;
  v_parts  numeric;
  v_labor  numeric;
BEGIN
  v_log_id := COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  SELECT COALESCE(SUM(quantity_used * cost_at_time), 0)
    INTO v_parts
    FROM public.maintenance_parts
   WHERE maintenance_log_id = v_log_id;
  SELECT COALESCE(SUM(total_cost), 0)
    INTO v_labor
    FROM public.maintenance_labor
   WHERE maintenance_log_id = v_log_id;
  UPDATE public.maintenance_logs
     SET cost = ROUND(v_parts + v_labor, 2)
   WHERE id = v_log_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3) Trigger sobre maintenance_labor que reusa la misma función
CREATE TRIGGER trg_maintenance_labor_recalc_cost
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_labor
  FOR EACH ROW EXECUTE FUNCTION public.recalc_maintenance_log_cost();

COMMENT ON COLUMN public.maintenance_logs.performed_by IS 'DEPRECATED (BL-38): usar tabla maintenance_labor. Se removerá en v7.98.0.';