-- A6R2-6: al cancelar la factura del cargo por daño, el daño vuelve a ser
-- re-cobrable (invoice_id = NULL, status = 'repaired').
CREATE OR REPLACE FUNCTION public.release_damage_on_invoice_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.damage_records
       SET invoice_id = NULL,
           status = CASE WHEN status = 'invoiced' THEN 'repaired' ELSE status END
     WHERE invoice_id = OLD.id;
    RETURN OLD;
  END IF;

  IF (COALESCE(NEW.status, '') = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled')
     OR (COALESCE(NEW.cancellation_status, '') = 'accepted'
         AND COALESCE(OLD.cancellation_status, '') <> 'accepted') THEN
    UPDATE public.damage_records
       SET invoice_id = NULL,
           status = CASE WHEN status = 'invoiced' THEN 'repaired' ELSE status END
     WHERE invoice_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_damage_on_invoice_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_release_damage_on_invoice_cancel ON public.invoices;
CREATE TRIGGER trg_release_damage_on_invoice_cancel
AFTER UPDATE OF status, cancellation_status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.release_damage_on_invoice_cancel();

DROP TRIGGER IF EXISTS trg_release_damage_on_invoice_delete ON public.invoices;
CREATE TRIGGER trg_release_damage_on_invoice_delete
BEFORE DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.release_damage_on_invoice_cancel();