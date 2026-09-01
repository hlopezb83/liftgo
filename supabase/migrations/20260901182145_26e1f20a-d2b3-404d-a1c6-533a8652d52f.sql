-- =====================================================================
-- R9 · LOTE C (forward-only)
-- R9-04 auto-match bancario · R9-23 unmatch guard
-- R9-08 depreciación de equipo archivado · R9-16 universo de utilización
-- =====================================================================

-- R9-04: única definición de "monto del pago en la moneda de la cuenta".
-- Delega en el helper canónico bidireccional (`fx_convert_amount`): la tasa
-- del pago es su tasa contra MXN, así que sirve como tasa del lado que no es
-- MXN sin importar la dirección.
CREATE OR REPLACE FUNCTION public.bank_amount_in_account_currency(
  p_amount numeric, p_pay_currency text, p_account_currency text, p_rate numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT public.fx_convert_amount(
    p_amount,
    COALESCE(p_pay_currency, 'MXN'),
    COALESCE(p_account_currency, 'MXN'),
    NULLIF(p_rate, 0),
    NULLIF(p_rate, 0)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.bank_amount_in_account_currency(numeric, text, text, numeric)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- R9-04 · match_bank_statement_lines
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_bank_statement_lines(p_import_id uuid)
RETURNS TABLE(matched_count integer, suggested_count integer, unmatched_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_matched int := 0; v_suggested int := 0; v_unmatched int := 0;
  v_line record; v_best record; v_score int; v_line_currency text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_line IN SELECT * FROM public.bank_statement_lines WHERE import_id = p_import_id AND status = 'unmatched' LOOP
    v_best := NULL; v_score := 0;
    SELECT COALESCE(currency, 'MXN') INTO v_line_currency FROM public.bank_accounts WHERE id = v_line.bank_account_id;
    v_line_currency := COALESCE(v_line_currency, 'MXN');

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
        WHERE public.bank_amount_in_account_currency(sp.amount, sb.currency, v_line_currency, sb.exchange_rate) IS NOT NULL
          AND abs(
                public.bank_amount_in_account_currency(sp.amount, sb.currency, v_line_currency, sb.exchange_rate)
                - abs(v_line.signed_amount)
              ) < 0.01
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
      -- Ingreso: pagos de cliente. TC propio del pago con respaldo en la factura.
      SELECT p.id AS pid,
             60 + GREATEST(0, 25 - ABS(p.payment_date - v_line.posted_date) * 8)
             + CASE WHEN v_line.reference IS NOT NULL AND p.reference_number IS NOT NULL
                      AND position(lower(p.reference_number) IN lower(coalesce(v_line.description,'') || ' ' || coalesce(v_line.reference,''))) > 0
                    THEN 15 ELSE 0 END AS score,
             count(*) OVER () AS total
        INTO v_best
        FROM public.payments p
        LEFT JOIN public.invoices i ON i.id = p.invoice_id
        WHERE public.bank_amount_in_account_currency(
                p.amount, COALESCE(p.currency, i.moneda), v_line_currency,
                COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0))) IS NOT NULL
          AND abs(
                public.bank_amount_in_account_currency(
                  p.amount, COALESCE(p.currency, i.moneda), v_line_currency,
                  COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)))
                - v_line.signed_amount
              ) < 0.01
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
END; $function$;

-- ---------------------------------------------------------------------
-- R9-04 · paridad: candidatos y confirmación usan el mismo helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_bank_match(p_line_id uuid, p_payment_id uuid DEFAULT NULL::uuid, p_supplier_payment_id uuid DEFAULT NULL::uuid)
RETURNS void
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
    SELECT public.bank_amount_in_account_currency(
             p.amount, COALESCE(p.currency, i.moneda), v_currency,
             COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)))
      INTO v_pay_amount
      FROM public.payments p
      LEFT JOIN public.invoices i ON i.id = p.invoice_id
     WHERE p.id = p_payment_id;
  ELSE
    SELECT public.bank_amount_in_account_currency(sp.amount, sb.currency, v_currency, sb.exchange_rate)
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

