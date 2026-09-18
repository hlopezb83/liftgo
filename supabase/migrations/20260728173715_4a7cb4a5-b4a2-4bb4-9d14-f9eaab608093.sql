-- B-8 Fase 2/3: candidatos de emparejamiento y acciones masivas de conciliación bancaria.

CREATE OR REPLACE FUNCTION public.get_bank_match_candidates(
  p_line_id uuid,
  p_search text DEFAULT NULL,
  p_date_window integer DEFAULT 15,
  p_amount_tolerance numeric DEFAULT 0.01
)
RETURNS TABLE(
  id uuid,
  kind text,
  candidate_date date,
  amount numeric,
  reference text,
  label text,
  score integer,
  day_diff integer,
  exact_amount boolean,
  reference_hit boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line   public.bank_statement_lines%ROWTYPE;
  v_abs    numeric(14,2);
  v_text   text;
  v_search text;
  v_window integer := GREATEST(0, LEAST(COALESCE(p_date_window, 15), 120));
  v_tol    numeric := GREATEST(0.01, COALESCE(p_amount_tolerance, 0.01));
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_line FROM public.bank_statement_lines WHERE bank_statement_lines.id = p_line_id;
  IF v_line.id IS NULL THEN
    RAISE EXCEPTION 'línea inexistente' USING ERRCODE = 'P0001';
  END IF;

  v_abs  := ABS(v_line.signed_amount);
  v_text := lower(COALESCE(v_line.description, '') || ' ' || COALESCE(v_line.reference, ''));
  v_search := NULLIF(lower(btrim(COALESCE(p_search, ''))), '');

  IF v_line.signed_amount < 0 THEN
    -- Cargo del banco → pagos a proveedores
    RETURN QUERY
    SELECT
      sp.id,
      'supplier_payment'::text,
      sp.payment_date,
      sp.amount,
      sp.reference,
      COALESCE(sb.bill_number, '—') || ' · ' || COALESCE(s.name, 'Sin proveedor'),
      (60
        + GREATEST(0, 25 - ABS(sp.payment_date - v_line.posted_date) * 8)
        + CASE WHEN sp.reference IS NOT NULL AND btrim(sp.reference) <> ''
                    AND position(lower(sp.reference) IN v_text) > 0
               THEN 15 ELSE 0 END)::integer,
      ABS(sp.payment_date - v_line.posted_date)::integer,
      ABS(sp.amount - v_abs) <= 0.01,
      (sp.reference IS NOT NULL AND btrim(sp.reference) <> ''
        AND position(lower(sp.reference) IN v_text) > 0)
    FROM public.supplier_payments sp
    LEFT JOIN public.supplier_bills sb ON sb.id = sp.bill_id
    LEFT JOIN public.suppliers s ON s.id = sb.supplier_id
    WHERE ABS(sp.amount - v_abs) <= v_tol
      AND ABS(sp.payment_date - v_line.posted_date) <= v_window
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_statement_lines bsl
        WHERE bsl.matched_supplier_payment_id = sp.id AND bsl.id <> p_line_id
      )
      AND (
        v_search IS NULL
        OR lower(COALESCE(sp.reference, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(sb.bill_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(s.name, '')) LIKE '%' || v_search || '%'
        OR CAST(sp.amount AS text) LIKE '%' || v_search || '%'
      )
    ORDER BY 7 DESC, 8 ASC
    LIMIT 50;
  ELSE
    -- Abono del banco → pagos de clientes
    RETURN QUERY
    SELECT
      p.id,
      'payment'::text,
      p.payment_date,
      p.amount,
      p.reference_number,
      COALESCE(i.invoice_number, '—') || ' · ' || COALESCE(i.customer_name, 'Sin cliente'),
      (60
        + GREATEST(0, 25 - ABS(p.payment_date - v_line.posted_date) * 8)
        + CASE WHEN p.reference_number IS NOT NULL AND btrim(p.reference_number) <> ''
                    AND position(lower(p.reference_number) IN v_text) > 0
               THEN 15 ELSE 0 END)::integer,
      ABS(p.payment_date - v_line.posted_date)::integer,
      ABS(p.amount - v_abs) <= 0.01,
      (p.reference_number IS NOT NULL AND btrim(p.reference_number) <> ''
        AND position(lower(p.reference_number) IN v_text) > 0)
    FROM public.payments p
    LEFT JOIN public.invoices i ON i.id = p.invoice_id
    WHERE ABS(p.amount - v_abs) <= v_tol
      AND ABS(p.payment_date - v_line.posted_date) <= v_window
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_statement_lines bsl
        WHERE bsl.matched_payment_id = p.id AND bsl.id <> p_line_id
      )
      AND (
        v_search IS NULL
        OR lower(COALESCE(p.reference_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(i.invoice_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(i.customer_name, '')) LIKE '%' || v_search || '%'
        OR CAST(p.amount AS text) LIKE '%' || v_search || '%'
      )
    ORDER BY 7 DESC, 8 ASC
    LIMIT 50;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_bank_match_candidates(uuid, text, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_match_candidates(uuid, text, integer, numeric) TO authenticated;

-- Confirmación masiva de líneas sugeridas (usa la sugerencia guardada en cada línea).
CREATE OR REPLACE FUNCTION public.confirm_bank_matches(p_line_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_line_ids IS NULL OR array_length(p_line_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_id IN
    SELECT bsl.id
    FROM public.bank_statement_lines bsl
    WHERE bsl.id = ANY(p_line_ids)
      AND bsl.status = 'suggested'::bank_line_status
      AND (bsl.suggested_payment_id IS NOT NULL OR bsl.suggested_supplier_payment_id IS NOT NULL)
    ORDER BY bsl.posted_date
  LOOP
    PERFORM public.confirm_bank_match(
      v_id,
      (SELECT suggested_payment_id FROM public.bank_statement_lines WHERE id = v_id),
      (SELECT suggested_supplier_payment_id FROM public.bank_statement_lines WHERE id = v_id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_bank_matches(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_bank_matches(uuid[]) TO authenticated;

-- Ignorado masivo con una razón común.
CREATE OR REPLACE FUNCTION public.ignore_bank_lines(p_line_ids uuid[], p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_line_ids IS NULL OR array_length(p_line_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'la razón es obligatoria' USING ERRCODE = 'P0001';
  END IF;

  WITH upd AS (
    UPDATE public.bank_statement_lines
       SET status = 'ignored'::bank_line_status,
           ignored_reason = btrim(p_reason)
     WHERE id = ANY(p_line_ids)
       AND status IN ('unmatched'::bank_line_status, 'suggested'::bank_line_status)
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM upd;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.ignore_bank_lines(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ignore_bank_lines(uuid[], text) TO authenticated;