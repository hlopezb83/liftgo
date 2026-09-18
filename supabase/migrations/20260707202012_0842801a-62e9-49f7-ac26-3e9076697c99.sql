
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS rep_number text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS rep_folio text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_rep_number_uidx
  ON public.payments (rep_number)
  WHERE rep_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_stamped_rep_number(
  p_payment_id uuid,
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

  v_new_number := 'CP-' || lpad(p_folio, 4, '0');

  SELECT id INTO v_existing_id
  FROM public.payments
  WHERE rep_number = v_new_number AND id <> p_payment_id;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'rep_number % already exists on payment %', v_new_number, v_existing_id;
  END IF;

  UPDATE public.payments
     SET rep_number = v_new_number,
         rep_folio = p_folio
   WHERE id = p_payment_id;

  RETURN v_new_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text) TO service_role;
