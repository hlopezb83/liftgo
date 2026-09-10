-- Lote A: reintroduce unicamente los objetos ausentes de las migraciones
-- 20260909100000..103000 que nunca se aplicaron. Sin escrituras de datos,
-- sin REVOKE sobre tablas existentes y sin tocar get_bank_statement_lines_page.

CREATE TABLE IF NOT EXISTS public.bank_statement_uploads (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  period_start date,
  period_end date,
  expected_count integer NOT NULL CHECK (expected_count BETWEEN 1 AND 50000),
  staged_count integer NOT NULL DEFAULT 0 CHECK (staged_count BETWEEN 0 AND 50000),
  state text NOT NULL DEFAULT 'staging' CHECK (state IN ('staging', 'finalized')),
  result jsonb,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_statement_uploads_period_ck CHECK (
    period_start IS NULL OR period_end IS NULL OR period_start <= period_end
  ),
  CONSTRAINT bank_statement_uploads_finalized_ck CHECK (
    (state = 'staging' AND result IS NULL AND finalized_at IS NULL)
    OR (state = 'finalized' AND result IS NOT NULL AND finalized_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.bank_statement_upload_chunks (
  upload_id uuid NOT NULL REFERENCES public.bank_statement_uploads(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  line_count integer NOT NULL CHECK (line_count BETWEEN 1 AND 500),
  chunk_hash text NOT NULL,
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (upload_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS bank_statement_uploads_cleanup_idx
  ON public.bank_statement_uploads (state, updated_at);

REVOKE ALL ON TABLE public.bank_statement_uploads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bank_statement_upload_chunks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bank_statement_uploads TO service_role;
GRANT ALL ON TABLE public.bank_statement_upload_chunks TO service_role;

ALTER TABLE public.bank_statement_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_upload_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank statement uploads service only" ON public.bank_statement_uploads;
CREATE POLICY "bank statement uploads service only"
  ON public.bank_statement_uploads
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "bank statement upload chunks service only" ON public.bank_statement_upload_chunks;
CREATE POLICY "bank statement upload chunks service only"
  ON public.bank_statement_upload_chunks
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.begin_bank_statement_upload(
  p_upload_id uuid,
  p_bank_account_id uuid,
  p_file_name text,
  p_period_start date,
  p_period_end date,
  p_expected_count integer
)
RETURNS TABLE(
  upload_id uuid,
  upload_state text,
  staged_count integer,
  result jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_upload public.bank_statement_uploads%ROWTYPE;
  v_file_name text := coalesce(nullif(btrim(p_file_name), ''), 'estado-de-cuenta');
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_upload_id IS NULL OR p_bank_account_id IS NULL
     OR p_expected_count IS NULL OR p_expected_count NOT BETWEEN 1 AND 50000
     OR (p_period_start IS NOT NULL AND p_period_end IS NOT NULL AND p_period_start > p_period_end) THEN
    RAISE EXCEPTION 'Metadatos de carga invalidos.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bank_statement_uploads (
    id, created_by, bank_account_id, file_name, period_start, period_end,
    expected_count
  ) VALUES (
    p_upload_id, v_uid, p_bank_account_id, v_file_name, p_period_start,
    p_period_end, p_expected_count
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_upload
  FROM public.bank_statement_uploads u
  WHERE u.id = p_upload_id
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

CREATE OR REPLACE FUNCTION public.stage_bank_statement_chunk(
  p_upload_id uuid,
  p_chunk_index integer,
  p_lines jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
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

  SELECT * INTO v_upload
  FROM public.bank_statement_uploads u
  WHERE u.id = p_upload_id
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
    upload_id, chunk_index, line_count, chunk_hash, lines
  ) VALUES (
    p_upload_id, p_chunk_index, v_line_count, v_chunk_hash, p_lines
  )
  ON CONFLICT (upload_id, chunk_index) DO NOTHING;

  SELECT c.chunk_hash INTO v_existing_hash
  FROM public.bank_statement_upload_chunks c
  WHERE c.upload_id = p_upload_id AND c.chunk_index = p_chunk_index;

  IF v_existing_hash IS DISTINCT FROM v_chunk_hash THEN
    RAISE EXCEPTION 'El bloque % ya existe con contenido distinto.', p_chunk_index
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(c.line_count), 0)::integer INTO v_staged_count
  FROM public.bank_statement_upload_chunks c
  WHERE c.upload_id = p_upload_id;

  IF v_staged_count > v_upload.expected_count THEN
    RAISE EXCEPTION 'La carga excede el conteo declarado.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bank_statement_uploads
  SET staged_count = v_staged_count, updated_at = now()
  WHERE id = p_upload_id;

  RETURN v_staged_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_bank_statement_upload(p_upload_id uuid)
RETURNS TABLE(
  import_id uuid,
  inserted_count integer,
  matched_count integer,
  suggested_count integer,
  unmatched_count integer
)
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
    bank_account_id, file_name, period_start, period_end, lines_count, imported_by
  ) VALUES (
    v_upload.bank_account_id, v_upload.file_name, v_upload.period_start,
    v_upload.period_end, v_upload.expected_count, v_uid
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
    reference, line_seq, hash, occurrence
  )
  SELECT
    v_import_id, v_upload.bank_account_id, n.posted_date, n.description,
    n.signed_amount, n.reference, n.line_seq, n.line_hash, n.occurrence
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

CREATE OR REPLACE FUNCTION public.cleanup_bank_statement_uploads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  WITH stale AS (
    SELECT u.id
    FROM public.bank_statement_uploads u
    WHERE (u.state = 'staging' AND u.updated_at < now() - interval '24 hours')
       OR (u.state = 'finalized' AND u.finalized_at < now() - interval '7 days')
    ORDER BY u.updated_at
    LIMIT 500
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.bank_statement_uploads u
    USING stale s
    WHERE u.id = s.id
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_deleted FROM deleted;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_bank_statement_upload(uuid, uuid, text, date, date, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stage_bank_statement_chunk(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_bank_statement_upload(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cleanup_bank_statement_uploads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_bank_statement_upload(uuid, uuid, text, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_bank_statement_chunk(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bank_statement_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_bank_statement_uploads() TO service_role;

CREATE OR REPLACE FUNCTION public.get_bank_reconciliation_kpis(p_bank_account_id uuid)
RETURNS TABLE(
  total_count bigint,
  matched_count bigint,
  pending_count bigint,
  ignored_count bigint,
  charges numeric,
  credits numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE l.status = 'matched')::bigint,
    count(*) FILTER (WHERE l.status IN ('unmatched', 'suggested'))::bigint,
    count(*) FILTER (WHERE l.status = 'ignored')::bigint,
    coalesce(sum(abs(l.signed_amount)) FILTER (WHERE l.signed_amount < 0), 0),
    coalesce(sum(l.signed_amount) FILTER (WHERE l.signed_amount > 0), 0)
  FROM public.bank_statement_lines l
  WHERE l.bank_account_id = p_bank_account_id
    AND (
      public.has_role((select auth.uid()), 'admin'::app_role)
      OR public.has_role((select auth.uid()), 'administrativo'::app_role)
      OR public.has_role((select auth.uid()), 'auditor'::app_role)
    );
$function$;

REVOKE ALL ON FUNCTION public.get_bank_reconciliation_kpis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_reconciliation_kpis(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_portal_invoice(p_invoice_id uuid)
RETURNS TABLE(
  id uuid, invoice_number text, customer_id uuid, status text, issued_at date,
  due_date date, paid_at date, subtotal numeric, tax_rate numeric,
  tax_amount numeric, total numeric, line_items jsonb,
  billing_period_start date, billing_period_end date, cfdi_pdf_url text,
  cfdi_uuid uuid, moneda text, tipo_cambio numeric, paid_amount numeric,
  credited_amount numeric, balance numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.*
  FROM public.get_portal_invoices() p
  WHERE p.id = p_invoice_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_portal_invoices_page(
  p_page_size integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_only_balance boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH scoped AS MATERIALIZED (
    SELECT p.*
    FROM public.get_portal_invoices() p
    WHERE NOT coalesce(p_only_balance, false) OR coalesce(p.balance, 0) > 0.009
  ), page_rows AS (
    SELECT s.*
    FROM scoped s
    ORDER BY s.issued_at DESC, s.id DESC
    LIMIT greatest(1, least(coalesce(p_page_size, 25), 100))
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.issued_at DESC, r.id DESC)
      FROM page_rows r
    ), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM scoped)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_portal_contracts_page(
  p_page_size integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH scoped AS MATERIALIZED (
    SELECT p.* FROM public.get_portal_contracts() p
  ), page_rows AS (
    SELECT s.*
    FROM scoped s
    ORDER BY s.start_date DESC, s.id DESC
    LIMIT greatest(1, least(coalesce(p_page_size, 25), 100))
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.start_date DESC, r.id DESC)
      FROM page_rows r
    ), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM scoped)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_portal_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_portal_invoices_page(integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_portal_contracts_page(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_portal_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_portal_invoices_page(integer, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_portal_contracts_page(integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_feedback_points_total()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(sum(f.points_awarded), 0)::bigint
  FROM public.feedback_reports f
  WHERE f.reporter_id = (select auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.get_my_feedback_points_total() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_feedback_points_total() TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS feedback_reports_status_cursor_idx
  ON public.feedback_reports (status, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.get_feedback_reports_by_status(
  p_status text,
  p_limit integer DEFAULT 20,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_result jsonb;
BEGIN
  IF p_status IS NULL OR p_status NOT IN (
    'new', 'triage', 'accepted', 'in_progress',
    'resolved', 'closed', 'rejected', 'duplicate'
  ) THEN
    RAISE EXCEPTION 'Estado de feedback invalido.' USING ERRCODE = '22023';
  END IF;

  WITH scoped AS MATERIALIZED (
    SELECT f.*
    FROM public.feedback_reports f
    WHERE f.status = p_status
  ), candidates AS MATERIALIZED (
    SELECT s.*
    FROM scoped s
    WHERE p_before_created_at IS NULL
       OR s.created_at < p_before_created_at
       OR (s.created_at = p_before_created_at AND s.id < p_before_id)
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT v_limit + 1
  ), page_rows AS (
    SELECT c.*
    FROM candidates c
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT v_limit
  )
  SELECT jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.id DESC)
      FROM page_rows r
    ), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM scoped),
    'has_more', (SELECT count(*) > v_limit FROM candidates),
    'next_created_at', (
      SELECT r.created_at FROM page_rows r
      ORDER BY r.created_at ASC, r.id ASC LIMIT 1
    ),
    'next_id', (
      SELECT r.id FROM page_rows r
      ORDER BY r.created_at ASC, r.id ASC LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_feedback_reports_by_status(text, integer, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feedback_reports_by_status(text, integer, timestamptz, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';