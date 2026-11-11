-- Keep customer reassignment and booking creation in the same transaction.
CREATE FUNCTION public.convert_quote_with_customer_scoped(
  p_quote_id uuid,
  p_assignments jsonb,
  p_recurring boolean,
  p_replacement_customer_id uuid DEFAULT NULL
)
RETURNS TABLE(booking_id uuid, forklift_id uuid, customer_id uuid, start_date date, end_date date)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_org uuid := public.current_internal_organization_id();
  v_previous_name text;
  v_replacement_name text;
  v_booking record;
BEGIN
  IF v_org IS NULL OR (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No se pudo verificar la empresa de la cotización' USING ERRCODE = '42501';
  END IF;

  IF p_replacement_customer_id IS NOT NULL THEN
    SELECT q.customer_name INTO v_previous_name FROM public.quotes q
    WHERE q.id = p_quote_id AND q.organization_id = v_org FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cotización no encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF lower(coalesce(v_previous_name, '')) NOT LIKE ALL (ARRAY['%público en general%', '%publico en general%']) THEN
      RAISE EXCEPTION 'El cliente de la cotización cambió. Recarga antes de convertirla.' USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(nullif(btrim(oc.alias), ''), nullif(btrim(c.name), ''), nullif(btrim(oc.razon_social), ''))
    INTO v_replacement_name
    FROM public.organization_customers oc JOIN public.customers c ON c.id = oc.customer_id
    WHERE oc.organization_id = v_org AND oc.customer_id = p_replacement_customer_id
      AND oc.status = 'active' AND c.deleted_at IS NULL;
    IF v_replacement_name IS NULL
      OR lower(v_replacement_name) LIKE ANY (ARRAY['%público en general%', '%publico en general%']) THEN
      RAISE EXCEPTION 'Selecciona un cliente activo de la empresa' USING ERRCODE = '23514';
    END IF;

    PERFORM public.reassign_quote_customer(p_quote_id, p_replacement_customer_id, v_replacement_name);
  END IF;

  FOR v_booking IN SELECT * FROM public.convert_quote_to_bookings_scoped(p_quote_id, p_assignments, p_recurring)
  LOOP
    SELECT b.id, b.forklift_id, b.customer_id, b.start_date, b.end_date
    INTO STRICT booking_id, forklift_id, customer_id, start_date, end_date
    FROM public.bookings b
    WHERE b.id = v_booking.booking_id AND b.organization_id = v_org;
    RETURN NEXT;
  END LOOP;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La conversión no devolvió reservas' USING ERRCODE = '23514';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_quote_with_customer_scoped(uuid,jsonb,boolean,uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.convert_quote_with_customer_scoped(uuid,jsonb,boolean,uuid) TO authenticated;
