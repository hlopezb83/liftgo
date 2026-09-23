-- La RPC create_booking es SECURITY INVOKER y necesita ejecutar este generador.
-- La ACL anterior bloqueaba la reserva después de validar fechas y equipo.
-- El wrapper conserva su contador por organización y exige una sesión interna
-- con uno de los roles que pueden crear reservas.
CREATE OR REPLACE FUNCTION public.next_booking_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::public.app_role)
      OR public.has_role(v_uid, 'administrativo'::public.app_role)
      OR public.has_role(v_uid, 'dispatcher'::public.app_role)
      OR public.has_role(v_uid, 'ventas'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'booking_number_role_required'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'organization_context_required'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN 'RSV-' || lpad(
    public.next_organization_document_counter('booking', 1)::text,
    4,
    '0'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.next_booking_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_booking_number()
  TO authenticated, service_role;

DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.next_booking_number()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.next_booking_number()', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTFLIGHT 0052: ACL incorrecta para next_booking_number';
  END IF;
END;
$$;

