-- FIX-03 (Alta · H9): cierre del ciclo daño→factura sin condición de estado
-- previo permitía doble submit / doble facturación pisando invoice_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_damage_records_invoice_id
  ON public.damage_records (invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_damage_record_double_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL
     AND OLD.status = 'invoiced'
     AND OLD.invoice_id IS NOT NULL
     AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    RAISE EXCEPTION 'El daño ya está facturado (invoice_id=%). Cancela la factura previa antes de ligar otra.', OLD.invoice_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_damage_double_invoice ON public.damage_records;
CREATE TRIGGER trg_guard_damage_double_invoice
  BEFORE UPDATE OF invoice_id, status ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_record_double_invoice();
