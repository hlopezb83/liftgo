-- Preserve the existing signature, owner, ACL and organization authorization.
-- A stale stamping claim may represent a lost PAC response. Only reconciliation
-- can establish absence and return it to error; elapsed time never permits a
-- second emission. p_stale_minutes remains for caller compatibility only.
CREATE OR REPLACE FUNCTION public.claim_payment_rep_stamping(p_payment_id uuid, p_stale_minutes integer DEFAULT 5)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claimed uuid;
  v_status text;
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT (public.has_role(v_uid, 'admin'::app_role)
            OR public.has_role(v_uid, 'administrativo'::app_role)) THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere rol Admin o Administrativo';
    END IF;

    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere rol Admin o Administrativo';
    END IF;
  END IF;

  UPDATE public.payments
     SET rep_cfdi_status = 'stamping',
         rep_stamping_started_at = now(),
         rep_lookup_attempts = 0
   WHERE id = p_payment_id
     AND (v_org IS NULL OR organization_id = v_org)
     AND rep_facturapi_id IS NULL
     AND rep_cfdi_uuid IS NULL
     AND rep_cfdi_status IN ('pending', 'error', 'none', 'cancelled')
  RETURNING id INTO v_claimed;

  IF v_claimed IS NOT NULL THEN
    RETURN 'claimed';
  END IF;

  SELECT rep_cfdi_status INTO v_status FROM public.payments
   WHERE id = p_payment_id
     AND (v_org IS NULL OR organization_id = v_org);
  RETURN COALESCE(v_status, 'not_found');
END;
$function$;
