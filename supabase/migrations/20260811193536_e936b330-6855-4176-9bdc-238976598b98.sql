-- B-3: guard de rol en numeradores de folio BORRADOR
CREATE OR REPLACE FUNCTION public.next_draft_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role IS DISTINCT FROM 'service_role'
     AND NOT (public.has_role(auth.uid(), 'admin'::app_role)
              OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN 'BORRADOR-' || lpad(nextval('public.draft_invoice_seq')::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.peek_next_draft_invoice_number()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
  v_last bigint;
  v_called boolean;
  v_next bigint;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role IS DISTINCT FROM 'service_role'
     AND NOT (public.has_role(auth.uid(), 'admin'::app_role)
              OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT last_value, is_called
    INTO v_last, v_called
    FROM public.draft_invoice_seq;
  v_next := CASE WHEN v_called THEN v_last + 1 ELSE v_last END;
  RETURN 'BORRADOR-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_draft_credit_note_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role IS DISTINCT FROM 'service_role'
     AND NOT (public.has_role(auth.uid(), 'admin'::app_role)
              OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN 'BORRADOR-NC-' || lpad(nextval('public.draft_credit_note_seq')::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.peek_next_draft_credit_note_number()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
  v_last bigint;
  v_called boolean;
  v_next bigint;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role IS DISTINCT FROM 'service_role'
     AND NOT (public.has_role(auth.uid(), 'admin'::app_role)
              OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT last_value, is_called
    INTO v_last, v_called
    FROM public.draft_credit_note_seq;
  v_next := CASE WHEN v_called THEN v_last + 1 ELSE v_last END;
  RETURN 'BORRADOR-NC-' || lpad(v_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_draft_invoice_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.peek_next_draft_invoice_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_draft_credit_note_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.peek_next_draft_credit_note_number() TO authenticated, service_role;

-- B-15: contadores de reintentos de timbrado para REP y NC
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS rep_stamping_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rep_xml_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payments.rep_stamping_attempts IS
  'B-15: intentos de reconcile-stamping-invoices por descargar el XML del REP. Tras 10 intentos el REP pasa a stamped + rep_xml_pending.';
COMMENT ON COLUMN public.payments.rep_xml_pending IS
  'B-15: true = REP timbrado ante el SAT pero sin XML/PDF archivado en Storage (reconcile agotó reintentos).';

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS stamping_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cfdi_xml_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.credit_notes.stamping_attempts IS
  'B-15: intentos de reconcile-stamping-invoices por descargar el XML de la NC. Tras 10 intentos la NC pasa a stamped + cfdi_xml_pending.';
COMMENT ON COLUMN public.credit_notes.cfdi_xml_pending IS
  'B-15: true = NC timbrada ante el SAT pero sin XML/PDF archivado en Storage (reconcile agotó reintentos).';