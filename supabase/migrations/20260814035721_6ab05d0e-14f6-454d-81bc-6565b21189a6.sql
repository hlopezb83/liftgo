-- SPRINT 6.1 — Candidatos de conciliación con conversión por tipo de cambio
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
    RAISE EXCEPTION 'línea inexistente' USING ERRCODE = 'P0001';
  END IF;

  SELECT ba.currency INTO v_currency
  FROM public.bank_accounts ba WHERE ba.id = v_line.bank_account_id;
  v_currency := COALESCE(v_currency, 'MXN');

  v_abs  := ABS(v_line.signed_amount);
  v_text := lower(COALESCE(v_line.description, '') || ' ' || COALESCE(v_line.reference, ''));
  v_search := NULLIF(lower(btrim(COALESCE(p_search, ''))), '');

  IF v_line.signed_amount < 0 THEN
    -- Cargo del banco → pagos a proveedores (siempre en moneda de la cuenta)
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
    -- Abono del banco → pagos de clientes, convertidos a la moneda de la cuenta
    RETURN QUERY
    WITH conv AS (
      SELECT
        p.*,
        CASE
          WHEN COALESCE(p.currency, 'MXN') = v_currency THEN p.amount
          WHEN p.exchange_rate IS NULL OR p.exchange_rate <= 0 THEN NULL
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

-- SPRINT 5.4 — Una extensión sólo puede estar ligada a una factura
CREATE UNIQUE INDEX IF NOT EXISTS booking_extensions_invoice_id_uniq
  ON public.booking_extensions (invoice_id) WHERE invoice_id IS NOT NULL;

-- SPRINT 7.4 — Orden de kanban atómico para prospectos
CREATE OR REPLACE FUNCTION public.next_stage_order(p_stage text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
BEGIN
  IF p_stage IS NULL OR btrim(p_stage) = '' THEN
    RAISE EXCEPTION 'etapa requerida' USING ERRCODE = 'P0001';
  END IF;
  -- Bloqueo asesor por etapa: evita carreras leer-max-luego-insertar.
  PERFORM pg_advisory_xact_lock(hashtext(p_stage));
  SELECT COALESCE(MAX(stage_order), -1) + 1 INTO v_next
  FROM public.prospects WHERE stage = p_stage;
  RETURN v_next;
END;
$function$;

REVOKE ALL ON FUNCTION public.next_stage_order(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_stage_order(text) TO authenticated;

-- SPRINT 9.6 — Policy explícita de lectura para la bitácora de recordatorios
DROP POLICY IF EXISTS collection_reminders_log_select_staff ON public.collection_reminders_log;
CREATE POLICY collection_reminders_log_select_staff
  ON public.collection_reminders_log
  FOR SELECT TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'auditor'::app_role)
  );

GRANT SELECT ON public.collection_reminders_log TO authenticated;