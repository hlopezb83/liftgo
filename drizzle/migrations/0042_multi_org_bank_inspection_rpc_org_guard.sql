-- 0042_multi_org_bank_inspection_rpc_org_guard
--
-- Paso 5 del endurecimiento multiempresa. Doce RPC SECURITY DEFINER
-- invocables por `authenticated` validaban únicamente el rol global (o
-- `organization_scope_matches`, que no ata la sesión a una organización
-- verificada). Un administrador de la empresa A podía operar folios de nota de
-- crédito, cargas bancarias, conciliaciones, pólizas de mantenimiento,
-- inspecciones de devolución, intentos de pago, prospectos, roles y secretos de
-- facturación de la empresa B con privilegios del owner.
--
-- Reglas aplicadas en las doce:
--   * Se conservan firma, defaults, resultado, volatilidad, reglas de rol,
--     mensajes funcionales, flujos válidos, SECURITY DEFINER y
--     SET search_path = 'public'.
--   * Para sesión autenticada interna la organización se obtiene
--     exclusivamente con current_internal_organization_id(); se exige no nula e
--     is_internal_member(auth.uid()).
--   * El organization_id real se resuelve desde la fila objetivo antes de leer
--     datos sensibles o mutar, y debe coincidir con v_org. Nunca se confía en
--     UUID, JSON u organization_id provisto por el cliente.
--   * En operaciones con varias entidades todas deben pertenecer a v_org; una
--     mezcla A/B falla atómicamente antes de escribir.
--   * Toda fila derivada hereda organization_id = v_org.
--   * Un UUID ajeno y uno inexistente producen el mismo error genérico.
--   * Se conservan los canales sin sesión (service_role / edge functions) que ya
--     existían: assign_stamped_credit_note_number y
--     claim_maintenance_policy_month, que en ese caso derivan la organización de
--     la fila objetivo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. assign_stamped_credit_note_number
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_stamped_credit_note_number(p_credit_note_id uuid, p_folio text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_new_number text;
  v_existing_id uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;

    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  -- La organización real se toma de la nota de crédito, nunca del cliente.
  IF v_org IS NULL THEN
    SELECT cn.organization_id INTO v_org
      FROM public.credit_notes cn
     WHERE cn.id = p_credit_note_id;
  END IF;

  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.credit_notes cn
     WHERE cn.id = p_credit_note_id AND cn.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Nota de crédito inexistente o no autorizada.'
      USING ERRCODE = 'P0002';
  END IF;

  v_new_number := 'NC-' || lpad(p_folio, 4, '0');

  SELECT id INTO v_existing_id
  FROM public.credit_notes
  WHERE credit_note_number = v_new_number
    AND organization_id = v_org
    AND id <> p_credit_note_id;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'credit_note_number % already exists on credit_note %', v_new_number, v_existing_id;
  END IF;

  UPDATE public.credit_notes
     SET credit_note_number = v_new_number
   WHERE id = p_credit_note_id
     AND organization_id = v_org;

  RETURN v_new_number;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. begin_bank_statement_upload
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.begin_bank_statement_upload(p_upload_id uuid, p_bank_account_id uuid, p_file_name text, p_period_start date, p_period_end date, p_expected_count integer)
 RETURNS TABLE(upload_id uuid, upload_state text, staged_count integer, result jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_upload public.bank_statement_uploads%ROWTYPE;
  v_file_name text := coalesce(nullif(btrim(p_file_name), ''), 'estado-de-cuenta');
  v_organization_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_upload_id IS NULL OR p_bank_account_id IS NULL
     OR p_expected_count IS NULL OR p_expected_count NOT BETWEEN 1 AND 50000
     OR (p_period_start IS NOT NULL AND p_period_end IS NOT NULL AND p_period_start > p_period_end) THEN
    RAISE EXCEPTION 'Metadatos de carga invalidos.' USING ERRCODE = '22023';
  END IF;

  SELECT ba.organization_id INTO v_organization_id
  FROM public.bank_accounts ba
  WHERE ba.id = p_bank_account_id
    AND ba.organization_id = v_org;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta bancaria inexistente o no autorizada.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.bank_statement_uploads (
    id, created_by, bank_account_id, file_name, period_start, period_end,
    expected_count, organization_id
  ) VALUES (
    p_upload_id, v_uid, p_bank_account_id, v_file_name, p_period_start,
    p_period_end, p_expected_count, v_org
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_upload
  FROM public.bank_statement_uploads u
  WHERE u.id = p_upload_id
    AND u.organization_id = v_org
  FOR UPDATE;

  IF v_upload.id IS NULL OR v_upload.created_by <> v_uid THEN
    RAISE EXCEPTION 'Carga inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;

  IF v_upload.bank_account_id <> p_bank_account_id
     OR v_upload.file_name <> v_file_name
     OR v_upload.period_start IS DISTINCT FROM p_period_start
     OR v_upload.period_end IS DISTINCT FROM p_period_end
     OR v_upload.expected_count <> p_expected_count THEN
    RAISE EXCEPTION 'El identificador de carga ya pertenece a otro archivo.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT v_upload.id, v_upload.state, v_upload.staged_count, v_upload.result;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. stage_bank_statement_chunk
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stage_bank_statement_chunk(p_upload_id uuid, p_chunk_index integer, p_lines jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_upload public.bank_statement_uploads%ROWTYPE;
  v_line_count integer;
  v_expected_line_count integer;
  v_chunk_hash text;
  v_existing_hash text;
  v_staged_count integer;
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_upload
  FROM public.bank_statement_uploads u
  WHERE u.id = p_upload_id
    AND u.organization_id = v_org
  FOR UPDATE;

  IF v_upload.id IS NULL OR v_upload.created_by <> v_uid THEN
    RAISE EXCEPTION 'Carga inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF v_upload.state <> 'staging' THEN
    RAISE EXCEPTION 'La carga ya fue finalizada.' USING ERRCODE = '55000';
  END IF;
  IF p_chunk_index IS NULL OR p_chunk_index < 0
     OR p_chunk_index >= ((v_upload.expected_count + 499) / 500) THEN
    RAISE EXCEPTION 'Indice de bloque invalido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'El bloque debe ser un arreglo JSON.' USING ERRCODE = '22023';
  END IF;

  v_line_count := jsonb_array_length(p_lines);
  v_expected_line_count := least(500, v_upload.expected_count - (p_chunk_index * 500));
  IF v_line_count <> v_expected_line_count THEN
    RAISE EXCEPTION 'El bloque % contiene % lineas; se esperaban %.',
      p_chunk_index, v_line_count, v_expected_line_count USING ERRCODE = '22023';
  END IF;

  v_chunk_hash := encode(extensions.digest(p_lines::text, 'sha256'), 'hex');

  INSERT INTO public.bank_statement_upload_chunks (
    upload_id, chunk_index, line_count, chunk_hash, lines, organization_id
  ) VALUES (
    p_upload_id, p_chunk_index, v_line_count, v_chunk_hash, p_lines,
    v_org
  )
  ON CONFLICT (upload_id, chunk_index) DO NOTHING;

  SELECT c.chunk_hash INTO v_existing_hash
  FROM public.bank_statement_upload_chunks c
  WHERE c.upload_id = p_upload_id
    AND c.chunk_index = p_chunk_index
    AND c.organization_id = v_org;

  IF v_existing_hash IS DISTINCT FROM v_chunk_hash THEN
    RAISE EXCEPTION 'El bloque % ya existe con contenido distinto.', p_chunk_index
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(c.line_count), 0)::integer INTO v_staged_count
  FROM public.bank_statement_upload_chunks c
  WHERE c.upload_id = p_upload_id
    AND c.organization_id = v_org;

  IF v_staged_count > v_upload.expected_count THEN
    RAISE EXCEPTION 'La carga excede el conteo declarado.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bank_statement_uploads
  SET staged_count = v_staged_count, updated_at = now()
  WHERE id = p_upload_id
    AND organization_id = v_org;

  RETURN v_staged_count;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. finalize_bank_statement_upload
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_bank_statement_upload(p_upload_id uuid)
 RETURNS TABLE(import_id uuid, inserted_count integer, matched_count integer, suggested_count integer, unmatched_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
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

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_upload
  FROM public.bank_statement_uploads u
  WHERE u.id = p_upload_id
    AND u.organization_id = v_org
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
  WHERE c.upload_id = p_upload_id
    AND c.organization_id = v_org;

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
    v_upload.period_end, v_upload.expected_count, v_uid, v_org
  )
  RETURNING id INTO v_import_id;

  WITH raw AS (
    SELECT
      x.item,
      ((c.chunk_index::bigint * 500) + x.ordinality)::bigint AS global_ordinality
    FROM public.bank_statement_upload_chunks c
    CROSS JOIN LATERAL jsonb_array_elements(c.lines) WITH ORDINALITY AS x(item, ordinality)
    WHERE c.upload_id = p_upload_id
      AND c.organization_id = v_org
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
    v_org
  FROM numbered n
  ON CONFLICT (bank_account_id, hash, occurrence) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    DELETE FROM public.bank_statement_imports
     WHERE id = v_import_id AND organization_id = v_org;
    v_import_id := NULL;
  ELSE
    UPDATE public.bank_statement_imports
    SET lines_count = v_inserted
    WHERE id = v_import_id
      AND organization_id = v_org;

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
  WHERE id = p_upload_id
    AND organization_id = v_org;

  DELETE FROM public.bank_statement_upload_chunks
   WHERE upload_id = p_upload_id
     AND organization_id = v_org;

  RETURN QUERY SELECT
    v_import_id, v_inserted, coalesce(v_matched, 0),
    coalesce(v_suggested, 0), coalesce(v_unmatched, 0);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. match_bank_statement_lines
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_bank_statement_lines(p_import_id uuid)
 RETURNS TABLE(matched_count integer, suggested_count integer, unmatched_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_matched int := 0; v_suggested int := 0; v_unmatched int := 0;
  v_line record; v_best record; v_score int; v_line_currency text;
  v_organization_id uuid;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_organization_id := public.current_internal_organization_id();
  IF v_organization_id IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bank_statement_imports i
    WHERE i.id = p_import_id
      AND i.organization_id = v_organization_id
  ) THEN
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
            match_score = v_best.score, matched_at = now(), matched_by = v_uid
          WHERE id = v_line.id
            AND organization_id = v_organization_id;
          v_matched := v_matched + 1;
        ELSE
          UPDATE public.bank_statement_lines SET status = 'suggested', suggested_supplier_payment_id = v_best.pid,
            match_score = v_best.score
          WHERE id = v_line.id
            AND organization_id = v_organization_id;
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
            match_score = v_best.score, matched_at = now(), matched_by = v_uid
          WHERE id = v_line.id
            AND organization_id = v_organization_id;
          v_matched := v_matched + 1;
        ELSE
          UPDATE public.bank_statement_lines SET status = 'suggested', suggested_payment_id = v_best.pid,
            match_score = v_best.score
          WHERE id = v_line.id
            AND organization_id = v_organization_id;
          v_suggested := v_suggested + 1;
        END IF;
      ELSE
        v_unmatched := v_unmatched + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_matched, v_suggested, v_unmatched;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. claim_maintenance_policy_month
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_maintenance_policy_month(p_policy_id uuid, p_month text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_claimed uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role)
      OR public.has_role(v_uid, 'administrativo'::app_role)
      OR public.has_role(v_uid, 'dispatcher'::app_role)
    ) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;

    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.maintenance_policies
     SET last_generated_month = p_month
   WHERE id = p_policy_id
     AND (v_org IS NULL OR organization_id = v_org)
     AND is_active
     AND (last_generated_month IS NULL OR last_generated_month < p_month)
  RETURNING id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. complete_return_inspection
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_return_inspection(p_booking_id uuid, p_forklift_id uuid, p_condition text DEFAULT 'good'::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT 0, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text, p_inspected_by text DEFAULT NULL::text, p_inspected_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_inspection_id uuid;
  v_old_status text;
  v_new_status text;
  v_customer_id uuid;
  v_is_damaged_condition boolean;
  v_sends_to_maintenance boolean;
  v_booking_start date;
  v_existing_id uuid;
  v_booking_forklift_id uuid;
  v_booking_status text;
  v_open_damages integer;
  v_booking_end date;
  v_max_hours numeric;
  v_extra_rate numeric;
  v_months numeric;
  v_allowed numeric;
  v_extra_hours numeric;
  v_extra_charge numeric;
  v_span_end date;
  v_full_months integer;
  v_anchor date;
  v_rem_days integer;
  v_days_in_month integer;
  v_late_days numeric;
  v_late_charge numeric;
  v_daily_rate numeric;
  v_monthly_rate numeric;
  v_delivery_hours numeric;
  v_pickup_hours numeric;
  v_meter_hours numeric;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.'
      USING ERRCODE = 'P0002';
  END IF;

  -- El montacargas también debe ser de la organización actual: una mezcla A/B
  -- falla antes de cualquier escritura.
  IF p_forklift_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.forklifts f
     WHERE f.id = p_forklift_id AND f.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Montacargas inexistente o no autorizado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(p_condition, 'good') NOT IN ('good', 'minor_damage', 'major_damage', 'needs_repair') THEN
    RAISE EXCEPTION 'Condición de devolución no válida (%). Valores permitidos: good, minor_damage, major_damage, needs_repair.', p_condition
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_fuel_level IS NOT NULL AND btrim(p_fuel_level) <> ''
     AND btrim(p_fuel_level) NOT IN ('Full', '3/4', '1/2', '1/4', 'Empty') THEN
    RAISE EXCEPTION 'Nivel de combustible no válido (%). Valores permitidos: Full, 3/4, 1/2, 1/4, Empty.', p_fuel_level
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_damage_cost, 0) < 0 THEN
    RAISE EXCEPTION 'El costo de daño no puede ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_hours_used IS NOT NULL AND p_hours_used < 0 THEN
    RAISE EXCEPTION 'Las horas usadas no pueden ser negativas (%)', p_hours_used
      USING ERRCODE = 'check_violation';
  END IF;

  v_is_damaged_condition := p_condition IN ('minor_damage', 'major_damage', 'needs_repair');
  v_sends_to_maintenance := v_is_damaged_condition;
  IF v_is_damaged_condition
     AND COALESCE(p_damage_cost, 0) <= 0
     AND (p_damage_notes IS NULL OR btrim(p_damage_notes) = '') THEN
    RAISE EXCEPTION 'La devolución marcada como % requiere costo estimado (>0) o una descripción del daño.', p_condition
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_existing_id
    FROM public.return_inspections
   WHERE booking_id = p_booking_id
     AND organization_id = v_org
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_is_damaged_condition
       OR COALESCE(p_damage_cost, 0) > 0
       OR (p_damage_notes IS NOT NULL AND btrim(p_damage_notes) <> '') THEN
      RAISE EXCEPTION 'La reserva ya tiene inspeccion de devolucion (%). Para reportar un daño adicional usa el registro de daños, no una re-inspeccion.', v_existing_id
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE NOTICE 'La reserva % ya tenia inspeccion (%); se devuelve la existente.', p_booking_id, v_existing_id;
    RETURN v_existing_id;
  END IF;

  SELECT start_date, end_date, forklift_id, status
    INTO v_booking_start, v_booking_end, v_booking_forklift_id, v_booking_status
    FROM public.bookings
   WHERE id = p_booking_id
     AND organization_id = v_org
   FOR UPDATE;
  IF v_booking_start IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0001';
  END IF;
  IF v_booking_forklift_id IS DISTINCT FROM p_forklift_id THEN
    RAISE EXCEPTION 'La reserva % no corresponde al montacargas % (la reserva es de la unidad %). Verifica la unidad antes de completar la devolucion.',
      p_booking_id, p_forklift_id, v_booking_forklift_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_booking_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Solo se puede registrar la devolución de una reserva confirmada (estado actual: %).', v_booking_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.deliveries
     WHERE booking_id = p_booking_id
       AND organization_id = v_org
       AND type = 'delivery'
       AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'No hay una entrega completada para esta reserva; completa primero la entrega al cliente.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_inspected_at::date < v_booking_start THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser anterior al inicio de la reserva (%).', v_booking_start
      USING ERRCODE = 'P0001';
  END IF;
  IF p_inspected_at > now() THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser futura.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Bloque 3A: reconciliación del horómetro.
  SELECT d.hours_reading INTO v_delivery_hours
    FROM public.deliveries d
   WHERE d.booking_id = p_booking_id
     AND d.organization_id = v_org
     AND d.type = 'delivery'
     AND d.status = 'completed'
     AND d.hours_reading IS NOT NULL
     AND d.hours_reading >= 0
   ORDER BY COALESCE(d.completed_at, d.scheduled_date::timestamptz) DESC NULLS LAST,
            d.created_at DESC, d.id DESC
   LIMIT 1;
  SELECT d.hours_reading INTO v_pickup_hours
    FROM public.deliveries d
   WHERE d.booking_id = p_booking_id
     AND d.organization_id = v_org
     AND d.type = 'pickup'
     AND d.status = 'completed'
     AND d.hours_reading IS NOT NULL
     AND d.hours_reading >= 0
   ORDER BY COALESCE(d.completed_at, d.scheduled_date::timestamptz) DESC NULLS LAST,
            d.created_at DESC, d.id DESC
   LIMIT 1;
  IF v_delivery_hours IS NOT NULL AND v_pickup_hours IS NOT NULL THEN
    IF v_pickup_hours < v_delivery_hours THEN
      RAISE EXCEPTION 'Lecturas de horómetro inconsistentes: la recolección (%) es menor que la entrega (%). Corrige las lecturas antes de cerrar la devolución.',
        v_pickup_hours, v_delivery_hours
        USING ERRCODE = 'check_violation';
    END IF;
    v_meter_hours := ROUND(v_pickup_hours - v_delivery_hours, 2);
    IF p_hours_used IS NOT NULL AND ROUND(p_hours_used, 2) <> v_meter_hours THEN
      RAISE NOTICE 'Horas capturadas (%) reconciliadas con el horómetro (% - % = %).',
        p_hours_used, v_pickup_hours, v_delivery_hours, v_meter_hours;
    END IF;
    p_hours_used := v_meter_hours;
  END IF;

  SELECT c.max_hours_per_month, c.extra_hour_rate
    INTO v_max_hours, v_extra_rate
    FROM public.contracts c
   WHERE c.booking_id = p_booking_id
     AND c.organization_id = v_org
     AND COALESCE(c.status, '') <> 'cancelled'
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF p_hours_used IS NOT NULL
     AND COALESCE(v_max_hours, 0) > 0
     AND COALESCE(v_extra_rate, 0) > 0 THEN
    v_span_end := COALESCE(v_booking_end, p_inspected_at::date);
    v_full_months := EXTRACT(YEAR FROM age(v_span_end, v_booking_start))::integer * 12
                   + EXTRACT(MONTH FROM age(v_span_end, v_booking_start))::integer;
    v_anchor := (v_booking_start + make_interval(months => v_full_months))::date;
    IF v_anchor > v_span_end THEN
      v_full_months := GREATEST(v_full_months - 1, 0);
      v_anchor := (v_booking_start + make_interval(months => v_full_months))::date;
    END IF;
    v_days_in_month := EXTRACT(DAY FROM (
      date_trunc('month', v_anchor) + interval '1 month - 1 day'
    )::date)::integer;
    v_rem_days := GREATEST(v_span_end - v_anchor + 1, 0);
    v_months := GREATEST(1, v_full_months + v_rem_days::numeric / v_days_in_month);
    v_allowed := v_max_hours * v_months;
    IF p_hours_used > v_allowed THEN
      v_extra_hours := ROUND(p_hours_used - v_allowed, 2);
      v_extra_charge := ROUND(v_extra_hours * v_extra_rate, 2);
    END IF;
  END IF;

  IF v_booking_end IS NOT NULL AND p_inspected_at::date > v_booking_end THEN
    v_late_days := (p_inspected_at::date - v_booking_end)::numeric;
    SELECT b.daily_rate, b.monthly_rate
      INTO v_daily_rate, v_monthly_rate
      FROM public.bookings b
     WHERE b.id = p_booking_id
       AND b.organization_id = v_org;
    IF COALESCE(v_daily_rate, 0) <= 0 AND COALESCE(v_monthly_rate, 0) > 0 THEN
      v_daily_rate := v_monthly_rate
        / EXTRACT(DAY FROM (
            date_trunc('month', v_booking_end) + interval '1 month - 1 day'
          )::date);
    END IF;
    IF COALESCE(v_daily_rate, 0) > 0 THEN
      v_late_charge := ROUND(v_late_days * v_daily_rate, 2);
    END IF;
  END IF;

  SELECT status INTO v_old_status
    FROM public.forklifts
   WHERE id = p_forklift_id
     AND organization_id = v_org
   FOR UPDATE;
  SELECT customer_id INTO v_customer_id
    FROM public.bookings
   WHERE id = p_booking_id
     AND organization_id = v_org;
  IF p_fuel_level IS NULL OR btrim(p_fuel_level) = '' THEN
    RAISE EXCEPTION 'El nivel de combustible es obligatorio en la inspección de devolución'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.return_inspections (
    booking_id, forklift_id, condition, damage_notes, damage_cost,
    hours_used, fuel_level, inspected_by, inspected_at,
    extra_hours, suggested_extra_hour_charge, late_days, suggested_late_charge,
    organization_id
  ) VALUES (
    p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost,
    p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at,
    v_extra_hours, v_extra_charge, v_late_days, v_late_charge,
    v_org
  )
  RETURNING id INTO v_inspection_id;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
     SET return_status = 'returned', status = 'completed', updated_at = now()
   WHERE id = p_booking_id
     AND organization_id = v_org;

  IF v_is_damaged_condition THEN
    INSERT INTO public.damage_records (
      inspection_id, forklift_id, booking_id, customer_id, description,
      estimated_cost, status, previous_forklift_status, organization_id
    ) VALUES (
      v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
      COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
      COALESCE(p_damage_cost, 0), 'reported', v_old_status, v_org
    );
  END IF;

  IF NOT v_sends_to_maintenance THEN
    SELECT count(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = p_forklift_id
       AND organization_id = v_org
       AND deleted_at IS NULL
       AND (status IN ('reported', 'in_repair') OR repaired_at IS NULL);
    IF v_open_damages > 0 THEN
      v_sends_to_maintenance := true;
    END IF;
  END IF;
  IF NOT v_sends_to_maintenance AND EXISTS (
    SELECT 1
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = p_forklift_id
       AND ml.organization_id = v_org
       AND ml.deleted_at IS NULL
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ) THEN
    v_sends_to_maintenance := true;
  END IF;

  IF v_old_status = 'rented' THEN
    v_new_status := CASE
      WHEN v_sends_to_maintenance THEN 'maintenance'
      WHEN EXISTS (
        SELECT 1
          FROM public.bookings b
          JOIN public.deliveries d
            ON d.booking_id = b.id
           AND d.type = 'delivery'
           AND d.status = 'completed'
           AND d.organization_id = v_org
         WHERE b.forklift_id = p_forklift_id
           AND b.organization_id = v_org
           AND b.id <> p_booking_id
           AND b.status = 'confirmed'
           AND NOT public.booking_is_returned(b.id)
      ) THEN 'rented'
      ELSE 'available'
    END;
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE public.forklifts
       SET status = v_new_status, updated_at = now()
     WHERE id = p_forklift_id
       AND organization_id = v_org;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, organization_id)
    VALUES (
      p_forklift_id, v_old_status, v_new_status,
      'Returned — condition: ' || p_condition,
      v_org
    );
  END IF;

  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN v_inspection_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. correct_return_inspection
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.correct_return_inspection(p_inspection_id uuid, p_reason text, p_condition text DEFAULT NULL::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT NULL::numeric, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_ins public.return_inspections%ROWTYPE;
  v_condition text;
  v_fuel text;
  v_cost numeric;
  v_notes text;
  v_hours numeric;
  v_customer_id uuid;
  v_forklift_status text;
  v_new_status text;
  v_damaged boolean;
  v_to_maintenance boolean;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede corregir una inspección de devolución.'
      USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Solo un administrador puede corregir una inspección de devolución.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.return_inspections ri
    WHERE ri.id = p_inspection_id
      AND ri.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Inspección inexistente o no autorizada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'La corrección requiere un motivo.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_ins
    FROM public.return_inspections
   WHERE id = p_inspection_id
     AND organization_id = v_org
   FOR UPDATE;
  IF v_ins.id IS NULL THEN
    RAISE EXCEPTION 'Inspección no encontrada' USING ERRCODE = 'P0001';
  END IF;

  v_condition := COALESCE(p_condition, v_ins.condition);
  v_fuel      := COALESCE(NULLIF(btrim(COALESCE(p_fuel_level, '')), ''), v_ins.fuel_level);
  v_cost      := COALESCE(p_damage_cost, v_ins.damage_cost);
  v_notes     := COALESCE(NULLIF(btrim(COALESCE(p_damage_notes, '')), ''), v_ins.damage_notes);
  v_hours     := COALESCE(p_hours_used, v_ins.hours_used);

  IF v_condition NOT IN ('good','minor_damage','major_damage','needs_repair') THEN
    RAISE EXCEPTION 'Condición de devolución no válida (%).', v_condition
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_fuel IS NOT NULL AND v_fuel NOT IN ('Full','3/4','1/2','1/4','Empty') THEN
    RAISE EXCEPTION 'Nivel de combustible no válido (%).', v_fuel
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(v_cost, 0) < 0 OR COALESCE(v_hours, 0) < 0 THEN
    RAISE EXCEPTION 'Costos y horas no pueden ser negativos.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.return_inspections
     SET condition = v_condition,
         damage_notes = CASE WHEN v_condition = 'good' THEN v_notes
                             ELSE COALESCE(v_notes, 'Daño reportado en devolución') END,
         damage_cost = v_cost,
         hours_used = v_hours,
         fuel_level = v_fuel
   WHERE id = p_inspection_id
     AND organization_id = v_org;

  v_damaged := v_condition IN ('minor_damage','major_damage','needs_repair');
  SELECT customer_id INTO v_customer_id
    FROM public.bookings
   WHERE id = v_ins.booking_id
     AND organization_id = v_org;
  SELECT status INTO v_forklift_status
    FROM public.forklifts
   WHERE id = v_ins.forklift_id
     AND organization_id = v_org
   FOR UPDATE;

  IF v_damaged THEN
    IF EXISTS (
      SELECT 1 FROM public.damage_records
       WHERE inspection_id = p_inspection_id
         AND organization_id = v_org
         AND deleted_at IS NULL
    ) THEN
      UPDATE public.damage_records
         SET description = COALESCE(v_notes, description),
             estimated_cost = COALESCE(v_cost, estimated_cost)
       WHERE inspection_id = p_inspection_id
         AND organization_id = v_org
         AND deleted_at IS NULL
         AND status IN ('reported','in_repair');
    ELSE
      INSERT INTO public.damage_records (
        inspection_id, forklift_id, booking_id, customer_id, description,
        estimated_cost, status, previous_forklift_status, organization_id
      ) VALUES (
        p_inspection_id, v_ins.forklift_id, v_ins.booking_id, v_customer_id,
        COALESCE(v_notes, 'Daño reportado en devolución'),
        COALESCE(v_cost, 0), 'reported', v_forklift_status, v_org
      );
    END IF;
  ELSE
    UPDATE public.damage_records
       SET deleted_at = now()
     WHERE inspection_id = p_inspection_id
       AND organization_id = v_org
       AND deleted_at IS NULL
       AND status = 'reported'
       AND repaired_at IS NULL;
  END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
     SET return_status = 'returned', status = 'completed', updated_at = now()
   WHERE id = v_ins.booking_id
     AND organization_id = v_org
     AND (return_status IS DISTINCT FROM 'returned' OR status IS DISTINCT FROM 'completed');

  v_to_maintenance := v_damaged
    OR EXISTS (
      SELECT 1 FROM public.damage_records
       WHERE forklift_id = v_ins.forklift_id
         AND organization_id = v_org
         AND deleted_at IS NULL
         AND (status IN ('reported','in_repair') OR repaired_at IS NULL)
    )
    OR EXISTS (
      SELECT 1 FROM public.maintenance_logs ml
       WHERE ml.forklift_id = v_ins.forklift_id
         AND ml.organization_id = v_org
         AND ml.deleted_at IS NULL
         AND ml.work_status IN ('pending','in_progress','waiting_parts')
    );

  IF v_forklift_status IN ('rented','available','maintenance') THEN
    v_new_status := CASE
      WHEN v_to_maintenance THEN 'maintenance'
      WHEN EXISTS (
        SELECT 1
          FROM public.bookings b
          JOIN public.deliveries d
            ON d.booking_id = b.id AND d.type = 'delivery' AND d.status = 'completed'
           AND d.organization_id = v_org
         WHERE b.forklift_id = v_ins.forklift_id
           AND b.organization_id = v_org
           AND b.id <> v_ins.booking_id
           AND b.status = 'confirmed'
           AND NOT public.booking_is_returned(b.id)
      ) THEN 'rented'
      ELSE 'available'
    END;
    IF v_new_status IS DISTINCT FROM v_forklift_status THEN
      PERFORM set_config('app.forklift_rpc', 'on', true);
      UPDATE public.forklifts SET status = v_new_status, updated_at = now()
       WHERE id = v_ins.forklift_id
         AND organization_id = v_org;
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, organization_id)
      VALUES (v_ins.forklift_id, v_forklift_status, v_new_status,
              'Corrección de devolución: ' || btrim(p_reason), v_org);
    END IF;
  END IF;

  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN p_inspection_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. reject_payment_intent
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_payment_intent(p_intent_id uuid, p_review_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_id uuid;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role)
       OR public.has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.customer_payment_intents
     SET status = 'rejected'::payment_intent_status,
         review_notes = p_review_notes,
         reviewed_at = now(),
         reviewed_by = v_uid
   WHERE id = p_intent_id
     AND organization_id = v_org
     AND status = 'pending_review'::payment_intent_status
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'intent_not_pending' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. reorder_prospect_stage
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reorder_prospect_stage(p_prospect_id uuid, p_new_stage text, p_new_index integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_old_stage text;
  v_old_index integer;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin')
    OR public.has_role(v_uid, 'administrativo')
    OR public.has_role(v_uid, 'ventas')
  ) THEN
    RAISE EXCEPTION 'No autorizado para mover prospectos';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'No autorizado para mover prospectos';
  END IF;

  IF p_new_index < 0 THEN
    RAISE EXCEPTION 'Índice inválido';
  END IF;

  SELECT stage, stage_order INTO v_old_stage, v_old_index
  FROM public.prospects
  WHERE id = p_prospect_id
    AND organization_id = v_org
  FOR UPDATE;

  IF v_old_stage IS NULL THEN
    RAISE EXCEPTION 'Prospecto no encontrado';
  END IF;

  -- R24-E: al mover dentro de la misma columna hacia ABAJO, la tarjeta movida
  -- debe quedar DESPUÉS de las que empatan en el índice destino.
  IF v_old_stage IS DISTINCT FROM p_new_stage THEN
    v_old_index := -1;
  END IF;

  UPDATE public.prospects
  SET stage = p_new_stage,
      stage_order = -1,
      updated_at = now()
  WHERE id = p_prospect_id
    AND organization_id = v_org;

  WITH ordered AS (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE WHEN id = p_prospect_id THEN p_new_index ELSE stage_order END,
               CASE
                 WHEN id <> p_prospect_id THEN 1
                 WHEN p_new_index > COALESCE(v_old_index, -1) THEN 1
                 ELSE 0
               END,
               created_at
           ) - 1 AS new_order
    FROM public.prospects
    WHERE stage = p_new_stage
      AND organization_id = v_org
  )
  UPDATE public.prospects p
  SET stage_order = o.new_order
  FROM ordered o
  WHERE p.id = o.id
    AND p.organization_id = v_org
    AND p.stage_order IS DISTINCT FROM o.new_order;

  IF v_old_stage IS DISTINCT FROM p_new_stage THEN
    WITH ordered_src AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY stage_order, created_at) - 1 AS new_order
      FROM public.prospects
      WHERE stage = v_old_stage
        AND organization_id = v_org
    )
    UPDATE public.prospects p
    SET stage_order = o.new_order
    FROM ordered_src o
    WHERE p.id = o.id
      AND p.organization_id = v_org
      AND p.stage_order IS DISTINCT FROM o.new_order;
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. update_user_role_safe
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_user_role_safe(_target_user_id uuid, _new_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_org uuid;
  v_target_org uuid;
  v_was_admin boolean;
  v_admin_count integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _target_user_id IS NULL THEN RAISE EXCEPTION 'target_user_id_required'; END IF;

  -- Autorizacion ANTES de cualquier lectura de datos del objetivo.
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: solo administradores pueden cambiar roles';
  END IF;
  IF NOT public.is_internal_member(v_caller) THEN
    RAISE EXCEPTION 'forbidden: solo personal interno puede cambiar roles';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'forbidden: sin organizacion verificada';
  END IF;

  SELECT m.organization_id INTO v_target_org
    FROM public.organization_memberships m
   WHERE m.auth_user_id = _target_user_id
     AND m.organization_id = v_org;

  -- Ausencia y pertenencia ajena comparten mensaje: no se filtra si existe.
  IF v_target_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'not_found: el usuario no pertenece a tu empresa';
  END IF;

  PERFORM 1
    FROM public.user_roles ur
    JOIN public.organization_memberships m ON m.auth_user_id = ur.user_id
   WHERE ur.role = 'admin'::app_role
     AND m.organization_id = v_org
   FOR UPDATE OF ur;

  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.organization_memberships m ON m.auth_user_id = ur.user_id
     WHERE ur.user_id = _target_user_id
       AND ur.role = 'admin'::app_role
       AND m.organization_id = v_org
  ) INTO v_was_admin;

  IF v_was_admin AND _new_role <> 'admin'::app_role THEN
    SELECT count(*)::int INTO v_admin_count
      FROM public.user_roles ur
      JOIN public.organization_memberships m ON m.auth_user_id = ur.user_id
     WHERE ur.role = 'admin'::app_role
       AND m.organization_id = v_org;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN_CANNOT_BE_DEMOTED'
        USING HINT = 'no puedes degradar al ultimo administrador de la empresa.';
    END IF;
  END IF;

  UPDATE public.user_roles SET role = _new_role WHERE user_id = _target_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, _new_role);
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. upsert_billing_secret
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_billing_secret(p_id uuid DEFAULT NULL::uuid, p_test_key text DEFAULT NULL::text, p_live_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_organization_id uuid;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo admin puede modificar billing_secrets'
      USING ERRCODE = '42501';
  END IF;

  v_organization_id := public.current_internal_organization_id();
  IF v_organization_id IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Solo admin puede modificar billing_secrets'
      USING ERRCODE = '42501';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.billing_secrets
       SET facturapi_test_key = COALESCE(
             NULLIF(p_test_key, ''),
             facturapi_test_key
           ),
           facturapi_live_key = COALESCE(
             NULLIF(p_live_key, ''),
             facturapi_live_key
           ),
           updated_at = now()
     WHERE id = p_id
       AND organization_id = v_organization_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION
        'billing_secrets id % no existe en la organización actual',
        p_id
        USING ERRCODE = 'P0002';
    END IF;

    RETURN v_id;
  END IF;

  INSERT INTO public.billing_secrets (
    organization_id,
    facturapi_test_key,
    facturapi_live_key,
    updated_at
  )
  VALUES (
    v_organization_id,
    NULLIF(p_test_key, ''),
    NULLIF(p_live_key, ''),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACL: sin PUBLIC ni anon; authenticated y service_role conservan EXECUTE.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.assign_stamped_credit_note_number(uuid, text)',
    'public.begin_bank_statement_upload(uuid, uuid, text, date, date, integer)',
    'public.stage_bank_statement_chunk(uuid, integer, jsonb)',
    'public.finalize_bank_statement_upload(uuid)',
    'public.match_bank_statement_lines(uuid)',
    'public.claim_maintenance_policy_month(uuid, text)',
    'public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text, timestamptz)',
    'public.correct_return_inspection(uuid, text, text, text, numeric, numeric, text)',
    'public.reject_payment_intent(uuid, text)',
    'public.reorder_prospect_stage(uuid, text, integer)',
    'public.update_user_role_safe(uuid, app_role)',
    'public.upsert_billing_secret(uuid, text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.assign_stamped_credit_note_number(uuid, text) IS
  'Multiempresa 0042: la sesión interna exige current_internal_organization_id() e is_internal_member; el canal sin sesión deriva la organización de la nota de crédito. Folio único por organización.';
COMMENT ON FUNCTION public.claim_maintenance_policy_month(uuid, text) IS
  'Multiempresa 0042: la sesión interna sólo puede reclamar pólizas de su organización; el canal sin sesión (cron/service_role) se conserva.';
COMMENT ON FUNCTION public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text, timestamptz) IS
  'Multiempresa 0042: reserva y montacargas deben ser de la organización actual; inspección, daño y bitácora heredan organization_id.';
COMMENT ON FUNCTION public.upsert_billing_secret(uuid, text, text) IS
  'Multiempresa 0042: la organización se obtiene de current_internal_organization_id(), no de resolve_organization_context().';
