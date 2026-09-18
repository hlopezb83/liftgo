
CREATE OR REPLACE FUNCTION public.delete_quote_with_unassign(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote_number text;
  v_forklift_id uuid;
BEGIN
  SELECT quote_number INTO v_quote_number FROM public.quotes WHERE id = p_quote_id;
  IF v_quote_number IS NULL THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;

  FOR v_forklift_id IN
    SELECT forklift_id FROM public.quote_assigned_forklifts WHERE quote_id = p_quote_id
  LOOP
    UPDATE public.forklifts
      SET status = 'available'
      WHERE id = v_forklift_id AND status = 'sold';

    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_forklift_id, 'sold', 'available',
            'Liberado por eliminación de cotización ' || v_quote_number);
  END LOOP;

  DELETE FROM public.quote_assigned_forklifts WHERE quote_id = p_quote_id;
  DELETE FROM public.quotes WHERE id = p_quote_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_quote_with_unassign(uuid) TO authenticated;
