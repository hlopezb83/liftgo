-- EC-M6: validar signos positivos en líneas de factura (JSONB)
CREATE OR REPLACE FUNCTION public.validate_invoice_line_items_signs()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item jsonb;
  qty numeric;
  price numeric;
BEGIN
  IF NEW.line_items IS NULL OR jsonb_typeof(NEW.line_items) <> 'array' THEN
    RETURN NEW;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(NEW.line_items) LOOP
    qty := COALESCE((item->>'quantity')::numeric, 1);
    price := COALESCE((item->>'unit_price')::numeric, 0);
    IF qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad debe ser mayor a cero (recibido: %). Descripción: %',
        qty, COALESCE(item->>'description', '(sin descripción)')
        USING ERRCODE = 'check_violation';
    END IF;
    IF price < 0 THEN
      RAISE EXCEPTION 'Precio unitario no puede ser negativo (recibido: %). Descripción: %',
        price, COALESCE(item->>'description', '(sin descripción)')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_positive_line_amounts ON public.invoices;
CREATE TRIGGER trg_invoices_positive_line_amounts
BEFORE INSERT OR UPDATE OF line_items ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.validate_invoice_line_items_signs();

-- Igual para cotizaciones (evita que se conviertan a facturas con datos inválidos)
DROP TRIGGER IF EXISTS trg_quotes_positive_line_amounts ON public.quotes;
CREATE TRIGGER trg_quotes_positive_line_amounts
BEFORE INSERT OR UPDATE OF line_items ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.validate_invoice_line_items_signs();

-- BL-A4: helper que la edge function cancel-cfdi puede llamar antes de cancelar.
-- Devuelve NULL si es cancelable; si no, devuelve el motivo del bloqueo.
CREATE OR REPLACE FUNCTION public.assert_invoice_cancellable(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_count integer;
  v_payment_total numeric;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_payment_count, v_payment_total
  FROM public.payments
  WHERE invoice_id = p_invoice_id;

  IF v_payment_count > 0 THEN
    RETURN format(
      'La factura tiene %s pago(s) aplicado(s) por $%s. Elimina o reversa los pagos antes de cancelar el CFDI.',
      v_payment_count,
      to_char(v_payment_total, 'FM999,999,999,990.00')
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_invoice_cancellable(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.assert_invoice_cancellable(uuid) TO authenticated, service_role;