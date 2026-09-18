CREATE OR REPLACE FUNCTION public.reorder_prospect_stage(
  p_prospect_id uuid,
  p_new_stage text,
  p_new_index integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_stage text;
  v_old_index integer;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'administrativo')
    OR public.has_role(auth.uid(), 'ventas')
  ) THEN
    RAISE EXCEPTION 'No autorizado para mover prospectos';
  END IF;

  IF p_new_index < 0 THEN
    RAISE EXCEPTION 'Índice inválido';
  END IF;

  SELECT stage, stage_order INTO v_old_stage, v_old_index
  FROM public.prospects
  WHERE id = p_prospect_id
  FOR UPDATE;

  IF v_old_stage IS NULL THEN
    RAISE EXCEPTION 'Prospecto no encontrado';
  END IF;

  -- R24-E: al mover dentro de la misma columna hacia ABAJO, la tarjeta movida
  -- debe quedar DESPUÉS de las que empatan en el índice destino; hacia arriba,
  -- antes. Con el desempate fijo anterior el movimiento descendente quedaba
  -- una posición corto y la tarjeta "regresaba" al invalidar.
  IF v_old_stage IS DISTINCT FROM p_new_stage THEN
    v_old_index := -1;
  END IF;

  UPDATE public.prospects
  SET stage = p_new_stage,
      stage_order = -1,
      updated_at = now()
  WHERE id = p_prospect_id;

  WITH ordered AS (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE WHEN id = p_prospect_id THEN p_new_index ELSE stage_order END,
               CASE
                 WHEN id <> p_prospect_id THEN 1
                 WHEN p_new_index > COALESCE(v_old_index, -1) THEN 1
                 ELSE 0
               END,
               created_at
           ) - 1 AS new_order
    FROM public.prospects
    WHERE stage = p_new_stage
  )
  UPDATE public.prospects p
  SET stage_order = o.new_order
  FROM ordered o
  WHERE p.id = o.id AND p.stage_order IS DISTINCT FROM o.new_order;

  IF v_old_stage IS DISTINCT FROM p_new_stage THEN
    WITH ordered_src AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY stage_order, created_at) - 1 AS new_order
      FROM public.prospects
      WHERE stage = v_old_stage
    )
    UPDATE public.prospects p
    SET stage_order = o.new_order
    FROM ordered_src o
    WHERE p.id = o.id AND p.stage_order IS DISTINCT FROM o.new_order;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_prospect_stage(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_prospect_stage(uuid, text, integer) TO authenticated;