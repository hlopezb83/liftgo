-- R2: keep the cancellation invariant independent of caller invoice RLS.
-- DDL only. No business-row repair, permission expansion or RPC privilege change.
-- cancel_booking remains INVOKER. Private trigger functions only deny writes.

CREATE OR REPLACE FUNCTION public.guard_booking_cancellation_invoices()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR (auth.uid() IS NOT NULL AND (
       NEW.organization_id IS DISTINCT FROM public.current_internal_organization_id()
       OR NOT public.is_internal_member(auth.uid())
     )) THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND current_setting('role', true) NOT IN ('none', 'postgres', 'service_role') THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;

  -- Keep the status writer mutex; do not upgrade against billing's FK KEY SHARE.
  -- Billing's FOR SHARE conflicts with this NO KEY UPDATE status lock.
  PERFORM 1 FROM public.bookings b
   WHERE b.id = OLD.id AND b.organization_id = OLD.organization_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  -- Deliberately no invoice row lock here: billing uses invoice -> booking.
  IF EXISTS (
    SELECT 1 FROM public.invoices i
     WHERE i.organization_id = OLD.organization_id
       AND i.status NOT IN ('draft', 'cancelled')
       AND i.cancellation_status IS DISTINCT FROM 'accepted'
       AND (i.booking_id = OLD.id OR EXISTS (
         SELECT 1 FROM public.invoice_bookings ib
          WHERE ib.invoice_id = i.id AND ib.booking_id = OLD.id
            AND COALESCE(ib.organization_id, OLD.organization_id) = OLD.organization_id
       ))
  ) THEN
    RAISE EXCEPTION 'La reserva tiene facturas emitidas vigentes. Cancela primero la factura (y su CFDI ante el SAT) antes de cancelar la reserva.'
      USING ERRCODE = '23514', CONSTRAINT = 'booking_cancel_without_active_invoice';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_booking_cancellation_invoices() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_invoice_booking_cancellation()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_booking_id uuid;
  v_status text;
  v_active boolean;
BEGIN
  -- Preserve unrelated edits of legacy inconsistent rows, including a caller
  -- that sends unchanged lifecycle fields alongside notes or other metadata.
  IF TG_OP = 'UPDATE' AND ROW(NEW.status, NEW.booking_id, NEW.cancellation_status)
       IS NOT DISTINCT FROM ROW(OLD.status, OLD.booking_id, OLD.cancellation_status) THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL OR (auth.uid() IS NOT NULL AND (
       NEW.organization_id IS DISTINCT FROM public.current_internal_organization_id()
       OR NOT public.is_internal_member(auth.uid())
     )) THEN
    RAISE EXCEPTION 'Factura o reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND current_setting('role', true) NOT IN ('none', 'postgres', 'service_role') THEN
    RAISE EXCEPTION 'Factura o reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  v_active := NEW.status NOT IN ('draft', 'cancelled')
    AND NEW.cancellation_status IS DISTINCT FROM 'accepted';

  -- INSERT owns its new invoice; UPDATE already holds that invoice row.
  -- Never acquire advisory locks here: existing billing RPCs take them before
  -- acquiring invoice rows. Shared booking locks block status updates while
  -- remaining compatible with other billing readers and FK KEY SHARE locks.
  FOR v_booking_id IN
    SELECT linked.id FROM (
      SELECT NEW.booking_id AS id
      UNION
      SELECT ib.booking_id FROM public.invoice_bookings ib
       WHERE ib.invoice_id = NEW.id
         AND COALESCE(ib.organization_id, NEW.organization_id) = NEW.organization_id
    ) linked WHERE linked.id IS NOT NULL ORDER BY linked.id
  LOOP
    PERFORM 1 FROM public.bookings b
     WHERE b.id = v_booking_id AND b.organization_id = NEW.organization_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Factura o reserva inexistente o no autorizada.' USING ERRCODE = '42501';
    END IF;
    SELECT b.status INTO v_status FROM public.bookings b
     WHERE b.id = v_booking_id AND b.organization_id = NEW.organization_id;
    IF v_active AND v_status = 'cancelled' THEN
      RAISE EXCEPTION 'No se puede emitir ni ligar una factura vigente a una reserva cancelada.'
        USING ERRCODE = '23514', CONSTRAINT = 'invoice_booking_not_cancelled';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_invoice_booking_cancellation() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_invoice_booking_link_cancellation()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_invoice_status text;
  v_cancellation_status text;
  v_booking_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.invoice_id, NEW.booking_id, NEW.organization_id)
       IS NOT DISTINCT FROM ROW(OLD.invoice_id, OLD.booking_id, OLD.organization_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL OR (auth.uid() IS NOT NULL AND (
       NEW.organization_id IS DISTINCT FROM public.current_internal_organization_id()
       OR NOT public.is_internal_member(auth.uid())
     )) THEN
    RAISE EXCEPTION 'Factura o reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND current_setting('role', true) NOT IN ('none', 'postgres', 'service_role') THEN
    RAISE EXCEPTION 'Factura o reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;

  -- Lock even a draft invoice: concurrent issuance must see the committed new
  -- pivot, or this attach must see issuance and reject a cancelled booking.
  IF TG_OP = 'UPDATE' THEN
    -- UPDATE already owns the pivot tuple before this ROW trigger. Waiting on
    -- its invoice could invert save_invoice_with_bookings: invoice -> DELETE
    -- pivot. Abort only this contended update so the caller can retry safely.
    BEGIN
      PERFORM 1 FROM public.invoices i
       WHERE i.id = NEW.invoice_id AND i.organization_id = NEW.organization_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'La factura esta siendo editada. Reintenta la vinculacion de la reserva.' USING ERRCODE = '55P03';
    END;
  ELSE
    PERFORM 1 FROM public.invoices i
     WHERE i.id = NEW.invoice_id AND i.organization_id = NEW.organization_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura o reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.bookings b
   WHERE b.id = NEW.booking_id AND b.organization_id = NEW.organization_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura o reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  -- Reread only after both row locks, never from a pre-lock/stable snapshot.
  SELECT i.status, i.cancellation_status INTO v_invoice_status, v_cancellation_status
    FROM public.invoices i WHERE i.id = NEW.invoice_id AND i.organization_id = NEW.organization_id;
  SELECT b.status INTO v_booking_status FROM public.bookings b
   WHERE b.id = NEW.booking_id AND b.organization_id = NEW.organization_id;
  IF v_invoice_status NOT IN ('draft', 'cancelled')
     AND v_cancellation_status IS DISTINCT FROM 'accepted' AND v_booking_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede emitir ni ligar una factura vigente a una reserva cancelada.'
      USING ERRCODE = '23514', CONSTRAINT = 'invoice_booking_not_cancelled';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_invoice_booking_link_cancellation() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint

-- Organization is filled by trg_organization_write_context. These names sort
-- AFTER it, including RPC INSERTs that omit organization_id on invoice/pivot.
CREATE TRIGGER zz_guard_booking_cancellation_invoices
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_cancellation_invoices();
CREATE TRIGGER zz_guard_invoice_booking_cancellation
  BEFORE INSERT OR UPDATE OF status, booking_id, cancellation_status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_booking_cancellation();
CREATE TRIGGER zz_guard_invoice_booking_link_cancellation
  BEFORE INSERT OR UPDATE OF invoice_id, booking_id ON public.invoice_bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_booking_link_cancellation();
