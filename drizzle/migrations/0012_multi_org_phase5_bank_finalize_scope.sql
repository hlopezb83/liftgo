-- =====================================================================
-- Multi-organización · Fase 5.2d (finalización de conciliación bancaria)
--
-- La importación y su conciliación automática requieren acceso a staging.
-- Mantienen SECURITY DEFINER, pero el upload/import raíz se valida dentro de
-- la organización actual y cada candidato se limita a esa organización.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.finalize_bank_statement_upload(p_upload_id uuid)
 RETURNS TABLE(import_id uuid, inserted_count integer, matched_count integer, suggested_count integer, unmatched_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_upload public.bank_statement_uploads%ROWTYPE;
  v_import_id uuid;
  v_inserted integer := 0;
  v_matched integer := 0;
  v_suggested integer := 0;
  v_unmatched integer := 0;
  v_chunk_count integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_upload
  FROM public.bank_statement_uploads u
  WHERE u.id = p_upload_id
    AND public.organization_scope_matches(u.organization_id)
  FOR UPDATE;

  IF v_upload.id IS NULL OR v_upload.created_by <> v_uid THEN
    RAISE EXCEPTION 'Carga inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;

  IF v_upload.state = 'finalized' THEN
    RETURN QUERY SELECT
      nullif(v_upload.result->>'import_id', '')::uuid,
      coalesce((v_upload.result->>'inserted_count')::integer, 0),
      coalesce((v_upload.result->>'matched_count')::integer, 0),
      coalesce((v_upload.result->>'suggested_count')::integer, 0),
      coalesce((v_upload.result->>'unmatched_count')::integer, 0);
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_upload.bank_account_id::text, 0));

  SELECT count(*)::integer INTO v_chunk_count
  FROM public.bank_statement_upload_chunks c
  WHERE c.upload_id = p_upload_id;

  IF v_upload.staged_count <> v_upload.expected_count
     OR v_chunk_count <> ((v_upload.expected_count + 499) / 500) THEN
    RAISE EXCEPTION 'La carga esta incompleta (% de % lineas).',
      v_upload.staged_count, v_upload.expected_count USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bank_statement_imports (
    bank_account_id, file_name, period_start, period_end, lines_count, imported_by,
    organization_id
  ) VALUES (
    v_upload.bank_account_id, v_upload.file_name, v_upload.period_start,
    v_upload.period_end, v_upload.expected_count, v_uid, v_upload.organization_id
  )
  RETURNING id INTO v_import_id;

  WITH raw AS (
    SELECT
      x.item,
      ((c.chunk_index::bigint * 500) + x.ordinality)::bigint AS global_ordinality
    FROM public.bank_statement_upload_chunks c
    CROSS JOIN LATERAL jsonb_array_elements(c.lines) WITH ORDINALITY AS x(item, ordinality)
    WHERE c.upload_id = p_upload_id
  ), normalized AS (
    SELECT
      (item->>'posted_date')::date AS posted_date,
      coalesce(item->>'description', '') AS description,
      (item->>'signed_amount')::numeric AS signed_amount,
      nullif(item->>'reference', '') AS reference,
      coalesce(
        nullif(item->>'line_seq', '')::integer,
        (global_ordinality - 1)::integer
      ) AS line_seq,
      left(
        encode(
          extensions.digest(
            concat_ws(
              '|',
              to_char((item->>'posted_date')::date, 'YYYY-MM-DD'),
              trim(to_char((item->>'signed_amount')::numeric, 'FM9999999999990.00')),
              coalesce(nullif(item->>'reference', ''), ''),
              coalesce(item->>'description', '')
            ),
            'sha256'
          ),
          'hex'
        ),
        20
      ) AS line_hash,
      global_ordinality
    FROM raw
  ), numbered AS (
    SELECT
      n.*,
      row_number() OVER (
        PARTITION BY n.line_hash ORDER BY n.global_ordinality
      )::integer AS occurrence
    FROM normalized n
  )
  INSERT INTO public.bank_statement_lines (
    import_id, bank_account_id, posted_date, description, signed_amount,
    reference, line_seq, hash, occurrence, organization_id
  )
  SELECT
    v_import_id, v_upload.bank_account_id, n.posted_date, n.description,
    n.signed_amount, n.reference, n.line_seq, n.line_hash, n.occurrence,
    v_upload.organization_id
  FROM numbered n
  ON CONFLICT (bank_account_id, hash, occurrence) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    DELETE FROM public.bank_statement_imports WHERE id = v_import_id;
    v_import_id := NULL;
  ELSE
    UPDATE public.bank_statement_imports
    SET lines_count = v_inserted
    WHERE id = v_import_id;

    SELECT m.matched_count, m.suggested_count, m.unmatched_count
    INTO v_matched, v_suggested, v_unmatched
    FROM public.match_bank_statement_lines(v_import_id) m;
  END IF;

  v_result := jsonb_build_object(
    'import_id', v_import_id,
    'inserted_count', v_inserted,
    'matched_count', coalesce(v_matched, 0),
    'suggested_count', coalesce(v_suggested, 0),
    'unmatched_count', coalesce(v_unmatched, 0)
  );

  UPDATE public.bank_statement_uploads
  SET state = 'finalized', result = v_result, finalized_at = now(), updated_at = now()
  WHERE id = p_upload_id;

  DELETE FROM public.bank_statement_upload_chunks WHERE upload_id = p_upload_id;

  RETURN QUERY SELECT
    v_import_id, v_inserted, coalesce(v_matched, 0),
    coalesce(v_suggested, 0), coalesce(v_unmatched, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.match_bank_statement_lines(p_import_id uuid)
 RETURNS TABLE(matched_count integer, suggested_count integer, unmatched_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_matched int := 0; v_suggested int := 0; v_unmatched int := 0;
  v_line record; v_best record; v_score int; v_line_currency text;
  v_organization_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT i.organization_id INTO v_organization_id
  FROM public.bank_statement_imports i
  WHERE i.id = p_import_id
    AND public.organization_scope_matches(i.organization_id);

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Importación inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;

  FOR v_line IN
    SELECT *
    FROM public.bank_statement_lines
    WHERE import_id = p_import_id
      AND organization_id = v_organization_id
      AND status = 'unmatched'
  LOOP
    v_best := NULL; v_score := 0;
    SELECT COALESCE(currency, 'MXN') INTO v_line_currency FROM public.bank_accounts
    WHERE id = v_line.bank_account_id
      AND organization_id = v_organization_id;
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
        WHERE sp.organization_id = v_organization_id
          AND sb.organization_id = v_organization_id
          AND public.bank_amount_in_account_currency(sp.amount, sb.currency, v_line_currency, sb.exchange_rate) IS NOT NULL
          AND abs(
                public.bank_amount_in_account_currency(sp.amount, sb.currency, v_line_currency, sb.exchange_rate)
                - abs(v_line.signed_amount)
              ) < 0.01
          AND abs(sp.payment_date - v_line.posted_date) <= 3
          AND NOT EXISTS (
            SELECT 1
            FROM public.bank_statement_lines bsl
            WHERE bsl.matched_supplier_payment_id = sp.id
              AND bsl.organization_id = v_organization_id
          )
        ORDER BY ABS(sp.payment_date - v_line.posted_date) ASC LIMIT 1;

      IF v_best.pid IS NOT NULL THEN
        IF v_best.total = 1 THEN
          UPDATE public.bank_statement_lines SET status = 'matched', matched_supplier_payment_id = v_best.pid,
            match_score = v_best.score, matched_at = now(), matched_by = auth.uid()
          WHERE id = v_line.id
            AND organization_id = v_organization_id;
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
        WHERE p.organization_id = v_organization_id
          AND (i.id IS NULL OR i.organization_id = v_organization_id)
          AND public.bank_amount_in_account_currency(
                p.amount, COALESCE(p.currency, i.moneda), v_line_currency,
                COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0))) IS NOT NULL
          AND abs(
                public.bank_amount_in_account_currency(
                  p.amount, COALESCE(p.currency, i.moneda), v_line_currency,
                  COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)))
                - v_line.signed_amount
              ) < 0.01
          AND abs(p.payment_date - v_line.posted_date) <= 3
          AND NOT EXISTS (
            SELECT 1
            FROM public.bank_statement_lines bsl
            WHERE bsl.matched_payment_id = p.id
              AND bsl.organization_id = v_organization_id
          )
        ORDER BY ABS(p.payment_date - v_line.posted_date) ASC LIMIT 1;

      IF v_best.pid IS NOT NULL THEN
        IF v_best.total = 1 THEN
          UPDATE public.bank_statement_lines SET status = 'matched', matched_payment_id = v_best.pid,
            match_score = v_best.score, matched_at = now(), matched_by = auth.uid()
          WHERE id = v_line.id
            AND organization_id = v_organization_id;
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

DO $$
DECLARE
  v_unscoped text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_unscoped
  FROM pg_proc p
  WHERE p.oid IN (
    'public.finalize_bank_statement_upload(uuid)'::regprocedure,
    'public.match_bank_statement_lines(uuid)'::regprocedure
  )
    AND position('organization_scope_matches' IN pg_get_functiondef(p.oid)) = 0;

  IF v_unscoped IS NOT NULL THEN
    RAISE EXCEPTION
      'La finalización bancaria privilegiada no valida organización: %',
      v_unscoped;
  END IF;
END;
$$;
