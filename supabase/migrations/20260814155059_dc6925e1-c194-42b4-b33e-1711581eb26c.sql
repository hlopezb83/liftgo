CREATE OR REPLACE FUNCTION public.match_bank_statement_lines(p_import_id uuid)
RETURNS TABLE(matched_count integer, suggested_count integer, unmatched_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matched int := 0; v_suggested int := 0; v_unmatched int := 0;
  v_line record; v_best record; v_score int; v_line_currency text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_line IN SELECT * FROM public.bank_statement_lines WHERE import_id = p_import_id AND status = 'unmatched' LOOP
    v_best := NULL; v_score := 0;
    SELECT currency INTO v_line_currency FROM public.bank_accounts WHERE id = v_line.bank_account_id;

    IF v_line.signed_amount < 0 THEN
      -- Egreso: pagos a proveedor. La moneda/TC viven en la factura (supplier_bills).
      SELECT sp.id AS pid,
             60 + GREATEST(0, 25 - ABS(sp.payment_date - v_line.posted_date) * 8)
             + CASE WHEN v_line.reference IS NOT NULL AND sp.reference IS NOT NULL
                      AND position(lower(sp.reference) IN lower(coalesce(v_line.description,'') || ' ' || coalesce(v_line.reference,''))) > 0
                    THEN 15 ELSE 0 END AS score,
             count(*) OVER () AS total
        INTO v_best
        FROM public.supplier_payments sp
        JOIN public.supplier_bills sb ON sb.id = sp.bill_id
        WHERE abs(
                CASE WHEN sb.currency = v_line_currency THEN sp.amount
                     ELSE sp.amount * sb.exchange_rate END
                - abs(v_line.signed_amount)
              ) < 0.01
          AND (sb.currency = v_line_currency
               OR (sb.exchange_rate IS NOT NULL AND sb.exchange_rate > 0))
          AND abs(sp.payment_date - v_line.posted_date) <= 3
          AND NOT EXISTS (SELECT 1 FROM public.bank_statement_lines bsl WHERE bsl.matched_supplier_payment_id = sp.id)
        ORDER BY ABS(sp.payment_date - v_line.posted_date) ASC LIMIT 1;

      IF v_best.pid IS NOT NULL THEN
        IF v_best.total = 1 THEN
          UPDATE public.bank_statement_lines SET status = 'matched', matched_supplier_payment_id = v_best.pid,
            match_score = v_best.score, matched_at = now(), matched_by = auth.uid() WHERE id = v_line.id;
          v_matched := v_matched + 1;
        ELSE
          UPDATE public.bank_statement_lines SET status = 'suggested', suggested_supplier_payment_id = v_best.pid,
            match_score = v_best.score WHERE id = v_line.id;
          v_suggested := v_suggested + 1;
        END IF;
      ELSE
        v_unmatched := v_unmatched + 1;
      END IF;
    ELSE
      -- Ingreso: pagos de cliente. Conversión con el TC del propio pago.
      SELECT p.id AS pid,
             60 + GREATEST(0, 25 - ABS(p.payment_date - v_line.posted_date) * 8)
             + CASE WHEN v_line.reference IS NOT NULL AND p.reference_number IS NOT NULL
                      AND position(lower(p.reference_number) IN lower(coalesce(v_line.description,'') || ' ' || coalesce(v_line.reference,''))) > 0
                    THEN 15 ELSE 0 END AS score,
             count(*) OVER () AS total
        INTO v_best
        FROM public.payments p
        WHERE abs(
                CASE WHEN p.currency = v_line_currency THEN p.amount
                     ELSE p.amount * p.exchange_rate END
                - v_line.signed_amount
              ) < 0.01
          AND (p.currency = v_line_currency
               OR (p.exchange_rate IS NOT NULL AND p.exchange_rate > 0))
          AND abs(p.payment_date - v_line.posted_date) <= 3
          AND NOT EXISTS (SELECT 1 FROM public.bank_statement_lines bsl WHERE bsl.matched_payment_id = p.id)
        ORDER BY ABS(p.payment_date - v_line.posted_date) ASC LIMIT 1;

      IF v_best.pid IS NOT NULL THEN
        IF v_best.total = 1 THEN
          UPDATE public.bank_statement_lines SET status = 'matched', matched_payment_id = v_best.pid,
            match_score = v_best.score, matched_at = now(), matched_by = auth.uid() WHERE id = v_line.id;
          v_matched := v_matched + 1;
        ELSE
          UPDATE public.bank_statement_lines SET status = 'suggested', suggested_payment_id = v_best.pid,
            match_score = v_best.score WHERE id = v_line.id;
          v_suggested := v_suggested + 1;
        END IF;
      ELSE
        v_unmatched := v_unmatched + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_matched, v_suggested, v_unmatched;
END; $$;

REVOKE EXECUTE ON FUNCTION public.match_bank_statement_lines(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.match_bank_statement_lines(uuid) TO authenticated;