CREATE OR REPLACE FUNCTION public.get_bank_match_candidates(p_line_id uuid, p_search text DEFAULT NULL::text, p_date_window integer DEFAULT 15, p_amount_tolerance numeric DEFAULT 0.01)
RETURNS TABLE(id uuid, kind text, candidate_date date, amount numeric, reference text, label text, score integer, day_diff integer, exact_amount boolean, reference_hit boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
        sp.id, sp.payment_date, sp.reference, sp.amount,
        sb.bill_number, sb.supplier_id,
        public.bank_amount_in_account_currency(sp.amount, sb.currency, v_currency, sb.exchange_rate) AS converted_amount
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
        public.bank_amount_in_account_currency(
          p.amount, COALESCE(p.currency, i.moneda), v_currency,
          COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0))) AS converted_amount
      FROM public.payments p
      LEFT JOIN public.invoices i ON i.id = p.invoice_id
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

-- ---------------------------------------------------------------------
-- R9-23 · unmatch_bank_line con guard de estado
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unmatch_bank_line(p_line_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.bank_line_status;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT status INTO v_status
    FROM public.bank_statement_lines
   WHERE id = p_line_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'linea inexistente' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotente: deshacer una linea ya libre no hace nada.
  IF v_status = 'unmatched'::bank_line_status THEN
    RETURN;
  END IF;

  -- R9-23: una linea ignorada no se "deshace" por esta via; hacerlo borraba
  -- ignored_reason y perdia la decision del usuario.
  IF v_status = 'ignored'::bank_line_status THEN
    RAISE EXCEPTION 'la linea esta ignorada: reactivala en vez de deshacer la conciliacion'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_lines
     SET status = 'unmatched'::bank_line_status,
         matched_payment_id = NULL,
         matched_supplier_payment_id = NULL,
         suggested_payment_id = NULL,
         suggested_supplier_payment_id = NULL,
         match_score = NULL,
         matched_at = NULL,
         matched_by = NULL
   WHERE id = p_line_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- R9-16 · mismo universo de flota en utilización por unidad y por modelo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_utilization_by_unit(_start date, _end date)
RETURNS TABLE(forklift_id uuid, name text, booked_days integer, total_days integer, utilization integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH range_days AS (SELECT GREATEST((_end - _start)::int + 1, 1) AS total_days),
  unit_days AS (
    SELECT b.forklift_id, COUNT(DISTINCT d)::int AS booked_days
    FROM public.bookings b
    CROSS JOIN LATERAL generate_series(GREATEST(b.start_date::date, _start), LEAST(b.end_date::date, _end), interval '1 day') AS d
    WHERE b.status <> 'cancelled' AND b.is_e2e IS NOT TRUE
      AND b.start_date::date <= _end AND b.end_date::date >= _start
    GROUP BY b.forklift_id
  )
  SELECT f.id, f.name, COALESCE(ud.booked_days, 0), r.total_days,
    LEAST(ROUND(COALESCE(ud.booked_days, 0)::numeric * 100 / r.total_days), 100)::int
  FROM public.forklifts f
  CROSS JOIN range_days r
  LEFT JOIN unit_days ud ON ud.forklift_id = f.id
  WHERE f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
    -- R9-16: mismo universo que report_utilization_by_model.
    AND lower(COALESCE(f.status, '')) NOT IN ('sold', 'retired', 'vendido', 'retirado')
  ORDER BY 5 DESC, f.name;
END;
$function$;

-- ---------------------------------------------------------------------
-- R9-08 · depreciación: excluir equipo archivado (deleted_at)
-- Reescritura quirúrgica de la definición efectiva de get_income_statement
-- para no re-declarar sus ~300 líneas ni tocar migraciones históricas.
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  v_def   text;
  v_new   text;
  v_from  text := E'CROSS JOIN forklifts f\n    WHERE COALESCE(f.is_e2e, false) = false';
  v_to    text := E'CROSS JOIN forklifts f\n    WHERE f.deleted_at IS NULL\n      AND COALESCE(f.is_e2e, false) = false';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_income_statement'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'R9-08: get_income_statement no existe';
  END IF;

  -- Idempotencia: si ya filtra por deleted_at, no hay nada que hacer.
  IF position(v_to IN v_def) > 0 THEN
    RAISE NOTICE 'R9-08 ya aplicado';
    RETURN;
  END IF;

  IF (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'R9-08: el ancla de forklift_active_months no es única; revisar manualmente';
  END IF;

  v_new := replace(v_def, v_from, v_to);
  EXECUTE v_new;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_income_statement';

  IF position(v_to IN v_def) = 0 THEN
    RAISE EXCEPTION 'R9-08: la reescritura no quedó aplicada';
  END IF;
END
$do$;