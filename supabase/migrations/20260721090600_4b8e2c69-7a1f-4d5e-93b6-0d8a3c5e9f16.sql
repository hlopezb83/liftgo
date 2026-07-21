-- ============================================================================
-- BL: serialización de REPs (complementos de pago) por factura.
-- stamp-payment-complement calcula NumParcialidad e ImpSaldoAnt leyendo
-- TODOS los pagos de la factura; el claim atómico es por fila de payments,
-- así dos peticiones concurrentes (distinto pago, misma factura) podían
-- calcular la misma parcialidad y timbrar REPs inconsistentes.
-- Este RPC toma un SELECT ... FOR UPDATE sobre la fila de invoices para que
-- las emisiones concurrentes sobre la misma factura se ordenen al adquirir
-- el lock antes de calcular (mismo patrón de lock que
-- enforce_payment_within_invoice_total).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lock_invoice_for_rep(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_invoice_for_rep(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_invoice_for_rep(uuid) TO service_role;
