-- BF03/BF04: canonical settlement date and idempotent credit-note status.
-- Forward-only function replacement; preserves organization/FX guards and ACLs.
-- No data backfill, GRANT/REVOKE, fiscal operation or remote migration execution.

CREATE OR REPLACE FUNCTION public.sync_invoice_status(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_invoice_id uuid;
  v_invoice_org uuid;
  v_total numeric;
  v_status text;
  v_paid numeric;
  v_credited numeric;
  v_latest_date date;
  v_due date;
  v_target text;
  v_paid_at date;
  v_target_paid_at date;
  v_moneda text;
  v_tc numeric;
  v_missing_fx boolean;
BEGIN
  v_invoice_id := p_invoice_id;
  IF v_invoice_id IS NULL THEN
    RETURN;
  END IF;

  IF v_uid IS NOT NULL AND public.is_internal_member(v_uid) THEN
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT total, status, due_date, moneda, tipo_cambio, organization_id, paid_at
    INTO v_total, v_status, v_due, v_moneda, v_tc, v_invoice_org, v_paid_at
  FROM public.invoices WHERE id = v_invoice_id
  FOR UPDATE;
  IF v_total IS NULL THEN
    RETURN;
  END IF;

  -- Llamada directa desde una sesión interna: sólo su propia organización.
  IF v_org IS NOT NULL AND v_invoice_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_status IN ('cancelled', 'draft') THEN
    RETURN;
  END IF;

  v_moneda := upper(COALESCE(v_moneda, 'MXN'));

  -- Same per-payment conversion/rounding as v_invoices_with_balance.
  SELECT COALESCE(SUM(public.fx_convert_amount(p.amount, COALESCE(p.currency, v_moneda, 'MXN'), v_moneda, NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0))), 0), MAX(p.payment_date),
         COALESCE(bool_or((public.fx_convert_amount(p.amount, COALESCE(p.currency, v_moneda, 'MXN'), v_moneda, NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0)) IS NULL OR (public.fx_convert_amount(p.amount, COALESCE(p.currency, v_moneda, 'MXN'), v_moneda, NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0)))::text IN ('NaN','Infinity','-Infinity'))), false)
    INTO v_paid, v_latest_date, v_missing_fx
  FROM public.payments p
  WHERE p.invoice_id = v_invoice_id
    AND COALESCE(p.organization_id, v_invoice_org) = v_invoice_org;

  -- Unknown money must not manufacture a paid status. Leave it unchanged so
  -- non-fiscal notes and repair/deletion of legacy bad-FX payments remain possible.
  IF v_missing_fx THEN RETURN; END IF;

  -- N-21 / R4-15: criterio canónico de NC (mismo que la vista y la UI).
  SELECT COALESCE(SUM(total), 0) INTO v_credited
  FROM public.credit_notes
  WHERE invoice_id = v_invoice_id
    AND COALESCE(organization_id, v_invoice_org) = v_invoice_org
    AND cfdi_status = 'stamped'
    AND status <> 'cancelled'
    AND cancellation_status IS DISTINCT FROM 'accepted';

  IF v_total::text IN ('NaN','Infinity','-Infinity') OR v_credited::text IN ('NaN','Infinity','-Infinity') THEN RETURN; END IF;

  PERFORM set_config('app.payment_sync', 'on', true);

  IF v_paid >= v_total - v_credited - 0.005 AND v_paid > 0 THEN
    v_target := 'paid';
    -- BF03: editing a settlement payment date must reconcile paid_at even
    -- when the invoice remains paid. Keep the canonical latest payment date.
    v_target_paid_at := COALESCE(v_latest_date, public.today_mty());
  ELSIF v_paid = 0 AND v_credited >= v_total - 0.005 THEN
    v_target := 'paid';
    -- Credit-only settlement has no payment date. Preserve its initial date
    -- on repeated reconciliation instead of moving it to each new day.
    v_target_paid_at := CASE WHEN v_status = 'paid'
      THEN COALESCE(v_paid_at, public.today_mty()) ELSE public.today_mty() END;
  ELSIF (v_paid + v_credited) > 0 THEN
    -- BF04: partial coverage is partial regardless of the previous status,
    -- including after cancelling one of the notes that fully covered it.
    v_target := 'partial';
    v_target_paid_at := NULL;
  ELSE
    v_target := CASE
      WHEN v_due IS NOT NULL AND v_due < public.today_mty() THEN 'overdue'
      ELSE 'sent'
    END;
    v_target_paid_at := NULL;
  END IF;

  UPDATE public.invoices SET status = v_target, paid_at = v_target_paid_at
    WHERE id = v_invoice_id
      AND ROW(status, paid_at) IS DISTINCT FROM ROW(v_target, v_target_paid_at);
END;
$function$;
