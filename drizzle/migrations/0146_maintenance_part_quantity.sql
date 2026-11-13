-- A single OT/SKU line keeps its captured unit cost. Additional consumption
-- increments that line under the parent lock; existing stock/cost triggers apply.
CREATE FUNCTION public.add_maintenance_part_quantity(
  p_maintenance_log_id uuid, p_part_id uuid, p_quantity integer
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_org uuid := public.current_internal_organization_id();
  v_log public.maintenance_logs%ROWTYPE;
  v_part public.parts_inventory%ROWTYPE;
  v_consumption public.maintenance_parts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL
     OR NOT public.is_parts_writer()
     OR NOT public.operations_actor_allowed('Mantenimiento', 'full') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar refacciones en mantenimiento.'
      USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad adicional debe ser un entero mayor que cero.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize both first inserts and increments with close/archive operations.
  SELECT * INTO v_log FROM public.maintenance_logs
    WHERE id = p_maintenance_log_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de trabajo inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF v_log.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La orden está archivada. Restáurala antes de modificar refacciones o mano de obra.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_log.work_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'No se pueden modificar refacciones ni mano de obra de una orden %.', v_log.work_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The same inventory row supplies the initial cost and backs the stock check.
  -- Lock it exclusively: shared-lock upgrades could deadlock two different OTs.
  SELECT * INTO v_part FROM public.parts_inventory
    WHERE id = p_part_id AND organization_id = v_org AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refacción inexistente, inactiva o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF v_part.stock_quantity < p_quantity THEN
    RAISE EXCEPTION 'Existencias insuficientes para agregar esta cantidad.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_consumption FROM public.maintenance_parts
    WHERE maintenance_log_id = p_maintenance_log_id AND part_id = p_part_id
      AND organization_id = v_org;
  IF FOUND THEN
    IF v_consumption.cost_at_time < 0 OR v_consumption.cost_at_time::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'El consumo existente tiene un costo inválido. Revisa la orden antes de agregar unidades.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Never reprice previous consumption, including a legitimate captured zero.
    UPDATE public.maintenance_parts
      SET quantity_used = quantity_used + p_quantity
      WHERE id = v_consumption.id AND organization_id = v_org
      RETURNING * INTO v_consumption;
  ELSE
    IF v_part.unit_cost < 0 OR v_part.unit_cost::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'La refacción tiene un costo inválido.' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.maintenance_parts(organization_id,maintenance_log_id,part_id,quantity_used,cost_at_time)
      VALUES(v_org,p_maintenance_log_id,p_part_id,p_quantity,v_part.unit_cost)
      RETURNING * INTO v_consumption;
  END IF;
  IF v_consumption.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo registrar el consumo autorizado.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'id',v_consumption.id,'organization_id',v_consumption.organization_id,
    'maintenance_log_id',v_consumption.maintenance_log_id,'part_id',v_consumption.part_id,
    'quantity_used',v_consumption.quantity_used,'cost_at_time',v_consumption.cost_at_time
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.add_maintenance_part_quantity(uuid,uuid,integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.add_maintenance_part_quantity(uuid,uuid,integer) TO authenticated;
COMMENT ON FUNCTION public.add_maintenance_part_quantity(uuid,uuid,integer) IS
  'Adds positive consumption atomically per OT/SKU; preserves existing captured unit cost, reads initial cost from inventory, and retains INVOKER/RLS.';
NOTIFY pgrst, 'reload schema';
