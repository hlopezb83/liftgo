
-- ═══════════════════════════════════════════════════════════════
-- parts_inventory table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.parts_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT NOT NULL DEFAULT 'Otros',
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER NOT NULL DEFAULT 5,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.parts_inventory ENABLE ROW LEVEL SECURITY;

-- SELECT: staff roles
CREATE POLICY "Admin read parts_inventory" ON public.parts_inventory FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Administrativo read parts_inventory" ON public.parts_inventory FOR SELECT USING (has_role(auth.uid(), 'administrativo'::app_role));
CREATE POLICY "Mechanic read parts_inventory" ON public.parts_inventory FOR SELECT USING (has_role(auth.uid(), 'mechanic'::app_role));
CREATE POLICY "Dispatcher read parts_inventory" ON public.parts_inventory FOR SELECT USING (has_role(auth.uid(), 'dispatcher'::app_role));
CREATE POLICY "Auditor read parts_inventory" ON public.parts_inventory FOR SELECT USING (has_role(auth.uid(), 'auditor'::app_role));

-- INSERT/UPDATE/DELETE: admin, administrativo, mechanic
CREATE POLICY "Admin write parts_inventory" ON public.parts_inventory FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update parts_inventory" ON public.parts_inventory FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete parts_inventory" ON public.parts_inventory FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo write parts_inventory" ON public.parts_inventory FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));
CREATE POLICY "Administrativo update parts_inventory" ON public.parts_inventory FOR UPDATE USING (has_role(auth.uid(), 'administrativo'::app_role));
CREATE POLICY "Administrativo delete parts_inventory" ON public.parts_inventory FOR DELETE USING (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Mechanic write parts_inventory" ON public.parts_inventory FOR INSERT WITH CHECK (has_role(auth.uid(), 'mechanic'::app_role));
CREATE POLICY "Mechanic update parts_inventory" ON public.parts_inventory FOR UPDATE USING (has_role(auth.uid(), 'mechanic'::app_role));
CREATE POLICY "Mechanic delete parts_inventory" ON public.parts_inventory FOR DELETE USING (has_role(auth.uid(), 'mechanic'::app_role));

-- updated_at trigger
CREATE TRIGGER set_updated_at_parts_inventory
  BEFORE UPDATE ON public.parts_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- maintenance_parts junction table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.maintenance_parts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  maintenance_log_id UUID NOT NULL REFERENCES public.maintenance_logs(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES public.parts_inventory(id) ON DELETE RESTRICT,
  quantity_used INTEGER NOT NULL DEFAULT 1,
  cost_at_time NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_parts ENABLE ROW LEVEL SECURITY;

-- SELECT: staff roles
CREATE POLICY "Admin read maintenance_parts" ON public.maintenance_parts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Administrativo read maintenance_parts" ON public.maintenance_parts FOR SELECT USING (has_role(auth.uid(), 'administrativo'::app_role));
CREATE POLICY "Mechanic read maintenance_parts" ON public.maintenance_parts FOR SELECT USING (has_role(auth.uid(), 'mechanic'::app_role));
CREATE POLICY "Dispatcher read maintenance_parts" ON public.maintenance_parts FOR SELECT USING (has_role(auth.uid(), 'dispatcher'::app_role));
CREATE POLICY "Auditor read maintenance_parts" ON public.maintenance_parts FOR SELECT USING (has_role(auth.uid(), 'auditor'::app_role));

-- INSERT/UPDATE/DELETE: admin, administrativo, mechanic
CREATE POLICY "Admin write maintenance_parts" ON public.maintenance_parts FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update maintenance_parts" ON public.maintenance_parts FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete maintenance_parts" ON public.maintenance_parts FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo write maintenance_parts" ON public.maintenance_parts FOR INSERT WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));
CREATE POLICY "Administrativo update maintenance_parts" ON public.maintenance_parts FOR UPDATE USING (has_role(auth.uid(), 'administrativo'::app_role));
CREATE POLICY "Administrativo delete maintenance_parts" ON public.maintenance_parts FOR DELETE USING (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Mechanic write maintenance_parts" ON public.maintenance_parts FOR INSERT WITH CHECK (has_role(auth.uid(), 'mechanic'::app_role));
CREATE POLICY "Mechanic update maintenance_parts" ON public.maintenance_parts FOR UPDATE USING (has_role(auth.uid(), 'mechanic'::app_role));
CREATE POLICY "Mechanic delete maintenance_parts" ON public.maintenance_parts FOR DELETE USING (has_role(auth.uid(), 'mechanic'::app_role));

-- ═══════════════════════════════════════════════════════════════
-- Trigger: auto-decrement stock on part usage
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_part_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE parts_inventory
  SET stock_quantity = stock_quantity - NEW.quantity_used
  WHERE id = NEW.part_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON public.maintenance_parts
  FOR EACH ROW EXECUTE FUNCTION handle_part_usage();
