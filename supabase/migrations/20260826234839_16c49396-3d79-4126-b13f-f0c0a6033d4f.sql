-- FIX R4-11: conversion FX bidireccional en confirm_bank_match y
-- get_bank_match_candidates (pago MXN -> cuenta en divisa divide por el TC)
-- con redondeo a 2 decimales antes de comparar con la tolerancia.
CREATE OR REPLACE FUNCTION public.confirm_bank_match(
  p_line_id uuid,
  p_payment_id uuid DEFAULT NULL,
  p_supplier_payment_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line_amount     numeric(14,2);
  v_signed_amount   numeric(14,2);
  v_pay_amount      numeric(14,2);
  v_bank_account_id uuid;
  v_currency        text;
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'admin'::app_role)
       OR public.has_role((select auth.uid()), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF (p_payment_id IS NULL AND p_supplier_payment_id IS NULL)
     OR (p_payment_id IS NOT NULL AND p_supplier_payment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'debe enviarse exactamente un pago';
  END IF;

  SELECT ABS(bsl.signed_amount), bsl.signed_amount, bsl.bank_account_id
    INTO v_line_amount, v_signed_amount, v_bank_account_id
  FROM public.bank_statement_lines bsl
  WHERE bsl.id = p_line_id
    AND bsl.status IN ('unmatched'::bank_line_status, 'suggested'::bank_line_status)
  FOR UPDATE;

  IF v_line_amount IS NULL THEN
    RAISE EXCEPTION 'linea inexistente o ya conciliada' USING ERRCODE = 'P0001';
  END IF;

  IF (v_signed_amount < 0 AND p_supplier_payment_id IS NULL)
     OR (v_signed_amount > 0 AND p_payment_id IS NULL) THEN
    RAISE EXCEPTION 'el signo del movimiento (%) no corresponde al tipo de pago',
      v_signed_amount USING ERRCODE = 'P0001';
  END IF;

  SELECT ba.currency INTO v_currency
  FROM public.bank_accounts ba WHERE ba.id = v_bank_account_id;
  v_currency := COALESCE(v_currency, 'MXN');

  IF p_payment_id IS NOT NULL THEN
    SELECT CASE
             WHEN COALESCE(p.currency, 'MXN') = v_currency THEN p.amount
             WHEN p.exchange_rate IS NULL OR p.exchange_rate <= 0 THEN NULL
             WHEN COALESCE(p.currency, 'MXN') = 'MXN' THEN ROUND(p.amount / p.exchange_rate, 2)
             ELSE ROUND(p.amount * p.exchange_rate, 2)
           END
      INTO v_pay_amount
      FROM public.payments p
     WHERE p.id = p_payment_id;
  ELSE
    SELECT CASE
             WHEN COALESCE(sb.currency, 'MXN') = v_currency THEN sp.amount
             WHEN sb.exchange_rate IS NULL OR sb.exchange_rate <= 0 THEN NULL
             WHEN COALESCE(sb.currency, 'MXN') = 'MXN' THEN ROUND(sp.amount / sb.exchange_rate, 2)
             ELSE ROUND(sp.amount * sb.exchange_rate, 2)
           END
      INTO v_pay_amount
      FROM public.supplier_payments sp
      LEFT JOIN public.supplier_bills sb ON sb.id = sp.bill_id
     WHERE sp.id = p_supplier_payment_id;
  END IF;

  IF v_pay_amount IS NULL THEN
    RAISE EXCEPTION 'pago inexistente o sin tipo de cambio valido para convertir a %',
      v_currency USING ERRCODE = 'P0001';
  END IF;

  IF ABS(v_line_amount - v_pay_amount) > 0.01 THEN
    RAISE EXCEPTION 'el monto del pago (%) no coincide con el movimiento (%)',
      v_pay_amount, v_line_amount USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_lines
     SET status = 'matched'::bank_line_status,
         matched_payment_id = p_payment_id,
         matched_supplier_payment_id = p_supplier_payment_id,
         suggested_payment_id = NULL,
         suggested_supplier_payment_id = NULL,
         matched_at = now(),
         matched_by = (select auth.uid())
   WHERE id = p_line_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_bank_match(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_bank_match(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_bank_match_candidates(
  p_line_id uuid,
  p_search text DEFAULT NULL::text,
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
  v_line     public.bank_statement_lines%ROWTYPE;
  v_abs      numeric(14,2);
  v_text     text;
  v_search   text;
  v_currency text;
  v_window   integer := GREATEST(0, LEAST(COALESCE(p_date_window, 15), 120));
  v_tol      numeric := GREATEST(0.01, COALESCE(p_amount_tolerance, 0.01));
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'admin'::app_role)
       OR public.has_role((select auth.uid()), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_line FROM public.bank_statement_lines WHERE bank_statement_lines.id = p_line_id;
  IF v_line.id IS NULL THEN
    RAISE EXCEPTION 'linea inexistente' USING ERRCODE = 'P0001';
  END IF;

  SELECT ba.currency INTO v_currency
  FROM public.bank_accounts ba WHERE ba.id = v_line.bank_account_id;
  v_currency := COALESCE(v_currency, 'MXN');

  v_abs  := ABS(v_line.signed_amount);
  v_text := lower(COALESCE(v_line.description, '') || ' ' || COALESCE(v_line.reference, ''));
  v_search := NULLIF(lower(btrim(COALESCE(p_search, ''))), '');

  IF v_line.signed_amount < 0 THEN
    RETURN QUERY
    WITH conv AS (
      SELECT
        sp.id,
        sp.payment_date,
        sp.reference,
        sp.amount,
        sb.bill_number,
        sb.supplier_id,
        CASE
          WHEN COALESCE(sb.currency, 'MXN') = v_currency THEN sp.amount
          WHEN sb.exchange_rate IS NULL OR sb.exchange_rate <= 0 THEN NULL
          WHEN COALESCE(sb.currency, 'MXN') = 'MXN' THEN ROUND(sp.amount / sb.exchange_rate, 2)
          ELSE ROUND(sp.amount * sb.exchange_rate, 2)
        END AS converted_amount
      FROM public.supplier_payments sp
      LEFT JOIN public.supplier_bills sb ON sb.id = sp.bill_id
    )
    SELECT
      c.id,
      'supplier_payment'::text,
      c.payment_date,
      c.converted_amount,
      c.reference,
      COALESCE(c.bill_number, '—') || ' · ' || COALESCE(s.name, 'Sin proveedor'),
      (60
        + GREATEST(0, 25 - ABS(c.payment_date - v_line.posted_date) * 8)
        + CASE WHEN c.reference IS NOT NULL AND btrim(c.reference) <> ''
                    AND position(lower(c.reference) IN v_text) > 0
               THEN 15 ELSE 0 END)::integer,
      ABS(c.payment_date - v_line.posted_date)::integer,
      ABS(c.converted_amount - v_abs) <= 0.01,
      (c.reference IS NOT NULL AND btrim(c.reference) <> ''
        AND position(lower(c.reference) IN v_text) > 0)
    FROM conv c
    LEFT JOIN public.suppliers s ON s.id = c.supplier_id
    WHERE c.converted_amount IS NOT NULL
      AND ABS(c.converted_amount - v_abs) <= v_tol
      AND ABS(c.payment_date - v_line.posted_date) <= v_window
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_statement_lines bsl
        WHERE bsl.matched_supplier_payment_id = c.id AND bsl.id <> p_line_id
      )
      AND (
        v_search IS NULL
        OR lower(COALESCE(c.reference, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(c.bill_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(s.name, '')) LIKE '%' || v_search || '%'
        OR CAST(c.amount AS text) LIKE '%' || v_search || '%'
      )
    ORDER BY 7 DESC, 8 ASC
    LIMIT 50;
  ELSE
    RETURN QUERY
    WITH conv AS (
      SELECT
        p.*,
        CASE
          WHEN COALESCE(p.currency, 'MXN') = v_currency THEN p.amount
          WHEN p.exchange_rate IS NULL OR p.exchange_rate <= 0 THEN NULL
          WHEN COALESCE(p.currency, 'MXN') = 'MXN' THEN ROUND(p.amount / p.exchange_rate, 2)
          ELSE ROUND(p.amount * p.exchange_rate, 2)
        END AS converted_amount
      FROM public.payments p
    )
    SELECT
      c.id,
      'payment'::text,
      c.payment_date,
      c.converted_amount,
      c.reference_number,
      COALESCE(i.invoice_number, '—') || ' · ' || COALESCE(i.customer_name, 'Sin cliente'),
      (60
        + GREATEST(0, 25 - ABS(c.payment_date - v_line.posted_date) * 8)
        + CASE WHEN c.reference_number IS NOT NULL AND btrim(c.reference_number) <> ''
                    AND position(lower(c.reference_number) IN v_text) > 0
               THEN 15 ELSE 0 END)::integer,
      ABS(c.payment_date - v_line.posted_date)::integer,
      ABS(c.converted_amount - v_abs) <= 0.01,
      (c.reference_number IS NOT NULL AND btrim(c.reference_number) <> ''
        AND position(lower(c.reference_number) IN v_text) > 0)
    FROM conv c
    LEFT JOIN public.invoices i ON i.id = c.invoice_id
    WHERE c.converted_amount IS NOT NULL
      AND ABS(c.converted_amount - v_abs) <= v_tol
      AND ABS(c.payment_date - v_line.posted_date) <= v_window
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_statement_lines bsl
        WHERE bsl.matched_payment_id = c.id AND bsl.id <> p_line_id
      )
      AND (
        v_search IS NULL
        OR lower(COALESCE(c.reference_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(i.invoice_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(i.customer_name, '')) LIKE '%' || v_search || '%'
        OR CAST(c.amount AS text) LIKE '%' || v_search || '%'
      )
    ORDER BY 7 DESC, 8 ASC
    LIMIT 50;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_bank_match_candidates(uuid, text, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_match_candidates(uuid, text, integer, numeric) TO authenticated;