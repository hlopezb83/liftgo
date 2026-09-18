
CREATE SEQUENCE IF NOT EXISTS public.draft_credit_note_seq START 1;

CREATE OR REPLACE FUNCTION public.next_draft_credit_note_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'BORRADOR-NC-' || lpad(nextval('public.draft_credit_note_seq')::text, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.peek_next_draft_credit_note_number()
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
    FROM public.draft_credit_note_seq;
  v_next := CASE WHEN v_called THEN v_last + 1 ELSE v_last END;
  RETURN 'BORRADOR-NC-' || lpad(v_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_draft_credit_note_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.peek_next_draft_credit_note_number() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_stamped_credit_note_number(
  p_credit_note_id uuid,
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

  v_new_number := 'NC-' || lpad(p_folio, 4, '0');

  SELECT id INTO v_existing_id
  FROM public.credit_notes
  WHERE credit_note_number = v_new_number AND id <> p_credit_note_id;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'credit_note_number % already exists on credit_note %', v_new_number, v_existing_id;
  END IF;

  UPDATE public.credit_notes
     SET credit_note_number = v_new_number
   WHERE id = p_credit_note_id;

  RETURN v_new_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_stamped_credit_note_number(uuid, text) TO service_role;

-- Backfill: migrar borradores existentes con folio fiscal (NC-XXXX) a BORRADOR-NC-XXXX
UPDATE public.credit_notes
   SET credit_note_number = 'BORRADOR-NC-' || lpad(nextval('public.draft_credit_note_seq')::text, 4, '0')
 WHERE status = 'draft'
   AND cfdi_uuid IS NULL
   AND facturapi_invoice_id IS NULL
   AND credit_note_number LIKE 'NC-%';
