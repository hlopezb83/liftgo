-- FIX-06 (Media · M14): asignación de venta atómica (antes: 3 llamadas cliente
-- sin transacción, en conflicto con guard_forklift_status_change).
CREATE OR REPLACE FUNCTION public.assign_forklift_to_sale_quote(
  p_quote_id uuid,
  p_forklift_ids uuid[],
  p_line_indices int[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idx int;
  v_fid uuid;
  v_prev text;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_forklift_ids IS NULL OR p_line_indices IS NULL
     OR array_length(p_forklift_ids, 1) IS NULL
     OR array_length(p_forklift_ids, 1) <> array_length(p_line_indices, 1) THEN
    RAISE EXCEPTION 'Las listas de unidades y líneas deben tener la misma longitud'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  FOR v_idx IN 1 .. array_length(p_forklift_ids, 1) LOOP
    v_fid := p_forklift_ids[v_idx];

    SELECT status INTO v_prev FROM public.forklifts WHERE id = v_fid FOR UPDATE;
    IF v_prev IS NULL THEN
      RAISE EXCEPTION 'Montacargas no encontrado: %', v_fid USING ERRCODE = 'check_violation';
    END IF;
    IF v_prev = 'sold' THEN
      RAISE EXCEPTION 'El montacargas % ya está vendido', v_fid USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.quote_assigned_forklifts (quote_id, forklift_id, line_index)
    VALUES (p_quote_id, v_fid, p_line_indices[v_idx]);

    UPDATE public.forklifts
       SET status = 'sold', updated_at = now()
     WHERE id = v_fid;

    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_fid, v_prev, 'sold',
            'Asignado a cotización de venta ' || p_quote_id::text);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_forklift_to_sale_quote(uuid, uuid[], int[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_forklift_to_sale_quote(uuid, uuid[], int[]) TO authenticated;
