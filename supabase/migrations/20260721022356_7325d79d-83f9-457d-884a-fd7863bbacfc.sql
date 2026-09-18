-- BLOQUE 2.2: prepare_payment_complement — un solo RPC transaccional que
-- bloquea la factura, calcula NumParcialidad e ImpSaldoAnt y RESERVA esos
-- valores en payments antes de retornar. Concurrencia real: dos llamadas
-- para el mismo invoice se serializan por el FOR UPDATE en invoices; cuando
-- la primera commitea con installment_number seteado, la segunda ya lo ve y
-- computa el siguiente número.

CREATE OR REPLACE FUNCTION public.prepare_payment_complement(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_invoice invoices%ROWTYPE;
  v_prior_paid numeric := 0;
  v_prior_emissions integer := 0;
  v_installment integer;
  v_prior_balance numeric;
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_id requerido';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % no existe', p_payment_id;
  END IF;

  -- FOR UPDATE en la fila de invoices serializa a REPs concurrentes de la
  -- misma factura: la 2ª llamada se bloquea aquí hasta que la 1ª commitea.
  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_payment.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % no existe', v_payment.invoice_id;
  END IF;

  -- BL-06: priorPaid solo de REPs stamped (no cancelled).
  -- BL-07: NumParcialidad cuenta stamped + cancelados con UUID emitido +
  -- reservados (installment_number NOT NULL) + este mismo pago si ya emitió.
  SELECT
    COALESCE(SUM(CASE WHEN p.rep_cfdi_status = 'stamped' AND p.id <> p_payment_id THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(
      CASE
        WHEN p.id = p_payment_id THEN 0
        WHEN p.rep_cfdi_status = 'stamped' THEN 1
        WHEN p.rep_cfdi_status = 'cancelled' AND p.rep_cfdi_uuid IS NOT NULL THEN 1
        WHEN p.installment_number IS NOT NULL THEN 1
        ELSE 0
      END
    ), 0)
  INTO v_prior_paid, v_prior_emissions
  FROM public.payments p
  WHERE p.invoice_id = v_invoice.id;

  IF v_payment.rep_cfdi_uuid IS NOT NULL THEN
    v_prior_emissions := v_prior_emissions + 1;
  END IF;

  v_installment := v_prior_emissions + 1;
  v_prior_balance := round((v_invoice.total - v_prior_paid)::numeric, 2);

  IF v_payment.amount <= 0 OR v_payment.amount > v_prior_balance + 0.01 THEN
    RAISE EXCEPTION 'Monto inválido para complemento: pago=%, saldo previo=%',
      v_payment.amount, v_prior_balance;
  END IF;

  -- Reserva atómica: aunque el row-lock se libere al retornar, la próxima
  -- llamada ya ve installment_number/prior_balance seteados y computa N+1.
  UPDATE public.payments SET
    installment_number = v_installment,
    prior_balance = v_prior_balance
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'installment_number', v_installment,
    'prior_balance', v_prior_balance,
    'invoice_id', v_invoice.id,
    'invoice_total', v_invoice.total,
    'invoice_currency', v_invoice.moneda,
    'invoice_exchange', v_invoice.tipo_cambio,
    'invoice_cfdi_uuid', v_invoice.cfdi_uuid,
    'invoice_tax_rate', v_invoice.tax_rate,
    'invoice_metodo_pago', v_invoice.metodo_pago,
    'invoice_cfdi_status', v_invoice.cfdi_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_payment_complement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_payment_complement(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.prepare_payment_complement(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_payment_complement(uuid) TO service_role;

COMMENT ON FUNCTION public.prepare_payment_complement(uuid) IS
  'BLOQUE 2.2: bloquea invoice + payment con FOR UPDATE, calcula NumParcialidad/ImpSaldoAnt y RESERVA installment_number/prior_balance. Serializa REPs concurrentes de la misma factura.';

-- Elimina lock_invoice_for_rep: obsoleto. El row-lock moría al retornar la
-- función y los cálculos corrían desprotegidos.
DROP FUNCTION IF EXISTS public.lock_invoice_for_rep(uuid);

-- BLOQUE 2.3: reconcile_stamping_invoice ahora resetea stamping_attempts.
CREATE OR REPLACE FUNCTION public.reconcile_stamping_invoice(
  p_invoice_id uuid,
  p_facturapi_invoice_id text,
  p_cfdi_uuid text,
  p_xml_storage_path text DEFAULT NULL,
  p_pdf_storage_path text DEFAULT NULL,
  p_cfdi_xml text DEFAULT NULL,
  p_serie text DEFAULT NULL,
  p_folio text DEFAULT NULL,
  p_facturapi_env text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row invoices%ROWTYPE;
BEGIN
  IF p_invoice_id IS NULL OR p_facturapi_invoice_id IS NULL OR p_cfdi_uuid IS NULL THEN
    RAISE EXCEPTION 'invoice_id, facturapi_invoice_id y cfdi_uuid son obligatorios';
  END IF;

  SELECT * INTO v_row FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % no existe', p_invoice_id;
  END IF;

  IF v_row.cfdi_status = 'stamped' AND v_row.cfdi_uuid = p_cfdi_uuid THEN
    RETURN jsonb_build_object('status', 'already_reconciled', 'invoice_id', p_invoice_id);
  END IF;

  IF v_row.cfdi_status = 'stamped' AND v_row.cfdi_uuid IS NOT NULL AND v_row.cfdi_uuid <> p_cfdi_uuid THEN
    RAISE EXCEPTION 'Invoice % ya timbrada con UUID distinto (existente=%, nuevo=%)',
      p_invoice_id, v_row.cfdi_uuid, p_cfdi_uuid;
  END IF;

  IF v_row.cfdi_status NOT IN ('stamping', 'error', 'pending') THEN
    RAISE EXCEPTION 'Invoice % en estado % no reconciliable', p_invoice_id, v_row.cfdi_status;
  END IF;

  UPDATE public.invoices SET
    cfdi_uuid              = p_cfdi_uuid,
    cfdi_xml               = COALESCE(p_cfdi_xml, cfdi_xml),
    cfdi_xml_url           = COALESCE(p_xml_storage_path, cfdi_xml_url),
    cfdi_pdf_url           = COALESCE(p_pdf_storage_path, cfdi_pdf_url),
    cfdi_status            = 'stamped',
    cfdi_error_message     = NULL,
    facturapi_invoice_id   = COALESCE(facturapi_invoice_id, p_facturapi_invoice_id),
    facturapi_env          = COALESCE(p_facturapi_env, facturapi_env),
    serie                  = COALESCE(p_serie, serie),
    folio                  = COALESCE(p_folio, folio),
    stamping_attempts      = 0,
    status                 = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
    updated_at             = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('status', 'reconciled', 'invoice_id', p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stamping_invoice(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_stamping_invoice(uuid, text, text, text, text, text, text, text, text) TO service_role;