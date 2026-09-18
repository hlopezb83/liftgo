-- H4: elimina el re-claim "stale" de pagos en rep_cfdi_status='stamping'.
CREATE OR REPLACE FUNCTION public.claim_payment_rep_stamping(
  p_payment_id uuid,
  p_stale_minutes integer DEFAULT 5
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed uuid;
  v_status text;
BEGIN
  UPDATE public.payments
     SET rep_cfdi_status = 'stamping',
         rep_stamping_started_at = now()
   WHERE id = p_payment_id
     AND (
       (rep_cfdi_status IN ('pending', 'error', 'none') AND rep_cfdi_uuid IS NULL)
       OR rep_cfdi_status = 'cancelled'
     )
  RETURNING id INTO v_claimed;

  IF v_claimed IS NOT NULL THEN
    RETURN 'claimed';
  END IF;

  SELECT rep_cfdi_status INTO v_status FROM public.payments WHERE id = p_payment_id;
  RETURN COALESCE(v_status, 'not_found');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_rep_stamping(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_payment_rep_stamping(uuid, integer) TO service_role;

-- H6: flag de "timbrada sin XML local".
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cfdi_xml_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.invoices.cfdi_xml_pending IS
  'true = CFDI timbrado ante el SAT pero sin XML/PDF archivado en Storage (reconcile agotó reintentos).';