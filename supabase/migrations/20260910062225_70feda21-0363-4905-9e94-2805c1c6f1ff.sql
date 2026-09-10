CREATE OR REPLACE FUNCTION public.guard_credit_note_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR (select auth.uid()) IS NULL THEN
    RETURN OLD;
  END IF;
  IF OLD.cfdi_uuid IS NOT NULL
     OR OLD.cfdi_status IN ('stamped','cancelled')
     OR OLD.status IN ('stamped','cancelled') THEN
    RAISE EXCEPTION 'No se puede eliminar la nota de crédito % (timbrada o cancelada). Usa el flujo de cancelación fiscal.', OLD.credit_note_number
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_credit_note_delete() FROM PUBLIC;