-- Complete an invoice form save and its requested source effects together.
-- The existing 4/5 argument RPCs remain authoritative for invoice, booking,
-- damage, fiscal, overlap and optimistic-version guards. No historical rewrite.
CREATE FUNCTION public.save_invoice_with_sources(
  p_invoice jsonb,
  p_booking_ids uuid[] DEFAULT '{}'::uuid[],
  p_invoice_id uuid DEFAULT NULL::uuid,
  p_expected_version integer DEFAULT NULL::integer,
  p_damage_id uuid DEFAULT NULL::uuid,
  p_extension_id uuid DEFAULT NULL::uuid,
  p_accept_quote_id uuid DEFAULT NULL::uuid,
  p_quote_expected_version integer DEFAULT NULL::integer
)
RETURNS SETOF public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_extension public.booking_extensions%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_quote public.quotes%ROWTYPE;
  v_damage public.damage_records%ROWTYPE;
  v_updated integer;
BEGIN
  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Los datos de la factura deben ser un objeto.' USING ERRCODE = '23514';
  END IF;
  IF p_invoice_id IS NOT NULL
     AND (p_damage_id IS NOT NULL OR p_extension_id IS NOT NULL OR p_accept_quote_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Los orígenes sólo pueden ligarse al crear la factura.' USING ERRCODE = '23514';
  END IF;
  IF p_accept_quote_id IS NULL AND p_quote_expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'La versión de cotización requiere su cotización de origen.' USING ERRCODE = '23514';
  END IF;
  IF p_accept_quote_id IS NOT NULL THEN
    IF p_accept_quote_id IS DISTINCT FROM NULLIF(p_invoice->>'quote_id', '')::uuid THEN
      RAISE EXCEPTION 'La cotización a aceptar debe ser la cotización de la factura.' USING ERRCODE = '23514';
    END IF;
    IF p_quote_expected_version IS NULL OR p_quote_expected_version < 1 THEN
      RAISE EXCEPTION 'Recarga la cotización antes de crear su factura: falta una versión válida.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Do not lock a source quote/extension before the invoice. Invoice triggers
  -- already lock their quote rows in deterministic order; issuing an invoice
  -- also takes invoice -> extension locks. Errors below roll back this save.
  IF p_damage_id IS NOT NULL THEN
    SELECT saved.* INTO STRICT v_invoice
    FROM public.save_invoice_with_bookings(
      p_invoice, p_booking_ids, p_invoice_id, p_expected_version, p_damage_id
    ) AS saved;
  ELSE
    SELECT saved.* INTO STRICT v_invoice
    FROM public.save_invoice_with_bookings(
      p_invoice, p_booking_ids, p_invoice_id, p_expected_version
    ) AS saved;
  END IF;

  IF v_invoice.id IS NULL OR v_invoice.organization_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo confirmar la identidad de la factura guardada.' USING ERRCODE = 'P0001';
  END IF;
  IF (p_damage_id IS NOT NULL OR p_extension_id IS NOT NULL OR p_accept_quote_id IS NOT NULL)
     AND (v_invoice.status IS DISTINCT FROM 'draft' OR v_invoice.cfdi_uuid IS NOT NULL
          OR COALESCE(v_invoice.cfdi_status IN ('stamping', 'stamped', 'cancelled'), false)) THEN
    RAISE EXCEPTION 'Los orígenes requieren una nueva factura en borrador, sin emisión fiscal.' USING ERRCODE = '23514';
  END IF;

  IF p_damage_id IS NOT NULL THEN
    -- The delegated 5-argument RPC retains its damage lock. Explicit tenant
    -- equality also protects service-role callers, which can bypass RLS.
    SELECT * INTO v_damage FROM public.damage_records WHERE id = p_damage_id;
    IF NOT FOUND OR v_damage.organization_id IS DISTINCT FROM v_invoice.organization_id
       OR v_damage.invoice_id IS DISTINCT FROM v_invoice.id THEN
      RAISE EXCEPTION 'El daño no corresponde a la empresa de esta factura.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_extension_id IS NOT NULL THEN
    SELECT * INTO v_extension
    FROM public.booking_extensions
    WHERE id = p_extension_id AND organization_id = v_invoice.organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Extensión no encontrada o sin permisos para modificarla.' USING ERRCODE = '42501';
    END IF;
    IF v_extension.invoice_id IS NOT NULL OR v_extension.billed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Esta extensión ya fue facturada.' USING ERRCODE = '23505';
    END IF;
    IF v_extension.pending_invoice_id IS NOT NULL
       AND v_extension.pending_invoice_id IS DISTINCT FROM v_invoice.id THEN
      RAISE EXCEPTION 'Esta extensión ya está reservada por otra factura. Revisa ese borrador antes de continuar.' USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_booking FROM public.bookings
    WHERE id = v_extension.booking_id AND organization_id = v_invoice.organization_id;
    IF NOT FOUND
       OR (v_invoice.booking_id IS DISTINCT FROM v_extension.booking_id AND NOT EXISTS (
         SELECT 1 FROM public.invoice_bookings ib
         WHERE ib.invoice_id = v_invoice.id AND ib.booking_id = v_extension.booking_id
           AND ib.organization_id = v_invoice.organization_id
       )) THEN
      RAISE EXCEPTION 'La factura no corresponde a la reserva de esta extensión.' USING ERRCODE = '23514';
    END IF;
    IF v_booking.customer_id IS NOT NULL AND v_invoice.customer_id IS DISTINCT FROM v_booking.customer_id THEN
      RAISE EXCEPTION 'La factura debe pertenecer al cliente de la extensión.' USING ERRCODE = '23514';
    END IF;
    IF v_invoice.billing_period_start IS NULL OR v_invoice.billing_period_end IS NULL
       OR v_extension.original_end_date IS NULL OR v_extension.new_end_date IS NULL
       OR v_extension.new_end_date <= v_extension.original_end_date
       OR v_invoice.billing_period_start > v_extension.original_end_date + 1
       OR v_invoice.billing_period_end < v_extension.new_end_date THEN
      RAISE EXCEPTION 'El periodo de la factura debe cubrir todos los días de la extensión.' USING ERRCODE = '23514';
    END IF;

    -- Reserve the draft only. Existing issuance triggers own invoice_id and
    -- billed_at. Never replace another pending invoice, even if cancelled.
    UPDATE public.booking_extensions
       SET pending_invoice_id = v_invoice.id
     WHERE id = p_extension_id AND organization_id = v_invoice.organization_id
       AND invoice_id IS NULL AND billed_at IS NULL
       AND (pending_invoice_id IS NULL OR pending_invoice_id = v_invoice.id);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'No se pudo reservar la extensión; no se guardó ningún cambio.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_accept_quote_id IS NOT NULL THEN
    -- NO KEY UPDATE matches the existing quote-charge lock and avoids an
    -- unnecessary upgrade against concurrent foreign-key KEY SHARE readers.
    SELECT * INTO v_quote FROM public.quotes
    WHERE id = p_accept_quote_id AND organization_id = v_invoice.organization_id
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cotización no encontrada o sin permisos para modificarla.' USING ERRCODE = '42501';
    END IF;
    IF v_invoice.quote_id IS DISTINCT FROM v_quote.id
       OR v_invoice.customer_id IS DISTINCT FROM v_quote.customer_id THEN
      RAISE EXCEPTION 'La factura debe conservar la cotización y su cliente de origen.' USING ERRCODE = '23514';
    END IF;
    IF v_quote.version IS DISTINCT FROM p_quote_expected_version THEN
      RAISE EXCEPTION 'stale_write: otro usuario modificó esta cotización; recarga y vuelve a intentar' USING ERRCODE = '55000';
    END IF;
    IF v_quote.status = 'sent' THEN
      -- Keep the existing acceptance/expiry/state/version triggers enabled.
      UPDATE public.quotes SET status = 'accepted'
      WHERE id = v_quote.id AND organization_id = v_invoice.organization_id
        AND status = 'sent' AND version = p_quote_expected_version;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN
        RAISE EXCEPTION 'No se pudo aceptar la cotización; no se guardó ningún cambio.' USING ERRCODE = '42501';
      END IF;
    ELSIF v_quote.status IS NULL OR v_quote.status NOT IN ('accepted', 'converted') THEN
      RAISE EXCEPTION 'La cotización debe estar enviada, aceptada o convertida antes de crear su factura. Revisa su estado y vigencia.' USING ERRCODE = '23514';
    END IF;
    -- Already accepted/converted: no UPDATE, no version bump or date rewrite.
  END IF;

  RETURN NEXT v_invoice;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.save_invoice_with_sources(jsonb, uuid[], uuid, integer, uuid, uuid, uuid, integer) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.save_invoice_with_sources(jsonb, uuid[], uuid, integer, uuid, uuid, uuid, integer) TO authenticated, service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
