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
       OR (
         rep_cfdi_status = 'stamping'
         AND rep_cfdi_uuid IS NULL
         AND rep_stamping_started_at IS NOT NULL
         AND rep_stamping_started_at < now() - make_interval(mins => GREATEST(COALESCE(p_stale_minutes, 5), 1))
       )
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

CREATE OR REPLACE FUNCTION public.claim_maintenance_policy_month(
  p_policy_id uuid,
  p_month text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed uuid;
BEGIN
  UPDATE public.maintenance_policies
     SET last_generated_month = p_month
   WHERE id = p_policy_id
     AND is_active
     AND (last_generated_month IS NULL OR last_generated_month < p_month)
  RETURNING id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_maintenance_policy_month(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_maintenance_policy_month(uuid, text) TO service_role;