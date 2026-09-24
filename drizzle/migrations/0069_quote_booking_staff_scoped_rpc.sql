-- Ventas y despacho pueden convertir cotizaciones aceptadas, pero no tienen
-- permiso UPDATE sobre forklifts. La RPC invoker toma FOR UPDATE sobre esa
-- tabla y RLS oculta la fila. Esta puerta estrecha comprueba la organización
-- antes de ejecutar la conversión transaccional con privilegios del servidor.
CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings_scoped(
  p_quote_id uuid,
  p_assignments jsonb,
  p_recurring boolean DEFAULT false
)
RETURNS TABLE(booking_id uuid, forklift_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_can_see_e2e boolean;
  v_quote public.quotes%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin') OR
    public.has_role(v_uid, 'administrativo') OR
    public.has_role(v_uid, 'dispatcher') OR
    public.has_role(v_uid, 'ventas')
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_can_see_e2e := public.has_role(v_uid, 'admin') OR
                   public.has_role(v_uid, 'administrativo');

  SELECT q.* INTO v_quote
  FROM public.quotes q
  WHERE q.id = p_quote_id
    AND q.organization_id = v_org
    AND (v_can_see_e2e OR q.is_e2e IS NOT TRUE);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_quote.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_customers oc
    WHERE oc.organization_id = v_org
      AND oc.customer_id = v_quote.customer_id
      AND oc.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Cliente no disponible en esta organización'
      USING ERRCODE = '23514';
  END IF;

  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' OR
     jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_assignments) AS assignment(item)
    LEFT JOIN public.forklifts f
      ON f.id = CASE
        WHEN assignment.item->>'forklift_id' ~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN (assignment.item->>'forklift_id')::uuid
        ELSE NULL
      END
    WHERE f.id IS NULL
       OR f.organization_id <> v_org
       OR f.deleted_at IS NOT NULL
       OR (NOT v_can_see_e2e AND f.is_e2e IS TRUE)
  ) THEN
    RAISE EXCEPTION 'Montacargas no disponible en esta organización'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
    SELECT converted.booking_id, converted.forklift_id
    FROM public.convert_quote_to_bookings(
      p_quote_id, p_assignments, p_recurring
    ) AS converted;
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_quote_to_bookings_scoped(uuid, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_bookings_scoped(uuid, jsonb, boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.convert_quote_to_bookings_scoped(uuid, jsonb, boolean) IS
  'Convierte una cotización de la organización interna de la sesión; valida cliente y montacargas antes de la RPC invoker, sin otorgar UPDATE de flota a ventas o despacho.';
