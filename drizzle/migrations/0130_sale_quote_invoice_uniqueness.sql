-- A sale quote is invoiced once: a draft reserves it until valid cancellation.
-- Existing duplicate invoices are preserved for explicit operational review.
-- Do not add a historical unique index or silently choose/delete a winner.
-- FORCE RLS exists on invoices/quotes. Refuse installation under an owner
-- unable to see hidden conflicts; do not grant or modify any database role.
DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Sale invoice guard requires an existing RLS-bypassing migration owner.';
  END IF;
END;
$preflight$;
--> statement-breakpoint
CREATE FUNCTION public.guard_sale_quote_invoice_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_quote_type text;
BEGIN
  IF NEW.quote_id IS NULL OR NOT public.quote_charge_invoice_active(NEW) THEN
    RETURN NEW;
  END IF;
  -- Keep edits/lifecycle updates to an existing reservation possible, including
  -- historical duplicates. Reassignment/reactivation and a new issuance must
  -- acquire a claim. A recovery carrying a PAC identity is not a new claim:
  -- never block persisting a fiscal operation already created remotely.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.quote_id IS NOT DISTINCT FROM OLD.quote_id
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND public.quote_charge_invoice_active(OLD)
       AND NOT (OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'cancelled')
         AND OLD.cfdi_status IS DISTINCT FROM 'stamping'
         AND OLD.cfdi_status IS DISTINCT FROM 'stamped' AND OLD.cfdi_uuid IS NULL
         AND NEW.facturapi_invoice_id IS NULL AND NEW.cfdi_uuid IS NULL)
       AND NOT (NEW.cfdi_status IS NOT DISTINCT FROM 'stamping' AND OLD.cfdi_status IS DISTINCT FROM 'stamping'
         AND NEW.facturapi_invoice_id IS NULL AND NEW.cfdi_uuid IS NULL) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- The existing invoice quote-charge trigger takes the same quote locks in
  -- deterministic order before this AFTER trigger. Retain that lock discipline.
  SELECT q.quote_type INTO v_quote_type
  FROM public.quotes q
  WHERE q.id = NEW.quote_id AND q.organization_id = NEW.organization_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización inexistente o de otra empresa.' USING ERRCODE = '23514';
  END IF;
  IF v_quote_type IS DISTINCT FROM 'sale' THEN RETURN NEW; END IF;
  -- A fixed transaction snapshot could hide a claim committed while waiting.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Las facturas de venta deben guardarse en una transacción READ COMMITTED.'
      USING ERRCODE = '25001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.quote_id = NEW.quote_id
      AND i.organization_id = NEW.organization_id
      AND i.id <> NEW.id
      AND public.quote_charge_invoice_active(i)
  ) THEN
    RAISE EXCEPTION 'Esta cotización de venta ya tiene una factura activa. Continúa el borrador existente o revisa su cancelación antes de crear otra.'
      USING ERRCODE = '23505', CONSTRAINT = 'sale_quote_active_invoice_unique';
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
-- Trigger-only helper: no client RPC and no new effective execute grants.
REVOKE ALL ON FUNCTION public.guard_sale_quote_invoice_uniqueness() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TRIGGER zzzz_guard_sale_quote_invoice_uniqueness
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_sale_quote_invoice_uniqueness();
