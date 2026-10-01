-- New notifications only: preserve historical audit evidence.
CREATE FUNCTION public.notify_organization_admins(
  p_organization_id uuid, p_type text, p_title text,
  p_message text DEFAULT NULL, p_link text DEFAULT NULL,
  p_entity_type text DEFAULT NULL, p_entity_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_count integer;
BEGIN
  IF p_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_organization_id AND is_active
  ) THEN
    RAISE EXCEPTION 'La notificación requiere una empresa activa'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.notifications
    (organization_id, user_id, type, title, message, link, entity_type, entity_id)
  SELECT DISTINCT p_organization_id, m.auth_user_id, p_type, p_title,
    p_message, p_link, p_entity_type, p_entity_id
  FROM public.organization_memberships m
  JOIN public.user_roles ur ON ur.user_id = m.auth_user_id
  JOIN public.profiles pr ON pr.user_id = m.auth_user_id AND pr.is_active
  WHERE m.organization_id = p_organization_id
    AND m.member_type = 'internal'
    AND ur.role IN ('admin', 'administrativo')
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_memberships other_membership
      WHERE other_membership.auth_user_id = m.auth_user_id
        AND (other_membership.organization_id <> p_organization_id
          OR other_membership.member_type <> 'internal')
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- Internal trigger helper: authenticated clients cannot choose a recipient org.
REVOKE ALL ON FUNCTION public.notify_organization_admins(uuid, text, text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_organization_admins(uuid, text, text, text, text, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.notify_admins(
  p_type text, p_title text, p_message text DEFAULT NULL,
  p_link text DEFAULT NULL, p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_org uuid := public.current_internal_organization_id();
BEGIN
  IF auth.uid() IS NULL THEN
    v_org := NULLIF(current_setting('app.organization_id', true), '')::uuid;
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Falta el contexto interno de empresa' USING ERRCODE = '42501';
  END IF;
  IF p_entity_type = 'invoice' AND NOT EXISTS (
    SELECT 1 FROM public.invoices WHERE id = p_entity_id AND organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Factura fuera de la empresa' USING ERRCODE = '42501';
  END IF;
  RETURN public.notify_organization_admins(
    v_org, p_type, p_title, p_message, p_link, p_entity_type, p_entity_id
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_payment_received()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_invoice record;
BEGIN
  SELECT invoice_number, customer_name, organization_id, moneda INTO v_invoice
  FROM public.invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND OR v_invoice.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'El pago y la factura deben pertenecer a la misma empresa'
      USING ERRCODE = '23514';
  END IF;
  PERFORM public.notify_organization_admins(
    v_invoice.organization_id, 'payment_received', 'Pago recibido',
    'Se registró un pago de $' || to_char(NEW.amount, 'FM999,999,990.00')
      || ' ' || COALESCE(v_invoice.moneda, 'MXN')
      || ' para la factura ' || COALESCE(v_invoice.invoice_number, '')
      || ' (' || COALESCE(v_invoice.customer_name, 'Cliente') || ')',
    '/invoices/' || NEW.invoice_id, 'invoice', NEW.invoice_id
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_payment_received() FROM PUBLIC, anon, authenticated;

-- Cloud already has this trigger, but the historical migrations omitted it.
-- Version the same wiring so a fresh database also emits exactly one event.
CREATE OR REPLACE TRIGGER trg_notify_payment_received
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_received();
