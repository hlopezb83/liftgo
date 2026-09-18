
-- 1. Draft invoice sequence + RPCs
CREATE SEQUENCE IF NOT EXISTS public.draft_invoice_seq START 1;

CREATE OR REPLACE FUNCTION public.next_draft_invoice_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'BORRADOR-' || lpad(nextval('public.draft_invoice_seq')::text, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.peek_next_draft_invoice_number()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last bigint;
  v_called boolean;
  v_next bigint;
BEGIN
  SELECT last_value, is_called
    INTO v_last, v_called
    FROM public.draft_invoice_seq;
  v_next := CASE WHEN v_called THEN v_last + 1 ELSE v_last END;
  RETURN 'BORRADOR-' || lpad(v_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_draft_invoice_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.peek_next_draft_invoice_number() TO authenticated, service_role;

-- 2. Assign folio at stamping time (Facturapi = source of truth)
CREATE OR REPLACE FUNCTION public.assign_stamped_invoice_number(
  p_invoice_id uuid,
  p_serie text,
  p_folio text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_number text;
  v_existing_id uuid;
BEGIN
  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'FAC-' || lpad(p_folio, 4, '0');

  -- Detect collisions (should not happen if the Facturapi series is exclusive)
  SELECT id INTO v_existing_id
  FROM public.invoices
  WHERE invoice_number = v_new_number AND id <> p_invoice_id;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'invoice_number % already exists on invoice %', v_new_number, v_existing_id;
  END IF;

  UPDATE public.invoices
     SET invoice_number = v_new_number,
         serie = COALESCE(p_serie, serie),
         folio = p_folio
   WHERE id = p_invoice_id;

  RETURN v_new_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_stamped_invoice_number(uuid, text, text) TO service_role;

-- 3. Migrate existing drafts: FAC-XXXX -> BORRADOR-XXXX (frees the fiscal folios)
UPDATE public.invoices
   SET invoice_number = 'BORRADOR-' || lpad(nextval('public.draft_invoice_seq')::text, 4, '0')
 WHERE status = 'draft'
   AND invoice_number LIKE 'FAC-%'
   AND cfdi_uuid IS NULL
   AND facturapi_invoice_id IS NULL;
