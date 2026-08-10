-- H4: elimina el re-claim "stale" de pagos en rep_cfdi_status='stamping'.
-- Tras un timeout del PAC el REP pudo haberse timbrado server-side; re-reclamar
-- a los 5 min y re-timbrar producía DOS CFDIs tipo P ante el SAT para el mismo
-- pago. Ahora 'stamping' solo lo destraba reconcile-stamping-invoices:
--   - PAC confirma timbrado (por external_id) → recupera uuid/xml → 'stamped'
--   - PAC confirma que NO existe → revierte a 'error' (re-intentable aquí)
-- Se conserva el parámetro p_stale_minutes (ignorado) por compatibilidad de firma.
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
       -- H4: SIN rama de re-claim stale sobre 'stamping'. Un pago en
       -- 'stamping' puede tener CFDI emitido en el PAC; solo el reconciliador
       -- (con lookup por external_id) decide si es recuperable o si no se
       -- timbró nada y puede volver a 'error'.
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
