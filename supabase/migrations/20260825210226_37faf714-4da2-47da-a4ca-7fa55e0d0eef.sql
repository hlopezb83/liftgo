CREATE OR REPLACE FUNCTION public.enforce_invoice_booking_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Eximir roles de backend confiables: RPC SECURITY DEFINER (create_recurring_invoice,
  -- e2e_seed_*) y service_role. El create_recurring_invoice ya envia periodo de todos modos.
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  -- Regla: una factura con reserva DEBE llevar billing_period_start.
  IF NEW.booking_id IS NOT NULL AND NEW.billing_period_start IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'La factura vinculada a una reserva requiere un periodo de facturación (billing_period_start).'
        USING ERRCODE = 'check_violation';
    ELSIF TG_OP = 'UPDATE' AND (
         OLD.booking_id IS NULL                       -- se asigna reserva nueva sin periodo
      OR OLD.billing_period_start IS NOT NULL         -- tenia periodo y se le borro
    ) THEN
      RAISE EXCEPTION 'No se puede remover el periodo de facturación de una factura vinculada a una reserva.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_booking_period ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_booking_period
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_booking_period();