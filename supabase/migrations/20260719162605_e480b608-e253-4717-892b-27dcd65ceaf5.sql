
-- ============================================================
-- BL-28: Trigger que ajusta parts_inventory.stock_quantity
-- ============================================================
CREATE OR REPLACE FUNCTION public.adjust_part_stock_on_maintenance_part()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_stock integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.parts_inventory
       SET stock_quantity = stock_quantity - NEW.quantity_used
     WHERE id = NEW.part_id
     RETURNING stock_quantity INTO v_new_stock;
    IF v_new_stock IS NULL THEN
      RAISE EXCEPTION 'refacción inexistente (%)', NEW.part_id;
    END IF;
    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'stock insuficiente para la refacción %', NEW.part_id
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.parts_inventory
       SET stock_quantity = stock_quantity + OLD.quantity_used
     WHERE id = OLD.part_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.part_id <> OLD.part_id THEN
      UPDATE public.parts_inventory
         SET stock_quantity = stock_quantity + OLD.quantity_used
       WHERE id = OLD.part_id;
      UPDATE public.parts_inventory
         SET stock_quantity = stock_quantity - NEW.quantity_used
       WHERE id = NEW.part_id
       RETURNING stock_quantity INTO v_new_stock;
      IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'stock insuficiente para la refacción %', NEW.part_id
          USING ERRCODE = 'P0001';
      END IF;
    ELSIF NEW.quantity_used <> OLD.quantity_used THEN
      UPDATE public.parts_inventory
         SET stock_quantity = stock_quantity + OLD.quantity_used - NEW.quantity_used
       WHERE id = NEW.part_id
       RETURNING stock_quantity INTO v_new_stock;
      IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'stock insuficiente para la refacción %', NEW.part_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_parts_adjust_stock ON public.maintenance_parts;
CREATE TRIGGER trg_maintenance_parts_adjust_stock
AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_parts
FOR EACH ROW EXECUTE FUNCTION public.adjust_part_stock_on_maintenance_part();

-- ============================================================
-- BL-29: Trigger que recalcula maintenance_logs.cost
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_maintenance_log_cost()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_log_id uuid;
  v_total  numeric;
BEGIN
  v_log_id := COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  SELECT COALESCE(SUM(quantity_used * cost_at_time), 0)
    INTO v_total
    FROM public.maintenance_parts
   WHERE maintenance_log_id = v_log_id;
  UPDATE public.maintenance_logs SET cost = v_total WHERE id = v_log_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_parts_recalc_cost ON public.maintenance_parts;
CREATE TRIGGER trg_maintenance_parts_recalc_cost
AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_parts
FOR EACH ROW EXECUTE FUNCTION public.recalc_maintenance_log_cost();
