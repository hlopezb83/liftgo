
-- Ola 2.3 — Resiliencia CFDI: RPC de conciliación idempotente para facturas
-- que quedaron en cfdi_status='stamping' con el CFDI ya emitido en Facturapi.

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

  -- Idempotencia: ya conciliada con el mismo UUID → OK silencioso.
  IF v_row.cfdi_status = 'stamped' AND v_row.cfdi_uuid = p_cfdi_uuid THEN
    RETURN jsonb_build_object('status', 'already_reconciled', 'invoice_id', p_invoice_id);
  END IF;

  -- Conflicto real: ya está timbrada con OTRO UUID → abortar (indica bug o timbrado duplicado).
  IF v_row.cfdi_status = 'stamped' AND v_row.cfdi_uuid IS NOT NULL AND v_row.cfdi_uuid <> p_cfdi_uuid THEN
    RAISE EXCEPTION 'Invoice % ya timbrada con UUID distinto (existente=%, nuevo=%)',
      p_invoice_id, v_row.cfdi_uuid, p_cfdi_uuid;
  END IF;

  -- Solo permitimos reconciliar desde 'stamping' o 'error'.
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
    status                 = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
    updated_at             = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('status', 'reconciled', 'invoice_id', p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stamping_invoice(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_stamping_invoice(uuid, text, text, text, text, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.reconcile_stamping_invoice IS
  'EC-A2: conciliación idempotente de facturas atascadas en cfdi_status=stamping cuya emisión en Facturapi sí tuvo éxito. Solo service_role (usada por edge functions).';
