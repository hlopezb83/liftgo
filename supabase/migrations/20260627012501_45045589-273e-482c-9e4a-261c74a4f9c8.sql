CREATE OR REPLACE FUNCTION public.peek_next_invoice_number()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last bigint;
  v_called boolean;
  v_next bigint;
BEGIN
  SELECT last_value, is_called
    INTO v_last, v_called
    FROM public.invoice_number_seq;
  v_next := CASE WHEN v_called THEN v_last + 1 ELSE v_last END;
  RETURN 'FAC-' || lpad(v_next::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.peek_next_invoice_number() IS
  'Devuelve el folio tentativo de la próxima factura SIN consumir la secuencia. El folio definitivo se asigna atómicamente al insertar via next_invoice_number().';

GRANT EXECUTE ON FUNCTION public.peek_next_invoice_number() TO authenticated, service_role;